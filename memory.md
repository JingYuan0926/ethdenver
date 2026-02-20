# Project Memory — ETHDenver SPARK

## Hedera EVM Tinybar vs Weibar (CRITICAL)
- Hedera EVM internally uses **tinybar** (8 decimals): `1 HBAR = 10^8 tinybar`
- The JSON-RPC relay translates `msg.value` between weibar (18 dec) and tinybar (8 dec) automatically
- `address(this).balance` inside contracts returns **tinybar**
- `ethers.parseEther()` → only correct for `msg.value` (relay converts it)
- For contract function **parameters** storing HBAR amounts: use `ethers.parseUnits(amount, 8)` (tinybar)
- For display: divide raw contract values by `1e8`, NOT `1e18`

### Conversion Table
| Context | Unit | Decimals | Example for 1 HBAR |
|---------|------|----------|-------------------|
| `msg.value` in contract | tinybar | 8 | 100,000,000 |
| `address.balance` in contract | tinybar | 8 | 100,000,000 |
| `ethers.parseEther("1")` via relay | weibar | 18 | 10^18 (relay converts to tinybar) |
| Contract function params | raw (stored as-is) | - | Must pass tinybar manually |
| `eth_getBalance` RPC response | weibar | 18 | Relay converts FROM tinybar |

**Key rule**: The relay ONLY converts `value` fields (msg.value). It does NOT convert function parameters in calldata. So if a contract stores an HBAR amount as a uint256 parameter, you must pass it in tinybar (8 decimals) yourself.

## Hedera Schedule Service (HSS)
- System contract at `0x16b`
- `scheduleCall(to, expirySecond, gasLimit, value, callData)` — IHRC1215
- MIN_INTERVAL for demo: 10 seconds
- Self-rescheduling: executePayroll → pay → scheduleCall again → loop

### HSS Gas Limit (CRITICAL)
- The `gasLimit` param in `scheduleCall` determines HBAR cost per scheduled execution
- **Cost formula**: `gasLimit × gasPrice` — at 870 gWei: 10M gas = **8.7 HBAR/call** (way too expensive!)
- **Separate call** gas: executeSubscription ~132K, HSS precompile ~220K
- **Nested call** (executeSubscription + internal reschedule): **~790K gas** — much higher than separate calls!
- **HSS does NOT refund unused gas** — full `gasLimit × gasPrice` is charged per scheduled call
- **HSS precompile charges ~98% of gasLimit param** in gas when scheduling the next call
- 800K → used 790K (98.8%), 1.5M → used 1,479K (98.6%) — both fail with `Error("HSS: scheduleCall failed")`
- **Recommended**: `scheduledCallGasLimit = 2_000_000` (2M) → ~1.74 HBAR/call — matches Hedera official tutorial
- 2M is the minimum that works for self-rescheduling (confirmed on v3: 4 successful executions)
- Bug found: 10M gas limit drained contract's HBAR balance via gas fees → `INSUFFICIENT_PAYER_BALANCE`
- At 2M gas: 4 executions succeeded before running out (4 × 1.74 = 6.96 HBAR).
- The contract's HBAR balance (address(this).balance) is shared between escrow and gas fee reserves
- Use `setGasLimit()` (owner-only) to change without redeploying

## Hedera Testnet
- RPC: `https://testnet.hashio.io/api`
- Explorer: `https://hashscan.io/testnet`
- Mirror node API: `https://testnet.mirrornode.hedera.com/api/v1/`

## Hedera Payable Functions (CRITICAL)
- Hedera JSON-RPC relay does NOT pass `msg.value` during `eth_estimateGas`
- Payable contract calls MUST use manual `gasLimit` (e.g. `gasLimit: 3_000_000`) to skip estimation
- Without manual gasLimit, payable calls revert with InsufDeposit/ZeroAmount during gas estimation

## Contract Size Limit
- Hedera EVM enforces 24KB (24,576 bytes) bytecode limit like Ethereum
- SPARKPayrollVault (payroll + subscription merged) was 25,634 bytes — over limit
- Fix: optimizer runs 200→1 + custom errors (saves ~1KB+ vs require strings)
- Custom error selectors can be computed: `keccak256("ErrorName()").slice(0,10)`

## Key Deployed Contracts
- SPARKPayrollVault (v1, HBAR-only): `0xd5F260948ea2aBE5a809fcf7a4Ad1b51c17Ec044` (Hedera Testnet)
- SPARKPayrollVault (v2, with token support): `0x8175249eFD177AaD077c7BC5F4b8015330517a27`
- SPARKPayrollVault (v3, payroll + subscription): `0xf6F3f9ae7B183c9AE9A9608adD4E5dC31F12029c`
- SPARKPayrollVault (v4, gas-optimized): `0xdB818b1ED798acD53ab9D15960257b35A05AB44E`
- HSS system contract: `0x16b`
- HTS precompile: `0x167`

## HTS Tokens (Hedera Testnet)
- Mock USDC: Token ID `0.0.7984944` | Name: USDC | Symbol: USDC | Decimals: 6 | Initial Supply: 1,000,000
  - EVM address: `0x000000000000000000000000000000000079d730`
  - Treasury: operator account (holds all initial supply)

## Project Structure
- Next.js app in root, Hardhat 3 in `contracts/`
- API routes: `pages/api/schedule/` (payroll outbound), `pages/api/subscription/` (subscription inbound)
- Frontend: `pages/schedule.tsx` (payroll), `pages/subscription.tsx` (subscription)
- ABI: `lib/payroll-vault-abi.ts`, `lib/subscription-vault-abi.ts` (same contract, separate ABI subsets)
- Subscription API routes: subscribe-hbar, subscribe-token, start, cancel, retry, top-up, status

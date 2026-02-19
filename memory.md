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
- Gas limit for HSS precompile: needs 10M+ gas (expensive)
- MIN_INTERVAL for demo: 10 seconds
- Self-rescheduling: executePayroll → pay → scheduleCall again → loop

## Hedera Testnet
- RPC: `https://testnet.hashio.io/api`
- Explorer: `https://hashscan.io/testnet`
- Mirror node API: `https://testnet.mirrornode.hedera.com/api/v1/`

## Key Deployed Contracts
- SPARKPayrollVault: `0xd5F260948ea2aBE5a809fcf7a4Ad1b51c17Ec044` (Hedera Testnet)
- HSS system contract: `0x16b`

## Project Structure
- Next.js app in root, Hardhat 3 in `contracts/`
- API routes: `pages/api/schedule/` (fund, add-agent, update-agent, start-payroll, cancel-payroll, retry-payroll, status, set-defaults)
- Frontend: `pages/schedule.tsx`
- ABI: `lib/payroll-vault-abi.ts`

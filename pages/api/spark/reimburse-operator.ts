import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountId,
  PrivateKey,
  TransferTransaction,
  TokenId,
  TokenAssociateTransaction,
} from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

const OPERATOR_ACCOUNT_ID = "0.0.7946371";
const USDC_TOKEN_ID = "0.0.7984944"; // Mock USDC on Hedera Testnet
const REIMBURSEMENT_AMOUNT = 1_000000; // 1 USDC (6 decimals)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }

  const { hederaPrivateKey, paymentCount } = req.body;

  if (!hederaPrivateKey) {
    return res.status(400).json({ success: false, error: "hederaPrivateKey is required" });
  }

  try {
    const agentKey = PrivateKey.fromString(hederaPrivateKey);
    const client = getHederaClient();

    // Derive agent account ID from private key
    const publicKey = agentKey.publicKey;
    const MIRROR_URL = "https://testnet.mirrornode.hedera.com";
    const mirrorRes = await fetch(
      `${MIRROR_URL}/api/v1/accounts?account.publickey=${publicKey.toString()}&limit=1`
    );
    const mirrorData = await mirrorRes.json();

    if (!mirrorData.accounts || mirrorData.accounts.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Could not find agent account from private key"
      });
    }

    const agentAccountId = AccountId.fromString(mirrorData.accounts[0].account);
    client.setOperator(agentAccountId, agentKey);

    // Check if agent has USDC token associated and get balance
    const tokensRes = await fetch(
      `${MIRROR_URL}/api/v1/accounts/${agentAccountId.toString()}/tokens?token.id=${USDC_TOKEN_ID}`
    );
    const tokensData = await tokensRes.json();

    // If token not associated, associate it
    if (!tokensData.tokens || tokensData.tokens.length === 0) {
      const associateTx = await new TokenAssociateTransaction()
        .setAccountId(agentAccountId)
        .setTokenIds([TokenId.fromString(USDC_TOKEN_ID)])
        .execute(client);
      await associateTx.getReceipt(client);
    }

    // Check balance after association
    const balanceRes = await fetch(
      `${MIRROR_URL}/api/v1/accounts/${agentAccountId.toString()}/tokens?token.id=${USDC_TOKEN_ID}`
    );
    const balanceData = await balanceRes.json();
    const balance = balanceData.tokens?.[0]?.balance || 0;

    if (balance < REIMBURSEMENT_AMOUNT) {
      return res.status(400).json({
        success: false,
        error: `Insufficient USDC balance. Have: ${balance / 1e6} USDC, need: ${REIMBURSEMENT_AMOUNT / 1e6} USDC`,
        balance: balance / 1e6,
        required: REIMBURSEMENT_AMOUNT / 1e6,
      });
    }

    // Transfer 1 USDC from agent to operator
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(
        TokenId.fromString(USDC_TOKEN_ID),
        agentAccountId,
        -REIMBURSEMENT_AMOUNT
      )
      .addTokenTransfer(
        TokenId.fromString(USDC_TOKEN_ID),
        AccountId.fromString(OPERATOR_ACCOUNT_ID),
        REIMBURSEMENT_AMOUNT
      )
      .execute(client);

    const receipt = await transferTx.getReceipt(client);

    return res.status(200).json({
      success: true,
      txId: transferTx.transactionId?.toString(),
      status: receipt.status.toString(),
      paymentCount,
      amount: "1 USDC",
      from: agentAccountId.toString(),
      to: OPERATOR_ACCOUNT_ID,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

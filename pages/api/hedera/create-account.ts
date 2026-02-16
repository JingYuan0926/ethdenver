import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountCreateTransaction,
  AccountInfoQuery,
  Hbar,
  PrivateKey,
} from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = getHederaClient();

    // Generate a new key pair for the new account
    const newKey = PrivateKey.generateED25519();

    const txResponse = await new AccountCreateTransaction()
      .setKey(newKey.publicKey)
      .setInitialBalance(new Hbar(10))
      .setMaxAutomaticTokenAssociations(10)
      .execute(client);

    const receipt = await txResponse.getReceipt(client);
    const accountId = receipt.accountId!;

    // Query account info to get the EVM address
    const accountInfo = await new AccountInfoQuery()
      .setAccountId(accountId)
      .execute(client);

    const evmAddress = accountInfo.contractAccountId;

    return res.status(200).json({
      success: true,
      accountId: accountId.toString(),
      evmAddress: `0x${evmAddress}`,
      publicKey: newKey.publicKey.toString(),
      privateKey: newKey.toString(),
      initialBalance: "10 HBAR",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

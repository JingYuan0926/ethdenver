import type { NextApiRequest, NextApiResponse } from "next";
import { TokenAssociateTransaction, PrivateKey } from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tokenId, accountId, privateKey } = req.body;

  if (!tokenId || !accountId || !privateKey) {
    return res
      .status(400)
      .json({ error: "tokenId, accountId, and privateKey are required" });
  }

  try {
    const client = getHederaClient();
    const receiverKey = PrivateKey.fromString(privateKey);

    // Receiver signs to approve accepting this token
    const tx = await new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId])
      .freezeWith(client);

    const signedTx = await tx.sign(receiverKey);
    const txResponse = await signedTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      status: receipt.status.toString(),
      accountId,
      tokenId,
      message: "Token associated — account can now receive this token",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

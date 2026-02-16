import type { NextApiRequest, NextApiResponse } from "next";
import { TransferTransaction } from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tokenId, receiverAccountId, amount } = req.body;

  if (!tokenId || !receiverAccountId || !amount) {
    return res
      .status(400)
      .json({ error: "tokenId, receiverAccountId, and amount are required" });
  }

  try {
    const client = getHederaClient();

    // Transfer tokens from operator (treasury) to receiver
    // Receiver must have auto-association enabled (set during account creation)
    const txResponse = await new TransferTransaction()
      .addTokenTransfer(tokenId, client.operatorAccountId!, -Number(amount))
      .addTokenTransfer(tokenId, receiverAccountId, Number(amount))
      .execute(client);

    const receipt = await txResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      status: receipt.status.toString(),
      tokenId,
      from: client.operatorAccountId!.toString(),
      to: receiverAccountId,
      amount: Number(amount),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

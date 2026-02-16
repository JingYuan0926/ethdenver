import type { NextApiRequest, NextApiResponse } from "next";
import { TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topicId, message } = req.body;

  if (!topicId || !message) {
    return res
      .status(400)
      .json({ error: "topicId and message are required" });
  }

  try {
    const client = getHederaClient();

    const txResponse = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    const receipt = await txResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      topicId,
      message,
      status: receipt.status.toString(),
      sequenceNumber: receipt.topicSequenceNumber?.toString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

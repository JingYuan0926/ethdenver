import type { NextApiRequest, NextApiResponse } from "next";
import { TopicCreateTransaction } from "@hashgraph/sdk";
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

    const txResponse = await new TopicCreateTransaction()
      .setTopicMemo("SPARK ETHDenver Demo Topic")
      .execute(client);

    const receipt = await txResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      topicId: receipt.topicId?.toString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

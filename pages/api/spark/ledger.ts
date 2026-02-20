import type { NextApiRequest, NextApiResponse } from "next";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "data", "spark-config.json");
const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

const KNOWLEDGE_CATEGORIES = ["scam", "blockchain", "legal", "trend", "skills"] as const;

interface TopicMessage {
  [key: string]: unknown;
}

async function fetchMessages(topicId: string): Promise<TopicMessage[]> {
  const res = await fetch(
    `${MIRROR_URL}/api/v1/topics/${topicId}/messages?limit=100`
  );
  const data = await res.json();
  const msgs: TopicMessage[] = [];
  for (const msg of data.messages || []) {
    try {
      const decoded = JSON.parse(
        Buffer.from(msg.message, "base64").toString("utf-8")
      );
      msgs.push({
        ...decoded,
        _seqNo: msg.sequence_number,
        _consensusAt: msg.consensus_timestamp,
      });
    } catch {
      // skip non-JSON
    }
  }
  return msgs;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "GET only" });
  }

  if (!existsSync(CONFIG_PATH)) {
    return res.status(404).json({
      success: false,
      error: "No spark-config.json found. Register an agent first.",
    });
  }

  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    const { masterTopicId, subTopics } = config;

    if (!masterTopicId || !subTopics) {
      return res.status(404).json({
        success: false,
        error: "Config missing masterTopicId or subTopics",
      });
    }

    // Fetch all topics in parallel
    const topicIds = [
      masterTopicId,
      ...KNOWLEDGE_CATEGORIES.map((c) => subTopics[c]),
    ];
    const results = await Promise.all(topicIds.map(fetchMessages));

    const ledger: Record<string, { topicId: string; messages: TopicMessage[] }> = {
      master: { topicId: masterTopicId, messages: results[0] },
    };
    KNOWLEDGE_CATEGORIES.forEach((cat, i) => {
      ledger[cat] = { topicId: subTopics[cat], messages: results[i + 1] };
    });

    return res.status(200).json({
      success: true,
      masterTopicId,
      subTopics,
      ledger,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

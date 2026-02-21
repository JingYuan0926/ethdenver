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

interface KnowledgeItem {
  itemId: string;
  author: string;
  content: string;
  category: string;
  accessTier: "public" | "gated";
  zgRootHash: string;
  timestamp: string;
  approvals: number;
  rejections: number;
  voters: string[];
  status: "pending" | "approved" | "rejected";
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
    const { subTopics } = config;

    if (!subTopics) {
      return res.status(404).json({
        success: false,
        error: "Config missing subTopics",
      });
    }

    // Fetch all category sub-topics in parallel
    const categoryEntries = KNOWLEDGE_CATEGORIES.map((cat) => ({
      category: cat,
      topicId: subTopics[cat],
    }));

    const allMessages = await Promise.all(
      categoryEntries.map((e) => fetchMessages(e.topicId))
    );

    const pending: KnowledgeItem[] = [];
    const approved: KnowledgeItem[] = [];
    const rejected: KnowledgeItem[] = [];

    for (let i = 0; i < categoryEntries.length; i++) {
      const msgs = allMessages[i];
      const cat = categoryEntries[i].category;

      // Collect submitted items
      const submitted = msgs.filter((m) => m.action === "knowledge_submitted");

      // Collect votes grouped by itemId
      const votesByItem: Record<string, TopicMessage[]> = {};
      for (const m of msgs) {
        if (m.action === "knowledge_vote" && m.itemId) {
          const id = m.itemId as string;
          if (!votesByItem[id]) votesByItem[id] = [];
          votesByItem[id].push(m);
        }
      }

      // Collect finalized itemIds
      const finalizedItems: Record<string, "approved" | "rejected"> = {};
      for (const m of msgs) {
        if (m.action === "knowledge_approved" && m.itemId) {
          finalizedItems[m.itemId as string] = "approved";
        }
        if (m.action === "knowledge_rejected" && m.itemId) {
          finalizedItems[m.itemId as string] = "rejected";
        }
      }

      for (const sub of submitted) {
        const id = sub.itemId as string;
        const votes = votesByItem[id] || [];
        const approvalCount = votes.filter((v) => v.vote === "approve").length;
        const rejectionCount = votes.filter((v) => v.vote === "reject").length;
        const voters = votes.map((v) => v.voter as string);

        const item: KnowledgeItem = {
          itemId: id,
          author: sub.author as string,
          content: (sub.content as string) || "",
          category: cat,
          accessTier: (sub.accessTier as "public" | "gated") || "public",
          zgRootHash: (sub.zgRootHash as string) || "",
          timestamp: (sub.timestamp as string) || "",
          approvals: approvalCount,
          rejections: rejectionCount,
          voters,
          status: finalizedItems[id] || "pending",
        };

        if (finalizedItems[id] === "approved") {
          approved.push(item);
        } else if (finalizedItems[id] === "rejected") {
          rejected.push(item);
        } else {
          pending.push(item);
        }
      }
    }

    return res.status(200).json({
      success: true,
      pending,
      approved,
      rejected,
      counts: {
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
      },
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

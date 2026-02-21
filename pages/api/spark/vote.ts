import type { NextApiRequest, NextApiResponse } from "next";
import {
  PrivateKey,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { getHederaClient } from "@/lib/hedera";

// ── Mirror Node ──────────────────────────────────────────────────
const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

// ── Config ───────────────────────────────────────────────────────
const CONFIG_PATH = join(process.cwd(), "data", "spark-config.json");

function getMasterTopicId(): string | null {
  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (config.masterTopicId) return config.masterTopicId;
  }
  return null;
}

// ── Resolve target agent's voteTopicId from master topic ────────
async function resolveVoteTopicId(
  targetAccountId: string
): Promise<string> {
  const masterTopicId = getMasterTopicId();
  if (!masterTopicId) {
    throw new Error("No master topic found. Register an agent first.");
  }

  const topicRes = await fetch(
    `${MIRROR_URL}/api/v1/topics/${masterTopicId}/messages?limit=100`
  );
  const topicData = await topicRes.json();

  for (const msg of topicData.messages || []) {
    try {
      const decoded = JSON.parse(
        Buffer.from(msg.message, "base64").toString("utf-8")
      );
      if (
        decoded.action === "agent_registered" &&
        decoded.hederaAccountId === targetAccountId
      ) {
        return decoded.voteTopicId as string;
      }
    } catch {
      // skip non-JSON
    }
  }

  throw new Error(
    `Agent ${targetAccountId} not found in master topic`
  );
}

// ── Resolve voter's accountId from private key ──────────────────
async function resolveVoterAccount(
  voterKey: PrivateKey
): Promise<string> {
  const publicKeyDer = voterKey.publicKey.toString();

  const mirrorRes = await fetch(
    `${MIRROR_URL}/api/v1/accounts?account.publickey=${publicKeyDer}&limit=1`
  );
  const mirrorData = await mirrorRes.json();

  if (!mirrorData.accounts || mirrorData.accounts.length === 0) {
    throw new Error("No Hedera account found for voter's private key");
  }

  return mirrorData.accounts[0].account;
}

// ══════════════════════════════════════════════════════════════════
//  HANDLER
// ══════════════════════════════════════════════════════════════════

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }

  const { voterPrivateKey, targetAccountId, voteType } = req.body;

  if (!voterPrivateKey || !targetAccountId || !voteType) {
    return res.status(400).json({
      success: false,
      error: "Required: voterPrivateKey, targetAccountId, voteType (upvote|downvote)",
    });
  }

  if (voteType !== "upvote" && voteType !== "downvote") {
    return res.status(400).json({
      success: false,
      error: "voteType must be 'upvote' or 'downvote'",
    });
  }

  try {
    const client = getHederaClient();

    // Resolve voter identity
    const voterKey = PrivateKey.fromString(voterPrivateKey);
    const voterAccountId = await resolveVoterAccount(voterKey);

    // Prevent self-voting
    if (voterAccountId === targetAccountId) {
      return res.status(400).json({
        success: false,
        error: "Cannot vote for yourself",
      });
    }

    // Resolve target agent's vote topic
    const voteTopicId = await resolveVoteTopicId(targetAccountId);

    // Build HCS-20 vote message
    const voteMsg = JSON.stringify({
      p: "hcs-20",
      op: "mint",
      tick: voteType,
      amt: "1",
      voter: voterAccountId,
      timestamp: new Date().toISOString(),
    });

    // Vote topic has NO submit key (public) — anyone can submit
    // We use the operator client to execute the transaction
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(voteTopicId)
      .setMessage(voteMsg)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const seqNo = receipt.topicSequenceNumber?.toString() ?? "0";

    return res.status(200).json({
      success: true,
      voteType,
      voter: voterAccountId,
      target: targetAccountId,
      voteTopicId,
      sequenceNumber: seqNo,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

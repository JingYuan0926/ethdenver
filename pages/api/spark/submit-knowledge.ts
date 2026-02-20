import type { NextApiRequest, NextApiResponse } from "next";
import {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { ZgFile, Indexer } from "@0gfoundation/0g-ts-sdk";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { getHederaClient, getOperatorKey } from "@/lib/hedera";

// ── 0G Config ────────────────────────────────────────────────────
const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

// ── Mirror Node ──────────────────────────────────────────────────
const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

// ── Knowledge categories ─────────────────────────────────────────
const KNOWLEDGE_CATEGORIES = ["scam", "blockchain", "legal", "trend", "skills"] as const;
type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

// ── Topic config persistence (same as register-agent) ────────────
const CONFIG_PATH = join(process.cwd(), "data", "spark-config.json");

interface SparkConfig {
  masterTopicId?: string;
  subTopics?: Record<KnowledgeCategory, string>;
}

function readConfig(): SparkConfig {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  }
  return {};
}

function getTopicIds(): { masterTopicId: string; subTopics: Record<KnowledgeCategory, string> } {
  const config = readConfig();
  if (!config.masterTopicId || !config.subTopics) {
    throw new Error("No topics found. Register an agent first to auto-create them.");
  }
  return { masterTopicId: config.masterTopicId, subTopics: config.subTopics };
}

// ── Helper: submit HCS message with signing ──────────────────────
async function submitToTopic(
  client: Client,
  topicId: string,
  message: string,
  signingKey: PrivateKey
) {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .freezeWith(client)
    .sign(signingKey);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
  return receipt.topicSequenceNumber?.toString() ?? "0";
}

// ── Helper: resolve accountId + botTopicId from private key ──────
async function resolveAgent(botKey: PrivateKey): Promise<{
  accountId: string;
  botTopicId: string;
}> {
  const publicKeyDer = botKey.publicKey.toString();
  const { masterTopicId } = getTopicIds();

  // Look up account by public key via Mirror Node
  const mirrorRes = await fetch(
    `${MIRROR_URL}/api/v1/accounts?account.publickey=${publicKeyDer}&limit=1`
  );
  const mirrorData = await mirrorRes.json();

  if (!mirrorData.accounts || mirrorData.accounts.length === 0) {
    throw new Error("No Hedera account found for this private key");
  }

  const accountId = mirrorData.accounts[0].account;

  // Scan master topic for registration event to find botTopicId
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
        decoded.hederaAccountId === accountId
      ) {
        return { accountId, botTopicId: decoded.botTopicId };
      }
    } catch {
      // skip non-JSON messages
    }
  }

  throw new Error(
    `Account ${accountId} not found in SPARK master topic (${masterTopicId})`
  );
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

  const {
    content,
    category = "",
    hederaPrivateKey,
  } = req.body;

  if (!content || !hederaPrivateKey) {
    return res.status(400).json({
      success: false,
      error: "Required: content, hederaPrivateKey",
    });
  }

  if (!category || !KNOWLEDGE_CATEGORIES.includes(category)) {
    return res.status(400).json({
      success: false,
      error: `Required: category (one of: ${KNOWLEDGE_CATEGORIES.join(", ")})`,
    });
  }

  const zgPrivateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
  if (!zgPrivateKey) {
    return res
      .status(500)
      .json({ success: false, error: "Missing ZG_STORAGE_PRIVATE_KEY" });
  }

  try {
    const client = getHederaClient();
    const operatorKey = getOperatorKey();
    const { masterTopicId, subTopics } = getTopicIds();
    const categoryTopicId = subTopics[category as KnowledgeCategory];

    // ────────────────────────────────────────────────────────────
    // Step 0: Resolve agent identity from private key
    // ────────────────────────────────────────────────────────────
    const botKey = PrivateKey.fromStringED25519(hederaPrivateKey);
    const { accountId, botTopicId } = await resolveAgent(botKey);

    const itemId = `k-${Date.now()}`;

    // ────────────────────────────────────────────────────────────
    // Step 1: Upload content to 0G Storage
    // ────────────────────────────────────────────────────────────
    const knowledgeItem = JSON.stringify({
      type: "knowledge-item",
      itemId,
      category,
      content,
      author: accountId,
      version: 1,
      timestamp: new Date().toISOString(),
    });

    const tmpPath = join(tmpdir(), `spark-knowledge-${Date.now()}.json`);
    writeFileSync(tmpPath, knowledgeItem);

    const provider = new ethers.JsonRpcProvider(ZG_RPC);
    const zgSigner = new ethers.Wallet(zgPrivateKey, provider);
    const indexer = new Indexer(ZG_INDEXER);

    const zgFile = await ZgFile.fromFilePath(tmpPath);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr || !tree) throw new Error(`Merkle tree: ${treeErr}`);
    const zgRootHash = tree.rootHash();

    const [zgUploadResult, uploadErr] = await indexer.upload(zgFile, ZG_RPC, zgSigner);
    if (uploadErr) throw new Error(`0G upload: ${uploadErr}`);
    const zgUploadTxHash = zgUploadResult
      ? "txHash" in zgUploadResult
        ? zgUploadResult.txHash
        : zgUploadResult.txHashes?.[0] ?? ""
      : "";

    await zgFile.close();
    unlinkSync(tmpPath);

    // ────────────────────────────────────────────────────────────
    // Step 2: Log to category sub-topic (operator signs)
    // ────────────────────────────────────────────────────────────
    const categoryMsg = JSON.stringify({
      action: "knowledge_submitted",
      itemId,
      author: accountId,
      zgRootHash,
      category,
      content,
      timestamp: new Date().toISOString(),
    });

    const categorySeqNo = await submitToTopic(
      client,
      categoryTopicId,
      categoryMsg,
      operatorKey
    );

    // ────────────────────────────────────────────────────────────
    // Step 3: Log to bot topic (bot signs with its own key)
    // ────────────────────────────────────────────────────────────
    const botMsg = JSON.stringify({
      action: "i_submitted_knowledge",
      itemId,
      zgRootHash,
      category,
      timestamp: new Date().toISOString(),
    });

    const botSeqNo = await submitToTopic(
      client,
      botTopicId,
      botMsg,
      botKey
    );

    // ────────────────────────────────────────────────────────────
    // Return
    // ────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      itemId,
      author: accountId,
      zgRootHash,
      zgUploadTxHash: zgUploadTxHash ?? "",
      category,
      categoryTopicId,
      masterTopicId,
      categorySeqNo,
      botTopicId,
      botSeqNo,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

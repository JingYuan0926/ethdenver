import type { NextApiRequest, NextApiResponse } from "next";
import {
  PrivateKey,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { ethers, keccak256, toUtf8Bytes } from "ethers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { getHederaClient, getOperatorKey } from "@/lib/hedera";
import { SPARKINFT_ABI, SPARKINFT_ADDRESS } from "@/lib/sparkinft-abi";
import {
  PAYROLL_VAULT_ADDRESS,
  PAYROLL_VAULT_ABI,
  HEDERA_RPC_URL,
} from "@/lib/payroll-vault-abi";

// ── Mirror Node ──────────────────────────────────────────────────
const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

// ── Config ───────────────────────────────────────────────────────
const CONFIG_PATH = join(process.cwd(), "data", "spark-config.json");
const KNOWLEDGE_CATEGORIES = ["scam", "blockchain", "legal", "trend", "skills"] as const;
type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

const CONSENSUS_THRESHOLD = 2;

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

// Resolve voter's accountId from private key
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

// Resolve target agent's voteTopicId + botTopicId + iNftTokenId + evmAddress from master topic
async function resolveAgentTopics(
  masterTopicId: string,
  targetAccountId: string
): Promise<{ voteTopicId: string; botTopicId: string; iNftTokenId: number; evmAddress: string }> {
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
        return {
          voteTopicId: decoded.voteTopicId,
          botTopicId: decoded.botTopicId,
          iNftTokenId: decoded.iNftTokenId || 0,
          evmAddress: decoded.evmAddress || "",
        };
      }
    } catch {
      // skip
    }
  }

  throw new Error(`Agent ${targetAccountId} not found in master topic`);
}

// ── 0G Chain Config ──────────────────────────────────────────────
const ZG_RPC = "https://evmrpc-testnet.0g.ai";

// Sync iNFT on-chain state after knowledge consensus
async function syncInftOnConsensus(
  authorAccountId: string,
  masterTopicId: string,
  knowledgeZgRootHash: string | undefined,
  isApproval: boolean
): Promise<{ recordContribTxHash?: string; reputationTxHash: string; updateDataTxHash?: string } | null> {
  const zgPrivateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
  if (!zgPrivateKey) return null;

  const { iNftTokenId, voteTopicId } = await resolveAgentTopics(masterTopicId, authorAccountId);
  if (!iNftTokenId || iNftTokenId === 0) return null;

  const provider = new ethers.JsonRpcProvider(ZG_RPC);
  const zgSigner = new ethers.Wallet(zgPrivateKey, provider);
  const inftContract = new ethers.Contract(SPARKINFT_ADDRESS, SPARKINFT_ABI, zgSigner);

  const result: { recordContribTxHash?: string; reputationTxHash: string; updateDataTxHash?: string } = {
    reputationTxHash: "",
  };

  // On approval: record contribution + append knowledge data
  if (isApproval) {
    const contribTx = await inftContract.recordContribution(iNftTokenId);
    await contribTx.wait();
    result.recordContribTxHash = contribTx.hash;

    // Append approved knowledge to intelligentData
    if (knowledgeZgRootHash) {
      const existingData = await inftContract.intelligentDatasOf(iNftTokenId);
      const mapped = existingData.map((d: { dataDescription: string; dataHash: string }) => ({
        dataDescription: d.dataDescription,
        dataHash: d.dataHash,
      }));
      const newEntry = {
        dataDescription: `0g://knowledge/${knowledgeZgRootHash}`,
        dataHash: keccak256(toUtf8Bytes(knowledgeZgRootHash)),
      };
      const dataTx = await inftContract.updateData(iNftTokenId, [...mapped, newEntry]);
      await dataTx.wait();
      result.updateDataTxHash = dataTx.hash;
    }
  }

  // Always sync reputation score from HCS-20 vote counts
  const voteMessages = await fetchMessages(voteTopicId);
  let upvotes = 0;
  let downvotes = 0;
  for (const msg of voteMessages) {
    if (msg.p === "hcs-20" && msg.op === "mint") {
      if (msg.tick === "upvote") upvotes++;
      if (msg.tick === "downvote") downvotes++;
    }
  }
  // +1 for the vote we just minted (Mirror Node eventual consistency)
  if (isApproval) upvotes++;
  else downvotes++;

  const newScore = Math.max(0, upvotes - downvotes);
  const repTx = await inftContract.updateReputation(iNftTokenId, newScore);
  await repTx.wait();
  result.reputationTxHash = repTx.hash;

  return result;
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

  const { itemId, vote, hederaPrivateKey } = req.body;

  if (!itemId || !vote || !hederaPrivateKey) {
    return res.status(400).json({
      success: false,
      error: "Required: itemId, vote (approve|reject), hederaPrivateKey",
    });
  }

  if (vote !== "approve" && vote !== "reject") {
    return res.status(400).json({
      success: false,
      error: "vote must be 'approve' or 'reject'",
    });
  }

  try {
    const config = readConfig();
    if (!config.masterTopicId || !config.subTopics) {
      return res.status(400).json({
        success: false,
        error: "No topics found. Register an agent first.",
      });
    }

    const client = getHederaClient();
    const operatorKey = getOperatorKey();

    // Step 1: Resolve voter identity
    const voterKey = PrivateKey.fromStringED25519(hederaPrivateKey);
    const voterAccountId = await resolveVoterAccount(voterKey);

    // Step 2: Scan ALL category sub-topics for the knowledge item
    const categoryEntries = KNOWLEDGE_CATEGORIES.map((cat) => ({
      category: cat,
      topicId: config.subTopics![cat],
    }));

    const allMessages = await Promise.all(
      categoryEntries.map((e) => fetchMessages(e.topicId))
    );

    // Find the knowledge_submitted message with matching itemId
    let knowledgeItem: TopicMessage | null = null;
    let categoryTopicId = "";
    let categoryName = "";
    let categoryMessages: TopicMessage[] = [];

    for (let i = 0; i < categoryEntries.length; i++) {
      const msgs = allMessages[i];
      for (const msg of msgs) {
        if (msg.action === "knowledge_submitted" && msg.itemId === itemId) {
          knowledgeItem = msg;
          categoryTopicId = categoryEntries[i].topicId;
          categoryName = categoryEntries[i].category;
          categoryMessages = msgs;
          break;
        }
      }
      if (knowledgeItem) break;
    }

    if (!knowledgeItem) {
      return res.status(404).json({
        success: false,
        error: `Knowledge item ${itemId} not found in any category sub-topic`,
      });
    }

    const author = knowledgeItem.author as string;

    // Step 3: Self-vote check — disabled for demo
    // if (voterAccountId === author) { ... }

    // Step 4: Check existing votes for this itemId
    const existingVotes = categoryMessages.filter(
      (m) => m.action === "knowledge_vote" && m.itemId === itemId
    );

    // Double-vote check — disabled for demo
    // const alreadyVoted = existingVotes.some((v) => v.voter === voterAccountId);
    // if (alreadyVoted) { ... }

    // Already finalized check
    const isFinalized = categoryMessages.some(
      (m) =>
        (m.action === "knowledge_approved" || m.action === "knowledge_rejected") &&
        m.itemId === itemId
    );
    if (isFinalized) {
      return res.status(400).json({
        success: false,
        error: "This knowledge item has already been finalized (approved or rejected)",
      });
    }

    // Count current votes
    let approvals = existingVotes.filter((v) => v.vote === "approve").length;
    let rejections = existingVotes.filter((v) => v.vote === "reject").length;

    // Step 5: Log knowledge_vote to category sub-topic (operator signs)
    const voteMsg = JSON.stringify({
      action: "knowledge_vote",
      itemId,
      voter: voterAccountId,
      vote,
      timestamp: new Date().toISOString(),
    });

    const voteTx = await new TopicMessageSubmitTransaction()
      .setTopicId(categoryTopicId)
      .setMessage(voteMsg)
      .freezeWith(client)
      .sign(operatorKey);

    const voteResponse = await voteTx.execute(client);
    const voteReceipt = await voteResponse.getReceipt(client);
    const voteSeqNo = voteReceipt.topicSequenceNumber?.toString() ?? "0";

    // Step 6: Log i_voted_on_knowledge to voter's bot topic
    const { botTopicId: voterBotTopicId } = await resolveAgentTopics(
      config.masterTopicId,
      voterAccountId
    );

    const botMsg = JSON.stringify({
      action: "i_voted_on_knowledge",
      itemId,
      vote,
      category: categoryName,
      timestamp: new Date().toISOString(),
    });

    const botTx = await new TopicMessageSubmitTransaction()
      .setTopicId(voterBotTopicId)
      .setMessage(botMsg)
      .freezeWith(client)
      .sign(voterKey);

    await (await botTx.execute(client)).getReceipt(client);

    // Update counts with this vote
    if (vote === "approve") approvals++;
    else rejections++;

    // Step 7: Check consensus + iNFT sync
    let status: "pending" | "approved" | "rejected" = "pending";
    let reputationEffect: string | null = null;
    let inftSyncResult: { recordContribTxHash?: string; reputationTxHash: string; updateDataTxHash?: string } | null = null;
    let payrollResult: { agentIdx?: string; startTxHash?: string } | null = null;

    if (approvals >= CONSENSUS_THRESHOLD) {
      status = "approved";

      // Log knowledge_approved
      const approvedMsg = JSON.stringify({
        action: "knowledge_approved",
        itemId,
        author,
        approvedBy: [
          ...existingVotes.filter((v) => v.vote === "approve").map((v) => v.voter),
          voterAccountId,
        ],
        timestamp: new Date().toISOString(),
      });

      const approvedTx = await new TopicMessageSubmitTransaction()
        .setTopicId(categoryTopicId)
        .setMessage(approvedMsg)
        .freezeWith(client)
        .sign(operatorKey);

      await (await approvedTx.execute(client)).getReceipt(client);

      // Mint HCS-20 upvote on author's vote topic
      const { voteTopicId: authorVoteTopicId, evmAddress: authorEvmAddress } = await resolveAgentTopics(
        config.masterTopicId,
        author
      );

      const upvoteMsg = JSON.stringify({
        p: "hcs-20",
        op: "mint",
        tick: "upvote",
        amt: "1",
        voter: "consensus",
        reason: `knowledge_approved:${itemId}`,
        timestamp: new Date().toISOString(),
      });

      const upvoteTx = await new TopicMessageSubmitTransaction()
        .setTopicId(authorVoteTopicId)
        .setMessage(upvoteMsg)
        .execute(client);

      await upvoteTx.getReceipt(client);
      reputationEffect = "upvote on author's vote topic";

      // Sync iNFT: recordContribution + updateReputation + updateData
      try {
        const zgHash = knowledgeItem.zgRootHash as string | undefined;
        inftSyncResult = await syncInftOnConsensus(author, config.masterTopicId!, zgHash, true);
      } catch (inftErr) {
        console.error("[approve-knowledge] iNFT sync failed (approval):", inftErr);
      }

      // Step 8: If gated knowledge, add author as payroll agent in vault for payouts
      const knowledgeAccessTier = knowledgeItem.accessTier as string | undefined;
      if (knowledgeAccessTier === "gated" && authorEvmAddress) {
        try {
          const hederaPrivKey = process.env.HEDERA_PRIVATE_KEY;
          if (hederaPrivKey) {
            const hProvider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
            const hWallet = new ethers.Wallet(hederaPrivKey, hProvider);
            const vault = new ethers.Contract(PAYROLL_VAULT_ADDRESS, PAYROLL_VAULT_ABI, hWallet);

            // Check if author is already a payroll agent
            const alreadyAgent = await vault.isAgent(authorEvmAddress);
            if (!alreadyAgent) {
              // Add as payroll agent: 0.5 USDC per 60s payout
              const payoutAmount = ethers.parseUnits("0.5", 6); // 0.5 USDC (6 decimals)
              const payoutInterval = BigInt(60); // every 60 seconds

              const addTx = await vault.addAgent(
                authorEvmAddress,
                `contributor:${author}`,
                payoutAmount,
                payoutInterval
              );
              const addReceipt = await addTx.wait();

              // Get the agent index from the event or count
              const agentCount = await vault.getAgentCount();
              const agentIdx = Number(agentCount) - 1;

              // Start the payroll schedule
              const startTx = await vault.startPayroll(BigInt(agentIdx));
              await startTx.wait();

              payrollResult = {
                agentIdx: String(agentIdx),
                startTxHash: startTx.hash,
              };
            }
          }
        } catch (payrollErr) {
          console.error("[approve-knowledge] Payroll setup failed:", payrollErr);
        }
      }

    } else if (rejections >= CONSENSUS_THRESHOLD) {
      status = "rejected";

      // Log knowledge_rejected
      const rejectedMsg = JSON.stringify({
        action: "knowledge_rejected",
        itemId,
        author,
        rejectedBy: [
          ...existingVotes.filter((v) => v.vote === "reject").map((v) => v.voter),
          voterAccountId,
        ],
        timestamp: new Date().toISOString(),
      });

      const rejectedTx = await new TopicMessageSubmitTransaction()
        .setTopicId(categoryTopicId)
        .setMessage(rejectedMsg)
        .freezeWith(client)
        .sign(operatorKey);

      await (await rejectedTx.execute(client)).getReceipt(client);

      // Mint HCS-20 downvote on author's vote topic
      const { voteTopicId: authorVoteTopicId } = await resolveAgentTopics(
        config.masterTopicId,
        author
      );

      const downvoteMsg = JSON.stringify({
        p: "hcs-20",
        op: "mint",
        tick: "downvote",
        amt: "1",
        voter: "consensus",
        reason: `knowledge_rejected:${itemId}`,
        timestamp: new Date().toISOString(),
      });

      const downvoteTx = await new TopicMessageSubmitTransaction()
        .setTopicId(authorVoteTopicId)
        .setMessage(downvoteMsg)
        .execute(client);

      await downvoteTx.getReceipt(client);
      reputationEffect = "downvote on author's vote topic";

      // Sync iNFT: updateReputation only (no contribution for rejections)
      try {
        inftSyncResult = await syncInftOnConsensus(author, config.masterTopicId!, undefined, false);
      } catch (inftErr) {
        console.error("[approve-knowledge] iNFT sync failed (rejection):", inftErr);
      }
    }

    return res.status(200).json({
      success: true,
      itemId,
      vote,
      voter: voterAccountId,
      author,
      category: categoryName,
      categoryTopicId,
      voteSeqNo,
      approvals,
      rejections,
      status,
      reputationEffect,
      inftSynced: !!inftSyncResult,
      inftSyncTxHashes: inftSyncResult || null,
      payrollStarted: !!payrollResult,
      payrollResult: payrollResult || null,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountId,
  AccountInfoQuery,
  PrivateKey,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { getHederaClient } from "@/lib/hedera";
import { SPARKINFT_ABI, SPARKINFT_ADDRESS } from "@/lib/sparkinft-abi";

// ── Mirror Node ──────────────────────────────────────────────────
const MIRROR_URL = "https://testnet.mirrornode.hedera.com";

// ── 0G Config ────────────────────────────────────────────────────
const ZG_RPC = "https://evmrpc-testnet.0g.ai";

// ── Master topic persistence ─────────────────────────────────────
const CONFIG_PATH = join(process.cwd(), "spark-config.json");

function getMasterTopicId(): string | null {
  const envTopic = process.env.SPARK_MASTER_TOPIC_ID;
  if (envTopic) return envTopic;

  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (config.masterTopicId) return config.masterTopicId;
  }

  return null;
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

  const { hederaPrivateKey, hederaAccountId } = req.body;

  if (!hederaPrivateKey) {
    return res
      .status(400)
      .json({ success: false, error: "hederaPrivateKey is required" });
  }

  try {
    // ────────────────────────────────────────────────────────────
    // Step 1: Derive public key from private key
    // ────────────────────────────────────────────────────────────
    const botKey = PrivateKey.fromStringED25519(hederaPrivateKey);
    const publicKeyHex = botKey.publicKey.toStringRaw();
    const publicKeyDer = botKey.publicKey.toString();

    // ────────────────────────────────────────────────────────────
    // Step 2: Resolve account ID
    // ────────────────────────────────────────────────────────────
    let accountId = hederaAccountId;

    if (!accountId) {
      // Look up by public key via Mirror Node
      const mirrorRes = await fetch(
        `${MIRROR_URL}/api/v1/accounts?account.publickey=${publicKeyDer}&limit=1`
      );
      const mirrorData = await mirrorRes.json();

      if (!mirrorData.accounts || mirrorData.accounts.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No Hedera account found for this public key",
        });
      }

      accountId = mirrorData.accounts[0].account;
    }

    // ────────────────────────────────────────────────────────────
    // Step 3: Get account info (EVM address, balances)
    // ────────────────────────────────────────────────────────────
    const client = getHederaClient();
    const accountInfo = await new AccountInfoQuery()
      .setAccountId(AccountId.fromString(accountId))
      .execute(client);

    const evmAddress = `0x${accountInfo.contractAccountId}`;
    // toBigNumber() returns HBAR (not tinybar), no need to divide by 1e8
    const hbarBalance = accountInfo.balance.toBigNumber().toNumber();

    // Get token balances from mirror node
    const balanceRes = await fetch(
      `${MIRROR_URL}/api/v1/accounts/${accountId}/tokens`
    );
    const balanceData = await balanceRes.json();
    const tokens = (balanceData.tokens || []).map(
      (t: { token_id: string; balance: number }) => ({
        tokenId: t.token_id,
        balance: t.balance,
      })
    );

    // ────────────────────────────────────────────────────────────
    // Step 4: Scan master topic for registration event
    // ────────────────────────────────────────────────────────────
    const masterTopicId = getMasterTopicId();
    let registration: Record<string, unknown> | null = null;

    if (masterTopicId) {
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
            registration = decoded;
            break;
          }
        } catch {
          // skip non-JSON messages
        }
      }
    }

    if (!registration) {
      return res.status(404).json({
        success: false,
        error: `Account ${accountId} not found in SPARK master topic${
          masterTopicId ? ` (${masterTopicId})` : ""
        }`,
        accountId,
        evmAddress,
        publicKey: publicKeyDer,
      });
    }

    const botTopicId = registration.botTopicId as string;
    const voteTopicId = registration.voteTopicId as string;
    const zgRootHash = registration.zgRootHash as string;
    const iNftTokenId = registration.iNftTokenId as number;
    const botId = registration.botId as string;

    // ────────────────────────────────────────────────────────────
    // Step 5: Read bot topic messages (activity history)
    // ────────────────────────────────────────────────────────────
    const botTopicRes = await fetch(
      `${MIRROR_URL}/api/v1/topics/${botTopicId}/messages?limit=100`
    );
    const botTopicData = await botTopicRes.json();
    const botMessages: Record<string, unknown>[] = [];
    for (const msg of botTopicData.messages || []) {
      try {
        const decoded = JSON.parse(
          Buffer.from(msg.message, "base64").toString("utf-8")
        );
        botMessages.push({
          ...decoded,
          sequenceNumber: msg.sequence_number,
          timestamp: msg.consensus_timestamp,
        });
      } catch {
        // skip
      }
    }

    // ────────────────────────────────────────────────────────────
    // Step 6: Read vote topic messages (reputation)
    // ────────────────────────────────────────────────────────────
    const voteTopicRes = await fetch(
      `${MIRROR_URL}/api/v1/topics/${voteTopicId}/messages?limit=100`
    );
    const voteTopicData = await voteTopicRes.json();
    let upvotes = 0;
    let downvotes = 0;
    const voteMessages: Record<string, unknown>[] = [];
    for (const msg of voteTopicData.messages || []) {
      try {
        const decoded = JSON.parse(
          Buffer.from(msg.message, "base64").toString("utf-8")
        );
        voteMessages.push(decoded);
        // Count HCS-20 mints for upvote/downvote
        if (decoded.p === "hcs-20" && decoded.op === "mint") {
          if (decoded.tick === "upvote") upvotes += Number(decoded.amt || 1);
          if (decoded.tick === "downvote")
            downvotes += Number(decoded.amt || 1);
        }
      } catch {
        // skip
      }
    }

    // ────────────────────────────────────────────────────────────
    // Step 7: Query iNFT on 0G Chain
    // ────────────────────────────────────────────────────────────
    let agentProfile: Record<string, unknown> | null = null;
    let isAuthorized = false;
    let intelligentData: unknown[] = [];

    if (iNftTokenId && iNftTokenId > 0) {
      try {
        const provider = new ethers.JsonRpcProvider(ZG_RPC);
        const contract = new ethers.Contract(
          SPARKINFT_ADDRESS,
          SPARKINFT_ABI,
          provider
        );

        // getAgentProfile
        const profile = await contract.getAgentProfile(iNftTokenId);
        agentProfile = {
          botId: profile.botId,
          domainTags: profile.domainTags,
          serviceOfferings: profile.serviceOfferings,
          reputationScore: Number(profile.reputationScore),
          contributionCount: Number(profile.contributionCount),
          createdAt: Number(profile.createdAt),
          updatedAt: Number(profile.updatedAt),
        };

        // isAuthorized
        isAuthorized = await contract.isAuthorized(iNftTokenId, evmAddress);

        // intelligentDatasOf
        const iDatas = await contract.intelligentDatasOf(iNftTokenId);
        intelligentData = iDatas.map(
          (d: { dataDescription: string; dataHash: string }) => ({
            dataDescription: d.dataDescription,
            dataHash: d.dataHash,
          })
        );
      } catch (err) {
        // 0G chain query failed, non-critical
        agentProfile = {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // ────────────────────────────────────────────────────────────
    // Return full reconstructed profile
    // ────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,

      // Identity
      botId,
      hederaAccountId: accountId,
      hederaPublicKey: publicKeyDer,
      evmAddress,

      // Balances
      hbarBalance,
      tokens,

      // Topics
      masterTopicId,
      botTopicId,
      voteTopicId,

      // 0G Chain (iNFT)
      iNftTokenId,
      iNftContract: SPARKINFT_ADDRESS,
      isAuthorized,
      agentProfile,
      intelligentData,

      // 0G Storage
      zgRootHash,

      // Activity
      botMessages,
      botMessageCount: botMessages.length,

      // Reputation
      upvotes,
      downvotes,
      netReputation: upvotes - downvotes,
      voteMessages,

      // Registration metadata
      registeredAt: registration.timestamp,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

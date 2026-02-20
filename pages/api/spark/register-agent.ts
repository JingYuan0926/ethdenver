import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccountCreateTransaction,
  AccountInfoQuery,
  Client,
  AccountId,
  Hbar,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { ZgFile, Indexer } from "@0gfoundation/0g-ts-sdk";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { keccak256, toUtf8Bytes } from "ethers";

import { getHederaClient, getOperatorKey, getOperatorId } from "@/lib/hedera";
import { encrypt } from "@/lib/encrypt";
import { SPARKINFT_ABI, SPARKINFT_ADDRESS } from "@/lib/sparkinft-abi";

// ── 0G Config ────────────────────────────────────────────────────
const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

// ── USDC on Hedera Testnet ───────────────────────────────────────
const USDC_TOKEN_ID = "0.0.7984944";
const USDC_AIRDROP_AMOUNT = 100_000_000; // 100 USDC (6 decimals)

// ── Master topic persistence ─────────────────────────────────────
const CONFIG_PATH = join(process.cwd(), "spark-config.json");

function readConfig(): Record<string, string> {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  }
  return {};
}

function writeConfig(data: Record<string, string>) {
  const existing = readConfig();
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

async function ensureMasterTopic(): Promise<string> {
  // 1. Check env var
  const envTopic = process.env.SPARK_MASTER_TOPIC_ID;
  if (envTopic) return envTopic;

  // 2. Check persisted config
  const config = readConfig();
  if (config.masterTopicId) return config.masterTopicId;

  // 3. Create new master topic with operator submit key
  const client = getHederaClient();
  const operatorKey = getOperatorKey();

  const tx = await new TopicCreateTransaction()
    .setTopicMemo("SPARK Master Ledger")
    .setSubmitKey(operatorKey.publicKey)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId!.toString();

  writeConfig({ masterTopicId: topicId });
  return topicId;
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
    botId,
    domainTags = "",
    serviceOfferings = "",
    systemPrompt = "",
    modelProvider = "",
    apiKey = "",
  } = req.body;

  if (!botId) {
    return res.status(400).json({ success: false, error: "botId is required" });
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
    const operatorId = getOperatorId();

    // ────────────────────────────────────────────────────────────
    // Step 1: Ensure master topic
    // ────────────────────────────────────────────────────────────
    const masterTopicId = await ensureMasterTopic();

    // ────────────────────────────────────────────────────────────
    // Step 2: Create Hedera account (10 HBAR, unlimited auto-assoc)
    // ────────────────────────────────────────────────────────────
    const botKey = PrivateKey.generateED25519();

    const accountTx = await new AccountCreateTransaction()
      .setKey(botKey.publicKey)
      .setInitialBalance(new Hbar(10))
      .setMaxAutomaticTokenAssociations(-1)
      .execute(client);

    const accountReceipt = await accountTx.getReceipt(client);
    const hederaAccountId = accountReceipt.accountId!.toString();

    // Get EVM address
    const accountInfo = await new AccountInfoQuery()
      .setAccountId(AccountId.fromString(hederaAccountId))
      .execute(client);
    const evmAddress = `0x${accountInfo.contractAccountId}`;

    // ────────────────────────────────────────────────────────────
    // Step 3: Airdrop 100 USDC from operator treasury
    // ────────────────────────────────────────────────────────────
    const usdcTx = await new TransferTransaction()
      .addTokenTransfer(USDC_TOKEN_ID, operatorId, -USDC_AIRDROP_AMOUNT)
      .addTokenTransfer(USDC_TOKEN_ID, hederaAccountId, USDC_AIRDROP_AMOUNT)
      .execute(client);
    await usdcTx.getReceipt(client);

    // ────────────────────────────────────────────────────────────
    // Step 4: Create bot's personal topic (submit key = bot's key)
    // ────────────────────────────────────────────────────────────
    const botTopicTx = await new TopicCreateTransaction()
      .setTopicMemo(`SPARK Bot: ${botId}`)
      .setSubmitKey(botKey.publicKey)
      .execute(client);

    const botTopicReceipt = await botTopicTx.getReceipt(client);
    const botTopicId = botTopicReceipt.topicId!.toString();

    // ────────────────────────────────────────────────────────────
    // Step 5: Create vote topic (public, no submit key)
    // ────────────────────────────────────────────────────────────
    const voteTopicTx = await new TopicCreateTransaction()
      .setTopicMemo(`SPARK Votes: ${botId}`)
      .execute(client);

    const voteTopicReceipt = await voteTopicTx.getReceipt(client);
    const voteTopicId = voteTopicReceipt.topicId!.toString();

    // ────────────────────────────────────────────────────────────
    // Step 6: Deploy HCS-20 tickers on vote topic
    // ────────────────────────────────────────────────────────────
    const upMsg = JSON.stringify({
      p: "hcs-20",
      op: "deploy",
      name: `${botId} Upvotes`,
      tick: "upvote",
      max: "999999999",
      lim: "1",
    });
    await (
      await new TopicMessageSubmitTransaction()
        .setTopicId(voteTopicId)
        .setMessage(upMsg)
        .execute(client)
    ).getReceipt(client);

    const downMsg = JSON.stringify({
      p: "hcs-20",
      op: "deploy",
      name: `${botId} Downvotes`,
      tick: "downvote",
      max: "999999999",
      lim: "1",
    });
    await (
      await new TopicMessageSubmitTransaction()
        .setTopicId(voteTopicId)
        .setMessage(downMsg)
        .execute(client)
    ).getReceipt(client);

    // ────────────────────────────────────────────────────────────
    // Step 7: Upload agent config to 0G Storage
    // ────────────────────────────────────────────────────────────
    const encryptedApiKey = apiKey ? encrypt(apiKey) : "";

    const agentConfig = {
      version: "1.0.0",
      botId,
      hederaAccountId,
      evmAddress,
      botTopicId,
      voteTopicId,
      persona: botId,
      modelProvider,
      apiKey: encryptedApiKey,
      encrypted: !!apiKey,
      systemPrompt,
      domainTags,
      serviceOfferings,
      metadata: {
        created: new Date().toISOString(),
        type: "spark-agent",
        standard: "ERC-7857",
        network: "hedera-testnet",
      },
    };

    const configJson = JSON.stringify(agentConfig, null, 2);
    const configHash = keccak256(toUtf8Bytes(configJson));
    const tmpPath = join(tmpdir(), `spark-register-${Date.now()}.json`);
    writeFileSync(tmpPath, configJson);

    const provider = new ethers.JsonRpcProvider(ZG_RPC);
    const zgSigner = new ethers.Wallet(zgPrivateKey, provider);
    const indexer = new Indexer(ZG_INDEXER);

    const zgFile = await ZgFile.fromFilePath(tmpPath);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr || !tree) throw new Error(`Merkle tree: ${treeErr}`);
    const zgRootHash = tree.rootHash();

    const [, uploadErr] = await indexer.upload(zgFile, ZG_RPC, zgSigner);
    if (uploadErr) throw new Error(`0G upload: ${uploadErr}`);

    await zgFile.close();
    unlinkSync(tmpPath);

    // ────────────────────────────────────────────────────────────
    // Step 8: Mint iNFT on 0G Chain (operator wallet)
    // ────────────────────────────────────────────────────────────
    const inftContract = new ethers.Contract(
      SPARKINFT_ADDRESS,
      SPARKINFT_ABI,
      zgSigner
    );

    const dataDescription = `0g://storage/${zgRootHash}`;
    const iDatas = [{ dataDescription, dataHash: configHash }];

    const mintTx = await inftContract.mintAgent(
      await zgSigner.getAddress(),
      botId,
      domainTags,
      serviceOfferings,
      iDatas
    );
    const mintReceipt = await mintTx.wait();

    // Parse token ID from AgentMinted event
    let iNftTokenId = 0;
    for (const log of mintReceipt.logs) {
      try {
        const parsed = inftContract.interface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (parsed?.name === "AgentMinted") {
          iNftTokenId = Number(parsed.args.tokenId ?? parsed.args[0]);
          break;
        }
      } catch {
        // not our event, skip
      }
    }
    // Fallback: try Transfer event (ERC-721)
    if (iNftTokenId === 0) {
      for (const log of mintReceipt.logs) {
        try {
          const parsed = inftContract.interface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });
          if (parsed?.name === "Transfer") {
            iNftTokenId = Number(parsed.args.tokenId ?? parsed.args[2]);
            break;
          }
        } catch {
          // skip
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // Step 8b: Authorize bot's Hedera EVM address on the iNFT
    //          Operator owns the iNFT, bot is authorized to use it.
    //          Anyone can verify: isAuthorized(tokenId, evmAddress)
    // ────────────────────────────────────────────────────────────
    if (iNftTokenId > 0) {
      const authTx = await inftContract.authorizeUsage(
        iNftTokenId,
        evmAddress
      );
      await authTx.wait();
    }

    // ────────────────────────────────────────────────────────────
    // Step 9: Log to master topic (operator signs)
    // ────────────────────────────────────────────────────────────
    const masterMsg = JSON.stringify({
      action: "agent_registered",
      botId,
      hederaAccountId,
      evmAddress,
      zgRootHash,
      iNftTokenId,
      botTopicId,
      voteTopicId,
      timestamp: new Date().toISOString(),
    });

    const masterSeqNo = await submitToTopic(
      client,
      masterTopicId,
      masterMsg,
      operatorKey
    );

    // ────────────────────────────────────────────────────────────
    // Step 10: Log to bot topic (bot signs with its own key)
    // ────────────────────────────────────────────────────────────
    const botMsg = JSON.stringify({
      action: "i_registered",
      zgRootHash,
      iNftTokenId,
      hederaAccountId,
      botTopicId,
      voteTopicId,
      timestamp: new Date().toISOString(),
    });

    const botSeqNo = await submitToTopic(
      client,
      botTopicId,
      botMsg,
      botKey
    );

    // ────────────────────────────────────────────────────────────
    // Return complete agent identity bundle
    // ────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      hederaAccountId,
      hederaPrivateKey: botKey.toString(),
      hederaPublicKey: botKey.publicKey.toString(),
      evmAddress,
      botTopicId,
      voteTopicId,
      zgRootHash,
      configHash,
      iNftTokenId,
      masterTopicId,
      masterSeqNo,
      botSeqNo,
      airdrop: { hbar: 10, usdc: 100 },
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

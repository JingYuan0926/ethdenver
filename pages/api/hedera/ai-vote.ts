import type { NextApiRequest, NextApiResponse } from "next";
import {
  Client,
  AccountId,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { getHederaClient, getOperatorId } from "@/lib/hedera";

/**
 * AI Agent Voting via HCS-20
 *
 * Actions:
 *   setup  — create a public topic and deploy "upvote" + "downvote" tickers (operator pays)
 *   vote   — agent signs with its own key to mint 1 upvote/downvote to target
 *            the payer on-chain = the agent, proving who voted
 */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action } = req.body;

  if (!action) {
    return res.status(400).json({ error: "action is required (setup | vote)" });
  }

  try {
    if (action === "setup") {
      return await handleSetup(res);
    }

    if (action === "vote") {
      const { topicId, agentAccountId, agentPrivateKey, target, vote } = req.body;
      if (!topicId || !agentAccountId || !agentPrivateKey || !target || !vote) {
        return res.status(400).json({
          error: "vote requires topicId, agentAccountId, agentPrivateKey, target, vote (up|down)",
        });
      }
      if (vote !== "up" && vote !== "down") {
        return res.status(400).json({ error: "vote must be 'up' or 'down'" });
      }
      if (agentAccountId === target) {
        return res.status(400).json({ error: "Cannot vote for yourself" });
      }
      return await handleVote(topicId, agentAccountId, agentPrivateKey, target, vote, res);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

async function handleSetup(res: NextApiResponse) {
  const client = getHederaClient();

  // Public topic (no submit key) — any agent can write with their own key
  const topicTx = await new TopicCreateTransaction()
    .setTopicMemo("AI Agent Reputation (HCS-20)")
    .execute(client);

  const topicReceipt = await topicTx.getReceipt(client);
  const topicId = topicReceipt.topicId!.toString();

  // Deploy "upvote" ticker
  const upMsg = JSON.stringify({
    p: "hcs-20",
    op: "deploy",
    name: "AI Agent Upvotes",
    tick: "upvote",
    max: "999999999",
    lim: "1",
  });

  await (
    await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(upMsg)
      .execute(client)
  ).getReceipt(client);

  // Deploy "downvote" ticker
  const downMsg = JSON.stringify({
    p: "hcs-20",
    op: "deploy",
    name: "AI Agent Downvotes",
    tick: "downvote",
    max: "999999999",
    lim: "1",
  });

  await (
    await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(downMsg)
      .execute(client)
  ).getReceipt(client);

  return res.status(200).json({
    success: true,
    topicId,
    tickers: ["upvote", "downvote"],
    mode: "public (each agent signs with own key)",
    operatorId: getOperatorId(),
  });
}

async function handleVote(
  topicId: string,
  agentAccountId: string,
  agentPrivateKey: string,
  target: string,
  vote: "up" | "down",
  res: NextApiResponse
) {
  // Create a client for this agent so the payer = the agent
  const agentKey = PrivateKey.fromStringED25519(agentPrivateKey);
  const agentClient = Client.forTestnet();
  agentClient.setOperator(AccountId.fromString(agentAccountId), agentKey);

  const tick = vote === "up" ? "upvote" : "downvote";

  const mintMsg = JSON.stringify({
    p: "hcs-20",
    op: "mint",
    tick,
    amt: "1",
    to: target,
    m: `voted by ${agentAccountId}`,
  });

  const txResponse = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(mintMsg)
    .execute(agentClient);

  const receipt = await txResponse.getReceipt(agentClient);

  agentClient.close();

  return res.status(200).json({
    success: true,
    topicId,
    voter: agentAccountId,
    target,
    vote,
    tick,
    status: receipt.status.toString(),
    sequenceNumber: receipt.topicSequenceNumber?.toString(),
  });
}

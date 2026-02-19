import type { NextApiRequest, NextApiResponse } from "next";
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { getHederaClient, getOperatorKey, getOperatorId } from "@/lib/hedera";

/**
 * AI Agent Voting via HCS-20
 *
 * Actions:
 *   setup  — create a private topic (submit key = operator) and deploy "upvote" + "downvote" tickers
 *   vote   — mint 1 upvote or 1 downvote point to the target agent
 *   scores — read topic messages and tally net scores (upvotes - downvotes)
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
    const client = getHederaClient();

    if (action === "setup") {
      return await handleSetup(client, res);
    }

    if (action === "vote") {
      const { topicId, voter, target, vote } = req.body;
      if (!topicId || !voter || !target || !vote) {
        return res.status(400).json({ error: "vote requires topicId, voter, target, vote (up|down)" });
      }
      if (vote !== "up" && vote !== "down") {
        return res.status(400).json({ error: "vote must be 'up' or 'down'" });
      }
      if (voter === target) {
        return res.status(400).json({ error: "Cannot vote for yourself" });
      }
      return await handleVote(client, topicId, voter, target, vote, res);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

async function handleSetup(client: Parameters<typeof getHederaClient>[0] extends never ? never : ReturnType<typeof getHederaClient>, res: NextApiResponse) {
  const operatorKey = getOperatorKey();

  // 1. Create private topic (submit key = operator so only server can write)
  const topicTx = await new TopicCreateTransaction()
    .setTopicMemo("AI Agent Reputation (HCS-20)")
    .setSubmitKey(operatorKey.publicKey)
    .execute(client);

  const topicReceipt = await topicTx.getReceipt(client);
  const topicId = topicReceipt.topicId!.toString();

  // 2. Deploy "upvote" ticker
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

  // 3. Deploy "downvote" ticker
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
    mode: "private (submit key = operator)",
    operatorId: getOperatorId(),
  });
}

async function handleVote(
  client: ReturnType<typeof getHederaClient>,
  topicId: string,
  voter: string,
  target: string,
  vote: "up" | "down",
  res: NextApiResponse
) {
  const tick = vote === "up" ? "upvote" : "downvote";

  // Mint 1 point to the target agent
  const mintMsg = JSON.stringify({
    p: "hcs-20",
    op: "mint",
    tick,
    amt: "1",
    to: target,
    m: `voted by ${voter}`,
  });

  const txResponse = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(mintMsg)
    .execute(client);

  const receipt = await txResponse.getReceipt(client);

  return res.status(200).json({
    success: true,
    topicId,
    voter,
    target,
    vote,
    tick,
    status: receipt.status.toString(),
    sequenceNumber: receipt.topicSequenceNumber?.toString(),
  });
}

import type { NextApiRequest, NextApiResponse } from "next";
import { TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

type HCS20Op = "deploy" | "mint" | "transfer" | "burn";

interface HCS20Deploy {
  p: "hcs-20";
  op: "deploy";
  name: string;
  tick: string;
  max: string;
  lim?: string;
  m?: string;
}

interface HCS20Mint {
  p: "hcs-20";
  op: "mint";
  tick: string;
  amt: string;
  to: string;
  m?: string;
}

interface HCS20Transfer {
  p: "hcs-20";
  op: "transfer";
  tick: string;
  amt: string;
  from: string;
  to: string;
  m?: string;
}

interface HCS20Burn {
  p: "hcs-20";
  op: "burn";
  tick: string;
  amt: string;
  from: string;
  m?: string;
}

type HCS20Message = HCS20Deploy | HCS20Mint | HCS20Transfer | HCS20Burn;

function buildMessage(body: Record<string, string>): HCS20Message {
  const op = body.op as HCS20Op;

  switch (op) {
    case "deploy":
      if (!body.name || !body.tick || !body.max) {
        throw new Error("deploy requires name, tick, and max");
      }
      return {
        p: "hcs-20",
        op: "deploy",
        name: body.name,
        tick: body.tick.toLowerCase().trim(),
        max: body.max,
        ...(body.lim && { lim: body.lim }),
        ...(body.m && { m: body.m }),
      };

    case "mint":
      if (!body.tick || !body.amt || !body.to) {
        throw new Error("mint requires tick, amt, and to");
      }
      return {
        p: "hcs-20",
        op: "mint",
        tick: body.tick.toLowerCase().trim(),
        amt: body.amt,
        to: body.to,
        ...(body.m && { m: body.m }),
      };

    case "transfer":
      if (!body.tick || !body.amt || !body.from || !body.to) {
        throw new Error("transfer requires tick, amt, from, and to");
      }
      return {
        p: "hcs-20",
        op: "transfer",
        tick: body.tick.toLowerCase().trim(),
        amt: body.amt,
        from: body.from,
        to: body.to,
        ...(body.m && { m: body.m }),
      };

    case "burn":
      if (!body.tick || !body.amt || !body.from) {
        throw new Error("burn requires tick, amt, and from");
      }
      return {
        p: "hcs-20",
        op: "burn",
        tick: body.tick.toLowerCase().trim(),
        amt: body.amt,
        from: body.from,
        ...(body.m && { m: body.m }),
      };

    default:
      throw new Error(`Unknown op: ${op}. Use deploy, mint, transfer, or burn`);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { topicId, ...params } = req.body;

  if (!params.op) {
    return res.status(400).json({ error: "op is required (deploy | mint | transfer | burn)" });
  }

  if (!topicId) {
    return res.status(400).json({ error: "topicId is required" });
  }

  try {
    const hcs20Msg = buildMessage(params);
    const messageJson = JSON.stringify(hcs20Msg);

    const client = getHederaClient();

    const txResponse = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(messageJson)
      .execute(client);

    const receipt = await txResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      topicId,
      op: hcs20Msg.op,
      message: hcs20Msg,
      status: receipt.status.toString(),
      sequenceNumber: receipt.topicSequenceNumber?.toString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

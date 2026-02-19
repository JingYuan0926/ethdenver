import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  PAYROLL_VAULT_ADDRESS,
  PAYROLL_VAULT_ABI,
  HEDERA_RPC_URL,
} from "@/lib/payroll-vault-abi";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const vaultAddr = req.body.vaultAddress || PAYROLL_VAULT_ADDRESS;
  if (!vaultAddr) {
    return res
      .status(400)
      .json({ success: false, error: "No vault address configured" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
    const vault = new ethers.Contract(vaultAddr, PAYROLL_VAULT_ABI, provider);

    const [balance, agentCount, historyCount, owner, defaultAmount, defaultInterval] =
      await Promise.all([
        vault.getVaultBalance(),
        vault.getAgentCount(),
        vault.getScheduleHistoryCount(),
        vault.owner(),
        vault.defaultAmount(),
        vault.defaultInterval(),
      ]);

    // Fetch all agents
    const agents = [];
    const count = Number(agentCount);
    for (let i = 0; i < count; i++) {
      const a = await vault.getAgent(i);
      agents.push({
        agent: a.agent,
        amountPerPeriod: a.amountPerPeriod.toString(),
        intervalSeconds: Number(a.intervalSeconds),
        nextPaymentTime: Number(a.nextPaymentTime),
        currentScheduleAddr: a.currentScheduleAddr,
        status: Number(a.status),
        totalPaid: a.totalPaid.toString(),
        paymentCount: Number(a.paymentCount),
        active: a.active,
        agentName: a.agentName,
      });
    }

    // Fetch recent history (last 20)
    const hCount = Number(historyCount);
    const fetchCount = Math.min(hCount, 20);
    let history: Array<Record<string, unknown>> = [];
    if (fetchCount > 0) {
      const records = await vault.getRecentHistory(fetchCount);
      history = records.map(
        (r: {
          agentIdx: bigint;
          scheduleAddress: string;
          scheduledTime: bigint;
          createdAt: bigint;
          executedAt: bigint;
          status: bigint;
        }) => ({
          agentIdx: Number(r.agentIdx),
          scheduleAddress: r.scheduleAddress,
          scheduledTime: Number(r.scheduledTime),
          createdAt: Number(r.createdAt),
          executedAt: Number(r.executedAt),
          status: Number(r.status),
        })
      );
    }

    return res.status(200).json({
      success: true,
      vault: {
        address: vaultAddr,
        balance: balance.toString(),
        owner,
        defaultAmount: defaultAmount.toString(),
        defaultInterval: Number(defaultInterval),
        agentCount: count,
        historyCount: hCount,
      },
      agents,
      history,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

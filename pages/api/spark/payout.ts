import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";

import {
  PAYROLL_VAULT_ADDRESS,
  PAYROLL_VAULT_ABI,
  HEDERA_RPC_URL,
} from "@/lib/payroll-vault-abi";

// Payout config: 1 USDC per 10 seconds per contributor
const PAYOUT_AMOUNT_USDC = "1"; // 1 USDC (6 decimals)
const PAYOUT_INTERVAL = 10; // 10 seconds

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ success: false, error: "GET or POST" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
    const vault = new ethers.Contract(PAYROLL_VAULT_ADDRESS, PAYROLL_VAULT_ABI, provider);
    const payoutAmountRaw = ethers.parseUnits(PAYOUT_AMOUNT_USDC, 6);

    // ── GET: list all contributor payroll agents ──
    if (req.method === "GET") {
      const agentCount = Number(await vault.getAgentCount());
      const tokenBalance = await vault.getTokenBalance();
      const agents: Array<{
        idx: number;
        address: string;
        name: string;
        amount: string;
        interval: number;
        status: number;
        active: boolean;
        totalPaid: string;
        payments: number;
        nextPayment: number;
        scheduleAddr: string;
      }> = [];

      for (let i = 0; i < agentCount; i++) {
        const a = await vault.getAgent(i);
        // Only include contributor agents (name starts with "contributor:")
        if ((a.agentName as string).startsWith("contributor:")) {
          agents.push({
            idx: i,
            address: a.agent,
            name: a.agentName,
            amount: a.amountPerPeriod.toString(),
            interval: Number(a.intervalSeconds),
            status: Number(a.status),
            active: a.active,
            totalPaid: a.totalPaid.toString(),
            payments: Number(a.paymentCount),
            nextPayment: Number(a.nextPaymentTime),
            scheduleAddr: a.currentScheduleAddr,
          });
        }
      }

      return res.status(200).json({
        success: true,
        vaultBalance: (Number(tokenBalance) / 1e6).toFixed(2) + " USDC",
        agents,
      });
    }

    // ── POST: add a single contributor address + start payroll ──
    const { evmAddress } = req.body;
    if (!evmAddress) {
      return res.status(400).json({ success: false, error: "evmAddress is required" });
    }

    const privateKey = process.env.HEDERA_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ success: false, error: "Missing HEDERA_PRIVATE_KEY" });
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const vaultSigner = new ethers.Contract(PAYROLL_VAULT_ADDRESS, PAYROLL_VAULT_ABI, wallet);

    const alreadyAgent = await vaultSigner.isAgent(evmAddress);
    if (alreadyAgent) {
      const agentIdx = Number(await vaultSigner.agentIndex(evmAddress));
      const agent = await vaultSigner.getAgent(agentIdx);
      const agentStatus = Number(agent.status);

      // If not running (None=0, Failed=3, Cancelled=4), start it
      if (agentStatus !== 1) {
        const startTx = await vaultSigner.startPayroll(BigInt(agentIdx));
        await startTx.wait();
        return res.status(200).json({
          success: true,
          action: "restarted",
          agentIdx,
          evmAddress,
          message: `Contributor already exists (agent #${agentIdx}), restarted payroll`,
        });
      }

      return res.status(200).json({
        success: true,
        action: "already_running",
        agentIdx,
        evmAddress,
        message: `Contributor already running as agent #${agentIdx}`,
      });
    }

    // Add new agent
    const addTx = await vaultSigner.addAgent(
      evmAddress,
      `contributor:${evmAddress.slice(0, 10)}`,
      payoutAmountRaw,
      BigInt(PAYOUT_INTERVAL)
    );
    await addTx.wait();

    const agentCount = Number(await vaultSigner.getAgentCount());
    const agentIdx = agentCount - 1;

    // Start payroll
    const startTx = await vaultSigner.startPayroll(BigInt(agentIdx));
    await startTx.wait();

    return res.status(200).json({
      success: true,
      action: "added+started",
      agentIdx,
      evmAddress,
      message: `Added contributor as agent #${agentIdx} and started payroll (1 USDC / 10s)`,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

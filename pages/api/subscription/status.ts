import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  SUBSCRIPTION_VAULT_ADDRESS,
  SUBSCRIPTION_VAULT_ABI,
  HEDERA_RPC_URL,
} from "@/lib/subscription-vault-abi";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const vaultAddr =
    (req.query.vaultAddress as string) || SUBSCRIPTION_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
    const vault = new ethers.Contract(
      vaultAddr,
      SUBSCRIPTION_VAULT_ABI,
      provider
    );

    const [allSubs, historyCount, vaultBalance, collectedHbar] =
      await Promise.all([
        vault.getAllSubscriptions(),
        vault.getSubScheduleHistoryCount(),
        vault.getVaultBalance(),
        vault.getCollectedHbar(),
      ]);

    // Fetch recent history
    const histCount = Number(historyCount);
    const recentCount = Math.min(histCount, 20);
    const recentHistory =
      recentCount > 0 ? await vault.getSubRecentHistory(recentCount) : [];

    const statusNames = ["None", "Pending", "Executed", "Failed", "Cancelled"];
    const modeNames = ["HBAR", "Token"];

    const subscriptionsList = await Promise.all(
      allSubs.map(async (s: any, i: number) => {
        const hbarBal =
          Number(s.mode) === 0
            ? await vault.getSubHbarBalance(i)
            : BigInt(0);
        return {
          idx: i,
          subscriber: s.subscriber,
          name: s.name,
          amountPerPeriod: s.amountPerPeriod.toString(),
          intervalSeconds: Number(s.intervalSeconds),
          nextPaymentTime: Number(s.nextPaymentTime),
          status: statusNames[Number(s.status)] || "Unknown",
          totalPaid: s.totalPaid.toString(),
          paymentCount: Number(s.paymentCount),
          active: s.active,
          mode: modeNames[Number(s.mode)] || "Unknown",
          token: s.token,
          hbarEscrow: ethers.formatUnits(hbarBal, 8),
        };
      })
    );

    const history = recentHistory.map((r: any) => ({
      subIdx: Number(r.subIdx),
      scheduleAddress: r.scheduleAddress,
      scheduledTime: Number(r.scheduledTime),
      createdAt: Number(r.createdAt),
      executedAt: Number(r.executedAt),
      status: statusNames[Number(r.status)] || "Unknown",
    }));

    return res.status(200).json({
      success: true,
      vaultAddress: vaultAddr,
      vaultHbarBalance: ethers.formatUnits(vaultBalance, 8),
      collectedHbar: ethers.formatUnits(collectedHbar, 8),
      subscriptionCount: subscriptionsList.length,
      subscriptions: subscriptionsList,
      scheduleHistoryCount: histCount,
      recentHistory: history,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

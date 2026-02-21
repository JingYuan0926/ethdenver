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
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }

  const { subscriberAddress } = req.body;

  if (!subscriberAddress) {
    return res.status(400).json({
      success: false,
      error: "Required: subscriberAddress (EVM address)",
    });
  }

  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
    const vault = new ethers.Contract(
      SUBSCRIPTION_VAULT_ADDRESS,
      SUBSCRIPTION_VAULT_ABI,
      provider
    );

    const allSubs = await vault.getAllSubscriptions();

    // Find an active subscription whose name matches this specific agent.
    // Name format: "gated-knowledge-<evmAddress>"
    const expectedName = `gated-knowledge-${subscriberAddress.toLowerCase()}`;
    let hasAccess = false;
    let matchedSub: {
      subIdx: number;
      status: number;
      active: boolean;
      paymentCount: number;
      totalPaid: string;
      nextPaymentTime: number;
      name: string;
    } | null = null;

    for (let i = 0; i < allSubs.length; i++) {
      const sub = allSubs[i];
      if (
        sub.active &&
        (sub.name as string).toLowerCase() === expectedName
      ) {
        const status = Number(sub.status);
        // Pending (1) or Executed (2) = has access
        if (status === 1 || status === 2) {
          hasAccess = true;
          matchedSub = {
            subIdx: i,
            status,
            active: sub.active,
            paymentCount: Number(sub.paymentCount),
            totalPaid: sub.totalPaid.toString(),
            nextPaymentTime: Number(sub.nextPaymentTime),
            name: sub.name,
          };
          break;
        }
      }
    }

    return res.status(200).json({
      success: true,
      hasAccess,
      subscription: matchedSub,
    });
  } catch (err: unknown) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

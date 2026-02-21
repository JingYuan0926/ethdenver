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

  const { agentIdx, amountPerPeriod, intervalSeconds, vaultAddress } = req.body;
  const vaultAddr = vaultAddress || PAYROLL_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }
  if (agentIdx === undefined || agentIdx === null) {
    return res
      .status(400)
      .json({ success: false, error: "agentIdx is required" });
  }

  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (!privateKey) {
    return res
      .status(500)
      .json({ success: false, error: "Missing HEDERA_PRIVATE_KEY in env" });
  }

  try {
    const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const vault = new ethers.Contract(vaultAddr, PAYROLL_VAULT_ABI, wallet);

    // Check if vault is in token mode
    const paymentToken = await vault.paymentToken();
    const isTokenMode = paymentToken !== ethers.ZeroAddress;

    let newAmount = BigInt(0);
    if (amountPerPeriod) {
      if (isTokenMode) {
        const token = new ethers.Contract(
          paymentToken,
          ["function decimals() view returns (uint8)"],
          provider
        );
        const decimals = await token.decimals();
        newAmount = ethers.parseUnits(String(amountPerPeriod), decimals);
      } else {
        newAmount = ethers.parseUnits(String(amountPerPeriod), 8);
      }
    }
    const newInterval = intervalSeconds ? BigInt(intervalSeconds) : BigInt(0);

    const tx = await vault.updateAgent(BigInt(agentIdx), newAmount, newInterval);
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      message: `Agent #${agentIdx} updated`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

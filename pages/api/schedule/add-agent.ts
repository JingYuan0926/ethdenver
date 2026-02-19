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

  const { agent, name, amountPerPeriod, intervalSeconds, vaultAddress } =
    req.body;
  const vaultAddr = vaultAddress || PAYROLL_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }
  if (!agent || !name) {
    return res
      .status(400)
      .json({ success: false, error: "agent address and name are required" });
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

    // 0 means use contract defaults; input is HBAR, convert to tinybar (8 decimals)
    // Hedera EVM uses tinybar internally for address.balance and msg.value
    const amount = amountPerPeriod
      ? ethers.parseUnits(String(amountPerPeriod), 8)
      : 0n;
    const interval = intervalSeconds ? BigInt(intervalSeconds) : 0n;

    const tx = await vault.addAgent(agent, name, amount, interval);
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      agent,
      name,
      message: `Agent "${name}" added`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

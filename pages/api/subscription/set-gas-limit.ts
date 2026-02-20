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
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { gasLimit, vaultAddress } = req.body;
  const vaultAddr = vaultAddress || SUBSCRIPTION_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }
  if (!gasLimit || Number(gasLimit) < 400_000) {
    return res.status(400).json({
      success: false,
      error: "gasLimit required, minimum 400,000",
    });
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
    const vault = new ethers.Contract(
      vaultAddr,
      SUBSCRIPTION_VAULT_ABI,
      wallet
    );

    const tx = await vault.setGasLimit(BigInt(gasLimit));
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      newGasLimit: Number(gasLimit),
      estimatedCostPerCall: `~${(Number(gasLimit) * 870 / 1e9).toFixed(2)} HBAR at 870 gWei`,
      message: `Gas limit updated to ${Number(gasLimit).toLocaleString()}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

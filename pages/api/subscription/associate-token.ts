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

  const { token, vaultAddress } = req.body;
  const vaultAddr = vaultAddress || SUBSCRIPTION_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }
  if (!token) {
    return res.status(400).json({ success: false, error: "token is required" });
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

    const tx = await vault.associateToken(token, { gasLimit: 1_000_000 });
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      message: `Vault associated with token ${token}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    // Token may already be associated
    if (msg.includes("TOKEN_ALREADY_ASSOCIATED") || msg.includes("already associated")) {
      return res.status(200).json({
        success: true,
        message: "Token already associated with vault",
      });
    }
    return res.status(500).json({ success: false, error: msg });
  }
}

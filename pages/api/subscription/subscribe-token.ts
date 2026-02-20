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

  const { token, name, amountPerPeriod, intervalSeconds, vaultAddress } =
    req.body;
  const vaultAddr = vaultAddress || SUBSCRIPTION_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }
  if (!token || !name || !amountPerPeriod || !intervalSeconds) {
    return res.status(400).json({
      success: false,
      error:
        "token, name, amountPerPeriod, and intervalSeconds are required",
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

    // Convert human-readable amount to smallest units (USDC = 6 decimals)
    const decimals = 6;
    const amount = ethers.parseUnits(String(amountPerPeriod), decimals);

    const tx = await vault.subscribeToken(
      token,
      name,
      amount,
      BigInt(intervalSeconds),
      { gasLimit: 3_000_000 }
    );
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      message: `USDC subscription "${name}" created — ${amountPerPeriod} USDC every ${intervalSeconds}s`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

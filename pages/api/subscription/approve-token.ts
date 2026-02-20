import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  SUBSCRIPTION_VAULT_ADDRESS,
  HEDERA_RPC_URL,
} from "@/lib/subscription-vault-abi";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, amount, vaultAddress } = req.body;
  const vaultAddr = vaultAddress || SUBSCRIPTION_VAULT_ADDRESS;

  if (!vaultAddr) {
    return res.status(400).json({ success: false, error: "No vault address" });
  }
  if (!token || !amount) {
    return res.status(400).json({
      success: false,
      error: "token and amount are required",
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
    const tokenContract = new ethers.Contract(token, ERC20_ABI, wallet);

    // USDC = 6 decimals
    const decimals = 6;
    // Approve a large amount (1000x the per-period amount) so many periods can execute
    const approveAmount = ethers.parseUnits(
      String(Number(amount) * 1000),
      decimals
    );

    const balance = await tokenContract.balanceOf(wallet.address);
    const currentAllowance = await tokenContract.allowance(
      wallet.address,
      vaultAddr
    );

    const tx = await tokenContract.approve(vaultAddr, approveAmount, {
      gasLimit: 1_000_000,
    });
    const receipt = await tx.wait();

    return res.status(200).json({
      success: true,
      txHash: receipt.hash,
      approvedAmount: ethers.formatUnits(approveAmount, decimals),
      currentBalance: ethers.formatUnits(balance, decimals),
      previousAllowance: ethers.formatUnits(currentAllowance, decimals),
      message: `Approved ${ethers.formatUnits(approveAmount, decimals)} USDC for vault`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

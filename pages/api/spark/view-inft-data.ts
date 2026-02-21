import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { SPARKINFT_ABI, SPARKINFT_ADDRESS } from "@/lib/sparkinft-abi";
import {
  SUBSCRIPTION_VAULT_ADDRESS,
  SUBSCRIPTION_VAULT_ABI,
} from "@/lib/subscription-vault-abi";
import { HEDERA_RPC_URL } from "@/lib/payroll-vault-abi";

// ── 0G Config ────────────────────────────────────────────────────
const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }

  const { rootHash, tokenId, subscriberAddress } = req.body;

  // Mode 1: Download a specific file by rootHash
  if (rootHash) {
    try {
      const indexer = new Indexer(ZG_INDEXER);
      const tmpPath = join(tmpdir(), `spark-view-${Date.now()}.json`);

      const err = await indexer.download(rootHash, tmpPath, true);
      if (err) throw new Error(`0G download: ${err}`);

      const content = readFileSync(tmpPath, "utf-8");
      unlinkSync(tmpPath);

      // Try to parse as JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = content;
      }

      // Gate check: if this is gated knowledge, verify subscription
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as Record<string, unknown>).accessTier === "gated"
      ) {
        if (!subscriberAddress) {
          return res.status(403).json({
            success: false,
            error: "Subscription required. Provide subscriberAddress to access gated knowledge.",
            gated: true,
          });
        }

        // Check subscription status on the vault — match by agent-specific name
        const expectedName = `gated-knowledge-${subscriberAddress.toLowerCase()}`;
        const hProvider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
        const vault = new ethers.Contract(
          SUBSCRIPTION_VAULT_ADDRESS,
          SUBSCRIPTION_VAULT_ABI,
          hProvider
        );
        const allSubs = await vault.getAllSubscriptions();
        let hasAccess = false;
        for (const sub of allSubs) {
          if (
            sub.active &&
            (sub.name as string).toLowerCase() === expectedName
          ) {
            const st = Number(sub.status);
            if (st === 1 || st === 2) { hasAccess = true; break; }
          }
        }
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error: "Active subscription required to access gated knowledge. Subscribe first.",
            gated: true,
          });
        }
      }

      return res.status(200).json({
        success: true,
        rootHash,
        content: parsed,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Mode 2: List all intelligent data for a tokenId
  if (tokenId !== undefined && tokenId !== null) {
    const zgPrivateKey = process.env.ZG_STORAGE_PRIVATE_KEY;
    if (!zgPrivateKey) {
      return res.status(500).json({ success: false, error: "Missing ZG_STORAGE_PRIVATE_KEY" });
    }

    try {
      const provider = new ethers.JsonRpcProvider(ZG_RPC);
      const zgSigner = new ethers.Wallet(zgPrivateKey, provider);
      const inftContract = new ethers.Contract(SPARKINFT_ADDRESS, SPARKINFT_ABI, zgSigner);

      const data = await inftContract.intelligentDatasOf(tokenId);
      const entries = data.map((d: { dataDescription: string; dataHash: string }) => ({
        dataDescription: d.dataDescription,
        dataHash: d.dataHash,
      }));

      return res.status(200).json({
        success: true,
        tokenId: Number(tokenId),
        entries,
      });
    } catch (err: unknown) {
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(400).json({
    success: false,
    error: "Required: rootHash (string) or tokenId (number)",
  });
}

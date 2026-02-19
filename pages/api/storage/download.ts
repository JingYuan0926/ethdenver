import type { NextApiRequest, NextApiResponse } from "next";
import { Indexer } from "@0gfoundation/0g-ts-sdk";
import fs from "fs";
import path from "path";
import os from "os";

const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { rootHash } = req.body;
  if (!rootHash || typeof rootHash !== "string") {
    return res.status(400).json({
      success: false,
      error: "Provide 'rootHash' as a string in the request body",
    });
  }

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `spark-download-${Date.now()}.txt`);

  try {
    const indexer = new Indexer(INDEXER_RPC);
    const err = await indexer.download(rootHash, tmpFile, true);

    if (err) {
      return res.status(500).json({
        success: false,
        error: "Download failed: " + String(err),
      });
    }

    // Read downloaded content
    const content = fs.readFileSync(tmpFile, "utf-8");

    return res.status(200).json({
      success: true,
      rootHash,
      content,
      contentLength: content.length,
      verified: true,
      message: "Content downloaded from 0G Storage with Merkle proof verification",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

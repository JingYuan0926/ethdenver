import type { NextApiRequest, NextApiResponse } from "next";
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  PrivateKey,
} from "@hashgraph/sdk";
import { getHederaClient } from "@/lib/hedera";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = getHederaClient();
    const operatorKey = PrivateKey.fromStringDer(
      process.env.HEDERA_OPERATOR_KEY!
    );

    // Step 1: Create NFT collection
    const createTx = await new TokenCreateTransaction()
      .setTokenName("SPARK Demo NFT")
      .setTokenSymbol("SPNFT")
      .setTokenType(TokenType.NonFungibleUnique)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(100)
      .setTreasuryAccountId(client.operatorAccountId!)
      .setAdminKey(operatorKey.publicKey)
      .setSupplyKey(operatorKey.publicKey)
      .freezeWith(client);

    const signedCreateTx = await createTx.sign(operatorKey);
    const createResponse = await signedCreateTx.execute(client);
    const createReceipt = await createResponse.getReceipt(client);
    const tokenId = createReceipt.tokenId!;

    // Step 2: Mint one NFT with metadata
    const mintTx = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(Buffer.from("SPARK Knowledge Item #1 — ETHDenver 2026"))
      .freezeWith(client);

    const signedMintTx = await mintTx.sign(operatorKey);
    const mintResponse = await signedMintTx.execute(client);
    const mintReceipt = await mintResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      tokenId: tokenId.toString(),
      name: "SPARK Demo NFT",
      symbol: "SPNFT",
      maxSupply: 100,
      mintedSerials: mintReceipt.serials.map((s) => s.toString()),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

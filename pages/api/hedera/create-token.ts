import type { NextApiRequest, NextApiResponse } from "next";
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
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

    const tx = await new TokenCreateTransaction()
      .setTokenName("SPARK Demo Token")
      .setTokenSymbol("SPRK")
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(2)
      .setInitialSupply(10000)
      .setTreasuryAccountId(client.operatorAccountId!)
      .setSupplyType(TokenSupplyType.Infinite)
      .setAdminKey(operatorKey.publicKey)
      .setSupplyKey(operatorKey.publicKey)
      .freezeWith(client);

    const signedTx = await tx.sign(operatorKey);
    const txResponse = await signedTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return res.status(200).json({
      success: true,
      tokenId: receipt.tokenId?.toString(),
      name: "SPARK Demo Token",
      symbol: "SPRK",
      initialSupply: 10000,
      decimals: 2,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}

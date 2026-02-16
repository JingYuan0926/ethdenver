import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";

let client: Client | null = null;

export function getHederaClient(): Client {
  if (client) return client;

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env.local"
    );
  }

  client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromStringDer(operatorKey)
  );

  return client;
}

import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";

export function getOperatorKey(): PrivateKey {
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorKey) throw new Error("Missing HEDERA_OPERATOR_KEY in .env.local");
  return PrivateKey.fromStringDer(operatorKey);
}

export function getOperatorId(): string {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  if (!operatorId) throw new Error("Missing HEDERA_OPERATOR_ID in .env.local");
  return operatorId;
}

export function getHederaClient(): Client {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      "Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY in .env.local"
    );
  }

  const client = Client.forTestnet();
  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromStringDer(operatorKey)
  );

  return client;
}

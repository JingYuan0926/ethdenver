import { useState } from "react";

interface ApiResult {
  success: boolean;
  [key: string]: unknown;
}

export default function HederaPage() {
  const [topicResult, setTopicResult] = useState<ApiResult | null>(null);
  const [messageResult, setMessageResult] = useState<ApiResult | null>(null);
  const [tokenResult, setTokenResult] = useState<ApiResult | null>(null);
  const [nftResult, setNftResult] = useState<ApiResult | null>(null);
  const [accountResult, setAccountResult] = useState<ApiResult | null>(null);
  const [associateResult, setAssociateResult] = useState<ApiResult | null>(null);
  const [transferResult, setTransferResult] = useState<ApiResult | null>(null);
  const [balanceResult, setBalanceResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [topicId, setTopicId] = useState("");
  const [messageText, setMessageText] = useState("Hello from SPARK!");
  const [transferTokenId, setTransferTokenId] = useState("");
  const [transferReceiver, setTransferReceiver] = useState("");
  const [transferReceiverKey, setTransferReceiverKey] = useState("");
  const [transferAmount, setTransferAmount] = useState("100");
  const [balanceAccountId, setBalanceAccountId] = useState("");

  async function callApi(
    endpoint: string,
    body: Record<string, string> = {}
  ): Promise<ApiResult> {
    const res = await fetch(`/api/hedera/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function handleCreateTopic() {
    setLoading("topic");
    try {
      const result = await callApi("create-topic");
      setTopicResult(result);
      if (result.success && result.topicId) {
        setTopicId(result.topicId as string);
      }
    } catch (err) {
      setTopicResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleSubmitMessage() {
    if (!topicId) {
      setMessageResult({ success: false, error: "Create a topic first" });
      return;
    }
    setLoading("message");
    try {
      const result = await callApi("submit-message", {
        topicId,
        message: messageText,
      });
      setMessageResult(result);
    } catch (err) {
      setMessageResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleCreateToken() {
    setLoading("token");
    try {
      const result = await callApi("create-token");
      setTokenResult(result);
      if (result.success && result.tokenId) {
        setTransferTokenId(result.tokenId as string);
      }
    } catch (err) {
      setTokenResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleCreateNft() {
    setLoading("nft");
    try {
      const result = await callApi("create-nft");
      setNftResult(result);
    } catch (err) {
      setNftResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleCreateAccount() {
    setLoading("account");
    try {
      const result = await callApi("create-account");
      setAccountResult(result);
      if (result.success) {
        setTransferReceiver(result.accountId as string);
        setTransferReceiverKey(result.privateKey as string);
        setBalanceAccountId(result.accountId as string);
      }
    } catch (err) {
      setAccountResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleAssociateToken() {
    if (!transferTokenId || !transferReceiver || !transferReceiverKey) {
      setAssociateResult({ success: false, error: "Need token ID, receiver account, and receiver private key" });
      return;
    }
    setLoading("associate");
    try {
      const result = await callApi("associate-token", {
        tokenId: transferTokenId,
        accountId: transferReceiver,
        privateKey: transferReceiverKey,
      });
      setAssociateResult(result);
    } catch (err) {
      setAssociateResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleTransferToken() {
    if (!transferTokenId || !transferReceiver) {
      setTransferResult({ success: false, error: "Fill in token ID and receiver" });
      return;
    }
    setLoading("transfer");
    try {
      const result = await callApi("transfer-token", {
        tokenId: transferTokenId,
        receiverAccountId: transferReceiver,
        amount: transferAmount,
      });
      setTransferResult(result);
    } catch (err) {
      setTransferResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleCheckBalance() {
    if (!balanceAccountId) {
      setBalanceResult({ success: false, error: "Enter an account ID" });
      return;
    }
    setLoading("balance");
    try {
      const result = await callApi("balance", { accountId: balanceAccountId });
      setBalanceResult(result);
    } catch (err) {
      setBalanceResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "40px auto",
        fontFamily: "monospace",
        padding: "0 20px",
      }}
    >
      <h1>Hedera SDK Demo</h1>
      <p style={{ color: "#888" }}>
        Testnet — 3 native capabilities: HCS + HTS + Account Service
      </p>

      <hr style={{ margin: "24px 0" }} />

      {/* HCS: Create Topic */}
      <section style={{ margin: "24px 0" }}>
        <h2>1. Create Topic (HCS)</h2>
        <button onClick={handleCreateTopic} disabled={loading === "topic"}>
          {loading === "topic" ? "Creating..." : "Create Topic"}
        </button>
        {topicResult && <ResultBlock data={topicResult} />}
      </section>

      {/* HCS: Submit Message */}
      <section style={{ margin: "24px 0" }}>
        <h2>2. Submit Message (HCS)</h2>
        <div>
          <label>
            Topic ID:{" "}
            <input
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Message:{" "}
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              style={{ width: 300, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleSubmitMessage}
          disabled={loading === "message"}
          style={{ marginTop: 8 }}
        >
          {loading === "message" ? "Submitting..." : "Submit Message"}
        </button>
        {messageResult && <ResultBlock data={messageResult} />}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* HTS: Create Fungible Token */}
      <section style={{ margin: "24px 0" }}>
        <h2>3. Create Fungible Token (HTS)</h2>
        <button onClick={handleCreateToken} disabled={loading === "token"}>
          {loading === "token" ? "Creating..." : "Create Fungible Token"}
        </button>
        {tokenResult && <ResultBlock data={tokenResult} />}
      </section>

      {/* HTS: Create NFT */}
      <section style={{ margin: "24px 0" }}>
        <h2>4. Create NFT + Mint (HTS)</h2>
        <button onClick={handleCreateNft} disabled={loading === "nft"}>
          {loading === "nft" ? "Creating..." : "Create NFT & Mint"}
        </button>
        {nftResult && <ResultBlock data={nftResult} />}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* Account: Create Account */}
      <section style={{ margin: "24px 0" }}>
        <h2>5. Create Account</h2>
        <button onClick={handleCreateAccount} disabled={loading === "account"}>
          {loading === "account" ? "Creating..." : "Create New Account"}
        </button>
        {accountResult && <ResultBlock data={accountResult} />}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* HTS: Associate + Transfer Token */}
      <section style={{ margin: "24px 0" }}>
        <h2>6. Transfer Token (HTS) — Normal Flow</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Step A: Receiver signs to associate (accept) the token. Step B: Sender transfers.
        </p>
        <div>
          <label>
            Token ID:{" "}
            <input
              value={transferTokenId}
              onChange={(e) => setTransferTokenId(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Receiver Account:{" "}
            <input
              value={transferReceiver}
              onChange={(e) => setTransferReceiver(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Receiver Private Key:{" "}
            <input
              value={transferReceiverKey}
              onChange={(e) => setTransferReceiverKey(e.target.value)}
              placeholder="302e..."
              style={{ width: 400, fontFamily: "monospace", fontSize: 11 }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Amount:{" "}
            <input
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              style={{ width: 100, fontFamily: "monospace" }}
            />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Step A — Receiver Associates (signs to accept token):</strong>
          <br />
          <button
            onClick={handleAssociateToken}
            disabled={loading === "associate"}
            style={{ marginTop: 4 }}
          >
            {loading === "associate" ? "Associating..." : "Associate Token"}
          </button>
          {associateResult && <ResultBlock data={associateResult} />}
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Step B — Sender Transfers:</strong>
          <br />
          <button
            onClick={handleTransferToken}
            disabled={loading === "transfer"}
            style={{ marginTop: 4 }}
          >
            {loading === "transfer" ? "Transferring..." : "Transfer Token"}
          </button>
          {transferResult && <ResultBlock data={transferResult} />}
        </div>
      </section>

      {/* Account: Balance Query */}
      <section style={{ margin: "24px 0" }}>
        <h2>7. Check Balance</h2>
        <div>
          <label>
            Account ID:{" "}
            <input
              value={balanceAccountId}
              onChange={(e) => setBalanceAccountId(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleCheckBalance}
          disabled={loading === "balance"}
          style={{ marginTop: 8 }}
        >
          {loading === "balance" ? "Checking..." : "Check Balance"}
        </button>
        {balanceResult && <ResultBlock data={balanceResult} />}
      </section>
    </div>
  );
}

function ResultBlock({ data }: { data: ApiResult }) {
  return (
    <pre
      style={{
        background: data.success ? "#f0fdf4" : "#fef2f2",
        border: `1px solid ${data.success ? "#86efac" : "#fca5a5"}`,
        padding: 12,
        marginTop: 8,
        overflow: "auto",
        fontSize: 13,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

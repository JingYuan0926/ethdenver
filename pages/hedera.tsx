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

  // HCS-20 state
  const [hcs20TopicId, setHcs20TopicId] = useState("");
  const [hcs20TopicResult, setHcs20TopicResult] = useState<ApiResult | null>(null);
  const [deployTick, setDeployTick] = useState("spark");
  const [deployName, setDeployName] = useState("SPARK Points");
  const [deployMax, setDeployMax] = useState("1000000");
  const [deployLim, setDeployLim] = useState("10000");
  const [deployResult, setDeployResult] = useState<ApiResult | null>(null);
  const [mintTick, setMintTick] = useState("spark");
  const [mintTo, setMintTo] = useState("");
  const [mintAmt, setMintAmt] = useState("1000");
  const [mintResult, setMintResult] = useState<ApiResult | null>(null);
  const [xferTick, setXferTick] = useState("spark");
  const [xferFrom, setXferFrom] = useState("");
  const [xferTo, setXferTo] = useState("");
  const [xferAmt, setXferAmt] = useState("100");
  const [xferResult, setXferResult] = useState<ApiResult | null>(null);
  const [burnTick, setBurnTick] = useState("spark");
  const [burnFrom, setBurnFrom] = useState("");
  const [burnAmt, setBurnAmt] = useState("50");
  const [burnResult, setBurnResult] = useState<ApiResult | null>(null);

  // AI Agent Voting state
  const [voteTopicId, setVoteTopicId] = useState("");
  const [voteSetupResult, setVoteSetupResult] = useState<ApiResult | null>(null);
  const [agentAccountId, setAgentAccountId] = useState("");
  const [agentPrivateKey, setAgentPrivateKey] = useState("");
  const [voteTarget, setVoteTarget] = useState("");
  const [voteDirection, setVoteDirection] = useState<"up" | "down">("up");
  const [voteResult, setVoteResult] = useState<ApiResult | null>(null);

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

  async function handleCreateHcs20Topic() {
    setLoading("hcs20topic");
    try {
      const result = await callApi("create-topic");
      setHcs20TopicResult(result);
      if (result.success && result.topicId) {
        setHcs20TopicId(result.topicId as string);
      }
    } catch (err) {
      setHcs20TopicResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function callHcs20(
    op: string,
    params: Record<string, string>
  ): Promise<ApiResult> {
    const res = await fetch("/api/hedera/hcs20", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: hcs20TopicId, op, ...params }),
    });
    return res.json();
  }

  async function handleHcs20Deploy() {
    if (!hcs20TopicId) {
      setDeployResult({ success: false, error: "Create a topic first" });
      return;
    }
    setLoading("hcs20deploy");
    try {
      const result = await callHcs20("deploy", {
        name: deployName,
        tick: deployTick,
        max: deployMax,
        ...(deployLim && { lim: deployLim }),
      });
      setDeployResult(result);
    } catch (err) {
      setDeployResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleHcs20Mint() {
    if (!hcs20TopicId) {
      setMintResult({ success: false, error: "Create a topic first" });
      return;
    }
    setLoading("hcs20mint");
    try {
      const result = await callHcs20("mint", {
        tick: mintTick,
        amt: mintAmt,
        to: mintTo,
      });
      setMintResult(result);
    } catch (err) {
      setMintResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleHcs20Transfer() {
    if (!hcs20TopicId) {
      setXferResult({ success: false, error: "Create a topic first" });
      return;
    }
    setLoading("hcs20xfer");
    try {
      const result = await callHcs20("transfer", {
        tick: xferTick,
        amt: xferAmt,
        from: xferFrom,
        to: xferTo,
      });
      setXferResult(result);
    } catch (err) {
      setXferResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleHcs20Burn() {
    if (!hcs20TopicId) {
      setBurnResult({ success: false, error: "Create a topic first" });
      return;
    }
    setLoading("hcs20burn");
    try {
      const result = await callHcs20("burn", {
        tick: burnTick,
        amt: burnAmt,
        from: burnFrom,
      });
      setBurnResult(result);
    } catch (err) {
      setBurnResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleVoteSetup() {
    setLoading("votesetup");
    try {
      const res = await fetch("/api/hedera/ai-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const result = await res.json();
      setVoteSetupResult(result);
      if (result.success && result.topicId) {
        setVoteTopicId(result.topicId);
      }
    } catch (err) {
      setVoteSetupResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleCastVote() {
    if (!voteTopicId) {
      setVoteResult({ success: false, error: "Setup a voting topic first" });
      return;
    }
    if (!agentAccountId || !agentPrivateKey || !voteTarget) {
      setVoteResult({ success: false, error: "Agent account, private key, and target are required" });
      return;
    }
    setLoading("castvote");
    try {
      const res = await fetch("/api/hedera/ai-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vote",
          topicId: voteTopicId,
          agentAccountId,
          agentPrivateKey,
          target: voteTarget,
          vote: voteDirection,
        }),
      });
      const result = await res.json();
      setVoteResult(result);
    } catch (err) {
      setVoteResult({ success: false, error: String(err) });
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

      <hr style={{ margin: "24px 0", borderColor: "#6366f1" }} />

      <h1 style={{ color: "#6366f1" }}>HCS-20 Auditable Points</h1>
      <p style={{ color: "#888" }}>
        Inscribe JSON messages on HCS topics to deploy, mint, transfer &amp; burn
        points (no HTS needed).
      </p>

      {/* HCS-20: Create Topic */}
      <section style={{ margin: "24px 0" }}>
        <h2>8. Create HCS-20 Topic</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Creates a new HCS topic to hold your HCS-20 point inscriptions.
        </p>
        <div>
          <label>
            Topic ID (or create new):{" "}
            <input
              value={hcs20TopicId}
              onChange={(e) => setHcs20TopicId(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleCreateHcs20Topic}
          disabled={loading === "hcs20topic"}
          style={{ marginTop: 8 }}
        >
          {loading === "hcs20topic" ? "Creating..." : "Create New Topic"}
        </button>
        {hcs20TopicResult && <ResultBlock data={hcs20TopicResult} />}
      </section>

      {/* HCS-20: Deploy Points */}
      <section style={{ margin: "24px 0" }}>
        <h2>9. Deploy Points (HCS-20)</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Register a new point type on the topic.
        </p>
        <div>
          <label>
            Ticker:{" "}
            <input
              value={deployTick}
              onChange={(e) => setDeployTick(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Name:{" "}
            <input
              value={deployName}
              onChange={(e) => setDeployName(e.target.value)}
              style={{ width: 250, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Max Supply:{" "}
            <input
              value={deployMax}
              onChange={(e) => setDeployMax(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Mint Limit (per tx):{" "}
            <input
              value={deployLim}
              onChange={(e) => setDeployLim(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleHcs20Deploy}
          disabled={loading === "hcs20deploy"}
          style={{ marginTop: 8 }}
        >
          {loading === "hcs20deploy" ? "Deploying..." : "Deploy Points"}
        </button>
        {deployResult && <ResultBlock data={deployResult} />}
      </section>

      {/* HCS-20: Mint Points */}
      <section style={{ margin: "24px 0" }}>
        <h2>10. Mint Points (HCS-20)</h2>
        <div>
          <label>
            Ticker:{" "}
            <input
              value={mintTick}
              onChange={(e) => setMintTick(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            To (Account ID):{" "}
            <input
              value={mintTo}
              onChange={(e) => setMintTo(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Amount:{" "}
            <input
              value={mintAmt}
              onChange={(e) => setMintAmt(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleHcs20Mint}
          disabled={loading === "hcs20mint"}
          style={{ marginTop: 8 }}
        >
          {loading === "hcs20mint" ? "Minting..." : "Mint Points"}
        </button>
        {mintResult && <ResultBlock data={mintResult} />}
      </section>

      {/* HCS-20: Transfer Points */}
      <section style={{ margin: "24px 0" }}>
        <h2>11. Transfer Points (HCS-20)</h2>
        <div>
          <label>
            Ticker:{" "}
            <input
              value={xferTick}
              onChange={(e) => setXferTick(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            From (Account ID):{" "}
            <input
              value={xferFrom}
              onChange={(e) => setXferFrom(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            To (Account ID):{" "}
            <input
              value={xferTo}
              onChange={(e) => setXferTo(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Amount:{" "}
            <input
              value={xferAmt}
              onChange={(e) => setXferAmt(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleHcs20Transfer}
          disabled={loading === "hcs20xfer"}
          style={{ marginTop: 8 }}
        >
          {loading === "hcs20xfer" ? "Transferring..." : "Transfer Points"}
        </button>
        {xferResult && <ResultBlock data={xferResult} />}
      </section>

      {/* HCS-20: Burn Points */}
      <section style={{ margin: "24px 0" }}>
        <h2>12. Burn Points (HCS-20)</h2>
        <div>
          <label>
            Ticker:{" "}
            <input
              value={burnTick}
              onChange={(e) => setBurnTick(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            From (Account ID):{" "}
            <input
              value={burnFrom}
              onChange={(e) => setBurnFrom(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Amount:{" "}
            <input
              value={burnAmt}
              onChange={(e) => setBurnAmt(e.target.value)}
              style={{ width: 150, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleHcs20Burn}
          disabled={loading === "hcs20burn"}
          style={{ marginTop: 8 }}
        >
          {loading === "hcs20burn" ? "Burning..." : "Burn Points"}
        </button>
        {burnResult && <ResultBlock data={burnResult} />}
      </section>

      <hr style={{ margin: "24px 0", borderColor: "#f59e0b" }} />

      <h1 style={{ color: "#f59e0b" }}>AI Agent Reputation Voting</h1>
      <p style={{ color: "#888" }}>
        Each agent holds its own key and signs votes on-chain.
        The payer proves who voted — no central server needed.
      </p>

      {/* AI Vote: Setup */}
      <section style={{ margin: "24px 0" }}>
        <h2>13. Setup Voting Topic</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Creates a private topic + deploys &quot;upvote&quot; and &quot;downvote&quot; tickers.
        </p>
        <div>
          <label>
            Voting Topic ID (or create new):{" "}
            <input
              value={voteTopicId}
              onChange={(e) => setVoteTopicId(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <button
          onClick={handleVoteSetup}
          disabled={loading === "votesetup"}
          style={{ marginTop: 8 }}
        >
          {loading === "votesetup" ? "Setting up..." : "Create Voting Topic"}
        </button>
        {voteSetupResult && <ResultBlock data={voteSetupResult} />}
      </section>

      {/* AI Vote: Cast Vote */}
      <section style={{ margin: "24px 0" }}>
        <h2>14. Cast Vote</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Each agent signs with its own key. The payer on-chain proves who voted.
        </p>
        <div>
          <label>
            Agent Account ID:{" "}
            <input
              value={agentAccountId}
              onChange={(e) => setAgentAccountId(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Agent Private Key:{" "}
            <input
              value={agentPrivateKey}
              onChange={(e) => setAgentPrivateKey(e.target.value)}
              placeholder="302e..."
              style={{ width: 400, fontFamily: "monospace", fontSize: 11 }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Target (Account ID to vote on):{" "}
            <input
              value={voteTarget}
              onChange={(e) => setVoteTarget(e.target.value)}
              placeholder="0.0.XXXXX"
              style={{ width: 200, fontFamily: "monospace" }}
            />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Vote:{" "}
            <select
              value={voteDirection}
              onChange={(e) => setVoteDirection(e.target.value as "up" | "down")}
              style={{ fontFamily: "monospace" }}
            >
              <option value="up">Upvote (+1)</option>
              <option value="down">Downvote (-1)</option>
            </select>
          </label>
        </div>
        <button
          onClick={handleCastVote}
          disabled={loading === "castvote"}
          style={{ marginTop: 8 }}
        >
          {loading === "castvote" ? "Voting..." : "Cast Vote"}
        </button>
        {voteResult && <ResultBlock data={voteResult} />}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* Account: Balance Query */}
      <section style={{ margin: "24px 0" }}>
        <h2>15. Check Balance</h2>
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

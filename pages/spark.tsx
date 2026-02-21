import { useState } from "react";

interface ApiResult {
  success: boolean;
  [key: string]: unknown;
}

export default function SparkPage() {
  // ── Register state ──────────────────────────────────────────────
  const [botId, setBotId] = useState("");
  const [domainTags, setDomainTags] = useState("defi,analytics");
  const [serviceOfferings, setServiceOfferings] = useState("scraping,analysis");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI agent specializing in DeFi analytics."
  );
  const [modelProvider, setModelProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [registerResult, setRegisterResult] = useState<ApiResult | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);

  // ── Knowledge state ─────────────────────────────────────────────
  const [kContent, setKContent] = useState(
    "Uniswap V3 introduced concentrated liquidity, allowing LPs to allocate capital within custom price ranges."
  );
  const [kCategory, setKCategory] = useState("blockchain");
  const [kPrivateKey, setKPrivateKey] = useState("");
  const [knowledgeResult, setKnowledgeResult] = useState<ApiResult | null>(
    null
  );
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  // ── Load agent state ───────────────────────────────────────────
  const [loadPrivateKey, setLoadPrivateKey] = useState("");
  const [loadAccountId, setLoadAccountId] = useState("");
  const [loadResult, setLoadResult] = useState<ApiResult | null>(null);
  const [loadLoading, setLoadLoading] = useState(false);

  // ── Registered agents list ──────────────────────────────────────
  const [agents, setAgents] = useState<ApiResult[]>([]);

  // ── Vote state ──────────────────────────────────────────────────
  const [voteTargetAccountId, setVoteTargetAccountId] = useState("");
  const [voteType, setVoteType] = useState<"upvote" | "downvote">("upvote");
  const [voteResult, setVoteResult] = useState<ApiResult | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);

  // ── Pending Knowledge state ───────────────────────────────────
  interface PendingItem {
    itemId: string;
    author: string;
    content: string;
    category: string;
    zgRootHash: string;
    timestamp: string;
    approvals: number;
    rejections: number;
    voters: string[];
    status: "pending" | "approved" | "rejected";
  }
  const [approveResult, setApproveResult] = useState<ApiResult | null>(null);

  // ── Knowledge Registry state ────────────────────────────────
  const [registryItems, setRegistryItems] = useState<PendingItem[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryFilter, setRegistryFilter] = useState<"all" | "accepted" | "pending" | "approved" | "rejected">("accepted");

  // ── Agent Directory state ─────────────────────────────────────
  interface DirectoryAgent {
    hederaAccountId: string;
    botId: string;
    evmAddress: string;
    botTopicId: string;
    voteTopicId: string;
    zgRootHash: string;
    iNftTokenId: number;
    hbarBalance: number;
    tokens: { tokenId: string; balance: number }[];
    upvotes: number;
    downvotes: number;
    netReputation: number;
    botMessageCount: number;
    registeredAt: string;
    agentProfile: {
      botId: string;
      domainTags: string;
      serviceOfferings: string;
      reputationScore: number;
      contributionCount: number;
    } | null;
  }
  const [directoryAgents, setDirectoryAgents] = useState<DirectoryAgent[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);

  // ── Knowledge Ledger state ────────────────────────────────────
  interface TopicEntry {
    topicId: string;
    messages: Record<string, unknown>[];
  }
  type LedgerData = Record<string, TopicEntry>;
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  async function handleFetchLedger() {
    setLedgerLoading(true);
    try {
      const res = await fetch("/api/spark/ledger");
      const data = await res.json();
      if (data.success) {
        setLedger(data.ledger);
      }
    } catch (err) {
      console.error("Ledger fetch error:", err);
    }
    setLedgerLoading(false);
  }

  async function handleFetchDirectory() {
    setDirectoryLoading(true);
    try {
      const res = await fetch("/api/spark/agents");
      const data = await res.json();
      if (data.success) {
        setDirectoryAgents(data.agents);
      }
    } catch (err) {
      console.error("Directory fetch error:", err);
    }
    setDirectoryLoading(false);
  }

  async function handleFetchRegistry() {
    setRegistryLoading(true);
    try {
      const res = await fetch("/api/spark/pending-knowledge");
      const data = await res.json();
      if (data.success) {
        setRegistryItems([...data.pending, ...data.approved, ...data.rejected]);
      }
    } catch (err) {
      console.error("Registry fetch error:", err);
    }
    setRegistryLoading(false);
  }

  async function handleApproveKnowledge(
    itemId: string,
    vote: "approve" | "reject"
  ) {
    if (!kPrivateKey) {
      setApproveResult({
        success: false,
        error: "Private key required — register or load an agent first",
      });
      return;
    }
    setApproveResult(null);
    try {
      const res = await fetch("/api/spark/approve-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          vote,
          hederaPrivateKey: kPrivateKey,
        }),
      });
      const result = await res.json();
      setApproveResult(result);
      // Refresh registry after voting
      if (result.success) {
        handleFetchRegistry();
      }
    } catch (err) {
      setApproveResult({ success: false, error: String(err) });
    }
  }

  async function handleVote(
    overrideTarget?: string,
    overrideType?: "upvote" | "downvote"
  ) {
    const target = overrideTarget || voteTargetAccountId;
    const type = overrideType || voteType;

    if (!kPrivateKey) {
      setVoteResult({
        success: false,
        error: "Voter private key required — register or load an agent first",
      });
      return;
    }
    if (!target) {
      setVoteResult({
        success: false,
        error: "Target agent account ID is required",
      });
      return;
    }
    setVoteLoading(true);
    setVoteResult(null);
    try {
      const res = await fetch("/api/spark/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voterPrivateKey: kPrivateKey,
          targetAccountId: target,
          voteType: type,
        }),
      });
      const result = await res.json();
      setVoteResult(result);
    } catch (err) {
      setVoteResult({ success: false, error: String(err) });
    }
    setVoteLoading(false);
  }

  async function handleRegister() {
    setRegisterLoading(true);
    setRegisterResult(null);
    try {
      // Auto-generate name if left blank
      const effectiveBotId = botId.trim() || `spark-bot-${Date.now().toString(36).slice(-4)}`;
      const res = await fetch("/api/spark/register-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: effectiveBotId,
          domainTags,
          serviceOfferings,
          systemPrompt,
          modelProvider,
          apiKey,
        }),
      });
      const result = await res.json();

      if (result.success) {
        // Enrich with _loaded fields so AgentCard shows all sections
        const enriched: ApiResult = {
          ...result,
          _loaded: true,
          _agentProfile: {
            botId: result.botId,
            domainTags,
            serviceOfferings,
            reputationScore: 0,
            contributionCount: 0,
          },
          _isAuthorized: true,
          _upvotes: 0,
          _downvotes: 0,
          _netReputation: 0,
          _botMessages: [],
          _botMessageCount: 1,
          _tokens: [{ tokenId: "0.0.7984944", balance: 100_000_000 }],
          _intelligentData: result.zgRootHash
            ? [{ dataDescription: `0g://storage/${result.zgRootHash}` }]
            : [],
          _registeredAt: new Date().toISOString(),
        };
        setRegisterResult(enriched);
        setAgents((prev) => [...prev, enriched]);
        // Auto-fill knowledge form with this agent's private key
        setKPrivateKey(result.hederaPrivateKey);
      } else {
        setRegisterResult(result);
      }
    } catch (err) {
      setRegisterResult({ success: false, error: String(err) });
    }
    setRegisterLoading(false);
  }

  async function handleSubmitKnowledge() {
    if (!kPrivateKey) {
      setKnowledgeResult({
        success: false,
        error: "Private key required — register or load an agent first",
      });
      return;
    }
    setKnowledgeLoading(true);
    setKnowledgeResult(null);
    try {
      const res = await fetch("/api/spark/submit-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: kContent,
          category: kCategory,
          hederaPrivateKey: kPrivateKey,
        }),
      });
      const result = await res.json();
      setKnowledgeResult(result);
    } catch (err) {
      setKnowledgeResult({ success: false, error: String(err) });
    }
    setKnowledgeLoading(false);
  }

  async function handleLoadAgent() {
    if (!loadPrivateKey) {
      setLoadResult({ success: false, error: "Private key is required" });
      return;
    }
    setLoadLoading(true);
    setLoadResult(null);
    try {
      const res = await fetch("/api/spark/load-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hederaPrivateKey: loadPrivateKey,
          hederaAccountId: loadAccountId || undefined,
        }),
      });
      const result = await res.json();
      setLoadResult(result);

      if (result.success) {
        // Extract USDC balance from tokens array
        const usdcToken = (result.tokens || []).find(
          (t: { tokenId: string }) => t.tokenId === "0.0.7984944"
        );
        const usdcBalance = usdcToken
          ? usdcToken.balance / 1e6 // 6 decimals
          : 0;

        // Add to agents list with compatible shape for AgentCard
        const agentEntry: ApiResult = {
          success: true,
          hederaAccountId: result.hederaAccountId,
          hederaPrivateKey: loadPrivateKey,
          hederaPublicKey: result.hederaPublicKey,
          evmAddress: result.evmAddress,
          botTopicId: result.botTopicId,
          voteTopicId: result.voteTopicId,
          masterTopicId: result.masterTopicId,
          iNftTokenId: result.iNftTokenId,
          zgRootHash: result.zgRootHash,
          airdrop: { hbar: result.hbarBalance, usdc: usdcBalance },
          // Extra loaded data
          _loaded: true,
          _agentProfile: result.agentProfile,
          _isAuthorized: result.isAuthorized,
          _upvotes: result.upvotes,
          _downvotes: result.downvotes,
          _netReputation: result.netReputation,
          _botMessages: result.botMessages,
          _botMessageCount: result.botMessageCount,
          _tokens: result.tokens,
          _intelligentData: result.intelligentData,
          _registeredAt: result.registeredAt,
        };

        // Don't add duplicates
        setAgents((prev) => {
          const exists = prev.some(
            (a) => a.hederaAccountId === result.hederaAccountId
          );
          return exists ? prev : [...prev, agentEntry];
        });

        // Auto-fill knowledge form
        setKPrivateKey(loadPrivateKey);
      }
    } catch (err) {
      setLoadResult({ success: false, error: String(err) });
    }
    setLoadLoading(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "40px auto",
        fontFamily: "monospace",
        padding: "0 20px",
      }}
    >
      <h1>SPARK — Agent Registration</h1>
      <p style={{ color: "#888" }}>
        Register AI agents across Hedera + 0G, then submit knowledge
      </p>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  REGISTER AGENT                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>1. Register Agent</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Creates Hedera account (10 HBAR + 100 USDC), 3 HCS topics, uploads
          config to 0G Storage, mints iNFT on 0G Chain.
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <Field label="Bot Name (optional)" value={botId} onChange={setBotId} placeholder="Leave blank for auto-name (SPARK Bot #iNFT)" />
          <Field
            label="Domain Tags"
            value={domainTags}
            onChange={setDomainTags}
          />
          <Field
            label="Service Offerings"
            value={serviceOfferings}
            onChange={setServiceOfferings}
          />
          <Field
            label="Model Provider"
            value={modelProvider}
            onChange={setModelProvider}
          />
          <Field
            label="API Key (encrypted on 0G)"
            value={apiKey}
            onChange={setApiKey}
            type="password"
          />
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 13,
                padding: 8,
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <button
          onClick={handleRegister}
          disabled={registerLoading}
          style={{
            marginTop: 12,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: registerLoading ? "wait" : "pointer",
            background: registerLoading ? "#ccc" : "#2563eb",
            color: "#fff",
            border: "none",
          }}
        >
          {registerLoading
            ? "Registering... (this takes ~30s)"
            : "Register Agent"}
        </button>

        {registerResult && !registerResult.success && (
          <ResultBlock data={registerResult} />
        )}
        {registerResult?.success && (
          <AgentCard
            index={agents.length - 1}
            agent={registerResult}
            onCopy={copyToClipboard}
            onUseForKnowledge={() => {
              setKPrivateKey(registerResult.hederaPrivateKey as string);
            }}
            onVote={(accountId, type) => {
              setVoteTargetAccountId(accountId);
              setVoteType(type);
              handleVote(accountId, type);
            }}
          />
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  LOAD AGENT                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Load Existing Agent</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Paste a private key to reconstruct the full agent profile from
          on-chain data (Hedera + 0G).
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <Field
            label="Private Key (required)"
            value={loadPrivateKey}
            onChange={setLoadPrivateKey}
            type="password"
          />
          <Field
            label="Account ID (optional — auto-detected from key)"
            value={loadAccountId}
            onChange={setLoadAccountId}
          />
        </div>

        <button
          onClick={handleLoadAgent}
          disabled={loadLoading}
          style={{
            marginTop: 12,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: loadLoading ? "wait" : "pointer",
            background: loadLoading ? "#ccc" : "#7c3aed",
            color: "#fff",
            border: "none",
          }}
        >
          {loadLoading
            ? "Loading... (querying Hedera + 0G)"
            : "Load Agent"}
        </button>

        {loadResult && !loadResult.success && (
          <ResultBlock data={loadResult} />
        )}
        {loadResult?.success && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "#dcfce7",
              border: "1px solid #86efac",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            Agent <strong>{loadResult.botId as string}</strong> ({loadResult.hederaAccountId as string}) loaded successfully — see card below.
          </div>
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  REGISTERED AGENTS — FULL DASHBOARD                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {agents.length > 0 && (
        <section style={{ margin: "24px 0" }}>
          <h2>Registered Agents ({agents.length})</h2>
          {agents.map((agent, i) => (
            <AgentCard
              key={i}
              index={i}
              agent={agent}
              onCopy={copyToClipboard}
              onUseForKnowledge={() => {
                setKPrivateKey(agent.hederaPrivateKey as string);
              }}
              onVote={(accountId, type) => {
                setVoteTargetAccountId(accountId);
                setVoteType(type);
                handleVote(accountId, type);
              }}
            />
          ))}
        </section>
      )}

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  SUBMIT KNOWLEDGE                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>2. Submit Knowledge</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Just the private key + content. API auto-resolves account ID and bot
          topic from the master ledger, then uploads to 0G + logs to HCS.
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <Field
            label="Bot Private Key (auto-filled from register/load)"
            value={kPrivateKey}
            onChange={setKPrivateKey}
            type="password"
          />
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Content</label>
            <textarea
              value={kContent}
              onChange={(e) => setKContent(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 13,
                padding: 8,
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Category</label>
            <select
              value={kCategory}
              onChange={(e) => setKCategory(e.target.value)}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 13,
                padding: 8,
                border: "1px solid #ccc",
                boxSizing: "border-box",
              }}
            >
              <option value="scam">Scam</option>
              <option value="blockchain">Blockchain</option>
              <option value="legal">Legal</option>
              <option value="trend">Trend</option>
              <option value="skills">Skills</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSubmitKnowledge}
          disabled={knowledgeLoading}
          style={{
            marginTop: 12,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: knowledgeLoading ? "wait" : "pointer",
            background: knowledgeLoading ? "#ccc" : "#16a34a",
            color: "#fff",
            border: "none",
          }}
        >
          {knowledgeLoading
            ? "Submitting... (uploading to 0G + HCS)"
            : "Submit Knowledge"}
        </button>

        {knowledgeResult && !knowledgeResult.success && (
          <ResultBlock data={knowledgeResult} />
        )}
        {knowledgeResult?.success && (
          <OnChainResult
            data={knowledgeResult}
            type="knowledge"
            onCopy={copyToClipboard}
          />
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  VOTE ON AGENT                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>3. Vote on Agent (HCS-20)</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Upvote or downvote another agent. Votes are HCS-20 mint messages on
          the target agent&apos;s public vote topic. Self-voting is blocked.
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <Field
            label="Your Private Key (auto-filled from register/load)"
            value={kPrivateKey}
            onChange={setKPrivateKey}
            type="password"
          />
          <Field
            label="Target Agent Account ID (e.g. 0.0.123456)"
            value={voteTargetAccountId}
            onChange={setVoteTargetAccountId}
          />
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Vote Type</label>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="voteType"
                  value="upvote"
                  checked={voteType === "upvote"}
                  onChange={() => setVoteType("upvote")}
                />
                <span style={{ color: "#16a34a", fontWeight: "bold" }}>Upvote</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="voteType"
                  value="downvote"
                  checked={voteType === "downvote"}
                  onChange={() => setVoteType("downvote")}
                />
                <span style={{ color: "#dc2626", fontWeight: "bold" }}>Downvote</span>
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleVote()}
          disabled={voteLoading}
          style={{
            marginTop: 12,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: voteLoading ? "wait" : "pointer",
            background: voteLoading ? "#ccc" : voteType === "upvote" ? "#16a34a" : "#dc2626",
            color: "#fff",
            border: "none",
          }}
        >
          {voteLoading
            ? "Submitting vote..."
            : `Cast ${voteType === "upvote" ? "Upvote" : "Downvote"}`}
        </button>

        {voteResult && !voteResult.success && (
          <ResultBlock data={voteResult} />
        )}
        {voteResult?.success && (
          <div
            style={{
              marginTop: 12,
              padding: 16,
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#166534" }}>
              Vote Recorded
            </h4>
            <div style={{ display: "grid", gap: 4 }}>
              <div>
                <span style={{ color: "#475569" }}>Type: </span>
                <strong style={{ color: voteResult.voteType === "upvote" ? "#16a34a" : "#dc2626" }}>
                  {voteResult.voteType as string}
                </strong>
              </div>
              <div>
                <span style={{ color: "#475569" }}>Voter: </span>
                <strong>{voteResult.voter as string}</strong>
              </div>
              <div>
                <span style={{ color: "#475569" }}>Target: </span>
                <strong>{voteResult.target as string}</strong>
              </div>
              <LinkRow
                label="Vote Topic"
                value={`${voteResult.voteTopicId as string} (seq #${voteResult.sequenceNumber as string})`}
                url={`https://hashscan.io/testnet/topic/${voteResult.voteTopicId as string}`}
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  KNOWLEDGE LEDGER                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Knowledge Ledger</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          All messages from the master topic and 5 knowledge sub-topics, fetched
          from the Hedera Mirror Node.
        </p>

        <button
          onClick={handleFetchLedger}
          disabled={ledgerLoading}
          style={{
            marginTop: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: ledgerLoading ? "wait" : "pointer",
            background: ledgerLoading ? "#ccc" : "#0891b2",
            color: "#fff",
            border: "none",
          }}
        >
          {ledgerLoading ? "Fetching..." : ledger ? "Refresh Ledger" : "Fetch Ledger"}
        </button>

        {ledger && (
          <div style={{ marginTop: 16 }}>
            {Object.entries(ledger).map(([key, entry]) => (
              <TopicSection
                key={key}
                name={key}
                topicId={entry.topicId}
                messages={entry.messages}
                onCopy={copyToClipboard}
              />
            ))}
          </div>
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  KNOWLEDGE REGISTRY — FINAL VIEW                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Knowledge Registry</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Consensus state of all knowledge submissions. &quot;Accepted&quot; shows only approved knowledge — the final human-readable view.
        </p>

        <button
          onClick={handleFetchRegistry}
          disabled={registryLoading}
          style={{
            marginTop: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: registryLoading ? "wait" : "pointer",
            background: registryLoading ? "#ccc" : "#475569",
            color: "#fff",
            border: "none",
          }}
        >
          {registryLoading
            ? "Fetching..."
            : registryItems.length > 0
            ? "Refresh"
            : "View All"}
        </button>

        {/* Vote result feedback */}
        {approveResult && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: approveResult.success ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${approveResult.success ? "#86efac" : "#fca5a5"}`,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {approveResult.success ? (
              <div>
                <strong>Vote recorded:</strong> {approveResult.vote as string} on{" "}
                {approveResult.itemId as string} | Status:{" "}
                <strong
                  style={{
                    color:
                      approveResult.status === "approved"
                        ? "#16a34a"
                        : approveResult.status === "rejected"
                        ? "#dc2626"
                        : "#ca8a04",
                  }}
                >
                  {approveResult.status as string}
                </strong>
                {" "}({approveResult.approvals as number} approvals, {approveResult.rejections as number} rejections)
                {(approveResult.reputationEffect as string) && (
                  <span style={{ color: "#7c3aed" }}>
                    {" "}| Rep: {approveResult.reputationEffect as string}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ color: "#dc2626" }}>
                Error: {approveResult.error as string}
              </div>
            )}
          </div>
        )}

        {registryItems.length > 0 && (() => {
          const approvedCount = registryItems.filter((i) => i.status === "approved").length;
          const pendingCount = registryItems.filter((i) => i.status === "pending").length;
          const rejectedCount = registryItems.filter((i) => i.status === "rejected").length;

          return (
          <div style={{ marginTop: 16 }}>
            {/* Summary counts */}
            <div
              style={{
                display: "flex",
                gap: 24,
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              <div style={{ textAlign: "center", padding: "12px 20px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, minWidth: 80 }}>
                <div style={{ fontSize: 24, fontWeight: "bold" }}>{registryItems.length}</div>
                <div style={{ color: "#64748b", fontSize: 11 }}>Total</div>
              </div>
              <div style={{ textAlign: "center", padding: "12px 20px", background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, minWidth: 80 }}>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#ca8a04" }}>{pendingCount}</div>
                <div style={{ color: "#a16207", fontSize: 11 }}>Pending</div>
              </div>
              <div style={{ textAlign: "center", padding: "12px 20px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, minWidth: 80 }}>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#16a34a" }}>{approvedCount}</div>
                <div style={{ color: "#166534", fontSize: 11 }}>Approved</div>
              </div>
              <div style={{ textAlign: "center", padding: "12px 20px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, minWidth: 80 }}>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#dc2626" }}>{rejectedCount}</div>
                <div style={{ color: "#991b1b", fontSize: 11 }}>Rejected</div>
              </div>
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {(["accepted", "all", "pending", "approved", "rejected"] as const).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => setRegistryFilter(f)}
                    style={{
                      fontSize: 11,
                      padding: "4px 12px",
                      cursor: "pointer",
                      border: registryFilter === f
                        ? f === "accepted" ? "1px solid #16a34a" : "1px solid #cbd5e1"
                        : "1px solid #cbd5e1",
                      borderRadius: 4,
                      fontWeight: registryFilter === f ? "bold" : "normal",
                      background: registryFilter === f
                        ? f === "accepted" ? "#dcfce7" : "#e2e8f0"
                        : "#fff",
                      color: registryFilter === f
                        ? f === "accepted" ? "#166534" : "#334155"
                        : "#64748b",
                    }}
                  >
                    {f === "accepted" ? "Accepted" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                )
              )}
            </div>

            {/* "Accepted" view — clean, no pending/rejected noise */}
            {registryFilter === "accepted" && approvedCount === 0 && (
              <p style={{ color: "#94a3b8", fontSize: 13, fontStyle: "italic", marginTop: 8 }}>
                No accepted knowledge yet. Items need 2 peer approvals to appear here.
              </p>
            )}

            {/* Table */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                  {registryFilter !== "accepted" && (
                    <th style={{ padding: "8px 6px", color: "#64748b", fontWeight: "bold" }}>Status</th>
                  )}
                  <th style={{ padding: "8px 6px", color: "#64748b", fontWeight: "bold" }}>Category</th>
                  <th style={{ padding: "8px 6px", color: "#64748b", fontWeight: "bold" }}>Content</th>
                  <th style={{ padding: "8px 6px", color: "#64748b", fontWeight: "bold" }}>Author</th>
                  <th style={{ padding: "8px 6px", color: "#64748b", fontWeight: "bold", textAlign: "center" }}>Votes</th>
                  {registryFilter !== "accepted" && (
                    <th style={{ padding: "8px 6px", color: "#64748b", fontWeight: "bold", textAlign: "center" }}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {registryItems
                  .filter((item) => {
                    if (registryFilter === "accepted") return item.status === "approved";
                    if (registryFilter === "all") return true;
                    return item.status === registryFilter;
                  })
                  .map((item) => {
                    const statusStyle =
                      item.status === "approved"
                        ? { bg: "#dcfce7", color: "#16a34a", label: "APPROVED" }
                        : item.status === "rejected"
                        ? { bg: "#fef2f2", color: "#dc2626", label: "REJECTED" }
                        : { bg: "#fef9c3", color: "#ca8a04", label: "PENDING" };
                    const catColor =
                      KNOWLEDGE_CARD_COLORS[item.category] || "#475569";
                    return (
                      <tr
                        key={item.itemId}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        {registryFilter !== "accepted" && (
                          <td style={{ padding: "10px 6px" }}>
                            <span
                              style={{
                                background: statusStyle.bg,
                                color: statusStyle.color,
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: "bold",
                              }}
                            >
                              {statusStyle.label}
                            </span>
                          </td>
                        )}
                        <td style={{ padding: "10px 6px" }}>
                          <span
                            style={{
                              background: catColor,
                              color: "#fff",
                              padding: "2px 6px",
                              borderRadius: 3,
                              fontSize: 10,
                              fontWeight: "bold",
                              textTransform: "uppercase",
                            }}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 6px",
                            color: "#334155",
                            maxWidth: 350,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={item.content || "(no content)"}
                        >
                          {item.content
                            ? item.content.length > 80
                              ? item.content.slice(0, 80) + "..."
                              : item.content
                            : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(no content)</span>}
                        </td>
                        <td style={{ padding: "10px 6px", color: "#64748b" }}>
                          {item.author}
                        </td>
                        <td style={{ padding: "10px 6px", textAlign: "center" }}>
                          <span style={{ color: "#16a34a" }}>{item.approvals}</span>
                          {" / "}
                          <span style={{ color: "#dc2626" }}>{item.rejections}</span>
                        </td>
                        {registryFilter !== "accepted" && (
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            {item.status === "pending" ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                <button
                                  onClick={() => handleApproveKnowledge(item.itemId, "approve")}
                                  style={{
                                    fontSize: 10,
                                    cursor: "pointer",
                                    padding: "3px 8px",
                                    background: "#dcfce7",
                                    color: "#16a34a",
                                    border: "1px solid #86efac",
                                    borderRadius: 3,
                                    fontWeight: "bold",
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleApproveKnowledge(item.itemId, "reject")}
                                  style={{
                                    fontSize: 10,
                                    cursor: "pointer",
                                    padding: "3px 8px",
                                    background: "#fef2f2",
                                    color: "#dc2626",
                                    border: "1px solid #fca5a5",
                                    borderRadius: 3,
                                    fontWeight: "bold",
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: 10 }}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          );
        })()}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  AGENT DIRECTORY — PUBLIC VIEW                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Agent Directory</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          All registered agents on the network. Data fetched from master topic + Mirror Node + 0G Chain. No private key needed.
        </p>

        <button
          onClick={handleFetchDirectory}
          disabled={directoryLoading}
          style={{
            marginTop: 8,
            padding: "10px 24px",
            fontSize: 14,
            fontFamily: "monospace",
            fontWeight: "bold",
            cursor: directoryLoading ? "wait" : "pointer",
            background: directoryLoading ? "#ccc" : "#6366f1",
            color: "#fff",
            border: "none",
          }}
        >
          {directoryLoading
            ? "Fetching all agents..."
            : directoryAgents.length > 0
            ? "Refresh Directory"
            : "Load Agent Directory"}
        </button>

        {directoryAgents.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              <strong>{directoryAgents.length}</strong> agents registered on the network
            </div>

            {directoryAgents.map((agent) => {
              const usdcToken = agent.tokens.find((t) => t.tokenId === "0.0.7984944");
              const usdcBalance = usdcToken ? usdcToken.balance / 1e6 : 0;

              return (
                <div
                  key={agent.hederaAccountId}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 15 }}>
                        {agent.botId && agent.botId !== "spark-bot-001"
                          ? agent.botId
                          : agent.iNftTokenId > 0
                            ? `SPARK Bot #${String(agent.iNftTokenId).padStart(3, "0")}`
                            : `Agent ${agent.hederaAccountId.split(".").pop()}`}
                      </h3>
                      <a
                        href={`https://hashscan.io/testnet/account/${agent.hederaAccountId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#2563eb", fontSize: 12, textDecoration: "underline" }}
                      >
                        {agent.hederaAccountId}
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {agent.iNftTokenId > 0 && (
                        <a
                          href={`https://chainscan-galileo.0g.ai/address/0xc6D7c5Db8Ae14Be4aAB5332711a72026D41b7dB5`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: "#e0e7ff",
                            color: "#3730a3",
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: "bold",
                            textDecoration: "none",
                          }}
                        >
                          iNFT #{agent.iNftTokenId}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: 20, fontSize: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <span>HBAR: <strong>{formatHbar(agent.hbarBalance)}</strong></span>
                    <span>USDC: <strong>{usdcBalance.toLocaleString()}</strong></span>
                    <span style={{ color: "#16a34a" }}>
                      Upvotes: <strong>{agent.upvotes}</strong>
                    </span>
                    <span style={{ color: "#dc2626" }}>
                      Downvotes: <strong>{agent.downvotes}</strong>
                    </span>
                    <span>
                      Net Rep: <strong style={{ color: agent.netReputation >= 0 ? "#16a34a" : "#dc2626" }}>
                        {agent.netReputation >= 0 ? "+" : ""}{agent.netReputation}
                      </strong>
                    </span>
                    <span style={{ color: "#64748b" }}>
                      Activity: <strong>{agent.botMessageCount}</strong> msgs
                    </span>
                  </div>

                  {/* iNFT Profile */}
                  {agent.agentProfile && (
                    <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap", marginBottom: 10 }}>
                      <span>Domain: <strong>{agent.agentProfile.domainTags}</strong></span>
                      <span>Services: <strong>{agent.agentProfile.serviceOfferings}</strong></span>
                      <span>On-chain Rep: <strong>{agent.agentProfile.reputationScore}</strong></span>
                      <span>Contributions: <strong>{agent.agentProfile.contributionCount}</strong></span>
                    </div>
                  )}

                  {/* Links row */}
                  <div style={{ display: "flex", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
                    <a href={`https://hashscan.io/testnet/account/${agent.hederaAccountId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Account</a>
                    <span style={{ color: "#cbd5e1" }}>|</span>
                    <a href={`https://hashscan.io/testnet/topic/${agent.botTopicId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Bot Topic</a>
                    <span style={{ color: "#cbd5e1" }}>|</span>
                    <a href={`https://hashscan.io/testnet/topic/${agent.voteTopicId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Vote Topic</a>
                    <span style={{ color: "#cbd5e1" }}>|</span>
                    <span style={{ color: "#64748b" }}>EVM: {agent.evmAddress.slice(0, 10)}...{agent.evmAddress.slice(-6)}</span>
                    <span style={{ color: "#cbd5e1" }}>|</span>
                    <span style={{ color: "#64748b" }}>Registered: {agent.registeredAt?.slice(0, 10) || "?"}</span>
                  </div>

                  {/* Vote buttons */}
                  <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        setVoteTargetAccountId(agent.hederaAccountId);
                        setVoteType("upvote");
                        handleVote(agent.hederaAccountId, "upvote");
                      }}
                      style={{
                        fontSize: 11,
                        cursor: "pointer",
                        padding: "4px 10px",
                        background: "#dcfce7",
                        color: "#16a34a",
                        border: "1px solid #86efac",
                        borderRadius: 4,
                        fontWeight: "bold",
                      }}
                    >
                      Upvote
                    </button>
                    <button
                      onClick={() => {
                        setVoteTargetAccountId(agent.hederaAccountId);
                        setVoteType("downvote");
                        handleVote(agent.hederaAccountId, "downvote");
                      }}
                      style={{
                        fontSize: 11,
                        cursor: "pointer",
                        padding: "4px 10px",
                        background: "#fef2f2",
                        color: "#dc2626",
                        border: "1px solid #fca5a5",
                        borderRadius: 4,
                        fontWeight: "bold",
                      }}
                    >
                      Downvote
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Reusable components
// ══════════════════════════════════════════════════════════════════

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "#666" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: 13,
          padding: 8,
          border: "1px solid #ccc",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

const INFT_CONTRACT = "0xc6D7c5Db8Ae14Be4aAB5332711a72026D41b7dB5";
const ZG_EXPLORER = "https://chainscan-galileo.0g.ai";

// Known token decimals for display formatting
const TOKEN_DECIMALS: Record<string, { decimals: number; symbol: string }> = {
  "0.0.7984944": { decimals: 6, symbol: "USDC" },
};

function formatTokenBalance(tokenId: string, rawBalance: number): string {
  const info = TOKEN_DECIMALS[tokenId];
  if (info) {
    return `${(rawBalance / 10 ** info.decimals).toLocaleString()} ${info.symbol}`;
  }
  return rawBalance.toLocaleString();
}

// Format HBAR balance nicely (no scientific notation)
function formatHbar(value: number): string {
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(2);
  // Small values — show up to 4 decimals
  return value.toFixed(4);
}

function OnChainResult({
  data,
  type,
  onCopy,
}: {
  data: ApiResult;
  type: "register" | "knowledge";
  onCopy: (v: string) => void;
}) {
  const [showJson, setShowJson] = useState(false);
  const masterTopicId = data.masterTopicId as string;
  const botTopicId = data.botTopicId as string;
  const zgHash = data.zgRootHash as string;
  const category = data.category as string;
  const categoryTopicId = data.categoryTopicId as string;

  return (
    <div
      style={{
        marginTop: 12,
        padding: 16,
        background: "#f0fdf4",
        border: "1px solid #86efac",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#166534" }}>
        {type === "register"
          ? `Agent Registered — ${data.hederaAccountId as string}`
          : `Knowledge Submitted — ${data.itemId as string}`}
      </h4>

      {/* On-chain links */}
      <SectionLabel text="On-Chain Receipts" />
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        {type === "register" && (
          <LinkRow
            label="Master Topic"
            value={`${masterTopicId} (seq #${data.masterSeqNo as string})`}
            url={`https://hashscan.io/testnet/topic/${masterTopicId}`}
            onCopy={onCopy}
          />
        )}
        {type === "knowledge" && categoryTopicId && (
          <LinkRow
            label={`${category?.charAt(0).toUpperCase()}${category?.slice(1)} Topic`}
            value={`${categoryTopicId} (seq #${data.categorySeqNo as string})`}
            url={`https://hashscan.io/testnet/topic/${categoryTopicId}`}
            onCopy={onCopy}
          />
        )}
        <LinkRow
          label="Bot Topic"
          value={`${botTopicId} (seq #${data.botSeqNo as string})`}
          url={`https://hashscan.io/testnet/topic/${botTopicId}`}
          onCopy={onCopy}
        />
      </div>

      {/* 0G Storage */}
      <SectionLabel text="0G Storage" />
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <LinkRow
          label="Root Hash"
          value={zgHash}
          onCopy={onCopy}
        />
        {(data.zgUploadTxHash as string) && (
          <LinkRow
            label="Upload Tx"
            value={data.zgUploadTxHash as string}
            url={`${ZG_EXPLORER}/tx/${data.zgUploadTxHash as string}`}
            onCopy={onCopy}
          />
        )}
        {(data.configHash as string) && (
          <LinkRow
            label="Config Hash"
            value={data.configHash as string}
            onCopy={onCopy}
          />
        )}
      </div>

      {/* Register-specific: account + iNFT */}
      {type === "register" && (
        <>
          <SectionLabel text="Identity" />
          <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
            <LinkRow
              label="Hedera Account"
              value={data.hederaAccountId as string}
              url={`https://hashscan.io/testnet/account/${data.hederaAccountId as string}`}
              onCopy={onCopy}
              detail={`${(data.airdrop as { hbar: number; usdc: number }).hbar} HBAR + ${(data.airdrop as { hbar: number; usdc: number }).usdc} USDC`}
            />
            <LinkRow
              label="EVM Address"
              value={data.evmAddress as string}
              onCopy={onCopy}
            />
            <LinkRow
              label={`iNFT #${data.iNftTokenId as number}`}
              value={INFT_CONTRACT}
              url={`${ZG_EXPLORER}/address/${INFT_CONTRACT}`}
              onCopy={onCopy}
            />
            <LinkRow
              label="Vote Topic"
              value={data.voteTopicId as string}
              url={`https://hashscan.io/testnet/topic/${data.voteTopicId as string}`}
              onCopy={onCopy}
              detail="HCS-20 upvote + downvote"
            />
          </div>
        </>
      )}

      {/* Toggle raw JSON */}
      <button
        onClick={() => setShowJson(!showJson)}
        style={{
          fontSize: 11,
          cursor: "pointer",
          padding: "4px 8px",
          background: "#dcfce7",
          border: "1px solid #86efac",
          borderRadius: 4,
        }}
      >
        {showJson ? "Hide" : "Show"} Raw JSON
      </button>
      {showJson && (
        <pre
          style={{
            marginTop: 8,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            padding: 12,
            overflow: "auto",
            fontSize: 12,
            maxHeight: 300,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AgentCard({
  index,
  agent,
  onCopy,
  onUseForKnowledge,
  onVote,
}: {
  index: number;
  agent: ApiResult;
  onCopy: (v: string) => void;
  onUseForKnowledge: () => void;
  onVote: (accountId: string, voteType: "upvote" | "downvote") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const accountId = agent.hederaAccountId as string;
  const evmAddr = agent.evmAddress as string;
  const botTopicId = agent.botTopicId as string;
  const voteTopicId = agent.voteTopicId as string;
  const masterTopicId = agent.masterTopicId as string;
  const tokenId = agent.iNftTokenId as number;
  const zgHash = agent.zgRootHash as string;
  const configHash = (agent.configHash as string) || "";
  const zgUploadTxHash = (agent.zgUploadTxHash as string) || "";
  const mintTxHash = (agent.mintTxHash as string) || "";
  const authTxHash = (agent.authTxHash as string) || "";
  const airdrop = agent.airdrop as { hbar: number; usdc: number };
  const isLoaded = agent._loaded as boolean;
  const agentProfile = agent._agentProfile as Record<string, unknown> | null;
  const isAuthorized = agent._isAuthorized as boolean;
  const upvotes = (agent._upvotes as number) || 0;
  const downvotes = (agent._downvotes as number) || 0;
  const netRep = (agent._netReputation as number) || 0;
  const botMsgCount = (agent._botMessageCount as number) || 0;
  const tokens = (agent._tokens as { tokenId: string; balance: number }[]) || [];
  const iData = (agent._intelligentData as { dataDescription: string }[]) || [];
  const registeredAt = agent._registeredAt as string;

  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {agent.botId && (agent.botId as string) !== "spark-bot-001"
            ? agent.botId as string
            : tokenId > 0
              ? `SPARK Bot #${String(tokenId).padStart(3, "0")}`
              : `Agent #${index + 1}`}
          {" "}<span style={{ fontWeight: "normal", fontSize: 13, color: "#64748b" }}>— {accountId}</span>
        </h3>
        <div style={{ display: "flex", gap: 6 }}>
          {isLoaded && (
            <span
              style={{
                background: "#e0e7ff",
                color: "#3730a3",
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              Loaded
            </span>
          )}
          <span
            style={{
              background: isAuthorized ? "#dcfce7" : "#dcfce7",
              color: "#166534",
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: "bold",
            }}
          >
            {isAuthorized ? "Authorized" : "Registered"}
          </span>
        </div>
      </div>

      {/* Summary line */}
      <p style={{ color: "#666", fontSize: 12, margin: "4px 0 12px" }}>
        {isLoaded
          ? `Balance: ${formatHbar(airdrop.hbar)} HBAR + ${airdrop.usdc} USDC | iNFT #${tokenId} | ${botMsgCount} messages | Registered: ${registeredAt?.slice(0, 10) || "?"}`
          : `Funded: ${airdrop.hbar} HBAR + ${airdrop.usdc} USDC | iNFT #${tokenId} | Master seq #${agent.masterSeqNo as string}`}
      </p>

      {/* ── Live Balances (loaded only) ────────────────────── */}
      {isLoaded && tokens.length > 0 && (
        <>
          <SectionLabel text="Token Balances" />
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
            {tokens.map((t, i) => (
              <span key={i}>{TOKEN_DECIMALS[t.tokenId]?.symbol || t.tokenId}: <strong>{formatTokenBalance(t.tokenId, t.balance)}</strong></span>
            ))}
          </div>
        </>
      )}

      {/* ── iNFT Profile (loaded only) ─────────────────────── */}
      {isLoaded && agentProfile && !(agentProfile as Record<string, unknown>).error && (
        <>
          <SectionLabel text="iNFT Agent Profile (0G Chain)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12, fontSize: 12 }}>
            <div>Domain: <strong>{agentProfile.domainTags as string}</strong></div>
            <div>Services: <strong>{agentProfile.serviceOfferings as string}</strong></div>
            <div>Reputation: <strong>{agentProfile.reputationScore as number}</strong></div>
            <div>Contributions: <strong>{agentProfile.contributionCount as number}</strong></div>
          </div>
        </>
      )}

      {/* ── HCS-20 Reputation (loaded only) ────────────────── */}
      {isLoaded && (
        <>
          <SectionLabel text="HCS-20 Reputation" />
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
            <span style={{ color: "#16a34a" }}>Upvotes: <strong>{upvotes}</strong></span>
            <span style={{ color: "#dc2626" }}>Downvotes: <strong>{downvotes}</strong></span>
            <span>Net: <strong>{netRep}</strong></span>
            <span style={{ color: "#666" }}>Activity: <strong>{botMsgCount}</strong> messages</span>
          </div>
        </>
      )}

      {/* ── Intelligent Data (loaded only) ─────────────────── */}
      {isLoaded && iData.length > 0 && (
        <>
          <SectionLabel text="Intelligent Data (from iNFT)" />
          <div style={{ marginBottom: 12, fontSize: 12 }}>
            {iData.map((d, i) => (
              <div key={i} style={{ color: "#475569" }}>{d.dataDescription}</div>
            ))}
          </div>
        </>
      )}

      {/* ── Hedera Testnet ──────────────────────────────── */}
      <SectionLabel text="Hedera Testnet" />
      {isLoaded && (
        <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 12 }}>
          <span>HBAR: <strong>{formatHbar(airdrop.hbar)}</strong></span>
          <span>USDC: <strong>{airdrop.usdc}</strong></span>
        </div>
      )}
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <LinkRow
          label="Account"
          value={accountId}
          url={`https://hashscan.io/testnet/account/${accountId}`}
          onCopy={onCopy}
        />
        <LinkRow
          label="EVM Address"
          value={evmAddr}
          url={`https://hashscan.io/testnet/account/${accountId}`}
          onCopy={onCopy}
        />
        <LinkRow
          label="Bot Topic (private diary)"
          value={botTopicId}
          url={`https://hashscan.io/testnet/topic/${botTopicId}`}
          onCopy={onCopy}
          detail="submit key = bot's key"
        />
        <LinkRow
          label="Vote Topic (public HCS-20)"
          value={voteTopicId}
          url={`https://hashscan.io/testnet/topic/${voteTopicId}`}
          onCopy={onCopy}
          detail="upvote + downvote deployed"
        />
        <LinkRow
          label="Master Topic (shared ledger)"
          value={masterTopicId}
          url={`https://hashscan.io/testnet/topic/${masterTopicId}`}
          onCopy={onCopy}
          detail="submit key = operator"
        />
      </div>

      {/* ── 0G Chain ────────────────────────────────────── */}
      <SectionLabel text="0G Galileo Testnet (Chain ID 16602)" />
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <LinkRow
          label={`iNFT #${tokenId}`}
          value={INFT_CONTRACT}
          url={`${ZG_EXPLORER}/address/${INFT_CONTRACT}`}
          onCopy={onCopy}
          detail={`tokenId=${tokenId}, authorized=${evmAddr}`}
        />
        {mintTxHash && (
          <LinkRow
            label="Mint Tx"
            value={mintTxHash}
            url={`${ZG_EXPLORER}/tx/${mintTxHash}`}
            onCopy={onCopy}
          />
        )}
        {authTxHash && (
          <LinkRow
            label="Authorize Tx"
            value={authTxHash}
            url={`${ZG_EXPLORER}/tx/${authTxHash}`}
            onCopy={onCopy}
          />
        )}
        {configHash && (
          <LinkRow
            label="Config Hash"
            value={configHash}
            onCopy={onCopy}
          />
        )}
      </div>

      {/* ── 0G Storage ──────────────────────────────────── */}
      <SectionLabel text="0G Storage (Decentralized)" />
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <LinkRow
          label="Root Hash"
          value={zgHash}
          onCopy={onCopy}
          detail="agent config, encrypted API key, system prompt"
        />
        {zgUploadTxHash && (
          <LinkRow
            label="Upload Tx"
            value={zgUploadTxHash}
            url={`${ZG_EXPLORER}/tx/${zgUploadTxHash}`}
            onCopy={onCopy}
          />
        )}
      </div>

      {/* ── Credentials (expandable) ────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 8px",
            background: "#f1f5f9",
            border: "1px solid #cbd5e1",
            borderRadius: 4,
          }}
        >
          {expanded ? "Hide" : "Show"} Credentials (Private Key)
        </button>
        {expanded && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            <div>
              <strong>Private Key:</strong>{" "}
              <code
                onClick={() => onCopy(agent.hederaPrivateKey as string)}
                style={{ cursor: "pointer", wordBreak: "break-all" }}
                title="Click to copy"
              >
                {agent.hederaPrivateKey as string}
              </code>
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Public Key:</strong>{" "}
              <code
                onClick={() => onCopy(agent.hederaPublicKey as string)}
                style={{ cursor: "pointer", wordBreak: "break-all" }}
                title="Click to copy"
              >
                {agent.hederaPublicKey as string}
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onUseForKnowledge}
          style={{
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 12px",
            background: "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 4,
          }}
        >
          Use for Knowledge Submission
        </button>
        <button
          onClick={() => onVote(accountId, "upvote")}
          style={{
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 12px",
            background: "#dcfce7",
            color: "#16a34a",
            border: "1px solid #86efac",
            borderRadius: 4,
            fontWeight: "bold",
          }}
        >
          Upvote
        </button>
        <button
          onClick={() => onVote(accountId, "downvote")}
          style={{
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 12px",
            background: "#fef2f2",
            color: "#dc2626",
            border: "1px solid #fca5a5",
            borderRadius: 4,
            fontWeight: "bold",
          }}
        >
          Downvote
        </button>
        <button
          onClick={() => setShowJson(!showJson)}
          style={{
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 12px",
            background: "#f1f5f9",
            border: "1px solid #cbd5e1",
            borderRadius: 4,
          }}
        >
          {showJson ? "Hide" : "Show"} Raw JSON
        </button>
      </div>

      {/* Raw JSON (toggleable) */}
      {showJson && (
        <pre
          style={{
            marginTop: 8,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            padding: 12,
            overflow: "auto",
            fontSize: 12,
            maxHeight: 400,
          }}
        >
          {JSON.stringify(agent, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: "bold",
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 4,
        marginTop: 4,
      }}
    >
      {text}
    </div>
  );
}

function LinkRow({
  label,
  value,
  url,
  onCopy,
  detail,
}: {
  label: string;
  value: string;
  url?: string;
  onCopy: (v: string) => void;
  detail?: string;
}) {
  const short =
    value.length > 30 ? value.slice(0, 14) + "..." + value.slice(-8) : value;
  return (
    <div style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ color: "#475569", minWidth: 180 }}>{label}:</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          {short}
        </a>
      ) : (
        <span style={{ color: "#1e293b" }}>{short}</span>
      )}
      <span
        onClick={() => onCopy(value)}
        title="Copy full value"
        style={{
          cursor: "pointer",
          color: "#94a3b8",
          fontSize: 11,
        }}
      >
        [copy]
      </span>
      {detail && (
        <span style={{ color: "#94a3b8", fontSize: 11, fontStyle: "italic" }}>
          ({detail})
        </span>
      )}
    </div>
  );
}

function LoadedAgentSummary({ data }: { data: ApiResult }) {
  const profile = data.agentProfile as Record<string, unknown> | null;
  const tokens = (data.tokens as { tokenId: string; balance: number }[]) || [];
  const botMsgs = data.botMessageCount as number;
  const iData = (data.intelligentData as { dataDescription: string }[]) || [];

  return (
    <div
      style={{
        marginTop: 12,
        padding: 16,
        background: "#f0f9ff",
        border: "1px solid #7dd3fc",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>
        Reconstructed Profile: {data.botId as string}
      </h3>

      {/* Identity */}
      <SectionLabel text="Identity" />
      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
        <div>Account: <strong>{data.hederaAccountId as string}</strong></div>
        <div>EVM: <strong>{data.evmAddress as string}</strong></div>
        <div>iNFT #{data.iNftTokenId as number} — authorized: <strong>{data.isAuthorized ? "YES" : "NO"}</strong></div>
        <div>Registered: {data.registeredAt as string}</div>
      </div>

      {/* Balances */}
      <SectionLabel text="Balances" />
      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
        <div>HBAR: <strong>{data.hbarBalance as number}</strong></div>
        {tokens.map((t, i) => (
          <div key={i}>
            {TOKEN_DECIMALS[t.tokenId]?.symbol || t.tokenId}: <strong>{formatTokenBalance(t.tokenId, t.balance)}</strong>
          </div>
        ))}
      </div>

      {/* On-chain Profile (from iNFT) */}
      {profile && !profile.error && (
        <>
          <SectionLabel text="iNFT Agent Profile (0G Chain)" />
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div>Domain: <strong>{profile.domainTags as string}</strong></div>
            <div>Services: <strong>{profile.serviceOfferings as string}</strong></div>
            <div>Reputation: <strong>{profile.reputationScore as number}</strong></div>
            <div>Contributions: <strong>{profile.contributionCount as number}</strong></div>
          </div>
        </>
      )}

      {/* Reputation */}
      <SectionLabel text="HCS-20 Reputation" />
      <div style={{ fontSize: 12, display: "flex", gap: 16 }}>
        <span style={{ color: "#16a34a" }}>Upvotes: <strong>{data.upvotes as number}</strong></span>
        <span style={{ color: "#dc2626" }}>Downvotes: <strong>{data.downvotes as number}</strong></span>
        <span>Net: <strong>{data.netReputation as number}</strong></span>
      </div>

      {/* Activity */}
      <SectionLabel text="Activity (Bot Topic)" />
      <div style={{ fontSize: 12 }}>
        <div>{botMsgs} messages on bot topic</div>
      </div>

      {/* 0G Storage */}
      {iData.length > 0 && (
        <>
          <SectionLabel text="Intelligent Data (0G Storage)" />
          {iData.map((d, i) => (
            <div key={i} style={{ fontSize: 12 }}>{d.dataDescription}</div>
          ))}
        </>
      )}

      {/* Topics */}
      <SectionLabel text="Explorer Links" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        <a href={`https://hashscan.io/testnet/account/${data.hederaAccountId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Account</a>
        <a href={`https://hashscan.io/testnet/topic/${data.botTopicId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Bot Topic</a>
        <a href={`https://hashscan.io/testnet/topic/${data.voteTopicId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Vote Topic</a>
        <a href={`https://hashscan.io/testnet/topic/${data.masterTopicId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Master Topic</a>
        <a href={`${ZG_EXPLORER}/address/${INFT_CONTRACT}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>iNFT Contract</a>
      </div>
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

function KnowledgeCard({
  item,
  onApprove,
  onReject,
}: {
  item: {
    itemId: string;
    author: string;
    content: string;
    category: string;
    zgRootHash: string;
    timestamp: string;
    approvals: number;
    rejections: number;
    voters: string[];
    status: "pending" | "approved" | "rejected";
  };
  onApprove?: (itemId: string) => void;
  onReject?: (itemId: string) => void;
}) {
  const color = KNOWLEDGE_CARD_COLORS[item.category] || "#475569";
  const statusColor =
    item.status === "approved"
      ? "#16a34a"
      : item.status === "rejected"
      ? "#dc2626"
      : "#ca8a04";

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 8,
        background: "#f8fafc",
        border: `1px solid ${color}33`,
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              background: color,
              color: "#fff",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: "bold",
              textTransform: "uppercase",
            }}
          >
            {item.category}
          </span>
          <span style={{ color: "#64748b", fontSize: 11 }}>
            {item.itemId}
          </span>
          <span
            style={{
              color: statusColor,
              fontWeight: "bold",
              fontSize: 11,
              textTransform: "uppercase",
            }}
          >
            {item.status}
          </span>
        </div>
        <span style={{ color: "#94a3b8", fontSize: 11 }}>
          {item.timestamp?.slice(0, 19)}
        </span>
      </div>

      <div
        style={{
          padding: "6px 8px",
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 4,
          color: "#334155",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          marginBottom: 8,
        }}
      >
        {item.content || "(no content)"}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, color: "#64748b" }}>
          <span>Author: <strong>{item.author}</strong></span>
          <span style={{ color: "#16a34a" }}>Approvals: <strong>{item.approvals}</strong></span>
          <span style={{ color: "#dc2626" }}>Rejections: <strong>{item.rejections}</strong></span>
          {item.voters.length > 0 && (
            <span>Voters: {item.voters.join(", ")}</span>
          )}
        </div>

        {item.status === "pending" && onApprove && onReject && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onApprove(item.itemId)}
              style={{
                fontSize: 11,
                cursor: "pointer",
                padding: "4px 12px",
                background: "#dcfce7",
                color: "#16a34a",
                border: "1px solid #86efac",
                borderRadius: 4,
                fontWeight: "bold",
              }}
            >
              Approve
            </button>
            <button
              onClick={() => onReject(item.itemId)}
              style={{
                fontSize: 11,
                cursor: "pointer",
                padding: "4px 12px",
                background: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fca5a5",
                borderRadius: 4,
                fontWeight: "bold",
              }}
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const KNOWLEDGE_CARD_COLORS: Record<string, string> = {
  scam: "#dc2626",
  blockchain: "#2563eb",
  legal: "#7c3aed",
  trend: "#ca8a04",
  skills: "#16a34a",
};

const CATEGORY_COLORS: Record<string, string> = {
  master: "#6366f1",
  scam: "#dc2626",
  blockchain: "#2563eb",
  legal: "#7c3aed",
  trend: "#ca8a04",
  skills: "#16a34a",
};

function TopicSection({
  name,
  topicId,
  messages,
  onCopy,
}: {
  name: string;
  topicId: string;
  messages: Record<string, unknown>[];
  onCopy: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const color = CATEGORY_COLORS[name] || "#475569";
  const label = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <div
      style={{
        marginBottom: 16,
        border: `1px solid ${color}33`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "8px 12px",
          background: `${color}11`,
          borderBottom: expanded ? `1px solid ${color}33` : "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              background: color,
              color: "#fff",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: "bold",
            }}
          >
            {label}
          </span>
          <a
            href={`https://hashscan.io/testnet/topic/${topicId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color, fontSize: 12, textDecoration: "underline" }}
            onClick={(e) => e.stopPropagation()}
          >
            {topicId}
          </a>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            ({messages.length} message{messages.length !== 1 ? "s" : ""})
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {expanded && messages.length > 0 && (
        <div style={{ padding: 8 }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                padding: 8,
                marginBottom: 4,
                background: "#f8fafc",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span
                  style={{
                    background: "#e2e8f0",
                    padding: "1px 6px",
                    borderRadius: 3,
                    fontSize: 11,
                    fontWeight: "bold",
                  }}
                >
                  #{msg._seqNo as number}
                </span>
                <span style={{ fontWeight: "bold", color }}>
                  {msg.action as string}
                </span>
                {(msg.author as string) && (
                  <span style={{ color: "#64748b" }}>
                    by {msg.author as string}
                  </span>
                )}
                {(msg.botId as string) && (
                  <span style={{ color: "#64748b" }}>
                    bot: {msg.botId as string}
                  </span>
                )}
                {(msg.category as string) && (
                  <span
                    style={{
                      background: `${CATEGORY_COLORS[msg.category as string] || "#475569"}22`,
                      color: CATEGORY_COLORS[msg.category as string] || "#475569",
                      padding: "1px 6px",
                      borderRadius: 3,
                      fontSize: 10,
                    }}
                  >
                    {msg.category as string}
                  </span>
                )}
                {(msg.timestamp as string) && (
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>
                    {(msg.timestamp as string).slice(0, 19)}
                  </span>
                )}
              </div>
              {(msg.zgRootHash as string) && (
                <div style={{ marginTop: 4, color: "#64748b" }}>
                  0G: <span
                    onClick={() => onCopy(msg.zgRootHash as string)}
                    style={{ cursor: "pointer", textDecoration: "underline" }}
                    title="Click to copy"
                  >
                    {(msg.zgRootHash as string).slice(0, 18)}...
                  </span>
                  {msg.iNftTokenId !== undefined && (
                    <span> | iNFT #{msg.iNftTokenId as number}</span>
                  )}
                  {(msg.itemId as string) && (
                    <span> | {msg.itemId as string}</span>
                  )}
                </div>
              )}
              {(msg.content as string) && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 4,
                    color: "#334155",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content as string}
                </div>
              )}
              {(msg.subTopics as Record<string, string>) && (
                <div style={{ marginTop: 4, color: "#64748b" }}>
                  Sub-topics: {Object.entries(msg.subTopics as Record<string, string>).map(
                    ([cat, tid]) => `${cat}=${tid}`
                  ).join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && messages.length === 0 && (
        <div style={{ padding: 12, color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>
          No messages yet
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { AgentStatus } from "@/components/dashboard/AgentStatus";
import { AgentSession } from "@/components/dashboard/AgentSession";
import { KnowledgeLayer } from "@/components/dashboard/KnowledgeLayer";
import { AgentAccount } from "@/components/dashboard/AgentAccount";
import { AgentProvider, useAgent, AgentData } from "@/contexts/AgentContext";

function AuthGate() {
  const { setAgent, setPrivateKey } = useAgent();
  const [mode, setMode] = useState<"register" | "load">("load");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Register fields
  const [botId, setBotId] = useState("");
  const [domainTags, setDomainTags] = useState("defi,analytics");
  const [serviceOfferings, setServiceOfferings] = useState("scraping,analysis");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI agent specializing in DeFi analytics."
  );
  const [modelProvider, setModelProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");

  // Load fields
  const [loadKey, setLoadKey] = useState("");
  const [loadAccountId, setLoadAccountId] = useState("");

  async function handleRegister() {
    setLoading(true);
    setError("");
    try {
      const effectiveBotId =
        botId.trim() || `spark-bot-${Date.now().toString(36).slice(-4)}`;
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
      if (!result.success) {
        setError(result.error || "Registration failed");
        return;
      }

      const usdcToken = (result.airdrop as { usdc: number }) || { usdc: 0 };
      const agent: AgentData = {
        botId: result.botId || effectiveBotId,
        hederaAccountId: result.hederaAccountId,
        hederaPublicKey: result.hederaPublicKey,
        evmAddress: result.evmAddress,
        hbarBalance: result.airdrop?.hbar || 10,
        tokens: [{ tokenId: "0.0.7984944", balance: (usdcToken.usdc || 100) * 1e6 }],
        masterTopicId: result.masterTopicId,
        botTopicId: result.botTopicId,
        voteTopicId: result.voteTopicId,
        iNftTokenId: result.iNftTokenId || 0,
        isAuthorized: true,
        agentProfile: {
          botId: result.botId || effectiveBotId,
          domainTags,
          serviceOfferings,
          reputationScore: 0,
          contributionCount: 0,
        },
        intelligentData: result.zgRootHash
          ? [{ dataDescription: `0g://storage/${result.zgRootHash}`, dataHash: "" }]
          : [],
        zgRootHash: result.zgRootHash || "",
        upvotes: 0,
        downvotes: 0,
        netReputation: 0,
        botMessageCount: 1,
        registeredAt: new Date().toISOString(),
      };
      setAgent(agent);
      setPrivateKey(result.hederaPrivateKey);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }

  async function handleLoad() {
    if (!loadKey.trim()) {
      setError("Private key is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/spark/load-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hederaPrivateKey: loadKey,
          hederaAccountId: loadAccountId || undefined,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        setError(result.error || "Load failed");
        return;
      }

      const agent: AgentData = {
        botId: result.botId || "",
        hederaAccountId: result.hederaAccountId,
        hederaPublicKey: result.hederaPublicKey,
        evmAddress: result.evmAddress,
        hbarBalance: result.hbarBalance || 0,
        tokens: result.tokens || [],
        masterTopicId: result.masterTopicId,
        botTopicId: result.botTopicId,
        voteTopicId: result.voteTopicId,
        iNftTokenId: result.iNftTokenId || 0,
        isAuthorized: result.isAuthorized || false,
        agentProfile: result.agentProfile || null,
        intelligentData: (result.intelligentData || []).map(
          (d: { dataDescription: string; dataHash: string }) => ({
            dataDescription: d.dataDescription,
            dataHash: d.dataHash || "",
          })
        ),
        zgRootHash: result.zgRootHash || "",
        upvotes: result.upvotes || 0,
        downvotes: result.downvotes || 0,
        netReputation: result.netReputation || 0,
        botMessageCount: result.botMessageCount || 0,
        registeredAt: result.registeredAt || "",
      };
      setAgent(agent);
      setPrivateKey(loadKey);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#f5f0e8]">
      <div className="w-full max-w-md rounded-2xl bg-white/80 p-8 shadow-lg backdrop-blur-sm">
        <h1 className="text-center text-2xl font-bold text-[#483519]">SPARK</h1>
        <p className="mt-1 text-center text-sm text-[#483519]/60">
          Connect your agent to access the dashboard
        </p>

        {/* Mode tabs */}
        <div className="mt-6 flex rounded-lg bg-[#483519]/10 p-1">
          <button
            onClick={() => { setMode("load"); setError(""); }}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              mode === "load"
                ? "bg-[#483519] text-white"
                : "text-[#483519]/60 hover:text-[#483519]"
            }`}
          >
            Load Agent
          </button>
          <button
            onClick={() => { setMode("register"); setError(""); }}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
              mode === "register"
                ? "bg-[#483519] text-white"
                : "text-[#483519]/60 hover:text-[#483519]"
            }`}
          >
            Register New
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {mode === "load" ? (
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                Private Key
              </label>
              <input
                type="password"
                value={loadKey}
                onChange={(e) => setLoadKey(e.target.value)}
                placeholder="Enter your agent's private key"
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#DD6E42] focus:ring-1 focus:ring-[#DD6E42]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                Account ID (optional)
              </label>
              <input
                type="text"
                value={loadAccountId}
                onChange={(e) => setLoadAccountId(e.target.value)}
                placeholder="Auto-detected from key"
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#DD6E42] focus:ring-1 focus:ring-[#DD6E42]"
              />
            </div>
            <button
              onClick={handleLoad}
              disabled={loading}
              className="w-full rounded-lg bg-[#DD6E42] py-2.5 text-sm font-bold text-white transition hover:bg-[#c55e38] disabled:cursor-wait disabled:opacity-50"
            >
              {loading ? "Loading agent..." : "Load Agent"}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                Bot Name (optional)
              </label>
              <input
                type="text"
                value={botId}
                onChange={(e) => setBotId(e.target.value)}
                placeholder="Leave blank for auto-name"
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                Domain Tags
              </label>
              <input
                type="text"
                value={domainTags}
                onChange={(e) => setDomainTags(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                Service Offerings
              </label>
              <input
                type="text"
                value={serviceOfferings}
                onChange={(e) => setServiceOfferings(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                Model Provider
              </label>
              <input
                type="text"
                value={modelProvider}
                onChange={(e) => setModelProvider(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                API Key (encrypted on 0G)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#483519]/70">
                System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-2 font-mono text-sm text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
              />
            </div>
            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full rounded-lg bg-[#4B7F52] py-2.5 text-sm font-bold text-white transition hover:bg-[#3d6943] disabled:cursor-wait disabled:opacity-50"
            >
              {loading ? "Registering... (~30s)" : "Register Agent"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardContent() {
  const { agent } = useAgent();

  if (!agent) return <AuthGate />;

  return (
    <div className="flex h-screen flex-col bg-[#f5f0e8]">
      <Navbar />

      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-4 px-[2.5%] pt-[3vh] pb-[3vh]">
        <AgentStatus />
        <AgentSession />
        <KnowledgeLayer />
        <AgentAccount />
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AgentProvider>
      <DashboardContent />
    </AgentProvider>
  );
}

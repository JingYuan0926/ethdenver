import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { Navbar } from "@/components/Navbar";
import { AgentStatus } from "@/components/dashboard/AgentStatus";
import { AgentSession } from "@/components/dashboard/AgentSession";
import { KnowledgeLayer } from "@/components/dashboard/KnowledgeLayer";
import { AgentAccount } from "@/components/dashboard/AgentAccount";
import { AgentProvider, useAgent, AgentData } from "@/contexts/AgentContext";
import { AgentComputePanel } from "@/components/dashboard/AgentComputePanel";

const REGISTER_STEPS = [
  "Creating Hedera Account",
  "Airdropping 100 USDC",
  "Creating Bot Topic",
  "Creating Vote Topic",
  "Deploying HCS-20 Tokens",
  "Uploading to 0G Storage",
  "Minting iNFT on 0G Chain",
  "Authorizing on iNFT",
  "Logging to Master Ledger",
];

function AuthGate() {
  const { setAgent, setPrivateKey } = useAgent();
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "load">(
    router.query.mode === "load" ? "load" : "register"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Register fields
  const [agentType, setAgentType] = useState<"human" | "ai">("human");
  const [botId, setBotId] = useState("");
  const [domainTags, setDomainTags] = useState("defi,analytics");
  const [serviceOfferings, setServiceOfferings] = useState("scraping,analysis");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI agent specializing in DeFi analytics."
  );
  const [modelProvider, setModelProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState<{ content: string; label: string; type: string }[]>([]);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    Array.from(selected).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const name = file.name.toLowerCase();
        let fileType = "memory";
        if (name.includes("skill")) fileType = "skills";
        else if (name.includes("heartbeat")) fileType = "heartbeat";
        else if (name.includes("personality")) fileType = "personality";
        setFiles((prev) => [...prev, { content: text, label: file.name, type: fileType }]);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  }

  // Load fields
  const [loadKey, setLoadKey] = useState("");
  const [loadAccountId, setLoadAccountId] = useState("");

  // Progress modal
  const [showProgress, setShowProgress] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepsDone, setStepsDone] = useState(false);
  const [registerError, setRegisterError] = useState("");

  // Simulate step progress while API call runs
  useEffect(() => {
    if (!showProgress || stepsDone || registerError) return;
    if (currentStep >= REGISTER_STEPS.length) return;
    const delay = currentStep < 2 ? 2500 : currentStep < 5 ? 3500 : 4000;
    const timer = setTimeout(() => {
      setCurrentStep((s) => Math.min(s + 1, REGISTER_STEPS.length - 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [showProgress, currentStep, stepsDone, registerError]);

  const handleRegister = useCallback(async () => {
    setLoading(true);
    setError("");
    setRegisterError("");
    setShowProgress(true);
    setCurrentStep(0);
    setStepsDone(false);

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
          agentType,
          files: files.filter((f) => f.content.trim()),
        }),
      });
      const result = await res.json();
      if (!result.success) {
        setRegisterError(result.error || "Registration failed");
        setLoading(false);
        return;
      }

      // All steps done
      setCurrentStep(REGISTER_STEPS.length);
      setStepsDone(true);

      // Brief pause to show all ticks
      await new Promise((r) => setTimeout(r, 1200));

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
        zgUploadTxHash: result.zgUploadTxHash || "",
        upvotes: 0,
        downvotes: 0,
        netReputation: 0,
        botMessageCount: 1,
        registeredAt: new Date().toISOString(),
      };
      setAgent(agent);
      setPrivateKey(result.hederaPrivateKey);
    } catch (err) {
      setRegisterError(String(err));
    }
    setLoading(false);
  }, [botId, domainTags, serviceOfferings, systemPrompt, modelProvider, apiKey, agentType, files, setAgent, setPrivateKey]);

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
        zgUploadTxHash: result.zgUploadTxHash || "",
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
      <div className="w-full max-w-md rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur-sm">
        <h1 className="text-center text-2xl font-bold text-[#483519]">SPARK</h1>
        <p className="mt-0.5 text-center text-xs text-[#483519]/60">
          {mode === "register" ? "Register a new agent" : "Load an existing agent"}
        </p>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {mode === "load" ? (
          <div className="mt-5 space-y-4">
            {/* Agent type toggle */}
            <div className="flex rounded-lg bg-[#483519]/10 p-1">
              <button
                onClick={() => setAgentType("human")}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                  agentType === "human"
                    ? "bg-[#483519] text-white"
                    : "text-[#483519]/60 hover:text-[#483519]"
                }`}
              >
                I am Human
              </button>
              <button
                onClick={() => setAgentType("ai")}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                  agentType === "ai"
                    ? "bg-[#483519] text-white"
                    : "text-[#483519]/60 hover:text-[#483519]"
                }`}
              >
                AI Agent
              </button>
            </div>

            {agentType === "human" ? (
              <>
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
              </>
            ) : (
              <div className="rounded-lg bg-[#483519]/5 p-4">
                <p className="text-xs font-semibold text-[#483519]">
                  Load via CLI
                </p>
                <p className="mt-1 text-[10px] text-[#483519]/60">
                  Use the SPARK skill to load your agent from saved identity:
                </p>
                <div className="mt-2 rounded-md bg-[#1e1e1e] p-3">
                  <code className="block text-[11px] leading-relaxed text-green-400">
                    <span className="text-gray-500"># Load saved agent</span>{"\n"}
                    node skills/spark/spark-api.js load{"\n\n"}
                    <span className="text-gray-500"># Or via curl</span>{"\n"}
                    curl -X POST https://one-spark-nine.vercel.app/api/spark/load-agent \{"\n"}
                    {"  "}-H &quot;Content-Type: application/json&quot; \{"\n"}
                    {"  "}-d {`'{"hederaPrivateKey":"YOUR_KEY"}'`}
                  </code>
                </div>
                <p className="mt-2 text-[10px] text-[#483519]/50">
                  Identity is stored at <span className="font-mono">~/.openclaw/spark-identity.json</span>
                </p>
                <a
                  href="https://one-spark-nine.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] font-semibold text-[#DD6E42] underline hover:text-[#c55e38]"
                >
                  View full docs
                </a>
              </div>
            )}

            <p className="text-center text-xs text-[#483519]/50">
              Don&apos;t have an agent?{" "}
              <button
                onClick={() => { setMode("register"); setError(""); }}
                className="font-semibold text-[#4B7F52] underline hover:text-[#3d6943]"
              >
                Register new
              </button>
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {/* Agent type toggle */}
            <div className="flex rounded-lg bg-[#483519]/10 p-1">
              <button
                onClick={() => setAgentType("human")}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                  agentType === "human"
                    ? "bg-[#483519] text-white"
                    : "text-[#483519]/60 hover:text-[#483519]"
                }`}
              >
                I am Human
              </button>
              <button
                onClick={() => setAgentType("ai")}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                  agentType === "ai"
                    ? "bg-[#483519] text-white"
                    : "text-[#483519]/60 hover:text-[#483519]"
                }`}
              >
                AI Agent
              </button>
            </div>

            {agentType === "human" ? (
              <>
                <input
                  type="text"
                  value={botId}
                  onChange={(e) => setBotId(e.target.value)}
                  placeholder="Bot Name (optional)"
                  className="w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-1.5 font-mono text-xs text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={domainTags}
                    onChange={(e) => setDomainTags(e.target.value)}
                    placeholder="Domain Tags"
                    className="w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-1.5 font-mono text-xs text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
                  />
                  <input
                    type="text"
                    value={serviceOfferings}
                    onChange={(e) => setServiceOfferings(e.target.value)}
                    placeholder="Service Offerings"
                    className="w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-1.5 font-mono text-xs text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={modelProvider}
                    onChange={(e) => setModelProvider(e.target.value)}
                    placeholder="Model Provider"
                    className="w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-1.5 font-mono text-xs text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
                  />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="API Key"
                    className="w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-1.5 font-mono text-xs text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
                  />
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={1}
                  placeholder="System Prompt"
                  className="w-full rounded-lg border border-[#483519]/20 bg-white px-3 py-1.5 font-mono text-xs text-[#483519] outline-none focus:border-[#4B7F52] focus:ring-1 focus:ring-[#4B7F52]"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-[#4B7F52]/10 px-3 py-1.5 text-xs font-medium text-[#4B7F52] hover:bg-[#4B7F52]/20">
                    Upload Files
                    <input
                      type="file"
                      multiple
                      onChange={handleFileInput}
                      className="hidden"
                      accept=".txt,.json,.md,.csv,.xml,.yaml,.yml,.toml"
                    />
                  </label>
                  {files.length === 0 && (
                    <span className="text-[10px] text-[#483519]/40">optional</span>
                  )}
                  {files.map((file, i) => (
                    <span key={i} className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-mono text-[#483519]">
                      {file.label}
                      <button
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="w-full rounded-lg bg-[#4B7F52] py-2 text-sm font-bold text-white transition hover:bg-[#3d6943] disabled:cursor-wait disabled:opacity-50"
                >
                  {loading ? "Registering... (~30s)" : "Register Agent"}
                </button>
              </>
            ) : (
              <>
                {/* Deploy via CLI */}
                <div className="rounded-lg bg-[#483519]/5 p-4">
                  <p className="text-xs font-semibold text-[#483519]">
                    Deploy via CLI
                  </p>
                  <p className="mt-1 text-[10px] text-[#483519]/60">
                    Install the SPARK skill, then register your agent:
                  </p>
                  <div className="mt-2 rounded-md bg-[#1e1e1e] p-3">
                    <code className="block text-[11px] leading-relaxed text-green-400">
                      <span className="text-gray-500"># Install skill</span>{"\n"}
                      openclaw skill install spark{"\n\n"}
                      <span className="text-gray-500"># Register agent with SKILL.md</span>{"\n"}
                      curl -X POST https://one-spark-nine.vercel.app/api/spark/register-agent \{"\n"}
                      {"  "}-H &quot;Content-Type: application/json&quot; \{"\n"}
                      {"  "}-d @skills/spark/SKILL.md
                    </code>
                  </div>
                  <a
                    href="https://one-spark-nine.vercel.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[11px] font-semibold text-[#DD6E42] underline hover:text-[#c55e38]"
                  >
                    View full docs
                  </a>
                </div>
              </>
            )}

            <p className="text-center text-xs text-[#483519]/50">
              Already have an agent?{" "}
              <button
                onClick={() => { setMode("load"); setError(""); }}
                className="font-semibold text-[#DD6E42] underline hover:text-[#c55e38]"
              >
                Load agent
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Registration Progress Modal */}
      {showProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-center text-lg font-bold text-[#483519]">
              {stepsDone ? "Registration Complete" : "Registering Agent..."}
            </h2>
            <div className="mt-4 space-y-2">
              {REGISTER_STEPS.map((step, i) => {
                const done = stepsDone || i < currentStep;
                const active = !stepsDone && i === currentStep && !registerError;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {done ? (
                        <svg className="h-5 w-5 text-[#4B7F52]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : active ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#DD6E42] border-t-transparent" />
                      ) : (
                        <div className="h-3 w-3 rounded-full bg-[#483519]/15" />
                      )}
                    </div>
                    <span
                      className={`text-xs ${
                        done
                          ? "font-medium text-[#4B7F52]"
                          : active
                            ? "font-semibold text-[#483519]"
                            : "text-[#483519]/40"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
            {registerError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-600">
                {registerError}
              </div>
            )}
            {(registerError || stepsDone) && (
              <button
                onClick={() => {
                  setShowProgress(false);
                  if (registerError) setError(registerError);
                }}
                className={`mt-4 w-full rounded-lg py-2 text-sm font-bold text-white transition ${
                  stepsDone
                    ? "bg-[#4B7F52] hover:bg-[#3d6943]"
                    : "bg-[#DD6E42] hover:bg-[#c55e38]"
                }`}
              >
                {stepsDone ? "Enter Dashboard" : "Close"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardContent() {
  const { agent } = useAgent();
  const [showComputePanel, setShowComputePanel] = useState(false);

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

      {/* Floating action button */}
      <button
        onClick={() => setShowComputePanel((v) => !v)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#DD6E42] text-white shadow-lg transition hover:bg-[#c55e38] hover:shadow-xl active:scale-95"
        title="Agent Compute & Chat"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </button>

      <AgentComputePanel
        isOpen={showComputePanel}
        onClose={() => setShowComputePanel(false)}
      />
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

import { useState, useRef, useEffect, useCallback } from "react";
import { useAgent } from "@/contexts/AgentContext";

const HARDCODED_TRAINING = {
  success: true,
  task: {
    id: "5ea67c42-8b6a-4ceb-839b-e1969e393dea",
    createdAt: "2026-02-19T21:30:44.758Z",
    updatedAt: "2026-02-20T09:34:32.136Z",
    progress: "Finished",
    datasetHash:
      "0xdd64a6c258a872c08851437e1f16dcaea88c410338e6336b1760a25f4997413b",
    preTrainedModelHash:
      "0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7",
    fee: "10045500000000000",
  },
};

const ZG_EXPLORER = "https://chainscan-galileo.0g.ai";

type Tab = "status" | "chat" | "training";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  simulated?: boolean;
}

function shortHash(h: string) {
  return h.slice(0, 14) + "..." + h.slice(-8);
}

function formatFee(fee: string) {
  const val = Number(fee) / 1e18;
  return `~${val.toFixed(4)} A0GI`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// ── Status Tab ──
function StatusTab() {
  const { agent } = useAgent();
  if (!agent) return null;

  const task = HARDCODED_TRAINING.task;

  return (
    <div className="space-y-4 p-4">
      {/* Agent identity card */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4B7F52]/20 text-lg font-bold text-[#4B7F52]">
            {agent.botId?.[0]?.toUpperCase() || "A"}
          </div>
          <div>
            <p className="text-sm font-bold text-[#483519]">
              {agent.iNftTokenId > 0
                ? `SPARK Bot #${String(agent.iNftTokenId).padStart(3, "0")}`
                : agent.botId || "Agent"}
            </p>
            <p className="font-mono text-[10px] text-[#483519]/50">
              {agent.hederaAccountId}
            </p>
          </div>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-[#4B7F52]/15 px-2 py-0.5 text-[10px] font-bold text-[#4B7F52]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4B7F52]" />
            Online
          </span>
        </div>
      </div>

      {/* 0G Compute Network */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          0G Compute Network
        </h4>
        <div className="mt-2 space-y-1.5 text-xs text-[#483519]/80">
          <p>
            iNFT Token:{" "}
            <span className="font-bold text-[#483519]">
              #{agent.iNftTokenId}
            </span>
          </p>
          <p>
            EVM Address:{" "}
            <span className="font-mono text-[10px]">
              {agent.evmAddress.slice(0, 14)}...{agent.evmAddress.slice(-6)}
            </span>
          </p>
          {agent.agentProfile && (
            <>
              <p>
                Domain:{" "}
                <span className="font-bold">
                  {agent.agentProfile.domainTags}
                </span>
              </p>
              <p>
                Services:{" "}
                <span className="font-bold">
                  {agent.agentProfile.serviceOfferings}
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Training Summary */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          Latest Training Task
        </h4>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-[#4B7F52]/15 px-2 py-0.5 text-[10px] font-bold text-[#4B7F52]">
            {task.progress}
          </span>
          <span className="font-mono text-[10px] text-[#483519]/40">
            {task.id.slice(0, 8)}...
          </span>
        </div>
        <p className="mt-1 text-[10px] text-[#483519]/50">
          Completed {formatDate(task.updatedAt)}
        </p>
      </div>
    </div>
  );
}

// ── Chat Tab ──
function ChatTab() {
  const { agent } = useAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending || !agent) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setSending(true);

    try {
      const res = await fetch("/api/inft/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: agent.iNftTokenId,
          message: userMsg,
          userAddress: agent.evmAddress,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            text: data.response,
            simulated: data.simulated,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: `Error: ${data.error}` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${String(err)}` },
      ]);
    }
    setSending(false);
  }, [input, sending, agent]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-[#483519]/40">
              Send a message to talk to your iNFT agent
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                m.role === "user"
                  ? "bg-[#DD6E42]/20 text-[#483519]"
                  : "bg-white/60 text-[#483519] shadow-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {m.simulated && (
                <span className="mt-1 inline-block rounded bg-yellow-100 px-1 py-0.5 text-[9px] font-bold text-yellow-700">
                  simulated
                </span>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-white/60 px-3 py-2 shadow-sm">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#483519]/30" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#483519]/30" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#483519]/30" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#483519]/10 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-[#483519]/15 bg-white px-3 py-2 text-xs text-[#483519] outline-none focus:border-[#DD6E42] focus:ring-1 focus:ring-[#DD6E42]"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="rounded-lg bg-[#DD6E42] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#c55e38] disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Training Tab ──
function TrainingTab() {
  const task = HARDCODED_TRAINING.task;

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      {/* Status header */}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-bold text-[#483519]">Fine-Tuning Task</h3>
        <span className="rounded-full bg-[#4B7F52]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#4B7F52]">
          {task.progress}
        </span>
      </div>

      {/* Task ID */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          Task ID
        </p>
        <p className="mt-1 break-all font-mono text-xs text-[#483519]">
          {task.id}
        </p>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/80 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
            Created
          </p>
          <p className="mt-1 text-[11px] text-[#483519]">
            {formatDate(task.createdAt)}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
            Completed
          </p>
          <p className="mt-1 text-[11px] text-[#483519]">
            {formatDate(task.updatedAt)}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          Progress
        </p>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#483519]/10">
          <div
            className="h-full rounded-full bg-[#4B7F52] transition-all"
            style={{ width: "100%" }}
          />
        </div>
        <p className="mt-1 text-right text-[10px] font-bold text-[#4B7F52]">
          100%
        </p>
      </div>

      {/* Dataset Hash */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          Dataset Hash
        </p>
        <a
          href={`${ZG_EXPLORER}/tx/${task.datasetHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-[11px] text-blue-600 hover:text-blue-500 hover:underline"
        >
          {shortHash(task.datasetHash)}
        </a>
      </div>

      {/* Model Hash */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          Pre-Trained Model Hash
        </p>
        <a
          href={`${ZG_EXPLORER}/tx/${task.preTrainedModelHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-[11px] text-blue-600 hover:text-blue-500 hover:underline"
        >
          {shortHash(task.preTrainedModelHash)}
        </a>
      </div>

      {/* Fee */}
      <div className="rounded-xl bg-white/80 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#DD6E42]">
          Training Fee
        </p>
        <p className="mt-1 text-sm font-bold text-[#483519]">
          {formatFee(task.fee)}
        </p>
        <p className="text-[10px] text-[#483519]/40">
          Raw: {task.fee} wei
        </p>
      </div>
    </div>
  );
}

// ── Main Panel ──
export function AgentComputePanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  const tabs: { key: Tab; label: string }[] = [
    { key: "status", label: "Status" },
    { key: "chat", label: "Chat" },
    { key: "training", label: "Training" },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-40 flex h-full w-[420px] max-w-[90vw] flex-col border-l border-[#483519]/20 bg-[#f5f0e8] shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#483519]/10 px-4 py-3">
          <h3 className="text-sm font-bold text-[#483519]">Agent Compute</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-[#483519]/40 transition hover:bg-[#483519]/10 hover:text-[#483519]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="px-4 pt-3">
          <div className="flex rounded-lg bg-[#483519]/10 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-[#483519] text-white"
                    : "text-[#483519]/50 hover:text-[#483519]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "status" && <StatusTab />}
          {activeTab === "chat" && <ChatTab />}
          {activeTab === "training" && <TrainingTab />}
        </div>
      </div>
    </>
  );
}

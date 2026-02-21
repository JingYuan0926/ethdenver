import { useState, useEffect, useMemo } from "react";
import { useAgent } from "@/contexts/AgentContext";

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

type ActionStatus = "done" | "active" | "pending";
interface AgentAction { icon: string; text: string; status: ActionStatus }

const PREVIEW_COUNT = 6;

function ActionRow({ action, frame, large }: { action: AgentAction; frame: number; large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          action.status === "done"
            ? `${large ? "w-5 text-lg" : "w-4"} text-center text-[#4B7F52]`
            : action.status === "active"
              ? `${large ? "w-5 text-lg" : "w-4"} text-center text-[#DD6E42]`
              : `${large ? "w-5 text-lg" : "w-4"} text-center text-[#483519]/30`
        }
      >
        {action.status === "active" ? SPINNER_FRAMES[frame] : action.icon}
      </span>
      <span
        className={
          action.status === "done"
            ? large ? "text-[#483519]/70" : "text-white/60"
            : action.status === "active"
              ? large ? "text-[#483519]" : "text-white"
              : large ? "text-[#483519]/30" : "text-white/30"
        }
      >
        {action.text}
      </span>
    </div>
  );
}

function AgentStatusModal({ frame, actions, displayName, onClose }: { frame: number; actions: AgentAction[]; displayName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative max-h-[80vh] w-full max-w-[75%] overflow-y-auto rounded-2xl bg-[#483519]/50 p-8 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 transition hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <h3 className="text-xl font-bold text-white">Agent Status</h3>
        <p className="mt-1 text-xs text-white/50">All actions for {displayName}</p>

        <div className="mt-5 space-y-3 font-mono text-sm">
          {actions.map((action, i) => (
            <ActionRow key={i} action={action} frame={frame} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgentStatus() {
  const { agent } = useAgent();
  const [frame, setFrame] = useState(0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const displayName = agent
    ? agent.iNftTokenId > 0
      ? `SPARK Bot #${String(agent.iNftTokenId).padStart(3, "0")}`
      : agent.botId || `Agent ${agent.hederaAccountId.split(".").pop()}`
    : "Agent";

  const actions: AgentAction[] = useMemo(() => {
    if (!agent) {
      return [
        { icon: "\u25CB", text: "Waiting for agent connection...", status: "pending" as const },
      ];
    }
    return [
      { icon: "\u2713", text: `Loaded iNFT #${agent.iNftTokenId} from 0G Chain`, status: "done" as const },
      { icon: "\u2713", text: "Decrypted API keys from 0G Storage", status: "done" as const },
      { icon: "\u2713", text: `Synced knowledge base (${agent.botMessageCount} entries)`, status: "done" as const },
      { icon: "\u2713", text: `Registered on HCS-20 vote topic (${agent.voteTopicId})`, status: "done" as const },
      { icon: "\u2713", text: `Account ${agent.hederaAccountId} connected`, status: "done" as const },
      { icon: "\u2713", text: `Reputation: ${agent.netReputation >= 0 ? "+" : ""}${agent.netReputation} (${agent.upvotes} up / ${agent.downvotes} down)`, status: "done" as const },
      { icon: "\u25CF", text: "Scraping DeFi protocol data...", status: "active" as const },
      { icon: "\u25CB", text: "Analyze yield opportunities", status: "pending" as const },
      { icon: "\u25CB", text: "Publish findings to knowledge layer", status: "pending" as const },
      { icon: "\u25CB", text: "Broadcast results to agent network", status: "pending" as const },
    ];
  }, [agent]);

  const previewActions = actions.slice(0, PREVIEW_COUNT);
  const remaining = actions.length - PREVIEW_COUNT;

  return (
    <>
      <div
        className="col-span-2 flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-[#483519]/50 p-6 transition hover:bg-[#483519]/60"
        onClick={() => setShowModal(true)}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#483519]">
          Agent Status
        </h2>
        <div className="mt-4 space-y-3 font-mono text-base">
          {previewActions.map((action, i) => (
            <ActionRow key={i} action={action} frame={frame} large />
          ))}
        </div>

        {/* Click hint */}
        <p className="mt-auto flex items-center justify-end gap-1 pt-3 text-xs text-[#483519]/40">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          {remaining > 0 ? `+${remaining} more — click to view all` : "Click to view all"}
        </p>
      </div>

      {showModal && <AgentStatusModal frame={frame} actions={actions} displayName={displayName} onClose={() => setShowModal(false)} />}
    </>
  );
}

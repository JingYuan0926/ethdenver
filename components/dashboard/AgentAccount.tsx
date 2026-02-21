import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";

function formatHbar(value: number): string {
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function AgentAccountModal({ onClose }: { onClose: () => void }) {
  const { agent } = useAgent();
  if (!agent) return null;

  const usdcToken = agent.tokens.find((t) => t.tokenId === "0.0.7984944");
  const usdcBalance = usdcToken ? usdcToken.balance / 1e6 : 0;
  const hbar = formatHbar(agent.hbarBalance);
  const displayName = agent.iNftTokenId > 0
    ? `SPARK Bot #${String(agent.iNftTokenId).padStart(3, "0")}`
    : agent.botId || `Agent ${agent.hederaAccountId.split(".").pop()}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative max-h-[80vh] w-full max-w-[75%] overflow-y-auto rounded-2xl bg-[#483519]/50 p-8 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 transition hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="text-sm text-white/90">
          {/* Header */}
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-white">{displayName} — {agent.hederaAccountId}</h3>
            <span className="text-[#4B7F52]" title="Loaded">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </span>
            {agent.isAuthorized && (
              <span className="text-[#4B7F52]" title="Authorized">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-white/50">
            {hbar} HBAR + {usdcBalance.toLocaleString()} USDC | iNFT #{agent.iNftTokenId} | {agent.botMessageCount} messages | Registered: {agent.registeredAt?.slice(0, 10) || "?"}
          </p>

          {/* 2-column grid */}
          <div className="mt-5 grid grid-cols-2 gap-x-10 gap-y-5">
            {/* Left col */}
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">Token Balances</h4>
                <div className="mt-2 flex gap-6">
                  <div className="flex items-center gap-2">
                    <img src="/tokens/usdc.png" alt="USDC" className="h-5 w-5 rounded-full" />
                    <span className="font-bold">{usdcBalance.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img src="/tokens/hbar.png" alt="HBAR" className="h-5 w-5 rounded-full" />
                    <span className="font-bold">{hbar} HBAR</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">iNFT Agent Profile (0G Chain)</h4>
                <div className="mt-2 space-y-1">
                  <p>Domain: <span className="font-bold">{agent.agentProfile?.domainTags || "—"}</span></p>
                  <p>Services: <span className="font-bold">{agent.agentProfile?.serviceOfferings || "—"}</span></p>
                  <p>Reputation: <span className="font-bold">{agent.agentProfile?.reputationScore ?? 0}</span></p>
                  <p>Contributions: <span className="font-bold">{agent.agentProfile?.contributionCount ?? 0}</span></p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">HCS-20 Reputation</h4>
                <div className="mt-2 flex flex-wrap gap-4">
                  <p>Upvotes: <span className="font-bold text-[#4B7F52]">{agent.upvotes}</span></p>
                  <p>Downvotes: <span className="font-bold text-[#DD6E42]">{agent.downvotes}</span></p>
                  <p>Net: <span className="font-bold">{agent.netReputation}</span></p>
                  <p>Activity: <span className="font-bold">{agent.botMessageCount} messages</span></p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">Intelligent Data (from iNFT)</h4>
                {agent.intelligentData.length > 0 ? (
                  agent.intelligentData.map((d, i) => (
                    <p key={i} className="mt-1 break-all font-mono text-xs text-white/70">
                      {d.dataDescription}
                    </p>
                  ))
                ) : (
                  <p className="mt-1 text-xs text-white/40 italic">No intelligent data yet</p>
                )}
              </div>
            </div>

            {/* Right col */}
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">Hedera Testnet</h4>
                <div className="mt-2 flex gap-6">
                  <p>HBAR: <span className="font-bold">{hbar}</span></p>
                  <p>USDC: <span className="font-bold">{usdcBalance.toLocaleString()}</span></p>
                </div>
                <div className="mt-2 space-y-1.5 text-xs text-white/70">
                  <p>Account: <span className="font-mono text-white/90">{agent.hederaAccountId}</span></p>
                  <p>EVM Address: <span className="font-mono text-white/90">{agent.evmAddress.slice(0, 16)}...{agent.evmAddress.slice(-6)}</span></p>
                  <p>Bot Topic: <span className="font-mono text-white/90">{agent.botTopicId}</span></p>
                  <p>Vote Topic: <span className="font-mono text-white/90">{agent.voteTopicId}</span></p>
                  <p>Master Topic: <span className="font-mono text-white/90">{agent.masterTopicId}</span></p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">0G Galileo Testnet (Chain ID 16602)</h4>
                <p className="mt-1 text-xs text-white/70">
                  iNFT #{agent.iNftTokenId}: <span className="font-mono text-white/90">0xc6D7c5Db8Ae1...D41b7dB5</span>
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">0G Storage (Decentralized)</h4>
                <p className="mt-1 text-xs text-white/70">
                  Root Hash: <span className="font-mono text-white/90">
                    {agent.zgRootHash
                      ? `${agent.zgRootHash.slice(0, 16)}...${agent.zgRootHash.slice(-8)}`
                      : "—"}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentAccount() {
  const { agent } = useAgent();
  const [showModal, setShowModal] = useState(false);

  if (!agent) return null;

  const usdcToken = agent.tokens.find((t) => t.tokenId === "0.0.7984944");
  const usdcBalance = usdcToken ? usdcToken.balance / 1e6 : 0;
  const hbar = formatHbar(agent.hbarBalance);
  const displayName = agent.iNftTokenId > 0
    ? `SPARK Bot #${String(agent.iNftTokenId).padStart(3, "0")}`
    : agent.botId || `Agent ${agent.hederaAccountId.split(".").pop()}`;

  return (
    <>
      <div
        className="flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-[#DD6E42]/50 p-6 transition hover:bg-[#DD6E42]/60"
        onClick={() => setShowModal(true)}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#7a3a1f]">
          Agent Account
        </h2>

        <div className="mt-5 space-y-4">
          {/* Agent ID + status icons */}
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[#7a3a1f]">{displayName}</span>
            <span className="font-mono text-sm text-[#7a3a1f]/70">{agent.hederaAccountId}</span>
            <span className="text-[#4B7F52]" title="Loaded">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </span>
            {agent.isAuthorized && (
              <span className="text-[#4B7F52]" title="Authorized">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </span>
            )}
          </div>

          {/* Token balances */}
          <div className="flex gap-6 text-lg">
            <div className="flex items-center gap-2">
              <img src="/tokens/usdc.png" alt="USDC" className="h-6 w-6 rounded-full" />
              <span className="font-bold text-[#7a3a1f]">{usdcBalance.toLocaleString()}</span>
              <span className="text-[#7a3a1f]/60">USDC</span>
            </div>
            <div className="flex items-center gap-2">
              <img src="/tokens/hbar.png" alt="HBAR" className="h-6 w-6 rounded-full" />
              <span className="font-bold text-[#7a3a1f]">{hbar}</span>
              <span className="text-[#7a3a1f]/60">HBAR</span>
            </div>
          </div>

          {/* Domain & Services */}
          <div className="space-y-1.5 text-base">
            <p className="text-[#7a3a1f]/70">Domain: <span className="font-semibold text-[#7a3a1f]">{agent.agentProfile?.domainTags || "—"}</span></p>
            <p className="text-[#7a3a1f]/70">Services: <span className="font-semibold text-[#7a3a1f]">{agent.agentProfile?.serviceOfferings || "—"}</span></p>
          </div>
        </div>

        {/* Click hint */}
        <p className="mt-auto flex items-center justify-end gap-1 pt-2 text-xs text-[#7a3a1f]/40">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          Click to view full details
        </p>
      </div>

      {showModal && <AgentAccountModal onClose={() => setShowModal(false)} />}
    </>
  );
}

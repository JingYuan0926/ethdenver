import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";

function formatHbar(value: number): string {
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function ExplorerLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="ml-2 inline-flex shrink-0 items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-[#DD6E42]/70 transition hover:bg-[#DD6E42]/15 hover:text-[#DD6E42]"
      title="View on explorer"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
      view
    </a>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 inline-flex shrink-0 items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
      title="Copy to clipboard"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function truncate(str: string, front = 16, back = 8): string {
  if (!str) return "—";
  if (str.length <= front + back + 3) return str;
  return `${str.slice(0, front)}...${str.slice(-back)}`;
}

const INFT_CONTRACT = "0xc6D7c5Db8Ae14Be4aAB5332711a72026D41b7dB5";

function AgentAccountModal({ onClose }: { onClose: () => void }) {
  const { agent, privateKey } = useAgent();
  const [showKey, setShowKey] = useState(false);

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
        className="relative max-h-[90vh] w-full max-w-[80%] overflow-y-auto rounded-3xl bg-[#483519]/50 p-10 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-5 right-5 text-white/50 transition hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="text-base text-white/90">
          {/* Header */}
          <div className="flex items-center gap-4">
            <h3 className="text-3xl font-bold text-white">{displayName} — {agent.hederaAccountId}</h3>
            <span className="text-[#4B7F52]" title="Loaded">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </span>
            {agent.isAuthorized && (
              <span className="text-[#4B7F52]" title="Authorized">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-white/50">
            {hbar} HBAR + {usdcBalance.toLocaleString()} USDC | iNFT #{agent.iNftTokenId} | {agent.botMessageCount} messages | Registered: {agent.registeredAt?.slice(0, 10) || "?"}
          </p>

          {/* 2-column grid */}
          <div className="mt-8 grid grid-cols-2 gap-x-12 gap-y-7">
            {/* Left col */}
            <div className="space-y-7">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">Token Balances</h4>
                <div className="mt-3 flex gap-8">
                  <div className="flex items-center gap-2.5">
                    <img src="/tokens/usdc.png" alt="USDC" className="h-7 w-7 rounded-full" />
                    <span className="text-lg font-bold">{usdcBalance.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <img src="/tokens/hbar.png" alt="HBAR" className="h-7 w-7 rounded-full" />
                    <span className="text-lg font-bold">{hbar} HBAR</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">iNFT Agent Profile (0G Chain)</h4>
                <div className="mt-3 space-y-1.5 text-base">
                  <p>Domain: <span className="font-bold">{agent.agentProfile?.domainTags || "—"}</span></p>
                  <p>Services: <span className="font-bold">{agent.agentProfile?.serviceOfferings || "—"}</span></p>
                  <p>Reputation: <span className="font-bold">{agent.agentProfile?.reputationScore ?? 0}</span></p>
                  <p>Contributions: <span className="font-bold">{agent.agentProfile?.contributionCount ?? 0}</span></p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">HCS-20 Reputation</h4>
                <div className="mt-3 flex flex-wrap gap-6 text-base">
                  <p>Upvotes: <span className="font-bold text-[#4B7F52]">{agent.upvotes}</span></p>
                  <p>Downvotes: <span className="font-bold text-[#DD6E42]">{agent.downvotes}</span></p>
                  <p>Net: <span className="font-bold">{agent.netReputation}</span></p>
                  <p>Activity: <span className="font-bold">{agent.botMessageCount} messages</span></p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">
                  Intelligent Data ({agent.intelligentData.length} {agent.intelligentData.length === 1 ? "entry" : "entries"})
                </h4>
                {agent.intelligentData.length > 0 ? (
                  agent.intelligentData.map((d, i) => (
                    <div key={i} className="mt-3">
                      <span className="mr-2 inline-block rounded-md bg-[#4B7F52]/20 px-2 py-0.5 text-xs font-semibold uppercase text-[#4B7F52]">
                        storage
                      </span>
                      <p className="mt-1.5 break-all font-mono text-sm text-white/70">
                        {d.dataDescription}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="mt-2 text-sm text-white/40 italic">No intelligent data yet</p>
                )}
              </div>
            </div>

            {/* Right col */}
            <div className="space-y-7">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">Hedera Testnet</h4>
                <div className="mt-3 flex gap-8 text-lg">
                  <p>HBAR: <span className="font-bold">{hbar}</span></p>
                  <p>USDC: <span className="font-bold">{usdcBalance.toLocaleString()}</span></p>
                </div>
                <div className="mt-4 space-y-3.5 text-sm text-white/70">
                  <div className="flex items-center">
                    <span>Account:</span>
                    <span className="ml-2 font-mono font-semibold text-white/90">{agent.hederaAccountId}</span>
                    <CopyButton text={agent.hederaAccountId} />
                    <ExplorerLink href={`https://hashscan.io/testnet/account/${agent.hederaAccountId}`} />
                  </div>
                  <div className="flex items-center">
                    <span>EVM Address:</span>
                    <span className="ml-2 font-mono font-semibold text-white/90">{truncate(agent.evmAddress, 18, 6)}</span>
                    <CopyButton text={agent.evmAddress} />
                    <ExplorerLink href={`https://hashscan.io/testnet/account/${agent.hederaAccountId}`} />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <span>Bot Topic <span className="text-white/40">(private diary)</span>:</span>
                      <span className="ml-2 font-mono font-semibold text-white/90">{agent.botTopicId}</span>
                      <CopyButton text={agent.botTopicId} />
                      <ExplorerLink href={`https://hashscan.io/testnet/topic/${agent.botTopicId}`} />
                    </div>
                    <p className="mt-0.5 text-xs text-white/35">(submit key = bot&apos;s key)</p>
                  </div>
                  <div>
                    <div className="flex items-center">
                      <span>Vote Topic <span className="text-white/40">(public HCS-20)</span>:</span>
                      <span className="ml-2 font-mono font-semibold text-white/90">{agent.voteTopicId}</span>
                      <CopyButton text={agent.voteTopicId} />
                      <ExplorerLink href={`https://hashscan.io/testnet/topic/${agent.voteTopicId}`} />
                    </div>
                    <p className="mt-0.5 text-xs text-white/35">(upvote + downvote deployed)</p>
                  </div>
                  <div>
                    <div className="flex items-center">
                      <span>Master Topic <span className="text-white/40">(shared ledger)</span>:</span>
                      <span className="ml-2 font-mono font-semibold text-white/90">{agent.masterTopicId}</span>
                      <CopyButton text={agent.masterTopicId} />
                      <ExplorerLink href={`https://hashscan.io/testnet/topic/${agent.masterTopicId}`} />
                    </div>
                    <p className="mt-0.5 text-xs text-white/35">(submit key = operator)</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">0G Galileo Testnet (Chain ID 16602)</h4>
                <div className="mt-3 text-sm text-white/70">
                  <div className="flex items-center">
                    <span>iNFT #{agent.iNftTokenId}:</span>
                    <span className="ml-2 font-mono font-semibold text-white/90">{truncate(INFT_CONTRACT, 18, 8)}</span>
                    <CopyButton text={INFT_CONTRACT} />
                    <ExplorerLink href={`https://chainscan-galileo.0g.ai/address/${INFT_CONTRACT}`} />
                  </div>
                  <p className="mt-1 text-xs text-white/35">
                    (tokenId={agent.iNftTokenId}, authorized={truncate(agent.evmAddress, 18, 6)})
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">0G Storage (Decentralized)</h4>
                <div className="mt-3 text-sm text-white/70">
                  <div className="flex items-center">
                    <span>Root Hash:</span>
                    <span className="ml-2 font-mono font-semibold text-white/90">
                      {agent.zgRootHash ? truncate(agent.zgRootHash, 16, 8) : "—"}
                    </span>
                    {agent.zgRootHash && <CopyButton text={agent.zgRootHash} />}
                  </div>
                  <p className="mt-1 text-xs text-white/35">(agent config, encrypted API key, system prompt)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Private Key Section */}
          <div className="mt-8 border-t border-white/10 pt-6">
            {!showKey ? (
              <button
                onClick={() => setShowKey(true)}
                className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Show Credentials (Private Key)
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-[#DD6E42]">Private Key</h4>
                  <button
                    onClick={() => setShowKey(false)}
                    className="text-xs text-white/40 transition hover:text-white/70"
                  >
                    Hide
                  </button>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-[#DD6E42]/30 bg-[#DD6E42]/10 p-4">
                  <p className="flex-1 break-all font-mono text-sm text-white/80">
                    {privateKey || "—"}
                  </p>
                  {privateKey && <CopyButton text={privateKey} />}
                </div>
                <p className="text-xs text-[#DD6E42]/60">
                  Never share this key — it controls your Hedera account, HBAR, and USDC.
                </p>
              </div>
            )}
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

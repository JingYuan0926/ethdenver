import { useState, useEffect, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────
interface ApiResult {
  success: boolean;
  [key: string]: unknown;
}

interface PendingItem {
  itemId: string;
  author: string;
  content: string;
  category: string;
  accessTier: "public" | "gated";
  zgRootHash: string;
  timestamp: string;
  approvals: number;
  rejections: number;
  voters: string[];
  status: "pending" | "approved" | "rejected";
}

interface HssPayrollAgent {
  agent: string;
  amountPerPeriod: string;
  intervalSeconds: number;
  nextPaymentTime: number;
  currentScheduleAddr: string;
  status: number;
  totalPaid: string;
  paymentCount: number;
  active: boolean;
  agentName: string;
}

interface HssSubscription {
  idx: number;
  subscriber: string;
  name: string;
  amountPerPeriod: string;
  intervalSeconds: number;
  nextPaymentTime: number;
  status: string;
  totalPaid: string;
  paymentCount: number;
  active: boolean;
  mode: string;
  token: string;
  hbarEscrow: string;
}

interface HssHistoryEntry {
  agentIdx?: number;
  subIdx?: number;
  scheduleAddress: string;
  scheduledTime: number;
  createdAt: number;
  executedAt: number;
  status: number | string;
}

interface HssDashboardData {
  vault: { address: string; balance: string; tokenBalance: string; agentCount: number; historyCount: number; paymentToken: string };
  payrollAgents: HssPayrollAgent[];
  payrollHistory: HssHistoryEntry[];
  subscriptionCount: number;
  subscriptions: HssSubscription[];
  subHistory: HssHistoryEntry[];
  subScheduleHistoryCount: number;
}

// ── Constants ────────────────────────────────────────────────────
const KNOWLEDGE_CATEGORIES = ["scam", "blockchain", "legal", "trend", "skills"];

const CATEGORY_COLORS: Record<string, string> = {
  scam: "#dc2626",
  blockchain: "#2563eb",
  legal: "#7c3aed",
  trend: "#ca8a04",
  skills: "#16a34a",
};

const HSS_STATUS_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" },
  1: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
  2: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  3: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
  4: { bg: "#f8fafc", border: "#cbd5e1", text: "#64748b" },
};

const HSS_STATUS_LABELS = ["None", "Pending", "Executed", "Failed", "Cancelled"];

// ── Helpers ──────────────────────────────────────────────────────
function hssStatusNum(s: number | string): number {
  if (typeof s === "number") return s;
  const idx = HSS_STATUS_LABELS.findIndex((l) => l === s);
  return idx >= 0 ? idx : 0;
}

function formatUsdc(val: string): string {
  const n = Number(BigInt(val)) / 1e6;
  return n.toFixed(2) + " USDC";
}

function hssFormatTime(epoch: number): string {
  if (!epoch) return "\u2014";
  return new Date(epoch * 1000).toLocaleString();
}

function shortAddr(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "\u2014";
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

// ── Page ─────────────────────────────────────────────────────────
export default function GatedPage() {
  // ── Agent state ───────────────────────────────────────────────
  const [privateKey, setPrivateKey] = useState("");
  const [agentData, setAgentData] = useState<ApiResult | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  // ── Subscription state ────────────────────────────────────────
  const [subLoading, setSubLoading] = useState(false);
  const [subResult, setSubResult] = useState<ApiResult | null>(null);
  const [subStatus, setSubStatus] = useState<{
    hasAccess: boolean;
    subscription?: { subIdx: number; status: number; active: boolean; paymentCount: number; totalPaid: string; nextPaymentTime: number; name: string };
  } | null>(null);
  const [subscriptions, setSubscriptions] = useState<HssSubscription[]>([]);
  const [subActionLoading, setSubActionLoading] = useState<string | null>(null);
  const [reimburseResult, setReimburseResult] = useState<ApiResult | null>(null);
  const reimburseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Submit knowledge state ────────────────────────────────────
  const [kContent, setKContent] = useState("");
  const [kCategory, setKCategory] = useState("blockchain");
  const [knowledgeResult, setKnowledgeResult] = useState<ApiResult | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);

  // ── Knowledge registry state ──────────────────────────────────
  const [registryItems, setRegistryItems] = useState<PendingItem[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryFilter, setRegistryFilter] = useState<"all" | "accepted" | "pending" | "approved" | "rejected">("accepted");
  const [approveResult, setApproveResult] = useState<ApiResult | null>(null);

  // ── HSS Dashboard state ───────────────────────────────────────
  const [hssDashboard, setHssDashboard] = useState<HssDashboardData | null>(null);
  const [hssLoading, setHssLoading] = useState(false);
  const [hssError, setHssError] = useState<string | null>(null);
  const [hssAutoRefresh, setHssAutoRefresh] = useState(false);
  const [hssMineOnly, setHssMineOnly] = useState(false);

  // ── Payout state ─────────────────────────────────────────────
  const [payoutAddress, setPayoutAddress] = useState("");
  const [payoutAgents, setPayoutAgents] = useState<Array<{
    idx: number; address: string; name: string; amount: string;
    interval: number; status: number; active: boolean;
    totalPaid: string; payments: number; nextPayment: number; scheduleAddr: string;
  }>>([]);
  const [payoutVaultBalance, setPayoutVaultBalance] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutTransferring, setPayoutTransferring] = useState(false);
  const [payoutResult, setPayoutResult] = useState<ApiResult | null>(null);
  const [payoutActionLoading, setPayoutActionLoading] = useState("");

  // ── Derived ───────────────────────────────────────────────────
  const evmAddress = agentData?.success ? (agentData.evmAddress as string) || "" : "";
  const hasAccess = subStatus?.hasAccess ?? false;

  // ── Handlers ──────────────────────────────────────────────────
  async function handleLoadAgent() {
    if (!privateKey) return;
    setAgentLoading(true);
    setAgentData(null);
    try {
      const res = await fetch("/api/spark/load-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hederaPrivateKey: privateKey }),
      });
      const result = await res.json();
      setAgentData(result);
      if (result.success && result.evmAddress) {
        await checkSubscription(result.evmAddress);
        await fetchSubscriptions();
      }
    } catch (err) {
      setAgentData({ success: false, error: String(err) });
    }
    setAgentLoading(false);
  }

  async function fetchSubscriptions() {
    try {
      const res = await fetch("/api/subscription/status");
      const data = await res.json();
      if (data.success) {
        // Show only this agent's gated-knowledge subscriptions
        const myName = `gated-knowledge-${evmAddress.toLowerCase()}`;
        const gated = (data.subscriptions as HssSubscription[]).filter(
          (s) => s.name.toLowerCase() === myName
        );
        setSubscriptions(gated);
      }
    } catch (err) {
      console.error("fetchSubscriptions error:", err);
    }
  }

  async function checkSubscription(addr?: string) {
    const evm = addr || evmAddress;
    if (!evm) return;
    setSubLoading(true);
    setSubResult(null);
    try {
      const res = await fetch("/api/spark/check-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberAddress: evm }),
      });
      const result = await res.json();
      if (result.success) {
        setSubStatus({ hasAccess: result.hasAccess, subscription: result.subscription });
      }
      setSubResult(result);
    } catch (err) {
      setSubResult({ success: false, error: String(err) });
    }
    setSubLoading(false);
  }

  async function handleSubscribe() {
    if (!evmAddress) {
      setSubResult({ success: false, error: "Load an agent first" });
      return;
    }
    setSubLoading(true);
    setSubResult(null);
    setReimburseResult(null);
    try {
      // Step 1: Check for existing cancelled/None gated-knowledge subscriptions to reuse
      const statusRes = await fetch("/api/subscription/status");
      const statusData = await statusRes.json();
      let reuseIdx = -1;
      let reuseAction = "start"; // "start" for None
      if (statusData.success) {
        const allSubs = statusData.subscriptions as HssSubscription[];
        for (const sub of allSubs) {
          if (sub.name.toLowerCase() !== `gated-knowledge-${evmAddress.toLowerCase()}`) continue;
          const sn = hssStatusNum(sub.status);
          // Only reuse None (0) subs that are still active — cancelled subs
          // have active=false and contract reverts on retry/start
          if (sn === 0 && sub.active) { reuseIdx = sub.idx; reuseAction = "start"; break; }
        }
      }

      if (reuseIdx >= 0) {
        // Reuse existing subscription
        const restartRes = await fetch(`/api/subscription/${reuseAction}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subIdx: reuseIdx }),
        });
        const restartResult = await restartRes.json();
        if (restartResult.success) {
          setSubResult({ success: true, reused: true, subIdx: reuseIdx, action: reuseAction, txHash: restartResult.txHash });
        } else {
          setSubResult({ success: false, error: restartResult.error });
        }
      } else {
        // Create new subscription
        const res = await fetch("/api/subscription/subscribe-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "0x000000000000000000000000000000000079d730",
            name: `gated-knowledge-${evmAddress.toLowerCase()}`,
            amountPerPeriod: "1",
            intervalSeconds: 10,
          }),
        });
        const result = await res.json();
        setSubResult(result);

        if (result.success) {
          // Find the newly created subscription and start it
          const newStatusRes = await fetch("/api/subscription/status");
          const newStatusData = await newStatusRes.json();
          let latestSubIdx = 0;
          if (newStatusData.success) {
            const allSubs = newStatusData.subscriptions as HssSubscription[];
            if (allSubs.length > 0) {
              latestSubIdx = allSubs[allSubs.length - 1].idx;
            }
          }

          const startRes = await fetch("/api/subscription/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subIdx: latestSubIdx }),
          });
          const startResult = await startRes.json();
          if (startResult.success) {
            setSubResult({ ...result, started: true, startTxHash: startResult.txHash, subIdx: latestSubIdx });
          } else {
            setSubResult({ ...result, startError: startResult.error });
          }
        }
      }

      // Refresh status + subscription table
      await checkSubscription();
      await fetchSubscriptions();
    } catch (err) {
      setSubResult({ success: false, error: String(err) });
    }
    setSubLoading(false);
  }

  async function handleSubAction(action: "start" | "cancel" | "retry", subIdx: number) {
    setSubActionLoading(`${action}-${subIdx}`);
    try {
      const res = await fetch(`/api/subscription/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subIdx }),
      });
      const result = await res.json();
      if (result.success) {
        await checkSubscription();
        await fetchSubscriptions();
      } else {
        setSubResult({ success: false, error: result.error });
      }
    } catch (err) {
      setSubResult({ success: false, error: String(err) });
    }
    setSubActionLoading(null);
  }

  async function handleFetchRegistry() {
    setRegistryLoading(true);
    try {
      const res = await fetch("/api/spark/pending-knowledge");
      const data = await res.json();
      if (data.success) {
        // Only gated items
        const all = [...data.pending, ...data.approved, ...data.rejected];
        setRegistryItems(all.filter((item: PendingItem) => item.accessTier === "gated"));
      }
    } catch (err) {
      console.error("Registry fetch error:", err);
    }
    setRegistryLoading(false);
  }

  async function handleApproveKnowledge(itemId: string, vote: "approve" | "reject") {
    if (!privateKey) {
      setApproveResult({ success: false, error: "Load an agent first" });
      return;
    }
    setApproveResult(null);
    try {
      const res = await fetch("/api/spark/approve-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, vote, hederaPrivateKey: privateKey }),
      });
      const result = await res.json();
      setApproveResult(result);
      if (result.success) handleFetchRegistry();
    } catch (err) {
      setApproveResult({ success: false, error: String(err) });
    }
  }

  async function handleSubmitKnowledge() {
    if (!privateKey) {
      setKnowledgeResult({ success: false, error: "Load an agent first" });
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
          accessTier: "gated",
          hederaPrivateKey: privateKey,
        }),
      });
      setKnowledgeResult(await res.json());
    } catch (err) {
      setKnowledgeResult({ success: false, error: String(err) });
    }
    setKnowledgeLoading(false);
  }

  async function handleFetchHssDashboard() {
    setHssLoading(true);
    setHssError(null);
    try {
      const [payrollRes, subRes] = await Promise.all([
        fetch("/api/schedule/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        fetch("/api/subscription/status"),
      ]);
      const payrollData = await payrollRes.json();
      const subData = await subRes.json();
      if (!payrollData.success) throw new Error(payrollData.error || "Payroll status failed");
      if (!subData.success) throw new Error(subData.error || "Subscription status failed");

      // Also update the "My Subscriptions" table so top + bottom stay in sync
      const myName = `gated-knowledge-${evmAddress.toLowerCase()}`;
      const gatedSubs = (subData.subscriptions as HssSubscription[]).filter(
        (s) => s.name.toLowerCase() === myName
      );
      setSubscriptions(gatedSubs);

      setHssDashboard({
        vault: payrollData.vault,
        payrollAgents: payrollData.agents,
        payrollHistory: payrollData.history,
        subscriptionCount: subData.subscriptionCount,
        subscriptions: subData.subscriptions,
        subHistory: subData.recentHistory,
        subScheduleHistoryCount: subData.scheduleHistoryCount,
      });
    } catch (err) {
      setHssError(err instanceof Error ? err.message : String(err));
    }
    setHssLoading(false);
  }

  const hssIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (hssAutoRefresh) {
      handleFetchHssDashboard();
      hssIntervalRef.current = setInterval(handleFetchHssDashboard, 15000);
    } else if (hssIntervalRef.current) {
      clearInterval(hssIntervalRef.current);
      hssIntervalRef.current = null;
    }
    return () => { if (hssIntervalRef.current) clearInterval(hssIntervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hssAutoRefresh]);

  // Auto-reimburse operator every 10s while subscription is active
  useEffect(() => {
    const isActive = subStatus?.hasAccess && subStatus?.subscription?.active;

    if (isActive && privateKey) {
      // Start timer: reimburse every 10 seconds
      reimburseTimerRef.current = setInterval(async () => {
        try {
          const reimRes = await fetch("/api/spark/reimburse-operator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hederaPrivateKey: privateKey }),
          });
          const reimData = await reimRes.json();
          setReimburseResult(reimData);
        } catch (err) {
          setReimburseResult({ success: false, error: String(err) });
        }
      }, 10000); // 10 seconds
    } else if (reimburseTimerRef.current) {
      clearInterval(reimburseTimerRef.current);
      reimburseTimerRef.current = null;
    }

    return () => {
      if (reimburseTimerRef.current) {
        clearInterval(reimburseTimerRef.current);
        reimburseTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subStatus?.hasAccess, subStatus?.subscription?.active, privateKey]);

  async function handleRefreshPayoutAgents() {
    setPayoutLoading(true);
    try {
      const res = await fetch("/api/spark/payout");
      const data = await res.json();
      if (data.success) {
        setPayoutAgents(data.agents);
        setPayoutVaultBalance(data.vaultBalance);
      }
    } catch { /* ignore */ }
    setPayoutLoading(false);
  }

  async function handleTransferPayout() {
    if (!payoutAddress.trim()) return;
    setPayoutTransferring(true);
    setPayoutResult(null);
    try {
      const res = await fetch("/api/spark/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evmAddress: payoutAddress.trim() }),
      });
      const result = await res.json();
      setPayoutResult(result);
      if (result.success) {
        setPayoutAddress("");
        // Refresh the agents table + HSS dashboard
        await handleRefreshPayoutAgents();
        handleFetchHssDashboard();
      }
    } catch (err) {
      setPayoutResult({ success: false, error: String(err) });
    }
    setPayoutTransferring(false);
  }

  async function handlePayoutAction(action: "cancel" | "start", agentIdx: number) {
    const key = `${action}-${agentIdx}`;
    setPayoutActionLoading(key);
    try {
      const endpoint = action === "cancel" ? "/api/schedule/cancel-payroll" : "/api/schedule/start-payroll";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIdx }),
      });
      const result = await res.json();
      if (result.success) await handleRefreshPayoutAgents();
      else setPayoutResult({ success: false, error: result.error });
    } catch (err) {
      setPayoutResult({ success: false, error: String(err) });
    }
    setPayoutActionLoading("");
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", fontFamily: "monospace" }}>
      <h1>SPARK Gated Knowledge</h1>
      <p style={{ color: "#666", fontSize: 13, marginBottom: 24 }}>
        Gated knowledge requires an active subscription (1 USDC / 10s via HSS). Subscribers can view content, vote, and submit.
        Contributors of approved gated knowledge receive automatic payroll payouts (auto-payout from vault).
      </p>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  LOAD AGENT                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Load Agent</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Register your agent on the <a href="/spark" style={{ color: "#2563eb" }}>SPARK page</a> first, then load it here with your private key.
        </p>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            type="password"
            placeholder="Hedera ED25519 Private Key"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            style={{ flex: 1, padding: 8, fontSize: 12, fontFamily: "monospace", border: "1px solid #e2e8f0" }}
          />
          <button
            onClick={handleLoadAgent}
            disabled={agentLoading || !privateKey}
            style={{
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: "bold",
              cursor: agentLoading ? "wait" : "pointer",
              background: agentLoading ? "#ccc" : "#6366f1",
              color: "#fff",
              border: "none",
            }}
          >
            {agentLoading ? "Loading..." : "Load Agent"}
          </button>
        </div>

        {agentData?.success && (
          <div style={{ marginTop: 12, padding: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, fontSize: 12 }}>
            <div><strong>Account:</strong> {agentData.hederaAccountId as string}</div>
            <div><strong>EVM:</strong> {shortAddr(evmAddress)}</div>
            <div><strong>Bot:</strong> {(agentData as Record<string, unknown>).botId as string || (agentData as Record<string, unknown>).hederaAccountId as string}</div>
            {agentData.iNftTokenId !== undefined && <div><strong>iNFT:</strong> #{agentData.iNftTokenId as number}</div>}
          </div>
        )}
        {agentData && !agentData.success && (
          <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12, color: "#991b1b" }}>
            {agentData.error as string}
          </div>
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  SUBSCRIPTION STATUS + SUBSCRIBE                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Gated Knowledge Subscription</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Subscribe to access gated knowledge. Payments are automated via Hedera Schedule Service (HSS) — 1 USDC every 10 seconds.
          If your subscription lapses, access is revoked.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => checkSubscription()}
            disabled={subLoading || !evmAddress}
            style={{
              padding: "10px 20px", fontSize: 14, fontFamily: "monospace", fontWeight: "bold",
              cursor: subLoading || !evmAddress ? "wait" : "pointer",
              background: subLoading ? "#ccc" : "#6366f1", color: "#fff", border: "none", borderRadius: 4,
            }}
          >
            {subLoading ? "Checking..." : "Check Status"}
          </button>
          <button
            onClick={handleSubscribe}
            disabled={subLoading || !evmAddress}
            style={{
              padding: "10px 20px", fontSize: 14, fontFamily: "monospace", fontWeight: "bold",
              cursor: subLoading || !evmAddress ? "wait" : "pointer",
              background: subLoading ? "#ccc" : "#f59e0b", color: "#fff", border: "none", borderRadius: 4,
            }}
          >
            {subLoading ? "Processing..." : "Subscribe (1 USDC / 10s)"}
          </button>
        </div>

        {!evmAddress && (
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Load an agent above to check or subscribe.</p>
        )}

        {subStatus && (
          <div style={{
            marginTop: 16, padding: 16, borderRadius: 8,
            background: subStatus.hasAccess ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${subStatus.hasAccess ? "#86efac" : "#fca5a5"}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: "bold", color: subStatus.hasAccess ? "#16a34a" : "#dc2626", marginBottom: 8 }}>
              {subStatus.hasAccess ? "ACCESS GRANTED" : "NO ACCESS"}
            </div>
            {subStatus.subscription ? (
              <div style={{ fontSize: 12, color: "#334155" }}>
                <div><strong>Subscription:</strong> {subStatus.subscription.name}</div>
                <div><strong>Status:</strong> {subStatus.subscription.status === 1 ? "Pending" : subStatus.subscription.status === 2 ? "Executed" : "Inactive"}</div>
                <div><strong>Active:</strong> {subStatus.subscription.active ? "Yes" : "No"}</div>
                <div><strong>Payments Made:</strong> {subStatus.subscription.paymentCount}</div>
                <div><strong>Total Paid:</strong> {(Number(subStatus.subscription.totalPaid) / 1e6).toFixed(2)} USDC</div>
                <div><strong>Next Payment:</strong> {new Date(subStatus.subscription.nextPaymentTime * 1000).toLocaleString()}</div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                No active gated-knowledge subscription found. Click &quot;Subscribe&quot; to start.
              </p>
            )}
          </div>
        )}

        {subResult && !subResult.success && (
          <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12, color: "#991b1b" }}>
            {subResult.error as string}
          </div>
        )}

        {/* Reimbursement Status */}
        {reimburseResult && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 6, fontSize: 12,
            background: reimburseResult.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${reimburseResult.success ? "#86efac" : "#fca5a5"}`,
            color: reimburseResult.success ? "#166534" : "#991b1b",
          }}>
            {reimburseResult.success
              ? `✓ Reimbursed operator: ${reimburseResult.amount} (payment #${reimburseResult.paymentCount}) — Tx: ${reimburseResult.txId}`
              : `✗ Reimbursement failed: ${reimburseResult.error}`}
          </div>
        )}

        {/* Subscription Status Table */}
        {subscriptions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, margin: "0 0 8px 0" }}>My Subscriptions</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>#</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Name</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Amount</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Interval</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Payments</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Total Paid</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Next Payment</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((sub) => {
                    const sn = hssStatusNum(sub.status);
                    const sc = HSS_STATUS_COLORS[sn] || HSS_STATUS_COLORS[0];
                    return (
                      <tr key={sub.idx} style={{ opacity: sub.active ? 1 : 0.5 }}>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{sub.idx}</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0", fontWeight: "bold" }}>{sub.name}</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{formatUsdc(sub.amountPerPeriod)}</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{sub.intervalSeconds}s</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>
                            {HSS_STATUS_LABELS[sn] || sub.status}
                          </span>
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>{sub.paymentCount}</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{formatUsdc(sub.totalPaid)}</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0", fontSize: 10 }}>{sub.nextPaymentTime ? hssFormatTime(sub.nextPaymentTime) : "\u2014"}</td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {sub.active && sn !== 1 && (
                            <button
                              onClick={() => handleSubAction("start", sub.idx)}
                              disabled={subActionLoading === `start-${sub.idx}`}
                              style={{ fontSize: 10, cursor: "pointer", padding: "3px 8px", background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 3, fontWeight: "bold", marginRight: 4 }}
                            >
                              {subActionLoading === `start-${sub.idx}` ? "..." : "Start"}
                            </button>
                          )}
                          {sub.active && sn === 1 && (
                            <button
                              onClick={() => handleSubAction("cancel", sub.idx)}
                              disabled={subActionLoading === `cancel-${sub.idx}`}
                              style={{ fontSize: 10, cursor: "pointer", padding: "3px 8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 3, fontWeight: "bold" }}
                            >
                              {subActionLoading === `cancel-${sub.idx}` ? "..." : "Cancel"}
                            </button>
                          )}
                          {!sub.active && sn === 4 && (
                            <button
                              onClick={handleSubscribe}
                              disabled={subLoading}
                              style={{ fontSize: 10, cursor: subLoading ? "wait" : "pointer", padding: "3px 8px", background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 3, fontWeight: "bold" }}
                            >
                              {subLoading ? "..." : "New Sub"}
                            </button>
                          )}
                          {!sub.active && sn !== 4 && <span style={{ color: "#94a3b8", fontSize: 10 }}>{"\u2014"}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  SUBMIT GATED KNOWLEDGE                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {hasAccess && (
        <section style={{ margin: "24px 0" }}>
          <h2>Submit Gated Knowledge</h2>
          <p style={{ color: "#666", fontSize: 13 }}>
            Submit knowledge that will only be accessible to subscribed agents. Contributors receive automatic payroll payouts when approved.
          </p>

          <div style={{ marginTop: 8 }}>
            <label style={{ display: "block", marginBottom: 8 }}>
              <strong style={{ fontSize: 12 }}>Category</strong>
              <select
                value={kCategory}
                onChange={(e) => setKCategory(e.target.value)}
                style={{ display: "block", width: "100%", padding: 8, fontSize: 12, fontFamily: "monospace", marginTop: 4, border: "1px solid #e2e8f0" }}
              >
                {KNOWLEDGE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "block", marginBottom: 8 }}>
              <strong style={{ fontSize: 12 }}>Content</strong>
              <textarea
                value={kContent}
                onChange={(e) => setKContent(e.target.value)}
                rows={4}
                style={{ display: "block", width: "100%", padding: 8, fontSize: 12, fontFamily: "monospace", marginTop: 4, border: "1px solid #e2e8f0", resize: "vertical" }}
                placeholder="Enter gated knowledge content..."
              />
            </label>

            <button
              onClick={handleSubmitKnowledge}
              disabled={knowledgeLoading || !kContent.trim()}
              style={{
                padding: "10px 24px", fontSize: 14, fontWeight: "bold",
                cursor: knowledgeLoading ? "wait" : "pointer",
                background: knowledgeLoading ? "#ccc" : "#f59e0b", color: "#fff", border: "none",
              }}
            >
              {knowledgeLoading ? "Submitting..." : "Submit Gated Knowledge"}
            </button>

            {knowledgeResult && (
              <pre style={{
                marginTop: 12, padding: 12, borderRadius: 6, fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto",
                background: knowledgeResult.success ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${knowledgeResult.success ? "#86efac" : "#fca5a5"}`,
              }}>
                {JSON.stringify(knowledgeResult, null, 2)}
              </pre>
            )}
          </div>
        </section>
      )}

      {hasAccess && <hr style={{ margin: "24px 0" }} />}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  GATED KNOWLEDGE REGISTRY                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Gated Knowledge Registry</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          All gated knowledge submissions. {!hasAccess && "Subscribe to view content and vote."}
        </p>

        <button
          onClick={handleFetchRegistry}
          disabled={registryLoading}
          style={{
            marginTop: 8, padding: "10px 24px", fontSize: 14, fontFamily: "monospace", fontWeight: "bold",
            cursor: registryLoading ? "wait" : "pointer",
            background: registryLoading ? "#ccc" : "#6366f1", color: "#fff", border: "none",
          }}
        >
          {registryLoading ? "Loading..." : registryItems.length > 0 ? "Refresh Registry" : "Load Gated Registry"}
        </button>

        {approveResult && (
          <pre style={{
            marginTop: 12, padding: 12, borderRadius: 6, fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto",
            background: approveResult.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${approveResult.success ? "#86efac" : "#fca5a5"}`,
          }}>
            {JSON.stringify(approveResult, null, 2)}
          </pre>
        )}

        {registryItems.length > 0 && (() => {
          const pending = registryItems.filter((i) => i.status === "pending");
          const approved = registryItems.filter((i) => i.status === "approved");
          const rejected = registryItems.filter((i) => i.status === "rejected");

          return (
            <div style={{ marginTop: 16 }}>
              {/* Stat boxes */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ textAlign: "center", padding: "8px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: "bold" }}>{registryItems.length}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Total</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 16px", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: "#ca8a04" }}>{pending.length}</div>
                  <div style={{ fontSize: 10, color: "#a16207" }}>Pending</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 16px", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: "#16a34a" }}>{approved.length}</div>
                  <div style={{ fontSize: 10, color: "#166534" }}>Approved</div>
                </div>
                <div style={{ textAlign: "center", padding: "8px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6 }}>
                  <div style={{ fontSize: 20, fontWeight: "bold", color: "#dc2626" }}>{rejected.length}</div>
                  <div style={{ fontSize: 10, color: "#991b1b" }}>Rejected</div>
                </div>
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                {(["accepted", "all", "pending", "approved", "rejected"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRegistryFilter(f)}
                    style={{
                      padding: "4px 12px", fontSize: 11, cursor: "pointer", fontWeight: registryFilter === f ? "bold" : "normal",
                      background: registryFilter === f ? "#e2e8f0" : "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4,
                    }}
                  >
                    {f === "accepted" ? "Accepted" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {/* Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 12 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                    {registryFilter !== "accepted" && <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>}
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Category</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Content</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Author</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>Votes</th>
                    {registryFilter !== "accepted" && hasAccess && <th style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>Actions</th>}
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
                        item.status === "approved" ? { bg: "#dcfce7", color: "#16a34a", label: "APPROVED" }
                        : item.status === "rejected" ? { bg: "#fef2f2", color: "#dc2626", label: "REJECTED" }
                        : { bg: "#fef9c3", color: "#ca8a04", label: "PENDING" };
                      const catColor = CATEGORY_COLORS[item.category] || "#475569";
                      return (
                        <tr key={item.itemId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {registryFilter !== "accepted" && (
                            <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                              <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>
                                {statusStyle.label}
                              </span>
                            </td>
                          )}
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <span style={{ background: catColor, color: "#fff", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: "bold", textTransform: "uppercase" }}>
                              {item.category}
                            </span>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0", maxWidth: 350, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155" }}
                            title={hasAccess ? item.content : "Subscribe to view"}
                          >
                            {hasAccess
                              ? (item.content ? (item.content.length > 80 ? item.content.slice(0, 80) + "..." : item.content) : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(no content)</span>)
                              : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Subscribe to view</span>
                            }
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0", color: "#64748b" }}>{item.author}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                            <span style={{ color: "#16a34a" }}>{item.approvals}</span>{" / "}<span style={{ color: "#dc2626" }}>{item.rejections}</span>
                          </td>
                          {registryFilter !== "accepted" && hasAccess && (
                            <td style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                              {item.status === "pending" ? (
                                <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                  <button onClick={() => handleApproveKnowledge(item.itemId, "approve")}
                                    style={{ fontSize: 10, cursor: "pointer", padding: "3px 8px", background: "#dcfce7", color: "#16a34a", border: "1px solid #86efac", borderRadius: 3, fontWeight: "bold" }}>
                                    Approve
                                  </button>
                                  <button onClick={() => handleApproveKnowledge(item.itemId, "reject")}
                                    style={{ fontSize: 10, cursor: "pointer", padding: "3px 8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 3, fontWeight: "bold" }}>
                                    Reject
                                  </button>
                                </div>
                              ) : <span style={{ color: "#94a3b8", fontSize: 10 }}>{"\u2014"}</span>}
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
      {/*  HSS OBSERVABILITY DASHBOARD                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>HSS Observability Dashboard</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Unified view of all Hedera Schedule Service (HSS) activity — subscriptions (inbound) and payroll payouts (outbound).
        </p>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={handleFetchHssDashboard}
            disabled={hssLoading}
            style={{
              padding: "10px 24px", fontSize: 14, fontFamily: "monospace", fontWeight: "bold",
              cursor: hssLoading ? "wait" : "pointer", background: hssLoading ? "#ccc" : "#0ea5e9", color: "#fff", border: "none",
            }}
          >
            {hssLoading ? "Loading..." : hssDashboard ? "Refresh Dashboard" : "Load HSS Dashboard"}
          </button>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={hssAutoRefresh} onChange={(e) => setHssAutoRefresh(e.target.checked)} />
            Auto-refresh (15s)
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={hssMineOnly} onChange={(e) => setHssMineOnly(e.target.checked)} />
            Mine only
          </label>
        </div>

        {hssError && (
          <div style={{ marginTop: 12, padding: 12, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#991b1b", fontSize: 12 }}>
            {hssError}
          </div>
        )}

        {hssDashboard && (() => {
          const vlt = hssDashboard.vault;
          const isTokenMode = vlt.paymentToken !== "0x0000000000000000000000000000000000000000";
          const myAddr = evmAddress.toLowerCase();

          // "Mine only" filters: subscriptions by gated-knowledge name (operator creates them),
          // payroll agents by loaded agent's EVM address
          const filteredSubs = hssMineOnly
            ? hssDashboard.subscriptions.filter((s) => s.name.toLowerCase() === `gated-knowledge-${myAddr}`)
            : hssDashboard.subscriptions;
          const filteredAgents = hssMineOnly && myAddr
            ? hssDashboard.payrollAgents.filter((a) => a.agent.toLowerCase() === myAddr)
            : hssDashboard.payrollAgents;

          const totalRevenue = filteredSubs.reduce((s, sub) => s + Number(sub.totalPaid), 0);
          const totalPayouts = filteredAgents.reduce((s, a) => s + Number(a.totalPaid), 0);

          const scheduleRows = [
            ...filteredSubs.map((sub) => ({
              type: "SUBSCRIPTION" as const, idx: sub.idx, name: sub.name || `Sub #${sub.idx}`, address: sub.subscriber,
              amount: sub.amountPerPeriod, interval: sub.intervalSeconds, status: hssStatusNum(sub.status),
              nextPayment: sub.nextPaymentTime, payments: sub.paymentCount, totalPaid: sub.totalPaid,
              active: sub.active, scheduleAddr: "",
            })),
            ...filteredAgents.map((a, i) => ({
              type: "PAYROLL" as const, idx: i, name: a.agentName || `Agent #${i}`, address: a.agent,
              amount: a.amountPerPeriod, interval: a.intervalSeconds, status: a.status,
              nextPayment: a.nextPaymentTime, payments: a.paymentCount, totalPaid: a.totalPaid,
              active: a.active, scheduleAddr: a.currentScheduleAddr,
            })),
          ];

          const mySubIndices = new Set(filteredSubs.map((s) => s.idx));
          const myAgentIndices = new Set(filteredAgents.map((_, i) => i));

          const mergedHistory = [
            ...hssDashboard.payrollHistory
              .filter((h) => !hssMineOnly || !myAddr || myAgentIndices.has(h.agentIdx ?? -1))
              .map((h) => ({ ...h, source: "PAYROLL" as const, statusNum: hssStatusNum(h.status) })),
            ...hssDashboard.subHistory
              .filter((h) => !hssMineOnly || !myAddr || mySubIndices.has(h.subIdx ?? -1))
              .map((h) => ({ ...h, source: "SUBSCRIPTION" as const, statusNum: hssStatusNum(h.status) })),
          ].sort((a, b) => (b.executedAt || b.scheduledTime) - (a.executedAt || a.scheduledTime));

          return (
            <div style={{ marginTop: 16 }}>
              {/* Vault Info */}
              <div style={{ padding: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
                <div><strong>Vault:</strong>{" "}
                  <a href={`https://hashscan.io/testnet/contract/${vlt.address}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                    {shortAddr(vlt.address)}
                  </a>
                </div>
                <div>
                  <strong>USDC Balance:</strong> {isTokenMode ? formatUsdc(vlt.tokenBalance) : "N/A"}
                  {" | "}<strong>Agents:</strong> {hssMineOnly ? `${filteredAgents.length} / ${vlt.agentCount}` : vlt.agentCount}
                  {" | "}<strong>Subscriptions:</strong> {hssMineOnly ? `${filteredSubs.length} / ${hssDashboard.subscriptionCount}` : hssDashboard.subscriptionCount}
                  {" | "}<strong>Revenue:</strong> {(totalRevenue / 1e6).toFixed(2)} USDC
                  {" | "}<strong>Payouts:</strong> {(totalPayouts / 1e6).toFixed(2)} USDC
                </div>
              </div>

              {/* Active Schedules */}
              <h3 style={{ margin: "0 0 8px 0" }}>Active Schedules</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 12 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>#</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Type</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Name</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Address</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Amount</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Interval</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Payments</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Total Paid</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.length === 0 && (
                      <tr><td colSpan={10} style={{ padding: 16, textAlign: "center", color: "#94a3b8", border: "1px solid #e2e8f0" }}>No schedules found</td></tr>
                    )}
                    {scheduleRows.map((row) => {
                      const sc = HSS_STATUS_COLORS[row.status] || HSS_STATUS_COLORS[0];
                      const typeBg = row.type === "SUBSCRIPTION" ? { bg: "#fffbeb", color: "#92400e" } : { bg: "#e0e7ff", color: "#3730a3" };
                      return (
                        <tr key={`${row.type}-${row.idx}`} style={{ opacity: row.active ? 1 : 0.5 }}>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{row.idx}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <span style={{ background: typeBg.bg, color: typeBg.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>{row.type}</span>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0", fontWeight: "bold" }}>
                            {row.name}<div style={{ fontSize: 9, color: "#888" }}>{shortAddr(row.address)}</div>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <a href={`https://hashscan.io/testnet/account/${row.address}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 10 }} title={row.address}>{shortAddr(row.address)}</a>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{formatUsdc(row.amount)}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{row.interval}s</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>{HSS_STATUS_LABELS[row.status] || "Unknown"}</span>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>{row.payments}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{formatUsdc(row.totalPaid)}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0", fontSize: 10 }}>
                            {row.nextPayment ? hssFormatTime(row.nextPayment) : "\u2014"}
                            {row.scheduleAddr && row.scheduleAddr !== "0x0000000000000000000000000000000000000000" && (
                              <div><a href={`https://hashscan.io/testnet/contract/${row.scheduleAddr}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 9 }}>{shortAddr(row.scheduleAddr)}</a></div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Execution History */}
              <h3 style={{ margin: "16px 0 8px 0" }}>Execution History</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 12 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Source</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Schedule</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Scheduled For</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Created</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Executed</th>
                      <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedHistory.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#94a3b8", border: "1px solid #e2e8f0" }}>No execution history yet</td></tr>
                    )}
                    {mergedHistory.map((entry, idx) => {
                      const sc = HSS_STATUS_COLORS[entry.statusNum] || HSS_STATUS_COLORS[0];
                      const typeBg = entry.source === "SUBSCRIPTION" ? { bg: "#fffbeb", color: "#92400e" } : { bg: "#e0e7ff", color: "#3730a3" };
                      return (
                        <tr key={`hist-${idx}`}>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <span style={{ background: typeBg.bg, color: typeBg.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>{entry.source}</span>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <a href={`https://hashscan.io/testnet/contract/${entry.scheduleAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 10 }} title={entry.scheduleAddress}>{shortAddr(entry.scheduleAddress)}</a>
                          </td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{hssFormatTime(entry.scheduledTime)}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{hssFormatTime(entry.createdAt)}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{hssFormatTime(entry.executedAt)}</td>
                          <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                            <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>{HSS_STATUS_LABELS[entry.statusNum] || "Unknown"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </section>

      <hr style={{ margin: "24px 0" }} />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  CONTRIBUTOR PAYOUT                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section style={{ margin: "24px 0" }}>
        <h2>Contributor Payout</h2>
        <p style={{ color: "#666", fontSize: 13 }}>
          Add a contributor EVM address to start recurring payroll — <strong>1 USDC every 10 seconds</strong> via HSS.
          If the address already exists, it will restart payroll instead of creating a duplicate.
        </p>

        {/* Input + Transfer */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input
            value={payoutAddress}
            onChange={(e) => setPayoutAddress(e.target.value)}
            placeholder="0x... contributor EVM address"
            style={{
              flex: 1, minWidth: 280, padding: "10px 12px", fontSize: 13, fontFamily: "monospace",
              border: "1px solid #d1d5db", borderRadius: 4,
            }}
          />
          <button
            onClick={handleTransferPayout}
            disabled={payoutTransferring || !payoutAddress.trim()}
            style={{
              padding: "10px 20px", fontSize: 14, fontFamily: "monospace", fontWeight: "bold",
              cursor: payoutTransferring || !payoutAddress.trim() ? "not-allowed" : "pointer",
              background: payoutTransferring ? "#ccc" : "#16a34a", color: "#fff", border: "none", borderRadius: 4,
            }}
          >
            {payoutTransferring ? "Transferring..." : "Transfer (1 USDC / 10s)"}
          </button>
          <button
            onClick={handleRefreshPayoutAgents}
            disabled={payoutLoading}
            style={{
              padding: "10px 16px", fontSize: 14, fontFamily: "monospace", fontWeight: "bold",
              cursor: payoutLoading ? "wait" : "pointer",
              background: payoutLoading ? "#ccc" : "#6366f1", color: "#fff", border: "none", borderRadius: 4,
            }}
          >
            {payoutLoading ? "..." : "Refresh"}
          </button>
        </div>

        {/* Transfer result */}
        {payoutResult && (
          <div style={{
            marginTop: 8, padding: 10, borderRadius: 6, fontSize: 12,
            background: payoutResult.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${payoutResult.success ? "#86efac" : "#fca5a5"}`,
            color: payoutResult.success ? "#166534" : "#991b1b",
          }}>
            {payoutResult.success
              ? `${payoutResult.message} (${payoutResult.action})`
              : (payoutResult.error as string)}
          </div>
        )}

        {/* Vault balance */}
        {payoutVaultBalance && (
          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <div style={{ textAlign: "center", padding: "8px 16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6 }}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: "#16a34a" }}>{payoutVaultBalance}</div>
              <div style={{ fontSize: 10, color: "#166534" }}>Vault Balance</div>
            </div>
            <div style={{ textAlign: "center", padding: "8px 16px", background: "#e0e7ff", border: "1px solid #a5b4fc", borderRadius: 6 }}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: "#3730a3" }}>{payoutAgents.length}</div>
              <div style={{ fontSize: 10, color: "#4338ca" }}>Contributors</div>
            </div>
          </div>
        )}

        {/* Contributors table */}
        {payoutAgents.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>#</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Address</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Name</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Amount</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Interval</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Payments</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Total Paid</th>
                  <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payoutAgents.map((a) => {
                  const sc = HSS_STATUS_COLORS[a.status] || HSS_STATUS_COLORS[0];
                  const sn = a.status;
                  return (
                    <tr key={a.idx} style={{ opacity: a.active ? 1 : 0.5 }}>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{a.idx}</td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                        <a href={`https://hashscan.io/testnet/account/${a.address}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 10 }} title={a.address}>
                          {shortAddr(a.address)}
                        </a>
                      </td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0", fontWeight: "bold" }}>{a.name}</td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{formatUsdc(a.amount)}</td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{a.interval}s</td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                        <span style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: "bold" }}>
                          {HSS_STATUS_LABELS[a.status] || "Unknown"}
                        </span>
                      </td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>{a.payments}</td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>{formatUsdc(a.totalPaid)}</td>
                      <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                        {a.active && sn === 1 && (
                          <button
                            onClick={() => handlePayoutAction("cancel", a.idx)}
                            disabled={payoutActionLoading === `cancel-${a.idx}`}
                            style={{ fontSize: 10, cursor: "pointer", padding: "3px 8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 3, fontWeight: "bold" }}
                          >
                            {payoutActionLoading === `cancel-${a.idx}` ? "..." : "Stop"}
                          </button>
                        )}
                        {!a.active && (sn === 4 || sn === 0 || sn === 3) && (
                          <button
                            onClick={() => handlePayoutAction("start", a.idx)}
                            disabled={payoutActionLoading === `start-${a.idx}`}
                            style={{ fontSize: 10, cursor: "pointer", padding: "3px 8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 3, fontWeight: "bold" }}
                          >
                            {payoutActionLoading === `start-${a.idx}` ? "..." : "Start"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

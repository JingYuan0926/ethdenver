import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  SUBSCRIPTION_VAULT_ADDRESS,
  SUBSCRIPTION_VAULT_ABI,
  SubscriptionScheduleStatus,
  PaymentMode,
  HEDERA_RPC_URL,
} from "@/lib/subscription-vault-abi";
import { HASHSCAN_BASE } from "@/lib/payroll-vault-abi";

interface ApiResult {
  success: boolean;
  [key: string]: unknown;
}

interface SubData {
  subscriber: string;
  amountPerPeriod: string;
  intervalSeconds: number;
  nextPaymentTime: number;
  currentScheduleAddr: string;
  status: number;
  totalPaid: string;
  paymentCount: number;
  active: boolean;
  name: string;
  mode: number;
  token: string;
  hbarEscrow: string;
}

interface HistoryRecord {
  subIdx: number;
  scheduleAddress: string;
  scheduledTime: number;
  createdAt: number;
  executedAt: number;
  status: number;
}

interface VaultInfo {
  address: string;
  hbarBalance: string;
  collectedHbar: string;
  owner: string;
  subscriptionCount: number;
  historyCount: number;
  gasLimit: number;
}

const STATUS_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" },
  1: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" },
  2: { bg: "#f0fdf4", border: "#86efac", text: "#166534" },
  3: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
  4: { bg: "#f8fafc", border: "#cbd5e1", text: "#64748b" },
};

const MODE_COLORS: Record<number, { bg: string; text: string }> = {
  0: { bg: "#f0fdf4", text: "#166534" },
  1: { bg: "#dbeafe", text: "#1e40af" },
};

function formatTime(epoch: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString();
}

function shortAddr(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

export default function SubscriptionPage() {
  const [vaultAddress, setVaultAddress] = useState(SUBSCRIPTION_VAULT_ADDRESS);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [subs, setSubs] = useState<SubData[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  // Subscribe HBAR form
  const [hbarName, setHbarName] = useState("");
  const [hbarAmount, setHbarAmount] = useState("1");
  const [hbarInterval, setHbarInterval] = useState("60");
  const [hbarDeposit, setHbarDeposit] = useState("10");

  // Subscribe Token form — default to Mock USDC on Hedera Testnet
  const USDC_ADDRESS = "0x000000000000000000000000000000000079d730";
  const USDC_DECIMALS = 6;
  const [tokenAddr, setTokenAddr] = useState(USDC_ADDRESS);
  const [tokenName, setTokenName] = useState("");
  const [tokenAmount, setTokenAmount] = useState("1");
  const [tokenInterval, setTokenInterval] = useState("60");

  // Top up form
  const [topUpIdx, setTopUpIdx] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("5");

  // Gas limit form — deployed v3 contract enforces min 1M, new deploys allow 400K
  const [newGasLimit, setNewGasLimit] = useState("1000000");

  // ── Fetch Status ──────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!vaultAddress) return;
    try {
      const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
      const vault = new ethers.Contract(vaultAddress, SUBSCRIPTION_VAULT_ABI, provider);

      const [allSubs, historyCount, vaultBalance, collected, ownerAddr, gasLimitVal] =
        await Promise.all([
          vault.getAllSubscriptions(),
          vault.getSubScheduleHistoryCount(),
          vault.getVaultBalance(),
          vault.getCollectedHbar(),
          vault.owner(),
          vault.scheduledCallGasLimit(),
        ]);

      const histCount = Number(historyCount);
      const recentCount = Math.min(histCount, 20);
      const recentHistory =
        recentCount > 0 ? await vault.getSubRecentHistory(recentCount) : [];

      const subsList: SubData[] = await Promise.all(
        allSubs.map(async (s: any, i: number) => {
          const hbarBal =
            Number(s.mode) === 0
              ? await vault.getSubHbarBalance(i)
              : BigInt(0);
          return {
            subscriber: s.subscriber,
            amountPerPeriod: s.amountPerPeriod.toString(),
            intervalSeconds: Number(s.intervalSeconds),
            nextPaymentTime: Number(s.nextPaymentTime),
            currentScheduleAddr: s.currentScheduleAddr,
            status: Number(s.status),
            totalPaid: s.totalPaid.toString(),
            paymentCount: Number(s.paymentCount),
            active: s.active,
            name: s.name,
            mode: Number(s.mode),
            token: s.token,
            hbarEscrow: ethers.formatUnits(hbarBal, 8),
          };
        })
      );

      const histList: HistoryRecord[] = recentHistory.map((r: any) => ({
        subIdx: Number(r.subIdx),
        scheduleAddress: r.scheduleAddress,
        scheduledTime: Number(r.scheduledTime),
        createdAt: Number(r.createdAt),
        executedAt: Number(r.executedAt),
        status: Number(r.status),
      }));

      setVault({
        address: vaultAddress,
        hbarBalance: ethers.formatUnits(vaultBalance, 8),
        collectedHbar: ethers.formatUnits(collected, 8),
        owner: ownerAddr,
        subscriptionCount: subsList.length,
        historyCount: histCount,
        gasLimit: Number(gasLimitVal),
      });
      setSubs(subsList);
      setHistory(histList);
    } catch {
      // silent refresh failure
    }
  }, [vaultAddress]);

  useEffect(() => {
    if (!vaultAddress) return;
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [vaultAddress, fetchStatus]);

  // ── API Helpers ───────────────────────────────────────────
  async function apiCall(endpoint: string, body: Record<string, unknown>, loadKey: string) {
    setLoading(loadKey);
    setResult(null);
    try {
      const res = await fetch(`/api/subscription/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, ...body }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  function formatAmount(val: string, mode: number): string {
    if (mode === 1) {
      // USDC has 6 decimals
      const usdc = Number(BigInt(val)) / 1e6;
      return usdc.toFixed(2) + " USDC";
    }
    const hbar = Number(BigInt(val)) / 1e8;
    return hbar.toFixed(4) + " HBAR";
  }

  return (
    <div
      style={{
        maxWidth: 860,
        margin: "40px auto",
        fontFamily: "monospace",
        padding: "0 20px",
      }}
    >
      <h1>SPARK Subscription Vault</h1>
      <p style={{ color: "#888" }}>
        Pull-based recurring payments using Hedera Schedule Service (HSS) —
        subscribers approve, vault pulls on schedule. No off-chain servers.
      </p>
      <p style={{ color: "#666", fontSize: 12 }}>
        Network: Hedera Testnet | HSS @ 0x16b | Supports HBAR (escrow) + ERC-20/USDC (transferFrom)
      </p>

      <hr style={{ margin: "24px 0" }} />

      {/* 0. Connect to Vault */}
      <section style={{ margin: "24px 0" }}>
        <h2>0. Connect to Subscription Vault</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Enter the deployed SPARKSubscriptionVault contract address on Hedera Testnet.
        </p>
        <div>
          <input
            value={vaultAddress}
            onChange={(e) => setVaultAddress(e.target.value)}
            placeholder="0x... (deployed subscription vault address)"
            style={{ width: 420, fontFamily: "monospace", fontSize: 12 }}
          />
          <button
            onClick={fetchStatus}
            disabled={!vaultAddress || loading === "status"}
            style={{ marginLeft: 8 }}
          >
            {loading === "status" ? "Loading..." : "Load Vault"}
          </button>
        </div>

        {vault && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div>
              <strong>Vault:</strong>{" "}
              <a
                href={`${HASHSCAN_BASE}/contract/${vault.address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortAddr(vault.address)}
              </a>
            </div>
            <div>
              <strong>HBAR Balance:</strong> {vault.hbarBalance} HBAR
            </div>
            <div>
              <strong>Collected Revenue:</strong> {vault.collectedHbar} HBAR
            </div>
            <div>
              <strong>Owner:</strong> {shortAddr(vault.owner)}
            </div>
            <div>
              <strong>Subscriptions:</strong> {vault.subscriptionCount} |{" "}
              <strong>Schedules:</strong> {vault.historyCount}
            </div>
            <div>
              <strong>HSS Gas Limit:</strong>{" "}
              {vault.gasLimit.toLocaleString()} gas (~{(vault.gasLimit * 870 / 1e9).toFixed(2)} HBAR/call)
              {vault.gasLimit > 5_000_000 && (
                <span style={{ color: "#991b1b", fontWeight: "bold", marginLeft: 6 }}>
                  WARNING: Too high! Each scheduled call costs ~{(vault.gasLimit * 870 / 1e9).toFixed(1)} HBAR in gas fees.
                  Lower to 2M below.
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {vault && (
        <>
          <hr style={{ margin: "24px 0" }} />

          {/* 1. Subscribe HBAR */}
          <section style={{ margin: "24px 0" }}>
            <h2>1. Subscribe with HBAR</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Deposit HBAR upfront into escrow. The vault deducts from your escrow each period.
              Remaining HBAR is refunded on cancel.
            </p>
            <div
              style={{
                padding: 12,
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 6,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <label>
                  Name:{" "}
                  <input
                    value={hbarName}
                    onChange={(e) => setHbarName(e.target.value)}
                    placeholder="My HBAR Subscription"
                    style={{ width: 240, fontFamily: "monospace" }}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 6 }}>
                <label>
                  Amount/period (HBAR):{" "}
                  <input
                    value={hbarAmount}
                    onChange={(e) => setHbarAmount(e.target.value)}
                    placeholder="1"
                    style={{ width: 100, fontFamily: "monospace" }}
                  />
                </label>
                <label style={{ marginLeft: 12 }}>
                  Interval (sec):{" "}
                  <input
                    value={hbarInterval}
                    onChange={(e) => setHbarInterval(e.target.value)}
                    placeholder="60"
                    style={{ width: 80, fontFamily: "monospace" }}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 6 }}>
                <label>
                  Initial deposit (HBAR):{" "}
                  <input
                    value={hbarDeposit}
                    onChange={(e) => setHbarDeposit(e.target.value)}
                    placeholder="10"
                    style={{ width: 100, fontFamily: "monospace" }}
                  />
                </label>
                <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
                  Must be &ge; amount/period
                </span>
              </div>
              <button
                onClick={() =>
                  apiCall(
                    "subscribe-hbar",
                    {
                      name: hbarName,
                      amountPerPeriod: hbarAmount,
                      intervalSeconds: hbarInterval,
                      deposit: hbarDeposit,
                    },
                    "sub-hbar"
                  )
                }
                disabled={loading === "sub-hbar" || !hbarName || !hbarAmount || !hbarInterval}
              >
                {loading === "sub-hbar" ? "Creating..." : "Subscribe (HBAR)"}
              </button>
            </div>
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 2. Subscribe Token (USDC) */}
          <section style={{ margin: "24px 0" }}>
            <h2>2. Subscribe with USDC</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              The vault pulls USDC from the operator wallet each period via transferFrom.
              Step 1: Approve the vault. Step 2: Create subscription. Step 3: Start it.
            </p>
            <div
              style={{
                padding: 12,
                background: "#eff6ff",
                border: "1px solid #93c5fd",
                borderRadius: 6,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <label>
                  Token Address:{" "}
                  <input
                    value={tokenAddr}
                    onChange={(e) => setTokenAddr(e.target.value)}
                    placeholder="0x... (USDC EVM address)"
                    style={{ width: 380, fontFamily: "monospace", fontSize: 11 }}
                  />
                </label>
                <span style={{ fontSize: 10, color: "#888", marginLeft: 6 }}>
                  Default: Mock USDC (0.0.7984944)
                </span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <label>
                  Name:{" "}
                  <input
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="My USDC Subscription"
                    style={{ width: 240, fontFamily: "monospace" }}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 6 }}>
                <label>
                  Amount/period (USDC):{" "}
                  <input
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    placeholder="1"
                    style={{ width: 120, fontFamily: "monospace" }}
                  />
                </label>
                <label style={{ marginLeft: 12 }}>
                  Interval (sec):{" "}
                  <input
                    value={tokenInterval}
                    onChange={(e) => setTokenInterval(e.target.value)}
                    placeholder="60"
                    style={{ width: 80, fontFamily: "monospace" }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() =>
                    apiCall(
                      "associate-token",
                      { token: tokenAddr },
                      "associate"
                    )
                  }
                  disabled={loading === "associate" || !tokenAddr}
                  style={{ background: "#e0e7ff", border: "1px solid #a5b4fc" }}
                >
                  {loading === "associate" ? "Associating..." : "0. Associate Token"}
                </button>
                <button
                  onClick={() =>
                    apiCall(
                      "approve-token",
                      {
                        token: tokenAddr,
                        amount: tokenAmount,
                      },
                      "approve"
                    )
                  }
                  disabled={loading === "approve" || !tokenAddr || !tokenAmount}
                  style={{ background: "#dbeafe", border: "1px solid #93c5fd" }}
                >
                  {loading === "approve" ? "Approving..." : "1. Approve USDC"}
                </button>
                <button
                  onClick={() =>
                    apiCall(
                      "subscribe-token",
                      {
                        token: tokenAddr,
                        name: tokenName,
                        amountPerPeriod: tokenAmount,
                        intervalSeconds: tokenInterval,
                      },
                      "sub-token"
                    )
                  }
                  disabled={
                    loading === "sub-token" || !tokenAddr || !tokenName || !tokenAmount || !tokenInterval
                  }
                >
                  {loading === "sub-token" ? "Creating..." : "2. Subscribe (USDC)"}
                </button>
              </div>
            </div>
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 3. Top Up */}
          <section style={{ margin: "24px 0" }}>
            <h2>3. Top Up HBAR Escrow</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Add more HBAR to an existing HBAR subscription&apos;s escrow balance.
            </p>
            <div>
              <label>
                Sub #:{" "}
                <input
                  value={topUpIdx}
                  onChange={(e) => setTopUpIdx(e.target.value)}
                  placeholder="0"
                  style={{ width: 60, fontFamily: "monospace" }}
                />
              </label>
              <label style={{ marginLeft: 12 }}>
                Amount (HBAR):{" "}
                <input
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="5"
                  style={{ width: 100, fontFamily: "monospace" }}
                />
              </label>
              <button
                onClick={() =>
                  apiCall("top-up", { subIdx: Number(topUpIdx), amount: topUpAmount }, "top-up")
                }
                disabled={loading === "top-up" || !topUpIdx || !topUpAmount}
                style={{ marginLeft: 8 }}
              >
                {loading === "top-up" ? "Topping up..." : "Top Up"}
              </button>
            </div>
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 3b. Set Gas Limit */}
          <section style={{ margin: "24px 0" }}>
            <h2>3b. HSS Gas Limit</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Each HSS scheduled call charges the full gasLimit × gasPrice from the contract (no refund for scheduled txs).
              At 870 gWei: 10M = 8.7 HBAR/call, 2M = 1.74, 1M = 0.87. Actual usage ~350K gas. Lower = cheaper per call.
            </p>
            <div>
              <label>
                New Gas Limit:{" "}
                <input
                  value={newGasLimit}
                  onChange={(e) => setNewGasLimit(e.target.value)}
                  placeholder="2000000"
                  style={{ width: 140, fontFamily: "monospace" }}
                />
              </label>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>
                min 400,000 | ~{(Number(newGasLimit || 0) * 870 / 1e9).toFixed(2)} HBAR/call
              </span>
              <button
                onClick={() =>
                  apiCall("set-gas-limit", { gasLimit: Number(newGasLimit) }, "set-gas")
                }
                disabled={loading === "set-gas" || !newGasLimit || Number(newGasLimit) < 400_000}
                style={{ marginLeft: 8 }}
              >
                {loading === "set-gas" ? "Setting..." : "Set Gas Limit"}
              </button>
            </div>
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 4. Subscriptions Table */}
          <section style={{ margin: "24px 0" }}>
            <h2>4. Active Subscriptions</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              All subscriptions with their schedule status, payment history, and actions.
            </p>

            {subs.length > 0 ? (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                  marginBottom: 12,
                }}
              >
                <thead>
                  <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>#</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Name</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Mode</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Amount</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Interval</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Payments</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Balance</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Next</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s, i) => {
                    const sc = STATUS_COLORS[s.status] || STATUS_COLORS[0];
                    const mc = MODE_COLORS[s.mode] || MODE_COLORS[0];
                    const statusLabel =
                      SubscriptionScheduleStatus[
                        s.status as keyof typeof SubscriptionScheduleStatus
                      ] || "Unknown";
                    const modeLabel =
                      PaymentMode[s.mode as keyof typeof PaymentMode] || "Unknown";
                    return (
                      <tr key={i} style={{ opacity: s.active ? 1 : 0.5 }}>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {i}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0", fontWeight: "bold" }}>
                          {s.name}
                          <div style={{ fontSize: 9, color: "#888" }}>
                            {shortAddr(s.subscriber)}
                          </div>
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          <span
                            style={{
                              background: mc.bg,
                              color: mc.text,
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: "bold",
                            }}
                          >
                            {modeLabel}
                          </span>
                          {s.mode === 1 && (
                            <div style={{ fontSize: 9, color: "#888" }}>
                              {shortAddr(s.token)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {formatAmount(s.amountPerPeriod, s.mode)}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {s.intervalSeconds}s
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          <span
                            style={{
                              background: sc.bg,
                              border: `1px solid ${sc.border}`,
                              color: sc.text,
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: "bold",
                            }}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {s.paymentCount} ({formatAmount(s.totalPaid, s.mode)})
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {s.mode === 0 ? (
                            <span style={{ color: Number(s.hbarEscrow) > 0 ? "#166534" : "#991b1b" }}>
                              {s.hbarEscrow} HBAR
                            </span>
                          ) : (
                            <span style={{ color: "#6b7280", fontSize: 10 }}>
                              via allowance
                            </span>
                          )}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0", fontSize: 10 }}>
                          {s.nextPaymentTime ? formatTime(s.nextPaymentTime) : "—"}
                          {s.currentScheduleAddr &&
                            s.currentScheduleAddr !==
                              "0x0000000000000000000000000000000000000000" && (
                              <div>
                                <a
                                  href={`${HASHSCAN_BASE}/contract/${s.currentScheduleAddr}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 9 }}
                                >
                                  {shortAddr(s.currentScheduleAddr)}
                                </a>
                              </div>
                            )}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {s.active && s.status !== 1 && (
                            <button
                              onClick={() => apiCall("start", { subIdx: i }, `start-${i}`)}
                              disabled={loading === `start-${i}`}
                              style={{ fontSize: 10, marginRight: 4 }}
                            >
                              {loading === `start-${i}` ? "..." : "Start"}
                            </button>
                          )}
                          {s.active && s.status === 1 && (
                            <button
                              onClick={() => apiCall("cancel", { subIdx: i }, `cancel-${i}`)}
                              disabled={loading === `cancel-${i}`}
                              style={{ fontSize: 10, marginRight: 4 }}
                            >
                              {loading === `cancel-${i}` ? "..." : "Cancel"}
                            </button>
                          )}
                          {(s.status === 3 || s.status === 4) && s.active && (
                            <button
                              onClick={() => apiCall("retry", { subIdx: i }, `retry-${i}`)}
                              disabled={loading === `retry-${i}`}
                              style={{ fontSize: 10, marginRight: 4 }}
                            >
                              {loading === `retry-${i}` ? "..." : "Retry"}
                            </button>
                          )}
                          {s.active && (
                            <button
                              onClick={() => apiCall("cancel", { subIdx: i }, `unsub-${i}`)}
                              disabled={loading === `unsub-${i}`}
                              style={{ fontSize: 10, color: "#991b1b" }}
                            >
                              {loading === `unsub-${i}` ? "..." : "Unsubscribe"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "#888", fontSize: 12 }}>
                No subscriptions yet. Create one above.
              </p>
            )}
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 5. Schedule History */}
          <section style={{ margin: "24px 0" }}>
            <h2>5. Schedule History</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Full lifecycle of all scheduled pull transactions. Each row links to
              Hashscan for verification.
            </p>
            <button onClick={fetchStatus} style={{ marginBottom: 8 }}>
              Refresh
            </button>

            {history.length > 0 ? (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                }}
              >
                <thead>
                  <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Sub</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Schedule</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Scheduled For</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Created</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Executed</th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const sc = STATUS_COLORS[h.status] || STATUS_COLORS[0];
                    const statusLabel =
                      SubscriptionScheduleStatus[
                        h.status as keyof typeof SubscriptionScheduleStatus
                      ] || "Unknown";
                    const subName = subs[h.subIdx]?.name || `#${h.subIdx}`;
                    return (
                      <tr key={i}>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {subName}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          <a
                            href={`${HASHSCAN_BASE}/contract/${h.scheduleAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {shortAddr(h.scheduleAddress)}
                          </a>
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {formatTime(h.scheduledTime)}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {formatTime(h.createdAt)}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          {formatTime(h.executedAt)}
                        </td>
                        <td style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                          <span
                            style={{
                              background: sc.bg,
                              border: `1px solid ${sc.border}`,
                              color: sc.text,
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: "bold",
                            }}
                          >
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "#888", fontSize: 12 }}>
                No schedule history yet. Create a subscription and start it.
              </p>
            )}
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 6. How It Works */}
          <section style={{ margin: "24px 0" }}>
            <h2>6. How It Works</h2>
            <pre
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: 16,
                fontSize: 12,
                overflow: "auto",
              }}
            >
              {`Self-Rescheduling Subscription Loop (No Off-Chain Servers):

  HBAR Mode (Escrow):
  ───────────────────
  Subscriber calls subscribeHbar() with HBAR deposit
    │
    ▼
  Owner calls startSubscription(subIdx)
    │
    ▼
  Contract calls HSS.scheduleCall(
    address(this),
    block.timestamp + interval,
    2_000_000 gas,  // ~1.74 HBAR/call at 870 gWei
    abi.encodeCall(executeSubscription, subIdx)
  )
    │
    ▼
  HSS fires → executeSubscription(subIdx)
    ├── Deduct from subscriber's escrow balance
    ├── Add to collectedHbar (vault revenue)
    └── scheduleCall() again → self-reschedule next pull
         │
         ▼  (repeats forever until cancelled or escrow empty)

  Token Mode (USDC / ERC-20):
  ───────────────────────────
  Subscriber calls approve(vault, amount) on token contract
    │
  Subscriber calls subscribeToken(token, name, amount, interval)
    │
    ▼
  Owner calls startSubscription(subIdx)
    │
    ▼
  HSS fires → executeSubscription(subIdx)
    ├── Check allowance + balance
    ├── transferFrom(subscriber, vault, amount)
    └── scheduleCall() again → self-reschedule next pull
         │
         ▼  (repeats until cancelled or allowance revoked)

Edge Cases:
  • Insufficient HBAR escrow → emit InsufficientBalance, FAILED
  • Insufficient allowance   → emit InsufficientBalance, FAILED
  • Insufficient token bal   → emit InsufficientBalance, FAILED
  • HSS capacity full        → try time+1, emit event
  • Cancel → delete pending HSS schedule, refund HBAR escrow
  • Retry  → owner restarts failed subscriptions`}
            </pre>
          </section>
        </>
      )}

      {/* Result display */}
      {result && (
        <div style={{ position: "fixed", bottom: 20, right: 20, maxWidth: 400 }}>
          <pre
            style={{
              background: result.success ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${result.success ? "#86efac" : "#fca5a5"}`,
              padding: 12,
              overflow: "auto",
              fontSize: 11,
              maxHeight: 200,
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
          <button
            onClick={() => setResult(null)}
            style={{ fontSize: 10, marginTop: 4 }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

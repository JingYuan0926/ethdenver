import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { HASHSCAN_BASE, HEDERA_RPC_URL, ScheduleStatus, PAYROLL_VAULT_ADDRESS, PAYROLL_VAULT_ABI } from "@/lib/payroll-vault-abi";

interface ApiResult {
  success: boolean;
  [key: string]: unknown;
}

interface AgentData {
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

interface HistoryRecord {
  agentIdx: number;
  scheduleAddress: string;
  scheduledTime: number;
  createdAt: number;
  executedAt: number;
  status: number;
}

interface VaultInfo {
  address: string;
  balance: string;
  owner: string;
  defaultAmount: string;
  defaultInterval: number;
  agentCount: number;
  historyCount: number;
  paymentToken: string;
  tokenBalance: string;
}

const STATUS_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b" }, // None
  1: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" }, // Pending
  2: { bg: "#f0fdf4", border: "#86efac", text: "#166534" }, // Executed
  3: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" }, // Failed
  4: { bg: "#f8fafc", border: "#cbd5e1", text: "#64748b" }, // Cancelled
};

function formatTinybar(val: string): string {
  const n = BigInt(val);
  const hbar = Number(n) / 1e8;
  return hbar.toFixed(4) + " HBAR";
}

function formatTime(epoch: number): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString();
}

function shortAddr(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

export default function SchedulePage() {
  const [vaultAddress, setVaultAddress] = useState<string>(PAYROLL_VAULT_ADDRESS);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  // Add agent form
  const [newAddr, setNewAddr] = useState("");
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newInterval, setNewInterval] = useState("");

  // Fund form
  const [fundAmount, setFundAmount] = useState("10");

  // Token config — default to Mock USDC on Hedera Testnet
  const USDC_ADDRESS = "0x000000000000000000000000000000000079d730";
  const [tokenAddr, setTokenAddr] = useState(USDC_ADDRESS);
  const [fundTokenAmount, setFundTokenAmount] = useState("1000");

  // Private key deposit state
  const [userPrivateKey, setUserPrivateKey] = useState("");
  const [userWalletAddr, setUserWalletAddr] = useState("");
  const [userFundAmount, setUserFundAmount] = useState("100");

  const isTokenMode = vault?.paymentToken && vault.paymentToken !== "0x0000000000000000000000000000000000000000";

  function formatAmount(val: string): string {
    if (isTokenMode) {
      // HTS tokens typically have low decimals (0-8); show raw for now
      return Number(val).toLocaleString() + " USDC";
    }
    return formatTinybar(val);
  }

  const fetchStatus = useCallback(async () => {
    if (!vaultAddress) return;
    try {
      const res = await fetch("/api/schedule/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress }),
      });
      const data = await res.json();
      if (data.success) {
        setVault(data.vault);
        setAgents(data.agents);
        setHistory(data.history);
      }
    } catch {
      // silent refresh failure
    }
  }, [vaultAddress]);

  // Auto-refresh every 15s
  useEffect(() => {
    if (!vaultAddress) return;
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [vaultAddress, fetchStatus]);

  async function handleFund() {
    if (!vaultAddress || !fundAmount) return;
    setLoading("fund");
    setResult(null);
    try {
      const res = await fetch("/api/schedule/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, amount: fundAmount }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleSetToken() {
    if (!vaultAddress) return;
    setLoading("set-token");
    setResult(null);
    try {
      const res = await fetch("/api/schedule/set-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, tokenAddress: tokenAddr || "" }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleFundToken() {
    if (!vaultAddress || !fundTokenAmount) return;
    setLoading("fund-token");
    setResult(null);
    try {
      const res = await fetch("/api/schedule/fund-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, amount: fundTokenAmount }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  function handleLoadWallet() {
    if (!userPrivateKey.trim()) {
      setResult({ success: false, error: "Enter a private key" });
      return;
    }
    try {
      const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
      const wallet = new ethers.Wallet(userPrivateKey.trim(), provider);
      setUserWalletAddr(wallet.address);
      setResult({ success: true, message: `Wallet loaded: ${wallet.address}` });
    } catch (err) {
      setResult({ success: false, error: `Invalid key: ${err}` });
    }
  }

  async function handleUserFundUSDC() {
    if (!userPrivateKey || !userWalletAddr || !vaultAddress || !userFundAmount || !vault?.paymentToken) return;
    setLoading("user-fund");
    setResult(null);
    try {
      const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL);
      const wallet = new ethers.Wallet(userPrivateKey.trim(), provider);

      const tokenContract = new ethers.Contract(
        vault.paymentToken,
        [
          "function approve(address spender, uint256 amount) returns (bool)",
          "function decimals() view returns (uint8)",
        ],
        wallet
      );

      const decimals = await tokenContract.decimals();
      const rawAmount = ethers.parseUnits(userFundAmount, decimals);

      // Step 1: Approve vault to spend user's USDC
      setResult({ success: true, message: "Step 1/2: Approving USDC..." });
      const approveTx = await tokenContract.approve(vaultAddress, rawAmount);
      await approveTx.wait();

      // Step 2: Call fundVaultToken on the vault
      setResult({ success: true, message: "Step 2/2: Depositing USDC into vault..." });
      const vaultContract = new ethers.Contract(vaultAddress, PAYROLL_VAULT_ABI, wallet);
      const fundTx = await vaultContract.fundVaultToken(rawAmount);
      await fundTx.wait();

      setResult({
        success: true,
        message: `Deposited ${userFundAmount} USDC from ${userWalletAddr.slice(0, 8)}...`,
        txHash: fundTx.hash,
      });
      fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleAddAgent() {
    if (!vaultAddress || !newAddr || !newName) return;
    setLoading("add-agent");
    setResult(null);
    try {
      const res = await fetch("/api/schedule/add-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAddress,
          agent: newAddr,
          name: newName,
          amountPerPeriod: newAmount || undefined,
          intervalSeconds: newInterval || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setNewAddr("");
        setNewName("");
        setNewAmount("");
        setNewInterval("");
        fetchStatus();
      }
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleRemoveAgent(agentIdx: number) {
    if (!vaultAddress) return;
    setLoading(`remove-${agentIdx}`);
    setResult(null);
    try {
      const res = await fetch("/api/schedule/remove-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, agentIdx }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handleUpdateAgent(agentIdx: number) {
    if (!vaultAddress) return;
    const amountStr = prompt("New amount in HBAR (0 = no change):", "1");
    if (amountStr === null) return;
    const intervalStr = prompt("New interval in seconds (0 = no change):", "0");
    if (intervalStr === null) return;
    setLoading(`update-${agentIdx}`);
    setResult(null);
    try {
      const res = await fetch("/api/schedule/update-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAddress,
          agentIdx,
          amountPerPeriod: amountStr || undefined,
          intervalSeconds: intervalStr || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  async function handlePayrollAction(
    action: "start" | "cancel" | "retry",
    agentIdx: number
  ) {
    const loadKey = `${action}-${agentIdx}`;
    setLoading(loadKey);
    setResult(null);
    try {
      const endpoint =
        action === "start"
          ? "start-payroll"
          : action === "cancel"
            ? "cancel-payroll"
            : "retry-payroll";
      const res = await fetch(`/api/schedule/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, agentIdx }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) fetchStatus();
    } catch (err) {
      setResult({ success: false, error: String(err) });
    }
    setLoading(null);
  }

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "40px auto",
        fontFamily: "monospace",
        padding: "0 20px",
      }}
    >
      <h1>SPARK Agent Payroll Vault</h1>
      <p style={{ color: "#888" }}>
        Automated on-chain payroll using Hedera Schedule Service (HSS) —
        self-rescheduling payments with no off-chain servers
      </p>
      <p style={{ color: "#666", fontSize: 12 }}>
        Network: Hedera Testnet | Contract: scheduleCall via HSS @ 0x16b |
        Self-rescheduling loop
      </p>

      <hr style={{ margin: "24px 0" }} />

      {/* 0. Connect to Vault */}
      <section style={{ margin: "24px 0" }}>
        <h2>0. Connect to Vault</h2>
        <p style={{ color: "#888", fontSize: 13 }}>
          Enter the deployed SPARKPayrollVault contract address on Hedera
          Testnet.
        </p>
        <div>
          <input
            value={vaultAddress}
            onChange={(e) => setVaultAddress(e.target.value)}
            placeholder="0x... (deployed vault address)"
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
              <strong>HBAR Balance:</strong> {formatTinybar(vault.balance)}
            </div>
            {isTokenMode && (
              <div>
                <strong>Token Balance:</strong> {Number(vault.tokenBalance).toLocaleString()} USDC
              </div>
            )}
            <div>
              <strong>Payment Mode:</strong>{" "}
              <span style={{
                background: isTokenMode ? "#dbeafe" : "#f0fdf4",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: "bold",
              }}>
                {isTokenMode ? `USDC (${shortAddr(vault.paymentToken)})` : "HBAR"}
              </span>
            </div>
            <div>
              <strong>Owner:</strong> {shortAddr(vault.owner)}
            </div>
            <div>
              <strong>Default:</strong> {formatAmount(vault.defaultAmount)} every{" "}
              {vault.defaultInterval}s
            </div>
            <div>
              <strong>Agents:</strong> {vault.agentCount} |{" "}
              <strong>Schedules:</strong> {vault.historyCount}
            </div>
          </div>
        )}
      </section>

      {vault && (
        <>
          <hr style={{ margin: "24px 0" }} />

          {/* 1. Payment Token Config */}
          <section style={{ margin: "24px 0" }}>
            <h2>1. Payment Token</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Set an HTS/ERC-20 token for payments (e.g. mock USDC). Leave empty to use HBAR.
            </p>
            <div>
              <label>
                Token Address:{" "}
                <input
                  value={tokenAddr}
                  onChange={(e) => setTokenAddr(e.target.value)}
                  placeholder="0x... (HTS token EVM address, empty = HBAR)"
                  style={{ width: 380, fontFamily: "monospace", fontSize: 11 }}
                />
              </label>
              <span style={{ fontSize: 10, color: "#888", marginLeft: 6 }}>
                Default: Mock USDC (0.0.7984944)
              </span>
              <button
                onClick={handleSetToken}
                disabled={loading === "set-token"}
                style={{ marginLeft: 8 }}
              >
                {loading === "set-token" ? "Setting..." : "Set Token"}
              </button>
            </div>
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 2. Fund Vault */}
          <section style={{ margin: "24px 0" }}>
            <h2>2. Fund Vault</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              {isTokenMode
                ? "Deposit USDC tokens into the vault. Also fund HBAR for gas."
                : "Send HBAR to the vault to fund agent payroll disbursements."}
            </p>

            {/* HBAR funding (always needed for gas) */}
            <div>
              <label>
                HBAR {isTokenMode ? "(for gas)" : "(for payments)"}:{" "}
                <input
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  style={{ width: 80, fontFamily: "monospace" }}
                />
              </label>
              <button
                onClick={handleFund}
                disabled={loading === "fund"}
                style={{ marginLeft: 8 }}
              >
                {loading === "fund" ? "Funding..." : "Fund HBAR"}
              </button>
            </div>

            {/* Token funding via server EOA (admin) */}
            {isTokenMode && (
              <div style={{ marginTop: 8 }}>
                <label>
                  USDC via Server (admin):{" "}
                  <input
                    value={fundTokenAmount}
                    onChange={(e) => setFundTokenAmount(e.target.value)}
                    style={{ width: 120, fontFamily: "monospace" }}
                  />
                </label>
                <button
                  onClick={handleFundToken}
                  disabled={loading === "fund-token"}
                  style={{ marginLeft: 8 }}
                >
                  {loading === "fund-token" ? "Funding..." : "Fund USDC (Server)"}
                </button>
              </div>
            )}

            {/* User private key deposit */}
            {isTokenMode && (
              <div style={{
                marginTop: 16,
                padding: 12,
                background: "#eff6ff",
                border: "1px solid #93c5fd",
                borderRadius: 6,
              }}>
                <strong>Deposit USDC via Private Key</strong>
                <p style={{ color: "#888", fontSize: 12, margin: "4px 0" }}>
                  Enter your Hedera private key to approve &amp; deposit USDC directly.
                  Your key stays in-browser and is never sent to any server.
                </p>
                <p style={{ color: "#b45309", fontSize: 11, margin: "4px 0" }}>
                  Note: Your account needs a small HBAR balance for gas fees (~0.05 HBAR per tx).
                </p>
                <div>
                  <label>
                    Private Key:{" "}
                    <input
                      type="password"
                      value={userPrivateKey}
                      onChange={(e) => setUserPrivateKey(e.target.value)}
                      placeholder="0x... or hex key"
                      style={{ width: 380, fontFamily: "monospace", fontSize: 11 }}
                    />
                  </label>
                  <button onClick={handleLoadWallet} style={{ marginLeft: 8 }}>
                    Load Wallet
                  </button>
                </div>
                {userWalletAddr && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: "#166534", marginBottom: 6 }}>
                      Wallet: {shortAddr(userWalletAddr)}
                    </div>
                    <label>
                      Amount (USDC):{" "}
                      <input
                        value={userFundAmount}
                        onChange={(e) => setUserFundAmount(e.target.value)}
                        style={{ width: 120, fontFamily: "monospace" }}
                      />
                    </label>
                    <button
                      onClick={handleUserFundUSDC}
                      disabled={loading === "user-fund"}
                      style={{ marginLeft: 8 }}
                    >
                      {loading === "user-fund" ? "Depositing..." : "Deposit USDC"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 3. Agent Registry */}
          <section style={{ margin: "24px 0" }}>
            <h2>3. Agent Registry</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Register AI agent beneficiaries. Each agent gets scheduled{" "}
              {isTokenMode ? "USDC" : "HBAR"} payments at their configured interval.
            </p>

            {agents.length > 0 && (
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
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      #
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Name
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Amount
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Interval
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Status
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Payments
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Next
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => {
                    const sc = STATUS_COLORS[a.status] || STATUS_COLORS[0];
                    const statusLabel =
                      ScheduleStatus[a.status as keyof typeof ScheduleStatus] ||
                      "Unknown";
                    return (
                      <tr key={i} style={{ opacity: a.active ? 1 : 0.5 }}>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {i}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                            fontWeight: "bold",
                          }}
                        >
                          {a.agentName}
                          <div style={{ fontSize: 9, color: "#888" }}>
                            {shortAddr(a.agent)}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {formatAmount(a.amountPerPeriod)}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {a.intervalSeconds}s
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
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
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {a.paymentCount} ({formatAmount(a.totalPaid)})
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                            fontSize: 10,
                          }}
                        >
                          {a.nextPaymentTime
                            ? formatTime(a.nextPaymentTime)
                            : "—"}
                          {a.currentScheduleAddr &&
                            a.currentScheduleAddr !==
                              "0x0000000000000000000000000000000000000000" && (
                              <div>
                                <a
                                  href={`${HASHSCAN_BASE}/contract/${a.currentScheduleAddr}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 9 }}
                                >
                                  {shortAddr(a.currentScheduleAddr)}
                                </a>
                              </div>
                            )}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {a.active && a.status !== 1 && (
                            <button
                              onClick={() => handlePayrollAction("start", i)}
                              disabled={loading === `start-${i}`}
                              style={{ fontSize: 10, marginRight: 4 }}
                            >
                              {loading === `start-${i}` ? "..." : "Start"}
                            </button>
                          )}
                          {a.status === 1 && (
                            <button
                              onClick={() => handlePayrollAction("cancel", i)}
                              disabled={loading === `cancel-${i}`}
                              style={{ fontSize: 10, marginRight: 4 }}
                            >
                              {loading === `cancel-${i}` ? "..." : "Cancel"}
                            </button>
                          )}
                          {(a.status === 3 || a.status === 4) && a.active && (
                            <button
                              onClick={() => handlePayrollAction("retry", i)}
                              disabled={loading === `retry-${i}`}
                              style={{ fontSize: 10, marginRight: 4 }}
                            >
                              {loading === `retry-${i}` ? "..." : "Retry"}
                            </button>
                          )}
                          {a.active && (
                            <>
                              <button
                                onClick={() => handleUpdateAgent(i)}
                                disabled={loading === `update-${i}`}
                                style={{ fontSize: 10, marginRight: 4 }}
                              >
                                {loading === `update-${i}` ? "..." : "Edit"}
                              </button>
                              <button
                                onClick={() => handleRemoveAgent(i)}
                                disabled={loading === `remove-${i}`}
                                style={{ fontSize: 10, color: "#991b1b" }}
                              >
                                {loading === `remove-${i}` ? "..." : "Remove"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Add Agent Form */}
            <div
              style={{
                padding: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
              }}
            >
              <strong>Add Agent</strong>
              <div style={{ marginTop: 8 }}>
                <label>
                  Address:{" "}
                  <input
                    value={newAddr}
                    onChange={(e) => setNewAddr(e.target.value)}
                    placeholder="0x..."
                    style={{
                      width: 380,
                      fontFamily: "monospace",
                      fontSize: 11,
                    }}
                  />
                </label>
              </div>
              <div style={{ marginTop: 4 }}>
                <label>
                  Name:{" "}
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Agent name"
                    style={{ width: 200, fontFamily: "monospace" }}
                  />
                </label>
              </div>
              <div style={{ marginTop: 4 }}>
                <label>
                  Amount ({isTokenMode ? "USDC" : "HBAR"}, 0=default):{" "}
                  <input
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0"
                    style={{ width: 120, fontFamily: "monospace" }}
                  />
                </label>
                <label style={{ marginLeft: 12 }}>
                  Interval (sec, 0=default):{" "}
                  <input
                    value={newInterval}
                    onChange={(e) => setNewInterval(e.target.value)}
                    placeholder="0"
                    style={{ width: 80, fontFamily: "monospace" }}
                  />
                </label>
              </div>
              <button
                onClick={handleAddAgent}
                disabled={loading === "add-agent"}
                style={{ marginTop: 8 }}
              >
                {loading === "add-agent" ? "Adding..." : "Add Agent"}
              </button>
            </div>
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 4. Schedule History */}
          <section style={{ margin: "24px 0" }}>
            <h2>4. Schedule History</h2>
            <p style={{ color: "#888", fontSize: 13 }}>
              Full lifecycle of all scheduled transactions. Each row links to
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
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Agent
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Schedule
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Scheduled For
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Created
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Executed
                    </th>
                    <th style={{ padding: 6, border: "1px solid #e2e8f0" }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const sc = STATUS_COLORS[h.status] || STATUS_COLORS[0];
                    const statusLabel =
                      ScheduleStatus[
                        h.status as keyof typeof ScheduleStatus
                      ] || "Unknown";
                    const agentName =
                      agents[h.agentIdx]?.agentName || `#${h.agentIdx}`;
                    return (
                      <tr key={i}>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {agentName}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <a
                            href={`${HASHSCAN_BASE}/contract/${h.scheduleAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {shortAddr(h.scheduleAddress)}
                          </a>
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {formatTime(h.scheduledTime)}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {formatTime(h.createdAt)}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          {formatTime(h.executedAt)}
                        </td>
                        <td
                          style={{
                            padding: 6,
                            border: "1px solid #e2e8f0",
                          }}
                        >
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
                No schedule history yet. Add an agent and start payroll.
              </p>
            )}
          </section>

          <hr style={{ margin: "24px 0" }} />

          {/* 5. How It Works */}
          <section style={{ margin: "24px 0" }}>
            <h2>5. How It Works</h2>
            <pre
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                padding: 16,
                fontSize: 12,
                overflow: "auto",
              }}
            >
              {`Self-Rescheduling Payroll Loop (No Off-Chain Servers):

  Owner calls startPayroll(agentIdx)
    │
    ▼
  Contract calls HSS.scheduleCall(
    address(this),           ← target: the vault itself
    block.timestamp + interval,
    2_000_000 gas,
    abi.encodeCall(executePayroll, agentIdx)
  )
    │
    ▼
  HSS creates Schedule S1 → status: PENDING
    │
    ▼  (interval passes...)
    │
  HSS auto-executes vault.executePayroll(agentIdx)
    │
    ├── Pay agent HBAR/USDC    → status: EXECUTED
    ├── Update payment count
    └── Call scheduleCall() again → creates S2 (PENDING)
         │
         ▼  (interval passes...)
         │
       HSS auto-executes again → Pay → Reschedule S3 → ...

Edge Cases:
  • Insufficient balance → emit InsufficientBalance, set FAILED
  • Capacity full        → try time+1, emit ScheduleCapacityUnavailable
  • Agent removed        → skip payment, don't reschedule
  • Schedule expired     → owner calls retryPayroll() to restart`}
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

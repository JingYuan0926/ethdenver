import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useAgent } from "@/contexts/AgentContext";

const C = {
  walnut: [72, 53, 25] as const,
  peach: [221, 110, 66] as const,
  slate: [79, 109, 122] as const,
  fern: [75, 127, 82] as const,
};

function rgba(c: readonly number[], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

const STATES = [
  { label: "Analyzing data...", target: { x: 0.18, y: 0.18 }, duration: 5000, color: C.slate },
  { label: "Exploring the world...", target: { x: 0.78, y: 0.15 }, duration: 6000, color: C.walnut },
  { label: "Taking a break...", target: { x: 0.15, y: 0.75 }, duration: 4000, color: C.peach },
  { label: "Researching plants...", target: { x: 0.80, y: 0.78 }, duration: 4000, color: C.fern },
] as const;

function drawAgent(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  unit: number, timestamp: number,
  isMoving: boolean, facingRight: boolean,
) {
  const bw = unit * 0.045;
  const bh = unit * 0.06;
  const bob = isMoving ? 0 : Math.sin(timestamp * 0.003) * 2;
  const legSwing = isMoving ? Math.sin(timestamp * 0.012) * 3 : 0;
  const x = px, y = py + bob;

  ctx.fillStyle = rgba([0, 0, 0], 0.12);
  ctx.beginPath();
  ctx.ellipse(px, py + bh / 2 + 4, bw * 0.7, bw * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  const legW = bw * 0.32, legH = bh * 0.18;
  ctx.fillStyle = rgba(C.fern, 0.85);
  ctx.beginPath();
  ctx.roundRect(x - bw * 0.35, y + bh / 2 - legH * 0.3 + legSwing, legW, legH, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + bw * 0.05, y + bh / 2 - legH * 0.3 - legSwing, legW, legH, 2);
  ctx.fill();

  const bpSide = facingRight ? -1 : 1;
  ctx.fillStyle = rgba(C.fern, 0.65);
  ctx.beginPath();
  ctx.roundRect(x + bpSide * bw * 0.38, y - bh * 0.05, bw * 0.2, bh * 0.35, 3);
  ctx.fill();

  ctx.fillStyle = rgba(C.fern, 0.85);
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, bw / 2);
  ctx.fill();

  const vs = facingRight ? 1 : -1;
  ctx.fillStyle = rgba(C.slate, 0.8);
  ctx.beginPath();
  ctx.roundRect(x + vs * bw * 0.08, y - bh * 0.25, bw * 0.38, bh * 0.25, [4, 4, 2, 2]);
  ctx.fill();

  ctx.fillStyle = rgba([255, 255, 255], 0.25);
  ctx.beginPath();
  ctx.roundRect(x + vs * bw * 0.15, y - bh * 0.22, bw * 0.12, bh * 0.08, 2);
  ctx.fill();
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  label: string, color: readonly number[],
  unit: number,
) {
  const fontSize = Math.max(9, unit * 0.024);
  ctx.font = `600 ${fontSize}px sans-serif`;
  const textW = ctx.measureText(label).width;
  const padX = fontSize * 0.7, padY = fontSize * 0.5;
  const bubW = textW + padX * 2, bubH = fontSize + padY * 2;
  const bx = px - bubW / 2;
  const by = py - unit * 0.06 / 2 - bubH - 10;

  ctx.fillStyle = rgba(color, 0.85);
  ctx.beginPath();
  ctx.roundRect(bx, by, bubW, bubH, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px - 5, by + bubH);
  ctx.lineTo(px, by + bubH + 6);
  ctx.lineTo(px + 5, by + bubH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = rgba([255, 255, 255], 0.95);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px, by + bubH / 2);
}

interface ActivityEntry {
  id: string;
  type: string;
  bot: string;
  time: string;
  detail: string;
}

function timeAgo(consensusTimestamp: string): string {
  const secs = parseFloat(consensusTimestamp);
  const date = new Date(secs * 1000);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function parseActivity(msg: Record<string, unknown>, seqNo: number): ActivityEntry {
  const type = (msg.type as string) || "unknown";
  const bot = (msg.botId as string) || (msg.bot_id as string) || "unknown";
  const time = msg._consensusAt ? timeAgo(msg._consensusAt as string) : "";
  let detail = "";

  if (type === "agent_registered") {
    const evmAddr = (msg.evmAddress as string) || "";
    const iNft = msg.iNftTokenId ?? msg.inft_token_id ?? "";
    detail = `0G: ${evmAddr ? evmAddr.slice(0, 20) + "..." : "—"} | iNFT #${iNft}`;
  } else if (type === "knowledge_submitted") {
    const cat = (msg.category as string) || "";
    const hash = (msg.dataHash as string) || (msg.data_hash as string) || "";
    detail = `Topic: ${cat} | Hash: ${hash ? hash.slice(0, 20) + "..." : "—"}`;
  } else if (type === "vote_cast") {
    const vote = (msg.vote as string) || "";
    const target = (msg.targetBot as string) || (msg.target_bot as string) || "";
    detail = `${vote} on ${target}`;
  } else {
    detail = JSON.stringify(msg).slice(0, 60);
  }

  return { id: `#${seqNo}`, type, bot, time, detail };
}

const FALLBACK_ACTIVITY: ActivityEntry[] = [
  { id: "#—", type: "info", bot: "system", time: "", detail: "Loading master topic logs..." },
];

const TYPE_COLORS: Record<string, string> = {
  agent_registered: "text-[#4B7F52]",
  knowledge_submitted: "text-[#4F6D7A]",
  vote_cast: "text-[#DD6E42]",
  info: "text-[#483519]/50",
};

export function AgentSession() {
  const { agent } = useAgent();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const bgRef = useRef<HTMLImageElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>(FALLBACK_ACTIVITY);
  const [masterTopicId, setMasterTopicId] = useState<string | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, chatLoading]);

  async function handleChat() {
    if (!agent || !chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatLoading(true);
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
      if (!res.ok) {
        setChatHistory((prev) => [...prev, { role: "agent", text: `Error: ${data.error}` }]);
      } else {
        setChatHistory((prev) => [
          ...prev,
          { role: "agent", text: data.response + (data.simulated ? " [simulated]" : "") },
        ]);
      }
    } catch (err: unknown) {
      setChatHistory((prev) => [
        ...prev,
        { role: "agent", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function fetchLedger() {
      try {
        const res = await fetch("/api/spark/ledger");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.success) return;
        setMasterTopicId(data.masterTopicId || null);
        const msgs: Record<string, unknown>[] = data.ledger?.master?.messages || [];
        if (msgs.length === 0) return;
        const parsed = msgs
          .map((m) => parseActivity(m, (m._seqNo as number) || 0))
          .reverse();
        setActivity(parsed);
      } catch {
        // keep fallback
      }
    }
    fetchLedger();
    return () => { cancelled = true; };
  }, []);

  const animRef = useRef({
    agentX: 0.18, agentY: 0.18,
    targetX: 0.18, targetY: 0.18,
    stateIndex: 0, stateStart: 0,
    initialized: false, facingRight: true,
  });

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    sizeRef.current = { w: rect.width, h: rect.height };
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    setup();
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => setup());
    obs.observe(container);

    const bg = new Image();
    bg.src = "/sprite.png";
    bg.onload = () => { bgRef.current = bg; };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const draw = (timestamp: number) => {
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) { animId = requestAnimationFrame(draw); return; }
      const a = animRef.current;
      if (!a.initialized) { a.stateStart = timestamp; a.initialized = true; }

      const state = STATES[a.stateIndex];
      if (timestamp - a.stateStart > state.duration) {
        a.stateIndex = (a.stateIndex + 1) % STATES.length;
        a.stateStart = timestamp;
        const next = STATES[a.stateIndex];
        a.targetX = next.target.x;
        a.targetY = next.target.y;
      }

      const dx = a.targetX - a.agentX;
      const dy = a.targetY - a.agentY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isMoving = dist > 0.008;
      if (isMoving) {
        a.agentX += dx * 0.025;
        a.agentY += dy * 0.025;
        if (dx > 0.005) a.facingRight = true;
        else if (dx < -0.005) a.facingRight = false;
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;

      // Draw bg as square, fitted to canvas
      const size = Math.min(w, h);
      if (bgRef.current) {
        ctx.drawImage(bgRef.current, 0, 0, size, size);
      }

      const mapSize = size;
      const unit = mapSize;
      const px = a.agentX * mapSize;
      const py = a.agentY * mapSize;
      drawAgent(ctx, px, py, unit, timestamp, isMoving, a.facingRight);

      const cur = STATES[a.stateIndex];
      drawSpeechBubble(ctx, px, py, cur.label, cur.color, unit);

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); obs.disconnect(); };
  }, [setup]);

  const visibleActivity = expanded ? activity : activity.slice(0, 3);

  return (
    <div className="col-span-2 row-span-2 flex flex-col overflow-hidden rounded-2xl bg-[#4B7F52]/50 p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#2d4a30]">
        Agent Session
      </h2>

      <div className="grid flex-1 min-h-0 grid-cols-4 grid-rows-4 gap-3">
        {/* Map — 2x2 top-left */}
        <div ref={containerRef} className="col-span-2 row-span-2 overflow-hidden">
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>

        {/* Chat — 2x2 top-right */}
        <div className="col-span-2 row-span-2 flex flex-col overflow-hidden rounded-lg bg-white/30">
          <div className="border-b border-[#483519]/10 px-3 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#483519]/50">
              Chat with iNFT #{agent?.iNftTokenId ?? "—"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {chatHistory.length === 0 && (
              <p className="mt-2 text-center text-xs text-[#483519]/30">
                Send a message to talk to your agent.
              </p>
            )}
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`mb-2 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#483519] text-white"
                      : "bg-[#483519]/10 text-[#483519]"
                  }`}
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="mb-2 flex justify-start">
                <div className="rounded-xl bg-[#483519]/10 px-3 py-1.5 text-xs text-[#483519]/50">
                  Agent is thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-[#483519]/10 px-3 py-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !chatLoading && handleChat()}
              placeholder="Chat with your agent..."
              disabled={!agent || chatLoading}
              className="flex-1 rounded-lg border border-[#483519]/15 bg-white px-3 py-1.5 text-xs outline-none transition placeholder:text-[#483519]/30 focus:border-[#483519] focus:ring-1 focus:ring-[#483519] disabled:opacity-50"
            />
            <button
              onClick={handleChat}
              disabled={!agent || chatLoading || !chatInput.trim()}
              className="rounded-lg bg-[#483519] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#483519]/80 disabled:opacity-50"
            >
              {chatLoading ? "..." : "Send"}
            </button>
          </div>
        </div>

        {/* Activity feed — 4x2 bottom full width */}
        <div className="col-span-4 row-span-2 overflow-hidden bg-white/20">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#483519]/60">
            Platform Activity
            {masterTopicId && (
              <a
                href={`https://hashscan.io/testnet/topic/${masterTopicId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 font-mono text-[10px] normal-case tracking-normal text-[#483519]/40 transition hover:text-[#483519]/70"
              >
                (Master Topic: {masterTopicId})
              </a>
            )}
          </h3>
          <span className="rounded-full bg-[#483519]/15 px-2.5 py-0.5 text-xs font-bold text-[#483519]/80">{activity.length} Logs</span>
        </div>

        {/* Activity list */}
        <div className="divide-y divide-[#483519]/5">
          {visibleActivity.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-4 py-2">
              <span className="mt-0.5 font-mono text-xs text-[#483519]/40">{a.id}</span>
              <span className={`mt-0.5 font-mono text-xs font-semibold ${TYPE_COLORS[a.type] || "text-[#483519]/70"}`}>
                {a.type}
              </span>
              <span className="text-xs text-[#483519]/60">
                bot: <span className="font-semibold text-[#483519]/80">{a.bot}</span>
              </span>
              <span className="ml-auto shrink-0 text-xs text-[#483519]/30">{a.time}</span>
            </div>
          ))}
        </div>

        {/* Expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-[#483519]/5 py-1.5 text-xs font-medium text-[#483519]/40 transition hover:text-[#483519]/70"
        >
          {expanded ? "Show less" : `Show ${activity.length - 3} more...`}
        </button>
      </div>
      </div>
    </div>
  );
}

import { useRef, useEffect, useState, useCallback } from "react";
import { useAgent } from "@/contexts/AgentContext";

/* ── Category mapping ──────────────────────────────────── */
const CATEGORIES: Record<string, { color: number[]; topicId: string; label: string }> = {
  scam:       { color: [166, 28, 60],   topicId: "0.0.7993401", label: "Scam" },
  blockchain: { color: [105, 74, 56],   topicId: "0.0.7993402", label: "Blockchain" },
  legal:      { color: [244, 172, 69],  topicId: "0.0.7993403", label: "Legal" },
  trend:      { color: [208, 241, 191], topicId: "0.0.7993404", label: "Trend" },
  skills:     { color: [75, 127, 82],   topicId: "0.0.7993405", label: "Skills" },
};

/* ── Globe block colors (3 shades × 5 categories) ──────── */
const GLOBE_COLORS = [
  [55, 95, 60], [75, 127, 82], [110, 160, 115],
  [160, 210, 148], [208, 241, 191], [225, 248, 215],
  [200, 135, 30], [244, 172, 69], [250, 200, 120],
  [75, 50, 35], [105, 74, 56], [145, 110, 90],
  [120, 15, 40], [166, 28, 60], [200, 70, 95],
];

/* ── Grouped mode: 3 shades per category sector ────────── */
const CATEGORY_SHADES = [
  [[120, 15, 40], [166, 28, 60], [200, 70, 95]],
  [[75, 50, 35], [105, 74, 56], [145, 110, 90]],
  [[200, 135, 30], [244, 172, 69], [250, 200, 120]],
  [[160, 210, 148], [208, 241, 191], [225, 248, 215]],
  [[55, 95, 60], [75, 127, 82], [110, 160, 115]],
];

/* ── Grey shades for the moon ──────────────────────────── */
const GREY_SHADES = [
  [90, 90, 95], [110, 110, 115], [130, 130, 135], [75, 75, 80], [150, 150, 155],
];

/* ── Types ─────────────────────────────────────────────── */
interface Knowledge {
  id: string;
  title: string;
  description: string;
  category: string;
  upvotes: number;
  downvotes: number;
  quorum: number;
  author: string;
  status: "pending" | "approved" | "rejected";
}

interface Block {
  lat: number;
  lng: number;
  color: number[];
  opacity: number;
}

interface LightRay {
  targetLat: number;
  targetLng: number;
  progress: number;
  color: number[];
  age: number;
}

/* ── Block generators ─────────────────────────────────── */
function generateBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < 50; i++) {
    const lat = (i / 49) * Math.PI - Math.PI / 2;
    const ringCount = Math.round(Math.cos(lat) * 100);
    for (let j = 0; j < ringCount; j++) {
      const lng = (j / ringCount) * Math.PI * 2;
      const shade = GLOBE_COLORS[Math.floor(Math.random() * GLOBE_COLORS.length)];
      const rand = Math.random();
      let opacity = 1;
      if (rand < 0.15) opacity = 0.3;
      else if (rand < 0.35) opacity = 0.5;
      else if (rand < 0.6) opacity = 0.7;
      else if (rand < 0.85) opacity = 0.85;
      blocks.push({ lat, lng, color: shade, opacity });
    }
  }
  return blocks;
}

function generateGroupedBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < 50; i++) {
    const lat = (i / 49) * Math.PI - Math.PI / 2;
    const ringCount = Math.round(Math.cos(lat) * 100);
    for (let j = 0; j < ringCount; j++) {
      const lng = (j / ringCount) * Math.PI * 2;
      const sector = Math.min(4, Math.floor((lng / (Math.PI * 2)) * 5));
      const shades = CATEGORY_SHADES[sector];
      const shade = shades[Math.floor(Math.random() * shades.length)];
      const rand = Math.random();
      let opacity = 1;
      if (rand < 0.15) opacity = 0.3;
      else if (rand < 0.35) opacity = 0.5;
      else if (rand < 0.6) opacity = 0.7;
      else if (rand < 0.85) opacity = 0.85;
      blocks.push({ lat, lng, color: shade, opacity });
    }
  }
  return blocks;
}

function generateMoonBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < 30; i++) {
    const lat = (i / 29) * Math.PI - Math.PI / 2;
    const ringCount = Math.round(Math.cos(lat) * 60);
    for (let j = 0; j < ringCount; j++) {
      const lng = (j / ringCount) * Math.PI * 2;
      const shade = GREY_SHADES[Math.floor(Math.random() * GREY_SHADES.length)];
      const rand = Math.random();
      let opacity = 1;
      if (rand < 0.15) opacity = 0.3;
      else if (rand < 0.35) opacity = 0.5;
      else if (rand < 0.6) opacity = 0.7;
      else if (rand < 0.85) opacity = 0.85;
      blocks.push({ lat, lng, color: shade, opacity });
    }
  }
  return blocks;
}

/* ── Draw a sphere of blocks (shared helper) ───────────── */
function drawSphere(
  ctx: CanvasRenderingContext2D,
  blocks: Block[],
  rot: number,
  cx: number,
  cy: number,
  radius: number,
  blockSize: number,
) {
  const sorted = blocks
    .map((b) => {
      const cosLat = Math.cos(b.lat);
      return { ...b, x: cosLat * Math.sin(b.lng + rot), y: Math.sin(b.lat), z: cosLat * Math.cos(b.lng + rot) };
    })
    .filter((b) => b.z > -0.2)
    .sort((a, b) => a.z - b.z);

  for (const b of sorted) {
    const sx = cx + b.x * radius;
    const sy = cy - b.y * radius;
    const depth = (b.z + 1) / 2;
    const scale = 0.5 + depth * 0.5;
    const size = blockSize * scale;
    const alpha = b.opacity * (0.3 + depth * 0.7);
    ctx.fillStyle = `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${alpha})`;
    ctx.beginPath();
    ctx.roundRect(sx - size / 2, sy - size / 2, size, size, 1.5);
    ctx.fill();
  }
}

/* ── Preview Globe (small, card view) ──────────────────── */
function KnowledgeGlobe({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blocksRef = useRef<Block[]>(generateBlocks());
  const angleRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const radius = Math.min(width, height) * 0.48;
    const cx = width / 2;
    const cy = height / 2;
    const blockSize = Math.max(2, radius * 0.038);

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      drawSphere(ctx, blocksRef.current, angleRef.current, cx, cy, radius, blockSize);
      angleRef.current += 0.004;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

/* ── Modal Globe (interactive — rays, glow, moon) ──────── */
function ModalGlobe({
  width,
  height,
  isGrouped,
  knowledgeItems,
  onHoverKnowledge,
  onClickKnowledge,
  onMoonClick,
}: {
  width: number;
  height: number;
  isGrouped: boolean;
  knowledgeItems: Knowledge[];
  onHoverKnowledge: (k: Knowledge | null) => void;
  onClickKnowledge: (k: Knowledge | null) => void;
  onMoonClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const randomBlocksRef = useRef<Block[]>(generateBlocks());
  const groupedBlocksRef = useRef<Block[]>(generateGroupedBlocks());
  const moonBlocksRef = useRef<Block[]>(generateMoonBlocks());
  const isGroupedRef = useRef(isGrouped);
  isGroupedRef.current = isGrouped;

  const knowledgeRef = useRef(knowledgeItems);
  knowledgeRef.current = knowledgeItems;

  const angleRef = useRef(0);
  const mouseRef = useRef({ x: -1, y: -1 });
  const isHoveringGlobeRef = useRef(false);
  const isHoveringMoonRef = useRef(false);
  const raysRef = useRef<LightRay[]>([]);
  const lastRayTimeRef = useRef(0);
  const lastHoveredKeyRef = useRef("");

  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Main globe
    const radius = Math.min(width, height) * 0.38;
    const cx = width * 0.45;
    const cy = height * 0.55;
    const blockSize = Math.max(2, radius * 0.035);
    const GLOW_RADIUS = 35;
    const GLOW_SQ = GLOW_RADIUS * GLOW_RADIUS;

    // Moon
    const moonRadius = radius * 0.28;
    const moonCx = cx + radius * 0.85;
    const moonCy = cy - radius * 0.8;
    const moonBlockSize = Math.max(1.5, moonRadius * 0.04);

    let animId: number;

    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, width, height);
      const rot = angleRef.current;
      const mouse = mouseRef.current;

      // Globe hover detection
      const gdx = mouse.x - cx;
      const gdy = mouse.y - cy;
      const isOverGlobe = gdx * gdx + gdy * gdy < radius * radius;

      // Moon hover detection
      const mdx = mouse.x - moonCx;
      const mdy = mouse.y - moonCy;
      const isOverMoon = mdx * mdx + mdy * mdy < moonRadius * moonRadius;

      isHoveringGlobeRef.current = isOverGlobe || isOverMoon;
      isHoveringMoonRef.current = isOverMoon;

      // ── Spawn light rays ──
      if (timestamp - lastRayTimeRef.current > 400) {
        lastRayTimeRef.current = timestamp;
        const catKeys = Object.keys(CATEGORIES);
        const cat = catKeys[Math.floor(Math.random() * catKeys.length)];
        raysRef.current.push({
          targetLat: (Math.random() - 0.5) * Math.PI * 0.8,
          targetLng: Math.random() * Math.PI * 2,
          progress: 0,
          color: CATEGORIES[cat].color,
          age: 0,
        });
      }
      raysRef.current = raysRef.current
        .map((r) => ({ ...r, progress: Math.min(1, r.progress + 0.04), age: r.age + 1 }))
        .filter((r) => r.age < 80);

      // ── Choose block set ──
      const activeBlocks = isGroupedRef.current ? groupedBlocksRef.current : randomBlocksRef.current;

      // ── Project & sort blocks ──
      const sorted = activeBlocks
        .map((b) => {
          const cosLat = Math.cos(b.lat);
          return { ...b, x: cosLat * Math.sin(b.lng + rot), y: Math.sin(b.lat), z: cosLat * Math.cos(b.lng + rot) };
        })
        .filter((b) => b.z > -0.2)
        .sort((a, b) => a.z - b.z);

      // ── Draw blocks with glow ──
      let nearestDistSq = 20 * 20;
      let nearestKey = "";

      for (const b of sorted) {
        const sx = cx + b.x * radius;
        const sy = cy - b.y * radius;
        const depth = (b.z + 1) / 2;
        const scale = 0.5 + depth * 0.5;
        const size = blockSize * scale;
        const alpha = b.opacity * (0.3 + depth * 0.7);

        const dx = mouse.x - sx;
        const dy = mouse.y - sy;
        const distSq = dx * dx + dy * dy;
        const isGlowing = isOverGlobe && distSq < GLOW_SQ;

        if (isGlowing) {
          const intensity = 1 - Math.sqrt(distSq) / GLOW_RADIUS;
          ctx.save();
          ctx.shadowColor = `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${0.9 * intensity})`;
          ctx.shadowBlur = 14 * intensity;
          ctx.fillStyle = `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${Math.min(1, alpha + 0.4 * intensity)})`;
          const gs = size * (1 + 0.4 * intensity);
          ctx.beginPath();
          ctx.roundRect(sx - gs / 2, sy - gs / 2, gs, gs, 1.5);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${alpha})`;
          ctx.beginPath();
          ctx.roundRect(sx - size / 2, sy - size / 2, size, size, 1.5);
          ctx.fill();
        }

        if (isOverGlobe && distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestKey = `${b.lat.toFixed(2)},${b.lng.toFixed(2)}`;
        }
      }

      // ── Report hover knowledge ──
      const items = knowledgeRef.current;
      if (nearestKey && nearestKey !== lastHoveredKeyRef.current) {
        lastHoveredKeyRef.current = nearestKey;
        if (items.length > 0) {
          onHoverKnowledge(items[Math.floor(Math.random() * items.length)]);
        }
      } else if (!nearestKey && lastHoveredKeyRef.current) {
        lastHoveredKeyRef.current = "";
        onHoverKnowledge(null);
      }

      // ── Draw light rays ──
      for (const ray of raysRef.current) {
        const cosLat = Math.cos(ray.targetLat);
        const tx = cosLat * Math.sin(ray.targetLng + rot);
        const ty = Math.sin(ray.targetLat);
        const tz = cosLat * Math.cos(ray.targetLng + rot);
        if (tz > 0) {
          const tSX = cx + tx * radius;
          const tSY = cy - ty * radius;
          const dirX = tx;
          const dirY = -ty;
          const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          const sSX = tSX + (dirX / len) * radius * 1.1;
          const sSY = tSY + (dirY / len) * radius * 1.1;
          const curX = sSX + (tSX - sSX) * ray.progress;
          const curY = sSY + (tSY - sSY) * ray.progress;
          const trailP = Math.max(0, ray.progress - 0.5);
          const trailX = sSX + (tSX - sSX) * trailP;
          const trailY = sSY + (tSY - sSY) * trailP;
          const rayAlpha = ray.progress < 1 ? 0.9 : Math.max(0, 0.9 - (ray.age - 25) * 0.02);
          if (rayAlpha > 0) {
            ctx.save();
            ctx.shadowColor = `rgba(${ray.color[0]},${ray.color[1]},${ray.color[2]},${rayAlpha * 0.6})`;
            ctx.shadowBlur = 6;
            ctx.strokeStyle = `rgba(${ray.color[0]},${ray.color[1]},${ray.color[2]},${rayAlpha})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(trailX, trailY);
            ctx.lineTo(curX, curY);
            ctx.stroke();
            ctx.restore();
          }
          if (ray.progress >= 1) {
            const fa = Math.max(0, 0.8 - (ray.age - 25) * 0.02);
            if (fa > 0) {
              ctx.save();
              ctx.shadowColor = `rgba(${ray.color[0]},${ray.color[1]},${ray.color[2]},${fa * 0.5})`;
              ctx.shadowBlur = 10;
              ctx.fillStyle = `rgba(${ray.color[0]},${ray.color[1]},${ray.color[2]},${fa})`;
              ctx.beginPath();
              ctx.arc(tSX, tSY, 8, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      }

      // ── Draw moon ──
      drawSphere(ctx, moonBlocksRef.current, rot * 1.2, moonCx, moonCy, moonRadius, moonBlockSize);

      // Moon hover overlay
      if (isOverMoon) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.arc(moonCx, moonCy, moonRadius + 2, 0, Math.PI * 2);
        ctx.fill();

        // Lock arch
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(moonCx, moonCy - 14, 6, Math.PI, 0);
        ctx.stroke();

        // Lock body
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.roundRect(moonCx - 8, moonCy - 12, 16, 12, 2);
        ctx.fill();

        // Text
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText("Subscription", moonCx, moonCy + 12);
        ctx.fillText("Required", moonCx, moonCy + 22);
      }

      // ── Rotate ──
      if (!isHoveringGlobeRef.current) {
        angleRef.current += 0.004;
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [width, height, onHoverKnowledge]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
    isHoveringGlobeRef.current = false;
    lastHoveredKeyRef.current = "";
    onHoverKnowledge(null);
  }, [onHoverKnowledge]);

  const handleClick = useCallback(() => {
    if (isHoveringMoonRef.current && onMoonClick) {
      onMoonClick();
      return;
    }
    const items = knowledgeRef.current;
    if (lastHoveredKeyRef.current && items.length > 0) {
      onClickKnowledge(items[Math.floor(Math.random() * items.length)]);
    } else {
      onClickKnowledge(null);
    }
  }, [onClickKnowledge, onMoonClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: isHoveringMoonRef.current ? "pointer" : undefined }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    />
  );
}

/* ── Knowledge Detail Panel ────────────────────────────── */
function KnowledgeDetail({
  knowledge,
  isPreview,
  onVote,
  voteLoading,
  voteResult,
}: {
  knowledge: Knowledge;
  isPreview?: boolean;
  onVote?: (itemId: string, vote: "approve" | "reject") => void;
  voteLoading?: boolean;
  voteResult?: { success: boolean; error?: string; status?: string } | null;
}) {
  const cat = CATEGORIES[knowledge.category] || CATEGORIES.blockchain;
  const isApproved = knowledge.status === "approved";

  return (
    <div className={`rounded-xl p-5 ${isPreview ? "bg-white/5" : "bg-white/10"}`}>
      <div className="flex items-start gap-2">
        <h4 className={`font-bold text-white ${isPreview ? "text-base" : "text-lg"}`}>
          {knowledge.title}
        </h4>
        {isApproved && (
          <span className="mt-0.5 shrink-0 text-[#4B7F52]" title="Approved">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-sm"
          style={{ backgroundColor: `rgb(${cat.color.join(",")})` }}
        />
        <span className="text-xs text-white/50">
          {cat.label} · {knowledge.author}
        </span>
        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
          knowledge.status === "approved"
            ? "bg-[#4B7F52]/30 text-[#4B7F52]"
            : knowledge.status === "rejected"
              ? "bg-red-500/20 text-red-400"
              : "bg-yellow-500/20 text-yellow-400"
        }`}>
          {knowledge.status}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-white/70">{knowledge.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4B7F52" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          <span className="font-bold text-[#4B7F52]">{knowledge.upvotes}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DD6E42" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
          <span className="font-bold text-[#DD6E42]">{knowledge.downvotes}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">Quorum</span>
          <span className={`font-bold ${knowledge.status === "approved" ? "text-[#4B7F52]" : "text-white/70"}`}>
            {knowledge.quorum} / 2
          </span>
        </div>

        {/* Vote buttons */}
        {onVote && knowledge.status === "pending" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => onVote(knowledge.id, "approve")}
              disabled={voteLoading}
              className="rounded-lg bg-[#4B7F52]/20 px-3 py-1.5 text-xs font-bold text-[#4B7F52] transition hover:bg-[#4B7F52]/40 disabled:opacity-40"
            >
              {voteLoading ? "..." : "Approve"}
            </button>
            <button
              onClick={() => onVote(knowledge.id, "reject")}
              disabled={voteLoading}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-400 transition hover:bg-red-500/40 disabled:opacity-40"
            >
              {voteLoading ? "..." : "Reject"}
            </button>
          </div>
        )}
      </div>

      {/* Vote result feedback */}
      {voteResult && (
        <div className={`mt-3 rounded-lg p-2.5 text-xs ${
          voteResult.success
            ? "bg-[#4B7F52]/20 text-[#4B7F52]"
            : "bg-red-500/10 text-red-400"
        }`}>
          {voteResult.success
            ? `Vote recorded — status: ${voteResult.status}`
            : `Error: ${voteResult.error}`}
        </div>
      )}
    </div>
  );
}

/* ── Knowledge Modal ───────────────────────────────────── */
function KnowledgeModal({
  onClose,
  knowledgeItems,
  counts,
  onRefresh,
}: {
  onClose: () => void;
  knowledgeItems: Knowledge[];
  counts: { pending: number; approved: number; rejected: number; total: number };
  onRefresh?: () => void;
}) {
  const { agent, privateKey } = useAgent();
  const [hoveredKnowledge, setHoveredKnowledge] = useState<Knowledge | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [isGrouped, setIsGrouped] = useState(false);
  const [registryFilter, setRegistryFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const globeContainerRef = useRef<HTMLDivElement>(null);

  // Vote state
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteResult, setVoteResult] = useState<{ success: boolean; error?: string; status?: string } | null>(null);

  async function handleVote(itemId: string, vote: "approve" | "reject") {
    if (!privateKey) {
      setVoteResult({ success: false, error: "No agent loaded — load an agent first" });
      return;
    }
    setVoteLoading(true);
    setVoteResult(null);
    try {
      const res = await fetch("/api/spark/approve-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, vote, hederaPrivateKey: privateKey }),
      });
      const result = await res.json();
      setVoteResult({
        success: result.success,
        error: result.error,
        status: result.status,
      });
      if (result.success && onRefresh) {
        setTimeout(onRefresh, 1000);
      }
    } catch (err) {
      setVoteResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
    setVoteLoading(false);
  }
  const [globeSize, setGlobeSize] = useState<{ w: number; h: number } | null>(null);

  // Subscription state
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [subStatus, setSubStatus] = useState<{
    hasAccess: boolean;
    subscription?: { name: string; status: number; active: boolean; paymentCount: number; totalPaid: string; nextPaymentTime: number };
  } | null>(null);
  const [subError, setSubError] = useState<string | null>(null);

  async function checkSubscription() {
    if (!agent?.evmAddress) return;
    setSubLoading(true);
    setSubError(null);
    try {
      const res = await fetch("/api/spark/check-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberAddress: agent.evmAddress }),
      });
      const result = await res.json();
      if (result.success) {
        setSubStatus({ hasAccess: result.hasAccess, subscription: result.subscription });
      } else {
        setSubError(result.error || "Failed to check status");
      }
    } catch (err) {
      setSubError(err instanceof Error ? err.message : String(err));
    }
    setSubLoading(false);
  }

  async function handleSubscribe() {
    if (!agent?.evmAddress) return;
    setSubLoading(true);
    setSubError(null);
    try {
      // Check for existing reusable subscription
      const statusRes = await fetch("/api/subscription/status");
      const statusData = await statusRes.json();
      let reuseIdx = -1;
      if (statusData.success) {
        const allSubs = statusData.subscriptions as { idx: number; name: string; status: string | number; active: boolean }[];
        const myName = `gated-knowledge-${agent.evmAddress.toLowerCase()}`;
        for (const sub of allSubs) {
          if (sub.name.toLowerCase() !== myName) continue;
          const sn = typeof sub.status === "number" ? sub.status : 0;
          if (sn === 0 && sub.active) { reuseIdx = sub.idx; break; }
        }
      }

      if (reuseIdx >= 0) {
        const startRes = await fetch("/api/subscription/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subIdx: reuseIdx }),
        });
        const startResult = await startRes.json();
        if (!startResult.success) throw new Error(startResult.error);
      } else {
        // Create new
        const createRes = await fetch("/api/subscription/subscribe-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: "0x000000000000000000000000000000000079d730",
            name: `gated-knowledge-${agent.evmAddress.toLowerCase()}`,
            amountPerPeriod: "1",
            intervalSeconds: 10,
          }),
        });
        const createResult = await createRes.json();
        if (!createResult.success) throw new Error(createResult.error);

        // Find and start new subscription
        const newStatusRes = await fetch("/api/subscription/status");
        const newStatusData = await newStatusRes.json();
        if (newStatusData.success) {
          const allSubs = newStatusData.subscriptions as { idx: number }[];
          if (allSubs.length > 0) {
            const latestIdx = allSubs[allSubs.length - 1].idx;
            await fetch("/api/subscription/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subIdx: latestIdx }),
            });
          }
        }
      }

      await checkSubscription();
    } catch (err) {
      setSubError(err instanceof Error ? err.message : String(err));
    }
    setSubLoading(false);
  }

  function handleMoonClick() {
    setShowSubPanel(true);
    checkSubscription();
  }

  useEffect(() => {
    const el = globeContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setGlobeSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[80vh] w-[85vw] max-w-[1400px] overflow-hidden rounded-2xl bg-[#2d3f47]/90 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white/50 transition hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Left — Globe (30%) */}
        <div
          ref={globeContainerRef}
          className="flex w-[30%] shrink-0 items-center justify-center border-r border-white/10 p-4"
        >
          {globeSize && globeSize.w > 0 && globeSize.h > 0 && (
            <ModalGlobe
              width={globeSize.w - 32}
              height={globeSize.h - 32}
              isGrouped={isGrouped}
              knowledgeItems={knowledgeItems}
              onHoverKnowledge={setHoveredKnowledge}
              onClickKnowledge={setSelectedKnowledge}
              onMoonClick={handleMoonClick}
            />
          )}
        </div>

        {/* Subscription Panel Overlay */}
        {showSubPanel && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-[#2d3f47] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Gated Knowledge Subscription</h3>
                <button onClick={() => setShowSubPanel(false)} className="text-white/40 transition hover:text-white">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <p className="mt-2 text-sm text-white/50">
                Subscribe to access gated knowledge entries. Payments are automated via Hedera Schedule Service — 1 USDC every 10 seconds.
              </p>

              {!agent?.evmAddress && (
                <p className="mt-4 text-sm text-[#DD6E42]">Load an agent first to subscribe.</p>
              )}

              {/* Status */}
              {subStatus && (
                <div className={`mt-4 rounded-xl p-4 ${subStatus.hasAccess ? "bg-[#4B7F52]/20 border border-[#4B7F52]/40" : "bg-[#DD6E42]/10 border border-[#DD6E42]/30"}`}>
                  <p className={`text-base font-bold ${subStatus.hasAccess ? "text-[#4B7F52]" : "text-[#DD6E42]"}`}>
                    {subStatus.hasAccess ? "ACCESS GRANTED" : "NO ACCESS"}
                  </p>
                  {subStatus.subscription ? (
                    <div className="mt-2 space-y-1 text-xs text-white/60">
                      <p>Status: <span className="font-semibold text-white/80">{subStatus.subscription.status === 1 ? "Pending" : subStatus.subscription.status === 2 ? "Executed" : "Inactive"}</span></p>
                      <p>Active: <span className="font-semibold text-white/80">{subStatus.subscription.active ? "Yes" : "No"}</span></p>
                      <p>Payments: <span className="font-semibold text-white/80">{subStatus.subscription.paymentCount}</span></p>
                      <p>Total Paid: <span className="font-semibold text-white/80">{(Number(subStatus.subscription.totalPaid) / 1e6).toFixed(2)} USDC</span></p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-white/40">No active subscription found.</p>
                  )}
                </div>
              )}

              {subError && (
                <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                  {subError}
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex gap-3">
                <button
                  onClick={checkSubscription}
                  disabled={subLoading || !agent?.evmAddress}
                  className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
                >
                  {subLoading ? "Checking..." : "Check Status"}
                </button>
                <button
                  onClick={handleSubscribe}
                  disabled={subLoading || !agent?.evmAddress}
                  className="rounded-lg bg-[#DD6E42] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#c55e38] disabled:opacity-40"
                >
                  {subLoading ? "Processing..." : "Subscribe (1 USDC / 10s)"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right — Content (70%) */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-6 pb-0">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-white">Knowledge Layer</h3>
            <button
              onClick={() => setIsGrouped(!isGrouped)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                isGrouped
                  ? "bg-[#4B7F52]/80 text-white"
                  : "bg-white/10 text-white/50 hover:bg-white/20"
              }`}
            >
              {isGrouped ? "Grouped" : "Mixed"}
            </button>
            <p className="text-xs text-white/40">
              Hover to preview · Click to pin
            </p>
          </div>

          {/* Legend + Stats row */}
          <div className="flex gap-8">
            {/* Legend */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Categories
              </h4>
              <div className="mt-2 space-y-1.5">
                {Object.entries(CATEGORIES).map(([key, { color, topicId, label }]) => (
                  <div key={key} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: `rgb(${color.join(",")})` }}
                    />
                    <span className="font-medium text-white/80">{label}</span>
                    <span className="font-mono text-xs text-white/30">{topicId}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary count boxes */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total", value: counts.total, color: "text-white", border: "border-white/10", bg: "bg-white/5" },
                { label: "Pending", value: counts.pending, color: "text-yellow-400", border: "border-yellow-400/30", bg: "bg-yellow-400/5" },
                { label: "Approved", value: counts.approved, color: "text-[#4B7F52]", border: "border-[#4B7F52]/30", bg: "bg-[#4B7F52]/10" },
                { label: "Rejected", value: counts.rejected, color: "text-red-400", border: "border-red-400/30", bg: "bg-red-400/5" },
              ].map((s) => (
                <div key={s.label} className={`aspect-square rounded-xl border ${s.border} ${s.bg} flex flex-col items-center justify-center`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-white/40">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Filter tabs + entries */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-6">
            {/* Filter tabs */}
            <div className="flex gap-1.5">
              {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRegistryFilter(f)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    registryFilter === f
                      ? "bg-white/15 text-white border border-white/20"
                      : "bg-white/5 text-white/40 border border-transparent hover:bg-white/10"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Pinned detail */}
            {selectedKnowledge && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                    Pinned Knowledge
                  </span>
                  <button
                    onClick={() => setSelectedKnowledge(null)}
                    className="text-xs text-white/30 transition hover:text-white/60"
                  >
                    Clear
                  </button>
                </div>
                <KnowledgeDetail
                  knowledge={selectedKnowledge}
                  onVote={handleVote}
                  voteLoading={voteLoading}
                  voteResult={voteResult}
                />
              </>
            )}

            {/* Vote result banner */}
            {voteResult && !selectedKnowledge && (
              <div className={`rounded-lg p-2.5 text-xs ${
                voteResult.success
                  ? "bg-[#4B7F52]/20 text-[#4B7F52]"
                  : "bg-red-500/10 text-red-400"
              }`}>
                {voteResult.success
                  ? `Vote recorded — status: ${voteResult.status}`
                  : `Error: ${voteResult.error}`}
              </div>
            )}

            {/* Filtered entries list */}
            {knowledgeItems.length > 0 ? (
              <div className="space-y-2">
                {knowledgeItems
                  .filter((k) => {
                    if (registryFilter === "all") return true;
                    return k.status === registryFilter;
                  })
                  .map((k) => {
                    const cat = CATEGORIES[k.category] || CATEGORIES.blockchain;
                    return (
                      <div
                        key={k.id}
                        className="flex items-center gap-3 rounded-lg bg-white/5 p-3 transition hover:bg-white/10"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: `rgb(${cat.color.join(",")})` }}
                        />
                        <span
                          className="flex-1 cursor-pointer truncate text-sm text-white/80"
                          onClick={() => setSelectedKnowledge(k)}
                        >
                          {k.title}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          k.status === "approved"
                            ? "bg-[#4B7F52]/30 text-[#4B7F52]"
                            : k.status === "rejected"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {k.status}
                        </span>
                        <span className="shrink-0 text-xs text-white/30">
                          {k.upvotes}/{k.downvotes}
                        </span>
                        {k.status === "pending" && (
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              onClick={() => handleVote(k.id, "approve")}
                              disabled={voteLoading}
                              className="rounded-md bg-[#4B7F52]/20 px-2.5 py-1 text-[10px] font-bold text-[#4B7F52] transition hover:bg-[#4B7F52]/40 disabled:opacity-40"
                            >
                              {voteLoading ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => handleVote(k.id, "reject")}
                              disabled={voteLoading}
                              className="rounded-md bg-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-500/40 disabled:opacity-40"
                            >
                              {voteLoading ? "..." : "Reject"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="flex h-20 items-center justify-center text-sm text-white/30">
                No knowledge entries yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Export ────────────────────────────────────────── */
export function KnowledgeLayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [knowledgeItems, setKnowledgeItems] = useState<Knowledge[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Fetch knowledge on mount
  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    fetchKnowledge();
  }, [fetched]);

  async function fetchKnowledge() {
    try {
      const res = await fetch("/api/spark/pending-knowledge");
      const data = await res.json();
      if (data.success) {
        const allItems = [
          ...(data.pending || []),
          ...(data.approved || []),
          ...(data.rejected || []),
        ];
        const mapped: Knowledge[] = allItems.map(
          (item: {
            itemId: string;
            content: string;
            category: string;
            approvals: number;
            rejections: number;
            author: string;
            status: "pending" | "approved" | "rejected";
          }) => ({
            id: item.itemId,
            title: item.content
              ? item.content.length > 60
                ? item.content.slice(0, 60) + "..."
                : item.content
              : `${item.category} entry`,
            description: item.content || "",
            category: item.category,
            upvotes: item.approvals,
            downvotes: item.rejections,
            quorum: item.approvals,
            author: item.author,
            status: item.status,
          })
        );
        setKnowledgeItems(mapped);
        setCounts({
          pending: data.counts?.pending || 0,
          approved: data.counts?.approved || 0,
          rejected: data.counts?.rejected || 0,
          total: allItems.length,
        });
      }
    } catch (err) {
      console.error("Failed to fetch knowledge:", err);
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        className="relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-[#4F6D7A]/50 p-4 transition hover:bg-[#4F6D7A]/60"
        onClick={() => setShowModal(true)}
      >
        <button
          className="absolute top-3 right-3 z-10 text-[#2d3f47]/40 transition hover:text-[#2d3f47]"
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(true);
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          </svg>
        </button>

        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#2d3f47]">
          Knowledge Layer
        </h2>
        <div className="flex flex-1 items-center justify-center">
          {size && <KnowledgeGlobe width={size.w - 24} height={size.h - 90} />}
        </div>
        <div className="flex justify-between text-center">
          <div>
            <p className="text-xs text-[#2d3f47]/50">Total</p>
            <p className="text-lg font-bold text-[#2d3f47]">{counts.total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-[#2d3f47]/50">Approved</p>
            <p className="text-lg font-bold text-[#2d3f47]">{counts.approved.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-[#2d3f47]/50">Pending</p>
            <p className="text-lg font-bold text-[#2d3f47]">{counts.pending.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {showModal && (
        <KnowledgeModal
          onClose={() => setShowModal(false)}
          knowledgeItems={knowledgeItems}
          counts={counts}
          onRefresh={fetchKnowledge}
        />
      )}
    </>
  );
}

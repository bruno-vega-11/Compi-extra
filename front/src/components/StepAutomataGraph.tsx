import { useState, useRef, useMemo } from "react";
import type { GraphNode, GraphLink, ConstructionStep } from "../types";

const NW = 92, NH = 58;

interface Props {
  data: { nodes: GraphNode[]; links: GraphLink[] };
  currentStep: number;
  steps: ConstructionStep[];
  onNodeClick?: (node: any) => void;
}

export function StepAutomataGraph({ data, currentStep, steps }: Props) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const didPan    = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // ── Calcular qué nodos y enlaces están activos hasta el paso actual ─────────
  const { activeNodes, activeLinks, currentNode, currentLink } = useMemo(() => {
    const activeNodes = new Set<string>();
    const activeLinks = new Set<string>();
    let currentNode: string | null = null;
    let currentLink: string | null = null;

    for (const step of steps) {
      if (step.step > currentStep) break;
      if (step.type === "add_state" && step.state_id) {
        activeNodes.add(step.state_id);
        if (step.step === currentStep) currentNode = step.state_id;
      }
      if (step.type === "add_transition" && step.from && step.to) {
        activeLinks.add(`${step.from}-${step.to}-${step.symbol}`);
        if (step.step === currentStep) currentLink = `${step.from}-${step.to}-${step.symbol}`;
      }
      if (step.type === "compute_goto" && step.from) {
        if (step.step === currentStep) currentNode = step.from;
      }
    }

    return { activeNodes, activeLinks, currentNode, currentLink };
  }, [currentStep, steps]);

  // ── Layout (igual que StaticAutomataGraph) ──────────────────────────────────
  const layout = useMemo(() => {
    const { nodes, links } = data;
    const adj: Record<string, string[]> = {};
    nodes.forEach(n => { adj[n.id] = []; });
    links.forEach(l => { adj[l.source]?.push(l.target); });

    const rank: Record<string, number> = {};
    const startId = nodes.find(n => n.isStart)?.id ?? nodes[0]?.id;
    const queue = startId ? [startId] : [];
    if (startId) rank[startId] = 0;
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj[cur] ?? []) {
        if (rank[nb] === undefined) {
          rank[nb] = (rank[cur] ?? 0) + 1;
          queue.push(nb);
        }
      }
    }
    nodes.forEach(n => { if (rank[n.id] === undefined) rank[n.id] = 0; });

    const layers: Record<number, string[]> = {};
    nodes.forEach(n => {
      const r = rank[n.id];
      if (!layers[r]) layers[r] = [];
      layers[r].push(n.id);
    });

    const HGAP = 52, VGAP = 54;
    const pos: Record<string, { x: number; y: number }> = {};
    Object.entries(layers).forEach(([r, ids]) => {
      const totalW = ids.length * NW + (ids.length - 1) * HGAP;
      const startX = Math.max(16, (680 - totalW) / 2);
      ids.forEach((id, i) => {
        pos[id] = { x: startX + i * (NW + HGAP), y: 30 + Number(r) * (NH + VGAP) };
      });
    });

    const maxY = Math.max(...nodes.map(n => pos[n.id]?.y ?? 0)) + NH + 30;
    return { pos, svgH: Math.max(maxY, 200) };
  }, [data]);

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setTransform(t => ({ ...t, scale: Math.min(4, Math.max(0.2, t.scale * factor)) }));
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    isPanning.current = true;
    didPan.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }

  function onMouseUp() { isPanning.current = false; }

  function nodeOpacity(id: string) {
    if (!activeNodes.has(id)) return 0.08;
    if (id === currentNode) return 1;
    return 0.7;
  }

  function nodeStroke(n: GraphNode) {
    if (n.id === currentNode) return { color: "#f59e0b", width: 2 };
    if (!activeNodes.has(n.id)) return { color: "#1e293b", width: 0.5 };
    if (n.isStart)  return { color: "#3b82f6", width: 0.5 };
    if (n.isAccept) return { color: "#22c55e", width: 0.5 };
    return { color: "#334155", width: 0.5 };
  }

  function buildPath(l: GraphLink): { d: string; lx: number; ly: number } {
    const sp = layout.pos[l.source];
    const tp = layout.pos[l.target];
    if (!sp || !tp) return { d: "", lx: 0, ly: 0 };

    const cx1 = sp.x + NW / 2, cy1 = sp.y + NH / 2;
    const cx2 = tp.x + NW / 2, cy2 = tp.y + NH / 2;

    if (l.source === l.target) {
      const cx = sp.x + NW / 2, cy = sp.y;
      return {
        d: `M${cx - 10},${cy} C${cx - 32},${cy - 55} ${cx + 32},${cy - 55} ${cx + 10},${cy}`,
        lx: cx, ly: cy - 48,
      };
    }

    const parallel = data.links.filter(
      ll => (ll.source === l.source && ll.target === l.target) ||
            (ll.source === l.target && ll.target === l.source)
    );
    const pIdx   = parallel.findIndex(ll => ll.source === l.source && ll.target === l.target && ll.symbol === l.symbol);
    const offset = parallel.length > 1 ? (pIdx - (parallel.length - 1) / 2) * 24 : 0;

    const ang  = Math.atan2(cy2 - cy1, cx2 - cx1);
    const sx   = cx1 + Math.cos(ang) * NW / 2;
    const sy   = cy1 + Math.sin(ang) * NH / 2;
    const ang2 = Math.atan2(cy1 - cy2, cx1 - cx2);
    const ex   = cx2 + Math.cos(ang2) * NW / 2;
    const ey   = cy2 + Math.sin(ang2) * NH / 2;

    const dx = ex - sx, dy = ey - sy, len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const mx = (sx + ex) / 2 + nx * offset;
    const my = (sy + ey) / 2 + ny * offset;

    const d = offset !== 0
      ? `M${sx},${sy} Q${mx},${my} ${ex},${ey}`
      : `M${sx},${sy} L${ex},${ey}`;
    return { d, lx: mx, ly: my - 10 };
  }

  function linkKey(l: GraphLink) {
    return `${l.source}-${l.target}-${l.symbol}`;
  }

  function linkOpacity(l: GraphLink) {
    const key = linkKey(l);
    if (!activeLinks.has(key)) return 0.05;
    if (key === currentLink) return 1;
    return 0.6;
  }

  function linkColor(l: GraphLink) {
    const key = linkKey(l);
    const isEps = l.type === "epsilon";
    if (key === currentLink) return "#f59e0b";
    if (!activeLinks.has(key)) return isEps ? "#3b1f6b" : "#1e293b";
    return isEps ? "#7c3aed" : "#475569";
  }

  const { pos, svgH } = layout;

  return (
    <svg
      width="100%"
      viewBox={`0 0 680 ${svgH}`}
      style={{ display: "block", cursor: "grab", userSelect: "none" }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <defs>
        {([
          { id: "step-normal", color: "#64748b" },
          { id: "step-active", color: "#f59e0b" },
          { id: "step-dim",    color: "#1e293b" },
          { id: "step-eps",    color: "#7c3aed" },
        ] as const).map(({ id, color }) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1L9 5L1 9" fill="none" stroke={color}
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>

      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
        {/* Edges */}
        <g>
          {data.links.map((l, i) => {
            const isEps = l.type === "epsilon";
            const { d, lx, ly } = buildPath(l);
            if (!d) return null;
            const key   = linkKey(l);
            const isAct = key === currentLink;
            const marker = isAct ? "url(#step-active)" : isEps ? "url(#step-eps)" : "url(#step-normal)";

            return (
              <g key={i} style={{ opacity: linkOpacity(l), transition: "opacity 0.3s" }}>
                <path
                  d={d}
                  fill="none"
                  stroke={linkColor(l)}
                  strokeWidth={isAct ? 2 : 1}
                  strokeDasharray={isEps ? "4 3" : undefined}
                  markerEnd={marker}
                />
                <text
                  x={lx} y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="10"
                  fontFamily="monospace"
                  fill={isAct ? "#fbbf24" : isEps ? "#7c3aed" : "#64748b"}
                  pointerEvents="none"
                >
                  {l.symbol}
                </text>
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {data.nodes.map(n => {
            const p = pos[n.id];
            if (!p) return null;
            const { color: sc, width: sw } = nodeStroke(n);
            const isActive = activeNodes.has(n.id);
            const isCurrent = n.id === currentNode;
            const fill = isCurrent ? "#2d2005"
              : !isActive ? "#0f172a"
              : n.isStart ? "#1e3a5f"
              : n.isAccept ? "#1a3a2a"
              : "#1e293b";
            const lblColor = isCurrent ? "#fbbf24"
              : !isActive ? "#1e293b"
              : n.isStart ? "#93c5fd"
              : n.isAccept ? "#86efac"
              : "#cbd5e1";

            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                style={{ opacity: nodeOpacity(n.id), transition: "opacity 0.3s", cursor: "default" }}
              >
                <rect width={NW} height={NH} rx={4} fill={fill} stroke={sc} strokeWidth={sw} />
                {n.isAccept && isActive && (
                  <rect x={3} y={3} width={NW - 6} height={NH - 6} rx={2}
                        fill="none" stroke="#22c55e" strokeWidth={0.5} />
                )}
                {isCurrent && (
                  <rect x={-2} y={-2} width={NW + 4} height={NH + 4} rx={6}
                        fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" />
                )}
                <text
                  x={NW / 2}
                  y={n.items?.length ? NH / 2 - 9 : NH / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12"
                  fontWeight="500"
                  fontFamily="monospace"
                  fill={lblColor}
                  pointerEvents="none"
                >
                  {n.label}
                </text>
                {n.items && n.items.length > 0 && isActive && (
                  <text
                    x={NW / 2} y={NH / 2 + 9}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="9"
                    fontFamily="monospace"
                    fill="#475569"
                    pointerEvents="none"
                  >
                    {n.items.length} item{n.items.length !== 1 ? "s" : ""}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
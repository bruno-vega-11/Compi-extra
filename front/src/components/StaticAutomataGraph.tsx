import { useState, useRef, useMemo } from "react";

// Tipados globales consistentes
export interface GraphNode {
  id: string;
  label: string;
  isStart?: boolean;
  isAccept?: boolean;
  items?: any[];
}

export interface GraphLink {
  source: string;
  target: string;
  symbol: string;
  type?: "epsilon" | "real";
}

interface StaticAutomataGraphProps {
  data: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
}

export function StaticAutomataGraph({ data }: StaticAutomataGraphProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef<boolean>(false);
  const didPan = useRef<boolean>(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const NW = 92, NH = 58;

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
  }, [data, NW, NH]); // Agregadas dependencias faltantes para unuseMemo óptimo

  const outTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(data.links.filter(l => l.source === selected).map(l => l.target));
  }, [selected, data.links]);

  function buildPath(l: GraphLink): { d: string; lx: number; ly: number } {
    const sp = layout.pos[l.source], tp = layout.pos[l.target];
    if (!sp || !tp) return { d: "", lx: 0, ly: 0 };
    const cx1 = sp.x + NW / 2, cy1 = sp.y + NH / 2;
    const cx2 = tp.x + NW / 2, cy2 = tp.y + NH / 2;
    
    if (l.source === l.target) {
      const cx = sp.x + NW / 2, cy = sp.y;
      return { d: `M${cx - 10},${cy} C${cx - 32},${cy - 55} ${cx + 32},${cy - 55} ${cx + 10},${cy}`, lx: cx, ly: cy - 48 };
    }
    
    const parallel = data.links.filter(ll =>
      (ll.source === l.source && ll.target === l.target) || (ll.source === l.target && ll.target === l.source)
    );
    const pIdx = parallel.findIndex(ll => ll.source === l.source && ll.target === l.target && ll.symbol === l.symbol);
    const offset = parallel.length > 1 ? (pIdx - (parallel.length - 1) / 2) * 24 : 0;
    const ang = Math.atan2(cy2 - cy1, cx2 - cx1);
    const sx = cx1 + Math.cos(ang) * NW / 2, sy = cy1 + Math.sin(ang) * NH / 2;
    const ang2 = Math.atan2(cy1 - cy2, cx1 - cx2);
    const ex = cx2 + Math.cos(ang2) * NW / 2, ey = cy2 + Math.sin(ang2) * NH / 2;
    const ddx = ex - sx, ddy = ey - sy, len = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    const nx = -ddy / len, ny = ddx / len;
    const mx = (sx + ex) / 2 + nx * offset, my = (sy + ey) / 2 + ny * offset;
    
    return { d: offset !== 0 ? `M${sx},${sy} Q${mx},${my} ${ex},${ey}` : `M${sx},${sy} L${ex},${ey}`, lx: mx, ly: my - 10 };
  }

  return (
    <svg 
      width="100%" 
      viewBox={`0 0 680 ${layout.svgH}`}
      style={{ display: "block", cursor: isPanning.current ? "grabbing" : "grab", userSelect: "none" }}
      onWheel={e => { 
        e.preventDefault(); 
        setTransform(t => ({ ...t, scale: Math.min(4, Math.max(0.2, t.scale * (e.deltaY < 0 ? 1.12 : 0.89))) })); 
      }}
      onMouseDown={e => { 
        if (e.button !== 0) return; 
        e.preventDefault(); // Previene bugs de arrastre nativo en Firefox
        isPanning.current = true; 
        didPan.current = false; 
        lastMouse.current = { x: e.clientX, y: e.clientY }; 
      }}
      onMouseMove={e => {
        if (!isPanning.current) return;
        const dx = e.clientX - lastMouse.current.x; 
        const dy = e.clientY - lastMouse.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
      }}
      onMouseUp={() => { isPanning.current = false; }}
      onMouseLeave={() => { isPanning.current = false; }}
      onClick={() => { if (!didPan.current) setSelected(null); }}
    >
      <defs>
        {([
          { id: "agm-normal", color: "#64748b" }, { id: "agm-hi", color: "#818cf8" },
          { id: "agm-dim", color: "#374151" },    { id: "agm-eps", color: "#a78bfa" },
        ] as const).map(({ id, color }) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1L9 5L1 9" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
        {/* Renderizado de Enlaces (Líneas/Flechas) */}
        <g>
          {data.links.map((l, i) => {
            const isEps = l.type === "epsilon";
            const { d, lx, ly } = buildPath(l);
            if (!d) return null;
            const op = !selected ? 0.8 : l.source === selected ? 1 : 0.08;
            const stroke = !selected ? (isEps ? "#7c3aed" : "#475569") : l.source === selected ? "#818cf8" : "#374151";
            const marker = !selected ? (isEps ? "url(#agm-eps)" : "url(#agm-normal)") : l.source === selected ? "url(#agm-hi)" : "url(#agm-dim)";
            return (
              <g key={i} style={{ opacity: op }} className="transition-opacity duration-150">
                <path d={d} fill="none" stroke={stroke} strokeWidth={!selected ? 1 : l.source === selected ? 1.8 : 0.8}
                  strokeDasharray={isEps ? "4 3" : undefined} markerEnd={marker} />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize="10"
                  fontFamily="monospace" fill={selected && l.source === selected ? "#c4b5fd" : isEps ? "#7c3aed" : "#64748b"} pointerEvents="none">
                  {l.symbol}
                </text>
              </g>
            );
          })}
        </g>
        {/* Renderizado de Nodos (Cajas de Estado) */}
        <g>
          {data.nodes.map(n => {
            const p = layout.pos[n.id];
            if (!p) return null;
            const isOut = outTargets.has(n.id);
            const sc = selected === n.id ? "#818cf8" : isOut ? "#f59e0b" : n.isStart ? "#3b82f6" : n.isAccept ? "#22c55e" : "#334155";
            const sw = selected === n.id ? 2 : isOut ? 1.5 : 0.5;
            const fill = n.isStart ? "#1e3a5f" : n.isAccept ? "#1a3a2a" : "#1e293b";
            const lblColor = n.isStart ? "#93c5fd" : n.isAccept ? "#86efac" : "#cbd5e1";
            const op = !selected ? 1 : n.id === selected || isOut ? 1 : 0.15;
            
            // Verificación segura de que posea ítems válidos para el cálculo de altura
            const hasItems = Array.isArray(n.items) && n.items.length > 0;

            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer", opacity: op }}
                className="transition-opacity duration-150"
                onClick={e => { e.stopPropagation(); if (!didPan.current) setSelected(prev => prev === n.id ? null : n.id); }}>
                <rect width={NW} height={NH} rx={4} fill={fill} stroke={sc} strokeWidth={sw} />
                {n.isAccept && <rect x={3} y={3} width={NW - 6} height={NH - 6} rx={2} fill="none" stroke="#22c55e" strokeWidth={0.5} />}
                
                {/* Texto de Identificador de Estado */}
                <text x={NW / 2} y={hasItems ? NH / 2 - 8 : NH / 2} textAnchor="middle" dominantBaseline="central"
                  fontSize="12" fontWeight="500" fontFamily="monospace" fill={selected === n.id ? "#a5b4fc" : lblColor} pointerEvents="none">
                  {n.label}
                </text>
                
                {/* Contador de Ítems (Sólo si aplica) */}
                {hasItems && (
                  <text x={NW / 2} y={NH / 2 + 10} textAnchor="middle" dominantBaseline="central"
                    fontSize="9" fontFamily="monospace" fill="#64748b" pointerEvents="none">
                    {n.items!.length} item{n.items!.length !== 1 ? "s" : ""}
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
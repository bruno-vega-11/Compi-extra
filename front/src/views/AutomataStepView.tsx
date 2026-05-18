import { useState, useMemo } from "react";
import type { AutomataResponse, AutomataView, GraphNode, GraphLink, ConstructionStep, NFAState, DFAState, LR1State, LALR1State, LR1NFAState, NFATransition, DFATransition } from "../types";

interface Props {
  automata: any;
  view: string;
  zoom: number;
  panX: number;
  panY: number;
}

function stepTypeColor(type: string) {
  if (type === "add_state")       return "text-cyan-400";
  if (type === "add_transition")  return "text-yellow-400";
  if (type === "compute_goto")    return "text-purple-400";
  if (type === "epsilon_closure") return "text-indigo-400";
  return "text-zinc-400";
}

function stepTypeIcon(type: string) {
  if (type === "add_state")       return "◈";
  if (type === "add_transition")  return "→";
  if (type === "compute_goto")    return "⟳";
  if (type === "epsilon_closure") return "ε";
  return "·";
}

function stepTypeLabel(type: string) {
  if (type === "add_state")       return "Nuevo estado";
  if (type === "add_transition")  return "Nueva transición";
  if (type === "compute_goto")    return "Calcular GOTO";
  if (type === "epsilon_closure") return "ε-clausura";
  return type;
}

function itemsPanelLabel(step: ConstructionStep): string {
  if (step.type === "compute_goto")    return "Nodos movidos por GOTO";
  if (step.type === "epsilon_closure") {
    return step.from ? `Items de ${step.is_new ? "nuevo " : ""}I${step.state_id?.slice(1) ?? "?"}` : "Items de I0 (clausura inicial)";
  }
  if (step.type === "add_state")       return "Items del estado";
  return "Items";
}

function GenericIncrementalView({ view, referenceAutomata, targetAutomata, zoom, panX, panY }: { view: string; referenceAutomata: any; targetAutomata: any; zoom: number; panX: number; panY: number; }) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: ConstructionStep[] = targetAutomata?.construction_order ?? [];
  const maxStep  = steps.length - 1;
  const stepInfo = steps[currentStep];

  const leftHighlightedNodes = useMemo(() => {
    if (!stepInfo) return new Set<string>();
    if (view === "lalr1" && stepInfo.state_id) {
      const stateData = targetAutomata.states?.find((s: any) => s.id === stepInfo.state_id);
      if (stateData?.lr1_ids) return new Set<string>(stateData.lr1_ids);
    }
    return new Set<string>(stepInfo.afn_nodes ?? []);
  }, [stepInfo, view, targetAutomata]);

  const builtStates = useMemo(() => {
    const built: any[] = [];
    for (const s of steps) {
      if (s.step > currentStep) break;
      const isNewState = (s.type === "epsilon_closure" && s.is_new === true && s.state_id) || (s.type === "add_state" && s.state_id);
      if (isNewState && s.state_id) {
        if (!built.find(b => b.id === s.state_id)) {
          const fullState = targetAutomata.states?.find((st: any) => st.id === s.state_id);
          built.push({
            id:        s.state_id,
            label:     `I${s.state_id.slice(1)}`,
            items:     s.items ?? [],
            is_start:  s.is_start  ?? fullState?.is_start ?? false,
            is_accept: s.is_accept ?? fullState?.is_accept ?? false,
          });
        }
      }
    }
    return built;
  }, [currentStep, steps, targetAutomata]);

  const builtTransitions = useMemo(() => {
    const trans: { from: string; to: string; symbol: string }[] = [];
    for (const s of steps) {
      if (s.step > currentStep) break;
      if (s.type === "add_transition" && s.from && s.to) {
        trans.push({ from: s.from, to: s.to, symbol: s.symbol ?? "" });
      }
    }
    return trans;
  }, [currentStep, steps]);

  const leftGraphData = useMemo(() => ({
    nodes: (referenceAutomata?.states ?? []).map((s: any) => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
    links: [
      ...(referenceAutomata?.transitions ?? []).map((t: any) => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
      ...(referenceAutomata?.epsilon_transitions ?? []).map((t: any) => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
    ],
  }), [referenceAutomata]);

  const rightGraphData = useMemo(() => ({
    nodes: builtStates.map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
    links: builtTransitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
  }), [builtStates, builtTransitions]);

  const activeRightNodeId = stepInfo?.state_id;
  const activeRightLink = stepInfo?.type === "add_transition" && stepInfo.from && stepInfo.to ? { from: stepInfo.from, to: stepInfo.to, symbol: stepInfo.symbol ?? "" } : null;

  return (
    <div className="flex flex-col gap-3 h-full flex-1">
      <div className="flex items-center gap-3 px-1">
        <button onClick={() => setCurrentStep(s => Math.max(0, s - 1))} disabled={currentStep === 0} className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 disabled:opacity-30">← Anterior</button>
        <div className="flex-1 flex flex-col gap-1">
          <input type="range" min={0} max={maxStep} value={currentStep} onChange={e => setCurrentStep(Number(e.target.value))} className="w-full accent-indigo-400" />
          <div className="flex justify-between text-[10px] text-zinc-600 font-mono"><span>paso {currentStep + 1} / {maxStep + 1}</span></div>
        </div>
        <button onClick={() => setCurrentStep(s => Math.min(maxStep, s + 1))} disabled={currentStep === maxStep} className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 disabled:opacity-30">Siguiente →</button>
      </div>

      {stepInfo && (
        <div className="px-3 py-2 rounded border border-zinc-800 bg-zinc-900 flex items-center gap-3 shrink-0 text-xs">
          <span className={`font-bold ${stepTypeColor(stepInfo.type)}`}>{stepTypeIcon(stepInfo.type)}</span>
          <div className="flex flex-col flex-1 min-w-0">
            <span className={`text-[9px] uppercase tracking-widest ${stepTypeColor(stepInfo.type)}`}>{stepTypeLabel(stepInfo.type)}</span>
            <span className="text-zinc-300 truncate">{stepInfo.description}</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden relative" style={{ flex: "0 0 63%" }}>
          <AFNHighlightGraph data={leftGraphData} highlightedNodes={leftHighlightedNodes} variant="afn" zoom={zoom} panX={panX} panY={panY} />
        </div>

        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden relative h-[45%] min-h-[180px] shrink-0">
            {rightGraphData.nodes.length > 0 ? (
              <AFNHighlightGraph data={rightGraphData} highlightedNodes={leftHighlightedNodes} variant="afd" activeNodeId={activeRightNodeId} activeLink={activeRightLink} zoom={zoom} panX={panX} panY={panY} />
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-zinc-600 font-mono">Inicializando autómata...</div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            {stepInfo?.items && stepInfo.items.length > 0 && (
              <div className="shrink-0">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{itemsPanelLabel(stepInfo)}</p>
                <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
                  {stepInfo.items.map((item, i) => (
                    <div key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/30 border border-indigo-900/40 text-indigo-200">{item}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1 flex-1 overflow-hidden">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest shrink-0">Estados de la Colección ({builtStates.length})</p>
              <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
                {builtStates.map(state => (
                  <div key={state.id} className="rounded border p-2 bg-zinc-900 border-zinc-800 flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-indigo-400">{state.label}</span>
                    {state.is_start && <span className="text-[9px] text-green-600 border border-green-900 rounded px-1">inicio</span>}
                    {state.is_accept && <span className="text-[9px] text-yellow-600 border border-yellow-900 rounded px-1">reducción</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1 shrink-0 max-h-24 overflow-y-auto border-t border-zinc-800 pt-1">
              {steps.map((s, i) => (
                <button key={i} onClick={() => setCurrentStep(i)} className={`text-left px-2 py-0.5 rounded text-[10px] flex items-center gap-2 ${i === currentStep ? "bg-indigo-400/10 text-indigo-300" : "text-zinc-500"}`}>
                  <span className={stepTypeColor(s.type)}>{stepTypeIcon(s.type)}</span>
                  <span className="truncate">{i + 1}. {s.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AutomataStepView({ automata, view, zoom, panX, panY }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  const config = useMemo(() => {
    const v = view.toLowerCase();
    if (v === "afn") return { isIncremental: false, data: automata?.afn };
    if (v === "lr1_afn") return { isIncremental: false, data: automata?.lr1_afn };
    if (v === "afd") return { isIncremental: true, reference: automata?.afn, target: automata?.afd };
    if (v === "lr1") return { isIncremental: true, reference: automata?.lr1_afn, target: automata?.lr1 };
    if (v === "lalr1") return { isIncremental: true, reference: automata?.lr1, target: automata?.lalr1 };
    return null;
  }, [view, automata]);

  if (!config || (!config.data && !config.target)) {
    return <div className="p-6 text-zinc-600 text-xs font-mono">No hay datos mapeados para "{view}".</div>;
  }

  if (config.isIncremental) {
    return <GenericIncrementalView view={view} referenceAutomata={config.reference} targetAutomata={config.target} zoom={zoom} panX={panX} panY={panY} />;
  }

  const steps: ConstructionStep[] = config.data?.construction_order ?? [];
  const maxStep = steps.length - 1;
  const stepInfo = steps[currentStep];

  const standaloneGraphData = {
    nodes: (config.data?.states ?? []).map((s: any) => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
    links: [
      ...(config.data?.transitions ?? []).map((t: any) => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
      ...(config.data?.epsilon_transitions ?? []).map((t: any) => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
    ],
  };

  return (
    <div className="flex flex-col gap-3 h-full flex-1">
      <div className="flex items-center gap-3 px-1">
        <button onClick={() => setCurrentStep(s => Math.max(0, s - 1))} disabled={currentStep === 0} className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 disabled:opacity-30">← Anterior</button>
        <input type="range" min={0} max={maxStep} value={currentStep} onChange={e => setCurrentStep(Number(e.target.value))} className="flex-1 accent-amber-400" />
        <button onClick={() => setCurrentStep(s => Math.min(maxStep, s + 1))} disabled={currentStep === maxStep} className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 disabled:opacity-30">Siguiente →</button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden flex-1 relative">
          <AFNHighlightGraph data={standaloneGraphData} highlightedNodes={new Set(stepInfo?.state_id ? [stepInfo.state_id] : (stepInfo?.from && stepInfo?.to ? [stepInfo.from, stepInfo.to] : []))} variant="afn" zoom={zoom} panX={panX} panY={panY} />
        </div>
        
        <div className="w-80 flex flex-col gap-1 overflow-hidden border-l border-zinc-800 pl-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest shrink-0">Historial de Items</p>
          <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
            {steps.map((s, i) => (
              <button key={i} onClick={() => setCurrentStep(i)} className={`text-left px-2 py-1.5 rounded text-[10px] flex items-center gap-2 ${i === currentStep ? "bg-amber-400/10 text-amber-300" : "text-zinc-500"}`}>
                <span className={stepTypeColor(s.type)}>{stepTypeIcon(s.type)}</span>
                <span className="truncate">{i + 1}. {s.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EL GRAFO SVG SE ALINEA DE FORMA ESTÁTICA Y REACTIVA A LOS SLIDERS ───
export function AFNHighlightGraph({ data, highlightedNodes, variant = "afn", activeNodeId = null, activeLink = null, zoom, panX, panY }: { data: { nodes: GraphNode[]; links: GraphLink[] }; highlightedNodes: Set<string>; variant?: "afn" | "afd"; activeNodeId?: string | null; activeLink?: { from: string; to: string; symbol: string } | null; zoom: number; panX: number; panY: number; }) {
  const NW = 92, NH = 58;

  const layout = useMemo(() => {
    const { nodes, links } = data;
    const adj: Record<string, string[]> = {};
    nodes.forEach(n => { adj[n.id] = []; });
    links.forEach(l => { adj[l.source as string]?.push(l.target as string); });

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

    return { pos, svgH: Math.max(...nodes.map(n => pos[n.id]?.y ?? 0)) + NH + 30 };
  }, [data]);

  function buildPath(l: GraphLink): { d: string; lx: number; ly: number } {
    const sp = layout.pos[l.source as string];
    const tp = layout.pos[l.target as string];
    if (!sp || !tp) return { d: "", lx: 0, ly: 0 };
    const cx1 = sp.x + NW / 2, cy1 = sp.y + NH / 2;
    const cx2 = tp.x + NW / 2, cy2 = tp.y + NH / 2;

    if (l.source === l.target) {
      const cx = sp.x + NW / 2, cy = sp.y;
      return { d: `M${cx-10},${cy} C${cx-32},${cy-55} ${cx+32},${cy-55} ${cx+10},${cy}`, lx: cx, ly: cy - 48 };
    }

    const parallel = data.links.filter(ll => (ll.source === l.source && ll.target === l.target));
    const pIdx   = parallel.findIndex(ll => ll.symbol === l.symbol);
    const offset = parallel.length > 1 ? (pIdx - (parallel.length - 1) / 2) * 24 : 0;

    const ang  = Math.atan2(cy2 - cy1, cx2 - cx1);
    const sx   = cx1 + Math.cos(ang) * NW / 2;
    const sy   = cy1 + Math.sin(ang) * NH / 2;
    const ex   = cx2 + Math.cos(ang + Math.PI) * NW / 2;
    const ey   = cy2 + Math.sin(ang + Math.PI) * NH / 2;
    const dx = ex - sx, dy = ey - sy, len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const mx = (sx + ex) / 2 + nx * offset;
    const my = (sy + ey) / 2 + ny * offset;
    return { d: offset !== 0 ? `M${sx},${sy} Q${mx},${my} ${ex},${ey}` : `M${sx},${sy} L${ex},${ey}`, lx: mx, ly: my - 10 };
  }

  const hasHighlight = highlightedNodes.size > 0;

  return (
    <svg width="100%" height="100%" viewBox={`0 0 680 ${layout.svgH || 300}`} className="select-none pointer-events-none">
      <defs>
        {[{ id: "hl-normal", color: "#334155" }, { id: "hl-active", color: "#818cf8" }, { id: "hl-afd-active", color: "#fbbf24" }].map(m => (
          <marker key={m.id} id={m.id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1L9 5L1 9" fill="none" stroke={m.color} strokeWidth="1.5" />
          </marker>
        ))}
      </defs>

      {/* SE REMOVIERON LOS EVENTOS MOUSE; AHORA LA TRANSFORMACIÓN ES PURA DESDE PROPS */}
      <g 
        transform={`translate(${-panX},${panY}) scale(${zoom})`} 
        style={{ transformOrigin: "340px 120px" }} 
        >
        {data.links.map((l, i) => {
          const { d, lx, ly } = buildPath(l);
          if (!d) return null;

          const isAfdActiveLink = variant === "afd" && activeLink && activeLink.from === l.source && activeLink.to === l.target && activeLink.symbol === l.symbol;
          const isAfnActive = variant === "afn" && highlightedNodes.has(l.source as string) && highlightedNodes.has(l.target as string);
          const isActive = variant === "afd" ? isAfdActiveLink : isAfnActive;

          return (
            <g key={i} style={{ opacity: variant === "afd" ? (isActive ? 1.0 : 0.35) : (hasHighlight ? (isActive ? 1 : 0.06) : 0.5) }}>
              <path d={d} fill="none" stroke={isActive ? "#fbbf24" : "#1e293b"} strokeWidth={isActive ? 2.2 : 0.8} markerEnd={isActive ? "url(#hl-afd-active)" : "url(#hl-normal)"} />
              <text x={lx} y={ly} textAnchor="middle" fontSize="9" className="font-mono fill-zinc-500">{l.symbol}</text>
            </g>
          );
        })}

        {data.nodes.map(n => {
          const p = layout.pos[n.id];
          if (!p) return null;

          const isAfdHighlighted = variant === "afd" && (n.id === activeNodeId || (activeLink && (n.id === activeLink.from || n.id === activeLink.to)));
          const isHighlighted = variant === "afd" ? isAfdHighlighted : highlightedNodes.has(n.id);

          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ opacity: variant === "afd" ? (isHighlighted ? 1.0 : 0.6) : (hasHighlight ? (isHighlighted ? 1 : 0.08) : 0.8) }}>
              <rect width={NW} height={NH} rx={4} fill={isHighlighted ? "#1e1b4b" : "#0f172a"} stroke={isHighlighted ? "#fbbf24" : "#1e293b"} strokeWidth={isHighlighted ? 2 : 0.6} />
              <text x={NW / 2} y={NH / 2} textAnchor="middle" dominantBaseline="central" fontSize="9" className="font-mono fill-zinc-300">{n.label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
import { useState, useMemo, useEffect } from "react";
import type { AutomataResponse, AutomataView as ViewType, GraphNode, GraphLink } from "../types";
import { AUTOMATA_VIEW_LABELS } from "../constans";
import { StaticAutomataGraph } from "../components/Staticautomatagraph";
import { AutomataStepView } from "../views/AutomataStepView";
import { DFAPanel, NFAPanel, LR1Panel, LALR1Panel } from "../views/Automatapanels";

interface Props {
  automata: AutomataResponse;
  view: ViewType;
  setView: (v: ViewType) => void;
  // Recibimos los estados inyectados desde la barra lateral global de App.tsx
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (v: number) => void;
  setPanX: (v: number) => void;
  setPanY: (v: number) => void;
}

function ExploreReasonPanel({ clickedNodes, currentAutomataData }: { clickedNodes: Set<string>; currentAutomataData: any }) {
  if (clickedNodes.size === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11px] text-zinc-600 text-center px-4">
        Haz clic en el nodo inicial para comenzar a explorar
      </div>
    );
  }

  const revealedConnections: any[] = [];
  clickedNodes.forEach(nodeId => {
    const state = (currentAutomataData?.states ?? []).find((s: any) => s.id === nodeId);
    if (!state) return;
    (state.connections ?? []).forEach((conn: any) => {
      revealedConnections.push({
        fromLabel: state.label,
        toLabel:   conn.to_label   ?? conn.to,
        symbol:    conn.symbol,
        type:      conn.type       ?? "real",
        reason:    conn.reason     ?? "",
      });
    });
  });

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest shrink-0 mb-1">
        Conexiones reveladas ({revealedConnections.length})
      </p>
      {revealedConnections.map((c, i) => (
        <div key={i} className={`rounded border p-2 flex flex-col gap-1 ${c.type === "epsilon" ? "border-purple-900/50 bg-purple-950/20" : "border-zinc-800 bg-zinc-900"}`}>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-mono text-indigo-300 truncate">{c.fromLabel}</span>
            <span className={`text-[10px] font-bold px-1 rounded ${c.type === "epsilon" ? "text-purple-400" : "text-yellow-400"}`}>
              {c.type === "epsilon" ? "─ε→" : `─${c.symbol}→`}
            </span>
            <span className="text-[10px] font-mono text-green-300 truncate">{c.toLabel}</span>
          </div>
          {c.reason && <p className="text-[10px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-1 mt-0.5">{c.reason}</p>}
        </div>
      ))}
    </div>
  );
}

export function AutomataView({ automata, view, setView, zoom, panX, panY, setZoom, setPanX, setPanY }: Props) {
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const [stepMode, setStepMode] = useState(false);
  const [exploreMode, setExploreMode] = useState(false);
  const [clickedNodes, setClickedNodes] = useState<Set<string>>(new Set());

  const { afd: dfa, afn: nfa } = automata;

  const currentAutomataData = useMemo(() => {
    if (view === "afn") return automata.afn;
    if (view === "lr1_afn") return automata.lr1_afn;
    if (view === "lr1") return automata.lr1;
    if (view === "lalr1") return automata.lalr1;
    return automata.afd;
  }, [view, automata]);

  useEffect(() => {
    setClickedNodes(new Set());
    // Reiniciar los valores de cámara del padre al cambiar de tipo de autómata
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, [view, automata, setZoom, setPanX, setPanY]);

  const graphData: { nodes: GraphNode[]; links: GraphLink[] } = useMemo(() => {
    if (view === "afn") {
      return {
        nodes: (nfa.states ?? []).map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
        links: [
          ...(nfa.transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
          ...(nfa.epsilon_transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
        ],
      };
    }
    if (view === "lr1_afn" && automata.lr1_afn) {
      return {
        nodes: (automata.lr1_afn.states ?? []).map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
        links: [
          ...(automata.lr1_afn.transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
          ...(automata.lr1_afn.epsilon_transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
        ],
      };
    }
    if (view === "lr1" && automata.lr1) {
      return {
        nodes: (automata.lr1.states ?? []).map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept, items: s.items.map((i: any) => i.label) })),
        links: (automata.lr1.transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
      };
    }
    if (view === "lalr1" && automata.lalr1) {
      return {
        nodes: (automata.lalr1.states ?? []).map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept, items: s.items.map((i: any) => i.label) })),
        links: (automata.lalr1.transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
      };
    }
    return {
      nodes: (dfa.states ?? []).map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept, items: (s.items ?? []).map((i: any) => i.label) })),
      links: (dfa.transitions ?? []).map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
    };
  }, [view, automata]);

  const visibleGraphData = useMemo(() => {
    if (!exploreMode) return graphData;
    const startNode = graphData.nodes.find(n => n.isStart);
    const allowedNodeIds = new Set<string>();
    const allowedLinks = new Set<string>();
    if (startNode) allowedNodeIds.add(startNode.id);

    clickedNodes.forEach(nodeId => {
      graphData.links.forEach(link => {
        const sourceId = typeof link.source === 'object' && link.source !== null ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' && link.target !== null ? (link.target as any).id : link.target;
        if (sourceId === nodeId) {
          allowedLinks.add(`${sourceId}-${targetId}-${link.symbol}`);
          allowedNodeIds.add(targetId);
        }
      });
    });

    return {
      nodes: graphData.nodes.filter(n => allowedNodeIds.has(n.id)),
      links: graphData.links.filter(link => {
        const sourceId = typeof link.source === 'object' && link.source !== null ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' && link.target !== null ? (link.target as any).id : link.target;
        return allowedLinks.has(`${sourceId}-${targetId}-${link.symbol}`);
      }),
    };
  }, [graphData, clickedNodes, exploreMode]);

  const handleNodeClick = (node: any) => {
    if (!exploreMode) return;
    const nodeId = typeof node === 'object' && node !== null ? node.id : node;
    setClickedNodes(prev => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  };

  const statCount  = exploreMode ? visibleGraphData.nodes.length : graphData.nodes.length;
  const transCount = exploreMode ? visibleGraphData.links.length : graphData.links.length;
  const canStepMode = ["afd", "afn", "lr1_afn", "lr1", "lalr1"].includes(view);

  return (
    <div className="p-4 flex flex-col gap-3 h-full relative">
      
      {/* ── CABECERA LIMPIA (Los sliders ya no están estorbando aquí) ── */}
      <div className="flex items-center gap-4 flex-wrap border-b border-zinc-800 pb-2">
        <div className="flex gap-1">
          {(["afd", "afn", "lr1_afn", "lr1", "lalr1"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setExpandedState(null); setStepMode(false); setExploreMode(false); }}
              className={`px-3 py-1.5 text-xs rounded transition-all ${view === v ? "bg-purple-400/20 text-purple-400 border border-purple-400/40" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}
            >
              {AUTOMATA_VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-zinc-600 font-mono">
          {statCount} estados · {transCount} transiciones
        </span>

        {!stepMode && (
          <button
            onClick={() => { setExploreMode(e => !e); setStepMode(false); setClickedNodes(new Set()); }}
            className={`ml-auto px-3 py-1.5 text-xs rounded border transition-all ${exploreMode ? "bg-indigo-400/10 border-indigo-400/40 text-indigo-400" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
          >
            {exploreMode ? "Explorando..." : "Explorar Grafo"}
          </button>
        )}

        {canStepMode && (
          <button
            onClick={() => { setStepMode(s => !s); setExploreMode(false); }}
            className={`px-3 py-1.5 text-xs rounded border transition-all ${stepMode ? "ml-auto bg-amber-400/10 border-amber-400/40 text-amber-400 font-bold" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
          >
            {stepMode ? "Ver Grafo Completo" : "Paso a paso"}
          </button>
        )}
      </div>

      {exploreMode && (
        <p className="text-[11px] text-indigo-400/80 tracking-wide bg-indigo-950/20 border border-indigo-500/20 px-3 py-1 rounded">
          ✨ <strong>Modo Exploración:</strong> Haz clic en los nodos para revelar sus transiciones y ver por qué se conectan.
        </p>
      )}

      {/* Espacio de trabajo principal */}
      <div className="flex-1 flex min-h-0 relative">
        {stepMode && canStepMode ? (
          <AutomataStepView automata={automata} view={view} zoom={zoom} panX={panX} panY={panY} />
        ) : (
          <div className="flex gap-3 flex-1 min-h-0 w-full relative">
            
            {/* Contenedor del Grafo Estático */}
            <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden relative" style={{ flex: "0 0 63%" }}>
              <StaticAutomataGraph
                key={view + (exploreMode ? "-explore" : "-full")}
                data={exploreMode ? visibleGraphData : graphData}
                onNodeClick={handleNodeClick}
                zoom={zoom}
                panX={panX}
                panY={panY}
              />
            </div>

            <div className="flex flex-col flex-1 gap-2 overflow-hidden">
              {exploreMode ? (
                <ExploreReasonPanel clickedNodes={clickedNodes} currentAutomataData={currentAutomataData} />
              ) : (
                <>
                  {view === "afd" && <DFAPanel automata={automata} expandedState={expandedState} setExpandedState={setExpandedState} />}
                  {(view === "afn" || view === "lr1_afn") && <NFAPanel view={view} automata={automata} />}
                  {view === "lr1" && automata.lr1 && <LR1Panel automata={automata} expandedState={expandedState} setExpandedState={setExpandedState} />}
                  {view === "lalr1" && automata.lalr1 && <LALR1Panel automata={automata} expandedState={expandedState} setExpandedState={setExpandedState} />}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
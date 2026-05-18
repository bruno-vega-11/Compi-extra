import { useState, useMemo } from "react";
import type { AutomataResponse, AutomataView, GraphNode, GraphLink } from "../types";
import { AUTOMATA_VIEW_LABELS } from "../constans";
import { StaticAutomataGraph } from "../components/Staticautomatagraph";
import { DFAPanel, NFAPanel, LR1Panel, LALR1Panel } from "../views/Automatapanels";

interface Props {
  automata: AutomataResponse;
  view: AutomataView;
  setView: (v: AutomataView) => void;
}

export function AutomataView({ automata, view, setView }: Props) {
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const { afd: dfa, afn: nfa } = automata;

  if (!dfa?.states || !nfa?.states) {
    return (
      <div className="p-6 text-red-400 text-xs">
        ✗ La respuesta del servidor no tiene el formato esperado.
        Verifica que <code>/grammar/automata/all</code> devuelva{" "}
        <code>{"{ afn, afd, lr1, lalr1 }"}</code>.
      </div>
    );
  }

  const graphData: { nodes: GraphNode[]; links: GraphLink[] } = useMemo(() => {
    if (view === "afn") {
      return {
        nodes: nfa.states.map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
        links: [
          ...nfa.transitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
          ...nfa.epsilon_transitions.map(t => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
        ],
      };
    }
    if (view === "lr1_afn" && automata.lr1_afn) {
      return {
        nodes: automata.lr1_afn.states.map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept })),
        links: [
          ...automata.lr1_afn.transitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
          ...automata.lr1_afn.epsilon_transitions.map(t => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
        ],
      };
    }
    if (view === "lr1" && automata.lr1) {
      return {
        nodes: automata.lr1.states.map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept, items: s.items.map(i => i.label) })),
        links: automata.lr1.transitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
      };
    }
    if (view === "lalr1" && automata.lalr1) {
      return {
        nodes: automata.lalr1.states.map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept, items: s.items.map(i => i.label) })),
        links: automata.lalr1.transitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
      };
    }
    // default: LR(0) DFA
    return {
      nodes: dfa.states.map(s => ({ id: s.id, label: s.label, isStart: s.is_start, isAccept: s.is_accept, items: s.items.map(i => i.label) })),
      links: dfa.transitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
    };
  }, [view, automata]);

  const statCount  = graphData.nodes.length;
  const transCount = graphData.links.length;

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {(["afd", "afn", "lr1_afn", "lr1", "lalr1"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setExpandedState(null); }}
              className={`px-4 py-1.5 text-xs rounded transition-all ${
                view === v
                  ? "bg-purple-400/20 text-purple-400 border border-purple-400/40"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {AUTOMATA_VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">
          {statCount} estados · {transCount} transiciones
          {view === "afn" && ` (${nfa.epsilon_transitions.length} ε)`}
          {view === "lr1_afn" && automata.lr1_afn && ` (${automata.lr1_afn.epsilon_transitions.length} ε)`}
          {view === "lalr1" && automata.lalr1 && (
            <span className="ml-2 text-zinc-700">
              fusionado desde {automata.lr1?.states.length ?? "?"} estados LR(1)
            </span>
          )}
        </span>
      </div>

      <div className="flex gap-3" style={{ height: 520 }}>
        <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden" style={{ flex: "0 0 63%" }}>
          <StaticAutomataGraph key={view} data={graphData} />
        </div>

        <div className="flex flex-col flex-1 gap-2 overflow-hidden">
          {view === "afd" && (
            <DFAPanel automata={automata} expandedState={expandedState} setExpandedState={setExpandedState} />
          )}
          {(view === "afn" || view === "lr1_afn") && (
            <NFAPanel view={view} automata={automata} />
          )}
          {view === "lr1" && automata.lr1 && (
            <LR1Panel automata={automata} expandedState={expandedState} setExpandedState={setExpandedState} />
          )}
          {view === "lalr1" && automata.lalr1 && (
            <LALR1Panel automata={automata} expandedState={expandedState} setExpandedState={setExpandedState} />
          )}
        </div>
      </div>
    </div>
  );
}
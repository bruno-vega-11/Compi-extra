import { useState } from "react";
import type { AutomataResponse, GraphNode, GraphLink } from "../types/parser";
import { StaticAutomataGraph } from "./StaticAutomataGraph";

interface AutomataViewProps {
  automata: AutomataResponse;
  view: "afd" | "afn";
  setView: (v: "afd" | "afn") => void;
}

export function AutomataView({ automata, view, setView }: AutomataViewProps) {
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const { afd: dfa, afn: nfa } = automata;

  if (!dfa?.states || !nfa?.states) {
    return <div className="p-6 text-red-400 text-xs">✗ Respuesta del servidor inválida.</div>;
  }

  // Mapeo de datos para el grafo según la vista activa (DFA o NFA)
  const graphData: { nodes: GraphNode[]; links: GraphLink[] } = view === "afd"
    ? {
        nodes: dfa.states.map((s) => ({
          id: s.id,
          label: s.label,
          isStart: s.is_start,
          isAccept: s.is_accept,
          items: s.items // Mantenemos el objeto completo para que el JSX acceda a .label
        })),
        links: dfa.transitions.map((t) => ({
          source: t.from,
          target: t.to,
          symbol: t.symbol,
          type: "real" as const
        })),
      }
    : {
        nodes: nfa.states.map((s) => ({
          id: s.id,
          label: s.label,
          isStart: s.is_start,
          isAccept: s.is_accept
        })),
        links: [
          ...nfa.transitions.map((t) => ({
            source: t.from,
            target: t.to,
            symbol: t.symbol,
            type: "real" as const
          })),
          ...nfa.epsilon_transitions.map((t) => ({
            source: t.from,
            target: t.to,
            symbol: "ε",
            type: "epsilon" as const
          })),
        ],
      };

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Selectores de pestaña superior (AFD / AFN) */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {(["afd", "afn"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setExpandedState(null); }}
              className={`px-4 py-1.5 text-xs rounded transition-all ${
                view === v 
                  ? "bg-purple-400/20 text-purple-400 border border-purple-400/40" 
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">
          {view === "afd"
            ? `${dfa.states.length} estados · ${dfa.transitions.length} transiciones`
            : `${nfa.states.length} items · ${nfa.transitions.length + nfa.epsilon_transitions.length} transiciones`}
        </span>
      </div>

      {/* Contenedor principal del Grafo y el Panel Lateral */}
      <div className="flex gap-3" style={{ height: 520 }}>
        {/* Lado Izquierdo: Renderizado del Grafo */}
        <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden" style={{ flex: "0 0 63%" }}>
          <StaticAutomataGraph key={view} data={graphData} />
        </div>

        {/* Lado Derecho: Desglose de información en texto */}
        <div className="flex flex-col flex-1 gap-2 overflow-hidden">
          {view === "afd" && (
            <>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest flex-shrink-0">Estados DFA</p>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                {dfa.states.map((state) => {
                  const isSelected = expandedState === state.id;
                  const trans = dfa.transitions.filter((t) => t.from === state.id);
                  return (
                    <div
                      key={state.id}
                      onClick={() => setExpandedState((prev) => prev === state.id ? null : state.id)}
                      className={`rounded border p-2.5 cursor-pointer transition-all ${
                        isSelected ? "border-purple-400/50 bg-purple-400/5" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${state.is_start ? "text-green-400" : state.is_accept ? "text-yellow-400" : "text-purple-400"}`}>
                          {state.label}
                        </span>
                        {state.is_start && <span className="text-[10px] text-green-600 border border-green-900 rounded px-1">inicio</span>}
                        {state.is_accept && <span className="text-[10px] text-yellow-600 border border-yellow-900 rounded px-1">accept</span>}
                        <span className="ml-auto text-[10px] text-zinc-600">{isSelected ? "▲" : "▼"}</span>
                      </div>
                      
                      {trans.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                          {trans.map((t, i) => (
                            <span key={i} className="text-[10px] font-mono">
                              <span className="text-yellow-400">{t.symbol}</span>
                              <span className="text-zinc-600">→</span>
                              <span className="text-purple-400">{dfa.states.find((s) => s.id === t.to)?.label ?? t.to}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {isSelected && state.items && (
                        <div className="mt-2 pt-2 border-t border-zinc-800 flex flex-col gap-0.5">
                          {state.items.map((item, i) => (
                            <div key={i} className="text-[10px] font-mono text-zinc-300 leading-relaxed">
                              {item.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 text-[10px] text-zinc-600 flex-shrink-0 pt-1">
                <span><span className="text-green-400">■</span> Inicio</span>
                <span><span className="text-yellow-400">■</span> Accept</span>
                <span><span className="text-purple-400">■</span> Intermedio</span>
              </div>
            </>
          )}

          {view === "afn" && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
              {/* Transiciones Reales */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Transiciones reales ({nfa.transitions.length})</p>
                <div className="flex flex-col gap-0.5">
                  {nfa.transitions.map((t, i) => {
                    const fl = nfa.states.find((s) => s.id === t.from)?.label ?? t.from;
                    const tl = nfa.states.find((s) => s.id === t.to)?.label ?? t.to;
                    return (
                      <div key={i} className="text-[10px] font-mono">
                        <span className="text-zinc-400">[{fl}]</span>
                        <span className="text-yellow-400 mx-1">─{t.symbol}→</span>
                        <span className="text-zinc-400">[{tl}]</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transiciones Epsilon */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Transiciones ε ({nfa.epsilon_transitions.length})</p>
                <div className="flex flex-col gap-0.5">
                  {nfa.epsilon_transitions.map((t, i) => {
                    const fl = nfa.states.find((s) => s.id === t.from)?.label ?? t.from;
                    const tl = nfa.states.find((s) => s.id === t.to)?.label ?? t.to;
                    return (
                      <div key={i} className="text-[10px] font-mono">
                        <span className="text-zinc-500">[{fl}]</span>
                        <span className="text-purple-400 mx-1">─ε→</span>
                        <span className="text-zinc-500">[{tl}]</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Items de Aceptación (Añadido para completar el diseño original) */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Items de aceptación ({nfa.accept_states.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {nfa.accept_states.map((id) => {
                    const state = nfa.states.find((s) => s.id === id);
                    return (
                      <span key={id} className="text-[10px] bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 px-2 py-0.5 rounded font-mono">
                        {state?.label ?? id}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
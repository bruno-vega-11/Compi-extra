import type { AutomataResponse, AutomataView } from "../types";

// ─── LR(0) DFA Panel ─────────────────────────────────────────────────────────

export function DFAPanel({
  automata,
  expandedState,
  setExpandedState,
}: {
  automata: AutomataResponse;
  expandedState: string | null;
  setExpandedState: (id: string | null) => void;
}) {
  const { afd: dfa } = automata;
  return (
    <>
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest shrink-0">Estados LR(0) DFA</p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
        {dfa.states.map((state) => {
          const isSelected = expandedState === state.id;
          const trans = dfa.transitions.filter(t => t.from === state.id);
          return (
            <div
              key={state.id}
              onClick={() => setExpandedState(isSelected ? null : state.id)}
              className={`rounded border p-2.5 cursor-pointer transition-all ${
                isSelected ? "border-purple-400/50 bg-purple-400/5" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${
                  state.is_start ? "text-green-400" : state.is_accept ? "text-yellow-400" : "text-purple-400"
                }`}>{state.label}</span>
                {state.is_start  && <span className="text-[10px] text-green-600 border border-green-900 rounded px-1">inicio</span>}
                {state.is_accept && <span className="text-[10px] text-yellow-600 border border-yellow-900 rounded px-1">accept</span>}
                <span className="ml-auto text-[10px] text-zinc-600">{isSelected ? "▲" : "▼"}</span>
              </div>
              {trans.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                  {trans.map((t, i) => (
                    <span key={i} className="text-[10px] font-mono">
                      <span className="text-yellow-400">{t.symbol}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-purple-400">
                        {dfa.states.find(s => s.id === t.to)?.label ?? t.to}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {isSelected && (
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
      <div className="flex gap-3 text-[10px] text-zinc-600 shrink-0 pt-1">
        <span><span className="text-green-400">■</span> Inicio</span>
        <span><span className="text-yellow-400">■</span> Accept</span>
        <span><span className="text-purple-400">■</span> Intermedio</span>
      </div>
    </>
  );
}

// ─── NFA Panel (LR0 and LR1) ─────────────────────────────────────────────────

export function NFAPanel({
  view,
  automata,
}: {
  view: AutomataView;
  automata: AutomataResponse;
}) {
  const isLR1NFA = view === "lr1_afn";
  const nfa = isLR1NFA ? automata.lr1_afn : automata.afn;

  const lookup = (id: string) => nfa.states.find(s => s.id === id)?.label ?? id;

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
      <div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
          Transiciones reales ({nfa.transitions.length})
        </p>
        <div className="flex flex-col gap-0.5">
          {nfa.transitions.map((t, i) => (
            <div key={i} className="text-[10px] font-mono">
              <span className="text-zinc-400 truncate max-w-30 inline-block align-bottom">[{lookup(t.from)}]</span>
              <span className="text-yellow-400 mx-1">─{t.symbol}→</span>
              <span className="text-zinc-400 truncate max-w-30 inline-block align-bottom">[{lookup(t.to)}]</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
          Transiciones ε ({nfa.epsilon_transitions.length})
        </p>
        <div className="flex flex-col gap-0.5">
          {nfa.epsilon_transitions.map((t, i) => (
            <div key={i} className="text-[10px] font-mono">
              <span className="text-zinc-500 truncate max-w-30 inline-block align-bottom">[{lookup(t.from)}]</span>
              <span className="text-purple-400 mx-1">─ε→</span>
              <span className="text-zinc-500 truncate max-w-30 inline-block align-bottom">[{lookup(t.to)}]</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
          Items de aceptación ({nfa.accept_states.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {nfa.accept_states.map(id => {
            const state = nfa.states.find(s => s.id === id);
            return (
              <span key={id} className="text-[10px] bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 px-2 py-0.5 rounded font-mono">
                {state?.label ?? id}
              </span>
            );
          })}
        </div>
      </div>
      {isLR1NFA && (
        <div className="flex gap-3 text-[10px] text-zinc-600 shrink-0 pt-1 border-t border-zinc-800">
          <span><span className="text-yellow-400">─→</span> Real</span>
          <span><span className="text-purple-400">─ε→</span> Épsilon</span>
          <span><span className="text-yellow-300">■</span> Reducción</span>
          <span><span className="text-orange-400">■</span> Lookahead</span>
        </div>
      )}
    </div>
  );
}

// ─── LR(1) Panel ─────────────────────────────────────────────────────────────

export function LR1Panel({
  automata,
  expandedState,
  setExpandedState,
}: {
  automata: AutomataResponse;
  expandedState: string | null;
  setExpandedState: (id: string | null) => void;
}) {
  const lr1 = automata.lr1;
  return (
    <>
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest shrink-0">
        Estados LR(1) — {lr1.states.length} estados
      </p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
        {lr1.states.map((state) => {
          const isSelected = expandedState === state.id;
          const trans = lr1.transitions.filter(t => t.from === state.id);
          return (
            <div
              key={state.id}
              onClick={() => setExpandedState(isSelected ? null : state.id)}
              className={`rounded border p-2.5 cursor-pointer transition-all ${
                isSelected ? "border-purple-400/50 bg-purple-400/5" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${
                  state.is_start ? "text-green-400" : state.is_accept ? "text-yellow-400" : "text-purple-400"
                }`}>{state.label}</span>
                {state.is_start  && <span className="text-[10px] text-green-600 border border-green-900 rounded px-1">inicio</span>}
                {state.is_accept && <span className="text-[10px] text-yellow-600 border border-yellow-900 rounded px-1">accept</span>}
                <span className="text-[10px] text-zinc-600 ml-auto">{state.items.length} items</span>
                <span className="text-[10px] text-zinc-600">{isSelected ? "▲" : "▼"}</span>
              </div>
              {trans.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                  {trans.map((t, i) => (
                    <span key={i} className="text-[10px] font-mono">
                      <span className="text-yellow-400">{t.symbol}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-purple-400">
                        {lr1.states.find(s => s.id === t.to)?.label ?? t.to}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-zinc-800 flex flex-col gap-0.5">
                  {state.items.map((item, i) => {
                    const commaIdx = item.label.lastIndexOf(",");
                    const itemPart = commaIdx >= 0 ? item.label.slice(0, commaIdx) : item.label;
                    const laPart   = commaIdx >= 0 ? item.label.slice(commaIdx) : "";
                    return (
                      <div key={i} className="text-[10px] font-mono leading-relaxed">
                        <span className={item.completed ? "text-yellow-300" : "text-zinc-300"}>{itemPart}</span>
                        <span className="text-orange-400">{laPart}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[10px] text-zinc-600 shrink-0 pt-1">
        <span><span className="text-zinc-300">■</span> Item</span>
        <span><span className="text-yellow-300">■</span> Reducción</span>
        <span><span className="text-orange-400">■</span> Lookahead</span>
      </div>
    </>
  );
}

// ─── LALR(1) Panel ───────────────────────────────────────────────────────────

export function LALR1Panel({
  automata,
  expandedState,
  setExpandedState,
}: {
  automata: AutomataResponse;
  expandedState: string | null;
  setExpandedState: (id: string | null) => void;
}) {
  const lalr1 = automata.lalr1;
  return (
    <>
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest shrink-0">
        Estados LALR(1) — {lalr1.states.length} estados
      </p>
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
        {lalr1.states.map((state) => {
          const isSelected = expandedState === state.id;
          const trans = lalr1.transitions.filter(t => t.from === state.id);
          return (
            <div
              key={state.id}
              onClick={() => setExpandedState(isSelected ? null : state.id)}
              className={`rounded border p-2.5 cursor-pointer transition-all ${
                isSelected ? "border-purple-400/50 bg-purple-400/5" : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${
                  state.is_start ? "text-green-400" : state.is_accept ? "text-yellow-400" : "text-purple-400"
                }`}>{state.label}</span>
                {state.is_start  && <span className="text-[10px] text-green-600 border border-green-900 rounded px-1">inicio</span>}
                {state.is_accept && <span className="text-[10px] text-yellow-600 border border-yellow-900 rounded px-1">accept</span>}
                {state.lr1_ids?.length > 1 && (
                  <span className="text-[10px] text-zinc-600 border border-zinc-800 rounded px-1">
                    fusiona {state.lr1_ids.length}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600 ml-auto">{isSelected ? "▲" : "▼"}</span>
              </div>
              {trans.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                  {trans.map((t, i) => (
                    <span key={i} className="text-[10px] font-mono">
                      <span className="text-yellow-400">{t.symbol}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-purple-400">
                        {lalr1.states.find(s => s.id === t.to)?.label ?? t.to}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-zinc-800 flex flex-col gap-1">
                  {state.lr1_ids && (
                    <div className="text-[10px] text-zinc-600 mb-1">
                      Fusiona: <span className="text-zinc-500">{state.lr1_ids.join(", ")}</span>
                    </div>
                  )}
                  {state.items.map((item, i) => {
                    const commaIdx = item.label.lastIndexOf(",");
                    const itemPart = commaIdx >= 0 ? item.label.slice(0, commaIdx) : item.label;
                    const laPart   = commaIdx >= 0 ? item.label.slice(commaIdx) : "";
                    return (
                      <div key={i} className="text-[10px] font-mono leading-relaxed">
                        <span className={item.completed ? "text-yellow-300" : "text-zinc-300"}>{itemPart}</span>
                        <span className="text-orange-400">{laPart}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[10px] text-zinc-600 shrink-0 pt-1">
        <span><span className="text-zinc-300">■</span> Item</span>
        <span><span className="text-yellow-300">■</span> Reducción</span>
        <span><span className="text-orange-400">■</span> Lookaheads</span>
      </div>
    </>
  );
}
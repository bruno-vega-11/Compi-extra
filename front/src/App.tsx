import { useState, useRef, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParserMethod = "recursive-descent" | "ll1" | "lr0" | "slr1" | "lalr1" | "lr1";

interface RDParseStep {
  step_number: number;
  action: "call" | "check" | "match" | "epsilon" | "success" | "error";
  description: string;
  current_token: string;
  remaining_input: string[];
  production_used?: string;
}

interface RDParseResult {
  is_valid: boolean;
  parse_tree: object | null;
  steps: RDParseStep[];
  error_message: string | null;
  tokens_consumed: number;
  total_tokens: number;
}

interface RDApiResponse {
  method: string;
  grammar: GrammarInfo;
  generated_functions?: { function_name: string; cases: { production: string; triggered_by_tokens: string[] }[] }[];
  result: RDParseResult;
}

interface SLRParseStep {
  step_number: number;
  action: "shift" | "reduce" | "accept" | "error";
  description: string;
  stack: number[];
  remaining_input: string[];
  production_used?: string;
}

interface ActionTable {
  terminals: string[];
  rows: Record<string, string>[];
  productions: { index: number; production: string }[];
}

interface GotoTable {
  nonterminals: string[];
  rows: Record<string, string>[];
}

interface SLRParseResult {
  is_valid: boolean;
  steps: SLRParseStep[];
  action_table: ActionTable;
  goto_table: GotoTable;
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
  states: { id: number; items: string[]; transitions: Record<string, number> }[];
  conflicts: string[];
  error_message: string | null;
  tokens_consumed: number;
  total_tokens: number;
}

interface SLRApiResponse {
  method: string;
  grammar: GrammarInfo;
  result: SLRParseResult;
}

interface NFAState {
  id: string;
  label: string;
  is_accept: boolean;
  is_start: boolean;
  lhs: string;
  rhs: string[];
  dot: number;
}

interface NFATransition {
  from: string;
  to: string;
  symbol: string;
  type: "real" | "epsilon";
}

interface DFAItem {
  label: string;
  lhs: string;
  rhs: string[];
  dot: number;
}

interface DFAState {
  id: string;
  label: string;
  items: DFAItem[];
  afn_states: string[];
  is_accept: boolean;
  is_start: boolean;
}

interface DFATransition {
  from: string;
  to: string;
  symbol: string;
}

interface AutomataResponse {
  afn: {
    type: string;
    states: NFAState[];
    transitions: NFATransition[];
    epsilon_transitions: NFATransition[];
    start_state: string;
    accept_states: string[];
  };
  afd: {
    type: string;
    states: DFAState[];
    transitions: DFATransition[];
    start_state: string;
    accept_states: string[];
  };
}

interface GrammarInfo {
  start_symbol: string;
  productions: Record<string, string[][]>;
  terminals: string[];
  non_terminals: string[];
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
}

// ─── Graph node/link types (sin D3) ──────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  isStart: boolean;
  isAccept: boolean;
  items?: string[];
}

interface GraphLink {
  source: string;
  target: string;
  symbol: string;
  type?: "real" | "epsilon";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PARSERS: { id: ParserMethod; label: string; ready: boolean }[] = [
  { id: "recursive-descent", label: "Descenso Recursivo", ready: true },
  { id: "ll1",   label: "LL(1)",   ready: false },
  { id: "lr0",   label: "LR(0)",   ready: false },
  { id: "slr1",  label: "SLR(1)",  ready: true },
  { id: "lalr1", label: "LALR(1)", ready: false },
  { id: "lr1",   label: "LR(1)",   ready: false },
];

const DEFAULT_GRAMMAR = `E -> T E2
E2 -> + T E2 | ε
T -> F T2
T2 -> * F T2 | ε
F -> ( E ) | id`;

const DEFAULT_GRAMMAR_SLR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

const DEFAULT_INPUT = "id + id * id";

const RD_STEP_COLORS: Record<string, string> = {
  call:    "text-cyan-400",
  check:   "text-yellow-400",
  match:   "text-green-400",
  epsilon: "text-purple-400",
  success: "text-green-300",
  error:   "text-red-400",
};

const RD_STEP_ICONS: Record<string, string> = {
  call:    "→",
  check:   "?",
  match:   "✓",
  epsilon: "ε",
  success: "★",
  error:   "✗",
};

const SLR_STEP_COLORS: Record<string, string> = {
  shift:  "text-cyan-400",
  reduce: "text-yellow-400",
  accept: "text-green-300",
  error:  "text-red-400",
};

const SLR_STEP_ICONS: Record<string, string> = {
  shift:  "⇒",
  reduce: "↩",
  accept: "★",
  error:  "✗",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function App() {
  const [method, setMethod]           = useState<ParserMethod>("recursive-descent");
  const [grammarText, setGrammarText] = useState(DEFAULT_GRAMMAR);
  const [inputString, setInputString] = useState(DEFAULT_INPUT);
  const [rdResponse, setRdResponse]   = useState<RDApiResponse | null>(null);
  const [slrResponse, setSlrResponse] = useState<SLRApiResponse | null>(null);
  const [automata, setAutomata]       = useState<AutomataResponse | null>(null);
  const [loading, setLoading]         = useState(false);
  const [automataLoading, setAutomataLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<"steps" | "table" | "tree" | "grammar" | "automata">("steps");
  const [automataView, setAutomataView] = useState<"afd" | "afn">("afd");

  const handleMethodChange = (m: ParserMethod) => {
    setMethod(m);
    setRdResponse(null);
    setSlrResponse(null);
    setAutomata(null);
    setError(null);
    if (m === "slr1") {
      setGrammarText(DEFAULT_GRAMMAR_SLR);
    } else if (m === "recursive-descent") {
      setGrammarText(DEFAULT_GRAMMAR);
    }
    setActiveTab("steps");
  };

  async function handleParse() {
    setLoading(true);
    setError(null);
    setRdResponse(null);
    setSlrResponse(null);
    try {
      const res = await fetch(`http://localhost:8000/parse/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grammar_text: grammarText, input_string: inputString }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Error del servidor");
      }
      const data = await res.json();
      if (method === "recursive-descent") setRdResponse(data as RDApiResponse);
      else if (method === "slr1") setSlrResponse(data as SLRApiResponse);
      setActiveTab("steps");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleAutomata() {
    setAutomataLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/grammar/automata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grammar_text: grammarText }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Error del servidor");
      }
      const automataData = await res.json();
      console.log("automata response:", JSON.stringify(automataData).slice(0, 300));
      setAutomata(automataData);
      setActiveTab("automata");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setAutomataLoading(false);
    }
  }

  const currentResult  = method === "slr1" ? slrResponse?.result  : rdResponse?.result;
  const currentGrammar = method === "slr1" ? slrResponse?.grammar : rdResponse?.grammar;
  const hasResponse    = method === "slr1" ? !!slrResponse : !!rdResponse;
  const isSLR          = method === "slr1";

  const tabs = [
    { id: "steps"   as const, label: "Pasos",       show: hasResponse },
    { id: "table"   as const, label: "Tabla",        show: hasResponse && isSLR },
    { id: "tree"    as const, label: "Árbol",        show: hasResponse && !isSLR },
    { id: "grammar" as const, label: "Gramática",    show: hasResponse },
    { id: "automata"as const, label: "Autómata LR",  show: !!automata },
  ].filter(t => t.show);

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
         className="min-h-screen bg-zinc-950 text-zinc-100">

      <header className="border-b border-zinc-800 px-8 py-4 flex items-center gap-4">
        <span className="text-green-400 text-xl font-bold tracking-widest">{"</>"}</span>
        <h1 className="text-sm font-bold tracking-widest text-zinc-300 uppercase">
          Analizador Sintáctico
        </h1>
        <div className="ml-auto flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 opacity-70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-70" />
          <div className="w-3 h-3 rounded-full bg-green-500 opacity-70" />
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)]">

        <aside className="w-52 border-r border-zinc-800 p-4 flex flex-col gap-1">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Método</p>
          {PARSERS.map((p) => (
            <button
              key={p.id}
              disabled={!p.ready}
              onClick={() => p.ready && handleMethodChange(p.id)}
              className={`
                text-left px-3 py-2 rounded text-xs transition-all
                ${!p.ready
                  ? "text-zinc-600 cursor-not-allowed"
                  : method === p.id
                    ? "bg-green-400/10 text-green-400 border border-green-400/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }
              `}
            >
              {p.ready ? "▶ " : "○ "}{p.label}
              {!p.ready && <span className="ml-1 text-zinc-700">soon</span>}
            </button>
          ))}

          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Visualizar</p>
            <button
              onClick={handleAutomata}
              disabled={automataLoading}
              className="w-full text-left px-3 py-2 rounded text-xs transition-all
                         text-purple-400 hover:text-purple-300 hover:bg-purple-400/10
                         border border-purple-400/20 hover:border-purple-400/40
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {automataLoading ? "⟳ Generando..." : "◈ Autómata LR(0)"}
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-zinc-800 p-6 grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500 uppercase tracking-widest">Gramática</label>
              <textarea
                value={grammarText}
                onChange={(e) => setGrammarText(e.target.value)}
                rows={6}
                spellCheck={false}
                className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs
                           text-green-300 resize-none focus:outline-none
                           focus:border-green-400/50 leading-relaxed"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500 uppercase tracking-widest">Cadena de entrada</label>
              <input
                value={inputString}
                onChange={(e) => setInputString(e.target.value)}
                spellCheck={false}
                className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs
                           text-yellow-300 focus:outline-none focus:border-yellow-400/50"
              />
              <p className="text-xs text-zinc-600 mt-1">Tokens separados por espacios</p>
              <button
                onClick={handleParse}
                disabled={loading}
                className="mt-auto bg-green-400/10 border border-green-400/40
                           text-green-400 text-xs px-6 py-3 rounded
                           hover:bg-green-400/20 hover:border-green-400
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all tracking-widest uppercase"
              >
                {loading ? "Analizando..." : "▶  Analizar"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-950/50 border border-red-800 rounded text-red-400 text-xs">
              ✗ {error}
            </div>
          )}

          {slrResponse?.result.conflicts && slrResponse.result.conflicts.length > 0 && (
            <div className="mx-6 mt-4 p-3 bg-yellow-950/50 border border-yellow-800 rounded text-yellow-400 text-xs">
              ⚠ Conflictos detectados:
              {slrResponse.result.conflicts.map((c, i) => (
                <div key={i} className="mt-1 text-yellow-500">{c}</div>
              ))}
            </div>
          )}

          {(hasResponse || automata) && (
            <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
              <div className="flex items-center gap-4">
                {currentResult && (
                  <>
                    <span className={`px-3 py-1 rounded text-xs font-bold border ${
                      currentResult.is_valid
                        ? "bg-green-400/10 border-green-400/40 text-green-400"
                        : "bg-red-400/10 border-red-400/40 text-red-400"
                    }`}>
                      {currentResult.is_valid ? "✓ ACEPTADA" : "✗ RECHAZADA"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {currentResult.tokens_consumed}/{currentResult.total_tokens} tokens
                      &nbsp;·&nbsp;{currentResult.steps.length} pasos
                    </span>
                  </>
                )}
                {automata && !hasResponse && (
                  <span className="px-3 py-1 rounded text-xs font-bold border bg-purple-400/10 border-purple-400/40 text-purple-400">
                    ◈ Autómata LR(0)
                  </span>
                )}
                <div className="ml-auto flex gap-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1 text-xs rounded transition-all ${
                        activeTab === tab.id
                          ? "bg-zinc-700 text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {currentResult && !currentResult.is_valid && currentResult.error_message && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded text-xs text-red-300 whitespace-pre-wrap">
                  {currentResult.error_message}
                </div>
              )}

              <div className="flex-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-900">

                {activeTab === "steps" && !isSLR && rdResponse && (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-800 text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left w-20">Acción</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-left w-24">Token actual</th>
                        <th className="px-3 py-2 text-left w-36">Entrada restante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rdResponse.result.steps.map((step) => (
                        <tr key={step.step_number} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                          <td className="px-3 py-2 text-zinc-600">{step.step_number}</td>
                          <td className={`px-3 py-2 font-bold ${RD_STEP_COLORS[step.action] ?? "text-zinc-400"}`}>
                            {RD_STEP_ICONS[step.action]} {step.action}
                          </td>
                          <td className="px-3 py-2 text-zinc-300">{step.description}</td>
                          <td className="px-3 py-2 text-yellow-400">{step.current_token}</td>
                          <td className="px-3 py-2 text-zinc-500">{step.remaining_input.join(" ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === "steps" && isSLR && slrResponse && (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-800 text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left w-20">Acción</th>
                        <th className="px-3 py-2 text-left w-32">Pila</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-left w-36">Entrada restante</th>
                        <th className="px-3 py-2 text-left w-32">Producción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slrResponse.result.steps.map((step) => (
                        <tr key={step.step_number} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                          <td className="px-3 py-2 text-zinc-600">{step.step_number}</td>
                          <td className={`px-3 py-2 font-bold ${SLR_STEP_COLORS[step.action] ?? "text-zinc-400"}`}>
                            {SLR_STEP_ICONS[step.action]} {step.action}
                          </td>
                          <td className="px-3 py-2 text-cyan-400 font-mono">[{step.stack.join(" ")}]</td>
                          <td className="px-3 py-2 text-zinc-300">{step.description}</td>
                          <td className="px-3 py-2 text-zinc-500">{step.remaining_input.join(" ") || "—"}</td>
                          <td className="px-3 py-2 text-yellow-400 text-xs">{step.production_used ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === "table" && slrResponse && (
                  <SLRTableView result={slrResponse.result} />
                )}

                {activeTab === "tree" && rdResponse && (
                  <div className="p-4">
                    {rdResponse.result.parse_tree
                      ? <TreeNode node={rdResponse.result.parse_tree as TreeNodeType} depth={0} />
                      : <p className="text-zinc-600 text-xs">No hay árbol (cadena rechazada).</p>
                    }
                  </div>
                )}

                {activeTab === "grammar" && currentGrammar && (
                  <GrammarView
                    grammar={currentGrammar}
                    generatedFunctions={rdResponse?.generated_functions}
                    slrResult={isSLR ? slrResponse?.result : undefined}
                  />
                )}

                {activeTab === "automata" && automata && (
                  <AutomataView automata={automata} view={automataView} setView={setAutomataView} />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── SLR Table View ───────────────────────────────────────────────────────────

function SLRTableView({ result }: { result: SLRParseResult }) {
  const { action_table, goto_table } = result;
  const terms    = action_table.terminals;
  const nonterms = goto_table.nonterminals;

  function cellColor(val: string) {
    if (!val) return "text-zinc-700";
    if (val === "acc") return "text-green-400 font-bold";
    if (val.startsWith("s")) return "text-cyan-400";
    if (val.startsWith("r")) return "text-yellow-400";
    if (val.includes("/")) return "text-red-400 font-bold";
    return "text-zinc-300";
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Producciones</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {action_table.productions.map(p => (
            <span key={p.index} className="text-xs">
              <span className="text-yellow-400">r{p.index}</span>
              <span className="text-zinc-500"> : </span>
              <span className="text-zinc-300">{p.production}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead className="sticky top-0 bg-zinc-800">
            <tr>
              <th className="px-3 py-2 text-zinc-400 border border-zinc-700 text-left" rowSpan={2}>Estado</th>
              <th className="px-3 py-2 text-cyan-400 border border-zinc-700 text-center" colSpan={terms.length}>ACTION</th>
              <th className="px-3 py-2 text-purple-400 border border-zinc-700 text-center" colSpan={nonterms.length}>GOTO</th>
            </tr>
            <tr>
              {terms.map(t => (
                <th key={t} className="px-3 py-2 text-zinc-400 border border-zinc-700 text-center">{t}</th>
              ))}
              {nonterms.map(n => (
                <th key={n} className="px-3 py-2 text-zinc-400 border border-zinc-700 text-center">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {action_table.rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-800/40">
                <td className="px-3 py-2 text-zinc-400 border border-zinc-700 font-bold text-center">{row.state}</td>
                {terms.map(t => (
                  <td key={t} className={`px-3 py-2 border border-zinc-700 text-center font-mono ${cellColor(row[t] ?? "")}`}>
                    {row[t] || ""}
                  </td>
                ))}
                {nonterms.map(n => (
                  <td key={n} className={`px-3 py-2 border border-zinc-700 text-center font-mono ${
                    goto_table.rows[i]?.[n] ? "text-purple-400" : "text-zinc-700"
                  }`}>
                    {goto_table.rows[i]?.[n] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Items por estado</p>
        <div className="grid grid-cols-2 gap-3">
          {result.states.map(s => (
            <div key={s.id} className="bg-zinc-800 rounded p-3 border border-zinc-700">
              <p className="text-purple-400 text-xs font-bold mb-2">I{s.id}</p>
              {s.items.map((item, i) => (
                <div key={i} className="text-xs text-zinc-300 font-mono">{item}</div>
              ))}
              {Object.keys(s.transitions).length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-700 flex flex-wrap gap-2">
                  {Object.entries(s.transitions).map(([sym, dst]) => (
                    <span key={sym} className="text-xs">
                      <span className="text-yellow-400">{sym}</span>
                      <span className="text-zinc-500">→</span>
                      <span className="text-cyan-400">I{dst}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Grammar View ─────────────────────────────────────────────────────────────

function GrammarView({
  grammar,
  generatedFunctions,
  slrResult,
}: {
  grammar: GrammarInfo;
  generatedFunctions?: { function_name: string; cases: { production: string; triggered_by_tokens: string[] }[] }[];
  slrResult?: SLRParseResult;
}) {
  const first  = slrResult?.first  ?? grammar.first;
  const follow = slrResult?.follow ?? grammar.follow;

  return (
    <div className="p-4 grid grid-cols-2 gap-6">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Producciones</p>
        {Object.entries(grammar.productions).map(([nt, prods]) => (
          <div key={nt} className="mb-2">
            <span className="text-cyan-400">{nt}</span>
            <span className="text-zinc-500"> → </span>
            <span className="text-zinc-300">{prods.map(p => p.join(" ")).join(" | ")}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">FIRST</p>
          {Object.entries(first).map(([nt, set]) => (
            <div key={nt} className="text-xs mb-1">
              <span className="text-cyan-400">FIRST({nt})</span>
              <span className="text-zinc-500"> = </span>
              <span className="text-green-300">{"{ "}{set.join(", ")}{" }"}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">FOLLOW</p>
          {Object.entries(follow).map(([nt, set]) => (
            <div key={nt} className="text-xs mb-1">
              <span className="text-cyan-400">FOLLOW({nt})</span>
              <span className="text-zinc-500"> = </span>
              <span className="text-yellow-300">{"{ "}{set.join(", ")}{" }"}</span>
            </div>
          ))}
        </div>
      </div>

      {generatedFunctions && (
        <div className="col-span-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Funciones generadas dinámicamente</p>
          <div className="grid grid-cols-2 gap-3">
            {generatedFunctions.map((fn) => (
              <div key={fn.function_name} className="bg-zinc-800 rounded p-3 border border-zinc-700">
                <p className="text-green-400 text-xs font-bold mb-2">{fn.function_name}()</p>
                {fn.cases.map((c, i) => (
                  <div key={i} className="text-xs mb-1">
                    <span className="text-zinc-500">if token in </span>
                    <span className="text-yellow-400">[{c.triggered_by_tokens.join(", ")}]</span>
                    <span className="text-zinc-500"> → </span>
                    <span className="text-zinc-300">{c.production}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Automata View ────────────────────────────────────────────────────────────

function AutomataView({
  automata,
  view,
  setView,
}: {
  automata: AutomataResponse;
  view: "afd" | "afn";
  setView: (v: "afd" | "afn") => void;
}) {
  const [expandedState, setExpandedState] = useState<string | null>(null);
  const { afd: dfa, afn: nfa } = automata;

  // Guard: si el backend no devolvió la estructura esperada, mostramos error
  if (!dfa?.states || !nfa?.states) {
    return (
      <div className="p-6 text-red-400 text-xs">
        ✗ La respuesta del servidor no tiene el formato esperado.
        Verifica que <code>/grammar/automata</code> devuelva <code>{"{ afn, afd }"}</code>.
      </div>
    );
  }

  // Build graph data without D3 types
  const graphData: { nodes: GraphNode[]; links: GraphLink[] } = view === "afd"
    ? {
        nodes: dfa.states.map(s => ({
          id: s.id,
          label: s.label,
          isStart: s.is_start,
          isAccept: s.is_accept,
          items: s.items.map(i => i.label),
        })),
        links: dfa.transitions.map(t => ({
          source: t.from,
          target: t.to,
          symbol: t.symbol,
          type: "real" as const,
        })),
      }
    : {
        nodes: nfa.states.map(s => ({
          id: s.id,
          label: s.label,
          isStart: s.is_start,
          isAccept: s.is_accept,
        })),
        links: [
          ...nfa.transitions.map(t => ({ source: t.from, target: t.to, symbol: t.symbol, type: "real" as const })),
          ...nfa.epsilon_transitions.map(t => ({ source: t.from, target: t.to, symbol: "ε", type: "epsilon" as const })),
        ],
      };

  return (
    <div className="p-4 flex flex-col gap-3">
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

      <div className="flex gap-3" style={{ height: 520 }}>
        {/* Graph SVG */}
        <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden" style={{ flex: "0 0 63%" }}>
          <StaticAutomataGraph key={view} data={graphData} />
        </div>

        {/* State list panel */}
        <div className="flex flex-col flex-1 gap-2 overflow-hidden">
          {view === "afd" && (
            <>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest flex-shrink-0">Estados DFA</p>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                {dfa.states.map((state) => {
                  const isSelected = expandedState === state.id;
                  const trans = dfa.transitions.filter(t => t.from === state.id);
                  return (
                    <div
                      key={state.id}
                      onClick={() => setExpandedState(prev => prev === state.id ? null : state.id)}
                      className={`rounded border p-2.5 cursor-pointer transition-all ${
                        isSelected
                          ? "border-purple-400/50 bg-purple-400/5"
                          : "border-zinc-800 hover:border-zinc-700 bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold ${
                          state.is_start ? "text-green-400" : state.is_accept ? "text-yellow-400" : "text-purple-400"
                        }`}>
                          {state.label}
                        </span>
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
              <div className="flex gap-3 text-[10px] text-zinc-600 flex-shrink-0 pt-1">
                <span><span className="text-green-400">■</span> Inicio</span>
                <span><span className="text-yellow-400">■</span> Accept</span>
                <span><span className="text-purple-400">■</span> Intermedio</span>
              </div>
            </>
          )}

          {view === "afn" && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                  Transiciones reales ({nfa.transitions.length})
                </p>
                <div className="flex flex-col gap-0.5">
                  {nfa.transitions.map((t, i) => {
                    const fromLabel = nfa.states.find(s => s.id === t.from)?.label ?? t.from;
                    const toLabel   = nfa.states.find(s => s.id === t.to)?.label   ?? t.to;
                    return (
                      <div key={i} className="text-[10px] font-mono">
                        <span className="text-zinc-400">[{fromLabel}]</span>
                        <span className="text-yellow-400 mx-1">─{t.symbol}→</span>
                        <span className="text-zinc-400">[{toLabel}]</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                  Transiciones ε ({nfa.epsilon_transitions.length})
                </p>
                <div className="flex flex-col gap-0.5">
                  {nfa.epsilon_transitions.map((t, i) => {
                    const fromLabel = nfa.states.find(s => s.id === t.from)?.label ?? t.from;
                    const toLabel   = nfa.states.find(s => s.id === t.to)?.label   ?? t.to;
                    return (
                      <div key={i} className="text-[10px] font-mono">
                        <span className="text-zinc-500">[{fromLabel}]</span>
                        <span className="text-purple-400 mx-1">─ε→</span>
                        <span className="text-zinc-500">[{toLabel}]</span>
                      </div>
                    );
                  })}
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
                      <span key={id} className="text-[10px] bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 px-2 py-0.5 rounded">
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

// ─── Static Automata Graph (SVG puro, sin D3) ─────────────────────────────────

function StaticAutomataGraph({ data }: { data: { nodes: GraphNode[]; links: GraphLink[] } }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const didPan    = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const NW = 92, NH = 58;

  // BFS layout — sin D3
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

  const outTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(data.links.filter(l => l.source === selected).map(l => l.target));
  }, [selected, data.links]);

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
    if (!selected) return 1;
    return id === selected || outTargets.has(id) ? 1 : 0.15;
  }

  function edgeOpacity(source: string) {
    if (!selected) return 0.8;
    return source === selected ? 1 : 0.08;
  }

  function nodeStroke(n: GraphNode) {
    if (selected === n.id) return { color: "#818cf8", width: 2 };
    if (outTargets.has(n.id)) return { color: "#f59e0b", width: 1.5 };
    if (n.isStart)  return { color: "#3b82f6", width: 0.5 };
    if (n.isAccept) return { color: "#22c55e", width: 0.5 };
    return { color: "#334155", width: 0.5 };
  }

  function edgeStroke(source: string, isEps: boolean) {
    if (!selected) return isEps ? "#7c3aed" : "#475569";
    return source === selected ? "#818cf8" : "#374151";
  }

  function edgeMarker(source: string, isEps: boolean) {
    if (!selected) return isEps ? "url(#agm-eps)" : "url(#agm-normal)";
    return source === selected ? "url(#agm-hi)" : "url(#agm-dim)";
  }

  function edgeStrokeW(source: string) {
    if (!selected) return 1;
    return source === selected ? 1.8 : 0.8;
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

  const { pos, svgH } = layout;
  const svgW = 680;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ display: "block", cursor: isPanning.current ? "grabbing" : "grab", userSelect: "none" }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={() => { if (!didPan.current) setSelected(null); }}
    >
      <defs>
        {([
          { id: "agm-normal", color: "#64748b" },
          { id: "agm-hi",     color: "#818cf8" },
          { id: "agm-dim",    color: "#374151" },
          { id: "agm-eps",    color: "#a78bfa" },
        ] as const).map(({ id, color }) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1L9 5L1 9" fill="none" stroke={color}
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>

      <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
        <g>
          {data.links.map((l, i) => {
            const isEps = l.type === "epsilon";
            const { d, lx, ly } = buildPath(l);
            if (!d) return null;
            return (
              <g key={i} style={{ opacity: edgeOpacity(l.source) }}>
                <path
                  d={d}
                  fill="none"
                  stroke={edgeStroke(l.source, isEps)}
                  strokeWidth={edgeStrokeW(l.source)}
                  strokeDasharray={isEps ? "4 3" : undefined}
                  markerEnd={edgeMarker(l.source, isEps)}
                />
                <text
                  x={lx} y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="10"
                  fontFamily="monospace"
                  fill={selected && l.source === selected ? "#c4b5fd" : isEps ? "#7c3aed" : "#64748b"}
                  pointerEvents="none"
                >
                  {l.symbol}
                </text>
              </g>
            );
          })}
        </g>

        <g>
          {data.nodes.map(n => {
            const p = pos[n.id];
            if (!p) return null;
            const { color: sc, width: sw } = nodeStroke(n);
            const fill     = n.isStart ? "#1e3a5f" : n.isAccept ? "#1a3a2a" : "#1e293b";
            const lblColor = n.isStart ? "#93c5fd" : n.isAccept ? "#86efac" : "#cbd5e1";
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                style={{ cursor: "pointer", opacity: nodeOpacity(n.id) }}
                onClick={e => {
                  e.stopPropagation();
                  if (!didPan.current) setSelected(prev => prev === n.id ? null : n.id);
                }}
              >
                <rect width={NW} height={NH} rx={4} fill={fill} stroke={sc} strokeWidth={sw} />
                {n.isAccept && (
                  <rect x={3} y={3} width={NW - 6} height={NH - 6} rx={2}
                        fill="none" stroke="#22c55e" strokeWidth={0.5} />
                )}
                <text
                  x={NW / 2}
                  y={n.items?.length ? NH / 2 - 9 : NH / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12"
                  fontWeight="500"
                  fontFamily="monospace"
                  fill={selected === n.id ? "#a5b4fc" : lblColor}
                  pointerEvents="none"
                >
                  {n.label}
                </text>
                {n.items && n.items.length > 0 && (
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

// ─── Tree Viewer ──────────────────────────────────────────────────────────────

interface TreeNodeType {
  symbol: string;
  is_terminal: boolean;
  matched_token?: string;
  children?: TreeNodeType[];
}

function TreeNode({ node, depth }: { node: TreeNodeType; depth: number }) {
  const [collapsed, setCollapsed] = useState(false);

  if (node.is_terminal) {
    return (
      <div style={{ paddingLeft: depth * 20 }} className="flex items-center gap-2 py-0.5">
        <span className="text-zinc-600 text-xs">└─</span>
        <span className="text-yellow-400 text-xs">{node.symbol}</span>
        {node.matched_token && <span className="text-zinc-500 text-xs">«{node.matched_token}»</span>}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 20 }}
        className="flex items-center gap-2 py-0.5 cursor-pointer group"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-zinc-600 text-xs">{collapsed ? "▶" : "▼"}</span>
        <span className="text-cyan-400 text-xs font-bold group-hover:text-cyan-300">{node.symbol}</span>
      </div>
      {!collapsed && node.children?.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
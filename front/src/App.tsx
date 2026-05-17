import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParserMethod = "recursive-descent" | "ll1" | "lr0" | "slr1" | "lalr1" | "lr1";

interface ParseStep {
  step_number: number;
  action: "call" | "check" | "match" | "epsilon" | "success" | "error";
  description: string;
  current_token: string;
  remaining_input: string[];
  production_used?: string;
}

interface ParseResult {
  is_valid: boolean;
  parse_tree: object | null;
  steps: ParseStep[];
  error_message: string | null;
  tokens_consumed: number;
  total_tokens: number;
}

interface ApiResponse {
  method: string;
  grammar: {
    start_symbol: string;
    productions: Record<string, string[][]>;
    terminals: string[];
    non_terminals: string[];
    first: Record<string, string[]>;
    follow: Record<string, string[]>;
  };
  generated_functions?: { function_name: string; cases: { production: string; triggered_by_tokens: string[] }[] }[];
  result: ParseResult;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PARSERS: { id: ParserMethod; label: string; ready: boolean }[] = [
  { id: "recursive-descent", label: "Descenso Recursivo", ready: true },
  { id: "ll1",   label: "LL(1)",   ready: false },
  { id: "lr0",   label: "LR(0)",   ready: false },
  { id: "slr1",  label: "SLR(1)",  ready: false },
  { id: "lalr1", label: "LALR(1)", ready: false },
  { id: "lr1",   label: "LR(1)",   ready: false },
];

const DEFAULT_GRAMMAR = `E -> T E2
E2 -> + T E2 | ε
T -> F T2
T2 -> * F T2 | ε
F -> ( E ) | id`;

const DEFAULT_INPUT = "id + id * id";

const STEP_COLORS: Record<string, string> = {
  call:     "text-cyan-400",
  check:    "text-yellow-400",
  match:    "text-green-400",
  epsilon:  "text-purple-400",
  success:  "text-green-300",
  error:    "text-red-400",
};

const STEP_ICONS: Record<string, string> = {
  call:    "→",
  check:   "?",
  match:   "✓",
  epsilon: "ε",
  success: "★",
  error:   "✗",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [method, setMethod]           = useState<ParserMethod>("recursive-descent");
  const [grammarText, setGrammarText] = useState(DEFAULT_GRAMMAR);
  const [inputString, setInputString] = useState(DEFAULT_INPUT);
  const [response, setResponse]       = useState<ApiResponse | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<"steps" | "tree" | "grammar">("steps");

  // ── API call ──────────────────────────────────────────────────────────────

  async function handleParse() {
    setLoading(true);
    setError(null);
    setResponse(null);

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

      const data: ApiResponse = await res.json();
      setResponse(data);
      setActiveTab("steps");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
         className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* Header */}
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

        {/* ── Sidebar: método ────────────────────────────────────────────── */}
        <aside className="w-52 border-r border-zinc-800 p-4 flex flex-col gap-1">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Método</p>
          {PARSERS.map((p) => (
            <button
              key={p.id}
              disabled={!p.ready}
              onClick={() => p.ready && setMethod(p.id)}
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
        </aside>

        {/* ── Main ───────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Input panel */}
          <div className="border-b border-zinc-800 p-6 grid grid-cols-2 gap-6">

            {/* Gramática */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500 uppercase tracking-widest">
                Gramática
              </label>
              <textarea
                value={grammarText}
                onChange={(e) => setGrammarText(e.target.value)}
                rows={6}
                spellCheck={false}
                className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs
                           text-green-300 resize-none focus:outline-none
                           focus:border-green-400/50 leading-relaxed"
                placeholder="E -> T E2&#10;E2 -> + T E2 | ε"
              />
            </div>

            {/* Cadena + botón */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500 uppercase tracking-widest">
                Cadena de entrada
              </label>
              <input
                value={inputString}
                onChange={(e) => setInputString(e.target.value)}
                spellCheck={false}
                className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs
                           text-yellow-300 focus:outline-none focus:border-yellow-400/50"
                placeholder="id + id * id"
              />

              <p className="text-xs text-zinc-600 mt-1">
                Tokens separados por espacios
              </p>

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

          {/* Error de red / gramática */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-950/50 border border-red-800
                            rounded text-red-400 text-xs">
              ✗ {error}
            </div>
          )}

          {/* Output */}
          {response && (
            <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">

              {/* Badge resultado */}
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded text-xs font-bold border ${
                  response.result.is_valid
                    ? "bg-green-400/10 border-green-400/40 text-green-400"
                    : "bg-red-400/10 border-red-400/40 text-red-400"
                }`}>
                  {response.result.is_valid ? "✓ ACEPTADA" : "✗ RECHAZADA"}
                </span>
                <span className="text-xs text-zinc-500">
                  {response.result.tokens_consumed}/{response.result.total_tokens} tokens consumidos
                  &nbsp;·&nbsp;
                  {response.result.steps.length} pasos
                </span>

                {/* Tabs */}
                <div className="ml-auto flex gap-1">
                  {(["steps", "tree", "grammar"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1 text-xs rounded transition-all ${
                        activeTab === tab
                          ? "bg-zinc-700 text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {tab === "steps" ? "Pasos" : tab === "tree" ? "Árbol" : "Gramática"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error message */}
              {!response.result.is_valid && response.result.error_message && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded text-xs text-red-300 whitespace-pre-wrap">
                  {response.result.error_message}
                </div>
              )}

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-900">

                {/* PASOS */}
                {activeTab === "steps" && (
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
                      {response.result.steps.map((step) => (
                        <tr key={step.step_number}
                            className="border-t border-zinc-800 hover:bg-zinc-800/50">
                          <td className="px-3 py-2 text-zinc-600">{step.step_number}</td>
                          <td className={`px-3 py-2 font-bold ${STEP_COLORS[step.action] ?? "text-zinc-400"}`}>
                            {STEP_ICONS[step.action]} {step.action}
                          </td>
                          <td className="px-3 py-2 text-zinc-300">{step.description}</td>
                          <td className="px-3 py-2 text-yellow-400">{step.current_token}</td>
                          <td className="px-3 py-2 text-zinc-500">
                            {step.remaining_input.join(" ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* ÁRBOL */}
                {activeTab === "tree" && (
                  <div className="p-4">
                    {response.result.parse_tree
                      ? <TreeNode node={response.result.parse_tree as TreeNodeType} depth={0} />
                      : <p className="text-zinc-600 text-xs">No hay árbol (cadena rechazada).</p>
                    }
                  </div>
                )}

                {/* GRAMÁTICA */}
                {activeTab === "grammar" && (
                  <div className="p-4 grid grid-cols-2 gap-6">

                    {/* Producciones */}
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
                        Producciones
                      </p>
                      {Object.entries(response.grammar.productions).map(([nt, prods]) => (
                        <div key={nt} className="mb-2">
                          <span className="text-cyan-400">{nt}</span>
                          <span className="text-zinc-500"> → </span>
                          <span className="text-zinc-300">
                            {prods.map((p) => p.join(" ")).join(" | ")}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* FIRST / FOLLOW */}
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
                          FIRST
                        </p>
                        {Object.entries(response.grammar.first).map(([nt, set]) => (
                          <div key={nt} className="text-xs mb-1">
                            <span className="text-cyan-400">FIRST({nt})</span>
                            <span className="text-zinc-500"> = </span>
                            <span className="text-green-300">{"{ "}{set.join(", ")}{" }"}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
                          FOLLOW
                        </p>
                        {Object.entries(response.grammar.follow).map(([nt, set]) => (
                          <div key={nt} className="text-xs mb-1">
                            <span className="text-cyan-400">FOLLOW({nt})</span>
                            <span className="text-zinc-500"> = </span>
                            <span className="text-yellow-300">{"{ "}{set.join(", ")}{" }"}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Funciones generadas (solo descenso recursivo) */}
                    {response.generated_functions && (
                      <div className="col-span-2">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
                          Funciones generadas dinámicamente
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {response.generated_functions.map((fn) => (
                            <div key={fn.function_name}
                                 className="bg-zinc-800 rounded p-3 border border-zinc-700">
                              <p className="text-green-400 text-xs font-bold mb-2">
                                {fn.function_name}()
                              </p>
                              {fn.cases.map((c, i) => (
                                <div key={i} className="text-xs mb-1">
                                  <span className="text-zinc-500">if token in </span>
                                  <span className="text-yellow-400">
                                    [{c.triggered_by_tokens.join(", ")}]
                                  </span>
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
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Tree viewer ──────────────────────────────────────────────────────────────

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
        {node.matched_token && (
          <span className="text-zinc-500 text-xs">«{node.matched_token}»</span>
        )}
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
        <span className="text-cyan-400 text-xs font-bold group-hover:text-cyan-300">
          {node.symbol}
        </span>
      </div>
      {!collapsed && node.children?.map((child, i) => (
        <TreeNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
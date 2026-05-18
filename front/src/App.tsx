import { useState, useRef } from "react";
import { ExportPdfButton } from "./components/Exportpdfbutton";
import type {
  ParserMethod,
  AutomataView,
  RDApiResponse,
  LRApiResponse,
  AutomataResponse,
} from "./types";
import {
  PARSERS,
  DEFAULT_GRAMMAR,
  DEFAULT_GRAMMAR_LR,
  DEFAULT_INPUT,
} from "./constans";

import { RDStepsView, LRStepsView } from "./views/StepsView";
import { LRTableView } from "./views/Lrtableview";
import { GrammarView } from "./views/Grammarview";
import { AutomataView as AutomataViewComponent } from "./views/Automataview";
import { TreeNode } from "./components/Treenode";
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import type { TreeNodeType } from "./types";

export default function App() {
  const [method, setMethod]           = useState<ParserMethod>("recursive-descent");
  const [grammarText, setGrammarText] = useState(DEFAULT_GRAMMAR);
  const [inputString, setInputString] = useState(DEFAULT_INPUT);
  const [rdResponse, setRdResponse]   = useState<RDApiResponse | null>(null);
  const [lrResponse, setLrResponse]   = useState<LRApiResponse | null>(null);
  const [automata, setAutomata]       = useState<AutomataResponse | null>(null);
  const [loading, setLoading]         = useState(false);
  const [automataLoading, setAutomataLoading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [activeTab, setActiveTab]     = useState<"steps" | "table" | "tree" | "grammar" | "automata">("steps");
  const [automataView, setAutomataView] = useState<AutomataView>("afd");

  // Refs para insertar en la posición del cursor
  const grammarRef  = useRef<HTMLTextAreaElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const lrTableRef  = useRef<HTMLDivElement>(null);
  // Cuál campo está activo para el teclado virtual
  const [activeField, setActiveField] = useState<"grammar" | "input">("grammar");

  function insertAt(
    current: string,
    setter: (v: string) => void,
    el: HTMLTextAreaElement | HTMLInputElement | null,
    symbol: string,
  ) {
    if (!el) { setter(current + symbol); return; }
    const start  = el.selectionStart ?? current.length;
    const end    = el.selectionEnd   ?? current.length;
    const before = current.slice(0, start);
    const after  = current.slice(end);
    // Añadir espacios automáticos solo para tokens multi-char de gramática
    const needsPad = symbol.length > 1 && symbol !== "\n";
    const padL = needsPad && before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
    const padR = needsPad && after.length  > 0 && !after.startsWith(" ") && !after.startsWith("\n") ? " " : "";
    const insert = padL + symbol + padR;
    setter(before + insert + after);
    const cursor = start + insert.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  }

  function backspaceAt(
    current: string,
    setter: (v: string) => void,
    el: HTMLTextAreaElement | HTMLInputElement | null,
  ) {
    if (!el) { setter(current.slice(0, -1)); return; }
    const start = el.selectionStart ?? current.length;
    const end   = el.selectionEnd   ?? current.length;
    if (start === end && start > 0) {
      setter(current.slice(0, start - 1) + current.slice(start));
      const cursor = start - 1;
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
    } else if (start !== end) {
      setter(current.slice(0, start) + current.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start, start); });
    }
  }

  // Handlers del teclado virtual según el campo activo
  function kbInsert(sym: string) {
    if (activeField === "grammar")
      insertAt(grammarText, setGrammarText, grammarRef.current, sym);
    else
      insertAt(inputString, setInputString, inputRef.current, sym);
  }
  function kbBackspace() {
    if (activeField === "grammar")
      backspaceAt(grammarText, setGrammarText, grammarRef.current);
    else
      backspaceAt(inputString, setInputString, inputRef.current);
  }
  function kbEnter() {
    insertAt(grammarText, setGrammarText, grammarRef.current, "\n");
  }

  const isLR = ["ll1", "lr0", "slr1", "lalr1", "lr1"].includes(method);

  const handleMethodChange = (m: ParserMethod) => {
    setMethod(m);
    setRdResponse(null);
    setLrResponse(null);
    setAutomata(null);
    setError(null);
    setGrammarText(m === "recursive-descent" || m === "ll1" ? DEFAULT_GRAMMAR : DEFAULT_GRAMMAR_LR);
    setActiveTab("steps");
  };

  async function handleParse() {
    setLoading(true);
    setError(null);
    setRdResponse(null);
    setLrResponse(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/parse/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grammar_text: grammarText, input_string: inputString }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Error del servidor");
      }
      const data = await res.json();
      isLR ? setLrResponse(data as LRApiResponse) : setRdResponse(data as RDApiResponse);
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/grammar/automata/all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grammar_text: grammarText }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Error del servidor");
      }
      setAutomata(await res.json());
      setActiveTab("automata");
      setAutomataView("afd");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setAutomataLoading(false);
    }
  }

  const currentResult  = isLR ? lrResponse?.result  : rdResponse?.result;
  const currentGrammar = isLR ? lrResponse?.grammar : rdResponse?.grammar;
  const hasResponse    = isLR ? !!lrResponse : !!rdResponse;

  const tabs = [
    { id: "steps"    as const, label: "Pasos",      show: hasResponse },
    { id: "table"    as const, label: "Tabla",       show: hasResponse && isLR },
    { id: "tree"     as const, label: "Árbol",       show: hasResponse && !isLR },
    { id: "grammar"  as const, label: "Gramática",   show: hasResponse },
    { id: "automata" as const, label: "Autómata LR", show: !!automata },
  ].filter(t => t.show);

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
         className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">

      {/* ── Header ── */}
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

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-52 border-r border-zinc-800 p-4 flex flex-col gap-1">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Método</p>
          {PARSERS.map((p) => (
            <button
              key={p.id}
              disabled={!p.ready}
              onClick={() => p.ready && handleMethodChange(p.id)}
              className={`text-left px-3 py-2 rounded text-xs transition-all ${
                !p.ready
                  ? "text-zinc-600 cursor-not-allowed"
                  : method === p.id
                    ? "bg-green-400/10 text-green-400 border border-green-400/30"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
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
              {automataLoading ? "⟳ Generando..." : "◈ Autómatas LR"}
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Input area */}
          <div className="border-b border-zinc-800 p-6 grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500 uppercase tracking-widest">Gramática</label>
              <textarea
                ref={grammarRef}
                value={grammarText}
                onChange={(e) => setGrammarText(e.target.value)}
                onFocus={() => setActiveField("grammar")}
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
                ref={inputRef}
                value={inputString}
                onChange={(e) => setInputString(e.target.value)}
                onFocus={() => setActiveField("input")}
                spellCheck={false}
                className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs
                           text-yellow-300 focus:outline-none focus:border-yellow-400/50"
              />
              <p className="text-xs text-zinc-600 mt-1">Tokens separados por espacios</p>
            </div>
          </div>

          {/* Errors & conflicts */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-950/50 border border-red-800 rounded text-red-400 text-xs">
              ✗ {error}
            </div>
          )}
          {lrResponse?.result.conflicts && lrResponse.result.conflicts.length > 0 && (
            <div className="mx-6 mt-4 p-3 bg-yellow-950/50 border border-yellow-800 rounded text-yellow-400 text-xs flex flex-col gap-1">
              <strong>⚠ Conflictos detectados en {method.toUpperCase()}:</strong>
              <div className="max-h-24 overflow-y-auto">
                {lrResponse.result.conflicts.map((c, i) => (
                  <div key={i} className="text-yellow-500">{c}</div>
                ))}
              </div>
            </div>
          )}

          {/* Results area */}
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
                    ◈ Autómatas LR
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
                <div>
                  {activeTab === "table" && lrResponse && (
                    <ExportPdfButton
                      result={lrResponse.result}
                      method={method}
                    />
                  )}
                </div>
              </div>

              {currentResult && !currentResult.is_valid && currentResult.error_message && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded text-xs text-red-300 whitespace-pre-wrap">
                  {currentResult.error_message}
                </div>
              )}

              <div className="flex-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-900">

                {activeTab === "steps" && !isLR && rdResponse && (
                  <RDStepsView response={rdResponse} />
                )}

                {activeTab === "steps" && isLR && lrResponse && (
                  <LRStepsView response={lrResponse} method={method} />
                )}

                {activeTab === "table" && lrResponse && (
                  <div ref={lrTableRef}>
                  <LRTableView result={lrResponse.result} method={method}/>
                  </div>
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
                    lrResult={isLR ? lrResponse?.result : undefined}
                  />
                )}

                {activeTab === "automata" && automata && (
                  <AutomataViewComponent
                    automata={automata}
                    view={automataView}
                    setView={setAutomataView}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Teclado virtual global — se oculta cuando hay resultados ── */}
      {!hasResponse && !automata && (
        <VirtualKeyboard
          target={activeField}
          onInsert={kbInsert}
          onBackspace={kbBackspace}
          onEnter={kbEnter}
          onAnalyze={handleParse}
          loading={loading}
        />
      )}
    </div>
  );
}
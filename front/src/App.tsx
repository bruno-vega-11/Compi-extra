import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { ExportPdfButton } from "./components/Exportpdfbutton";
import { TreeNode } from "./components/Treenode";
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import { RDStepsView, LRStepsView } from "./views/StepsView";
import { LRTableView } from "./views/Lrtableview";
import { GrammarView } from "./views/Grammarview";
import { AutomataView as AutomataViewComponent } from "./views/Automataview";

import type {
  ParserMethod,
  AutomataView,
  RDApiResponse,
  LRApiResponse,
  AutomataResponse,
  TreeNodeType,
} from "./types";

import {
  PARSERS,
  DEFAULT_GRAMMAR,
  DEFAULT_GRAMMAR_LR,
  DEFAULT_INPUT,
} from "./constans";

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
  const [showKeyboard, setShowKeyboard] = useState(true);

  // ── ESTADOS MAESTROS DE LA CÁMARA DEL GRAFO ──
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  const grammarRef  = useRef<HTMLTextAreaElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const lrTableRef  = useRef<HTMLDivElement>(null);
  
  const [activeField, setActiveField] = useState<"grammar" | "input">("grammar");
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  function insertAt(current: string, setter: (v: string) => void, el: HTMLTextAreaElement | HTMLInputElement | null, symbol: string) {
    if (!el) { setter(current + symbol); return; }
    const start  = el.selectionStart ?? current.length;
    const end    = el.selectionEnd   ?? current.length;
    const before = current.slice(0, start);
    const after  = current.slice(end);
    const needsPad = symbol.length > 1 && symbol !== "\n";
    const padL = needsPad && before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
    const padR = needsPad && after.length  > 0 && !after.startsWith(" ") && !after.startsWith("\n") ? " " : "";
    const insert = padL + symbol + padR;
    setter(before + insert + after);
    const cursor = start + insert.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cursor, cursor); });
  }

  function backspaceAt(current: string, setter: (v: string) => void, el: HTMLTextAreaElement | HTMLInputElement | null) {
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

  function kbInsert(sym: string) {
    if (activeField === "grammar") insertAt(grammarText, setGrammarText, grammarRef.current, sym);
    else insertAt(inputString, setInputString, inputRef.current, sym);
  }
  function kbBackspace() {
    if (activeField === "grammar") backspaceAt(grammarText, setGrammarText, grammarRef.current);
    else backspaceAt(inputString, setInputString, inputRef.current);
  }
  function kbEnter() {
    if (activeField === "grammar") insertAt(grammarText, setGrammarText, grammarRef.current, "\n");
  }

  const isTabularResponse = ["ll1", "lr0", "slr1", "lalr1", "lr1"].includes(method);
  const hasTable          = ["ll1", "lr0", "slr1", "lalr1", "lr1"].includes(method);

  const handleMethodChange = (m: ParserMethod) => {
    setMethod(m);
    setRdResponse(null);
    setLrResponse(null);
    setAutomata(null);
    setError(null);
    setGrammarText(m === "recursive-descent" || m === "ll1" ? DEFAULT_GRAMMAR : DEFAULT_GRAMMAR_LR);
    setActiveTab("steps");
  };

  async function handleParse(overrideGrammar?: string) {
    setLoading(true);
    setError(null);
    setRdResponse(null);
    setLrResponse(null);
    const textToParse = overrideGrammar ?? grammarText;

    try {
      const res = await fetch(`${API_BASE_URL}/parse/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grammar_text: textToParse, input_string: inputString }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Error del servidor");
      }
      const data = await res.json();
      isTabularResponse ? setLrResponse(data as LRApiResponse) : setRdResponse(data as RDApiResponse);
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
      const res = await fetch(`${API_BASE_URL}/grammar/automata/all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grammar_text: grammarText }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Error del servidor");
      }
      const data = await res.json();
      setAutomata(data);
      setActiveTab("automata");
      setAutomataView(method === "lr1" ? "lr1" : method === "lalr1" ? "lalr1" : "afd");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setAutomataLoading(false);
    }
  }

  const currentResult  = isTabularResponse ? lrResponse?.result  : rdResponse?.result;
  const currentGrammar = isTabularResponse ? lrResponse?.grammar : rdResponse?.grammar;
  const hasResponse    = isTabularResponse ? !!lrResponse : !!rdResponse;

  const tabs = [
    { id: "steps"    as const, label: "Pasos",       show: hasResponse },
    { id: "table"    as const, label: "Tabla",        show: hasResponse && hasTable },
    { id: "tree"     as const, label: "Árbol",        show: hasResponse },
    { id: "grammar"  as const, label: "Gramática",   show: hasResponse },
    { id: "automata" as const, label: "Autómata LR", show: !!automata },
  ].filter(t => t.show);

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
         className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">

      {/* Header */}
      <header className="border-b border-zinc-800 px-8 py-4 flex items-center gap-4 flex-shrink-0">
        <span className="text-green-400 text-xl font-bold tracking-widest">{"</>"}</span>
        <h1 className="text-sm font-bold tracking-widest text-zinc-300 uppercase">Analizador Sintáctico</h1>
        <div className="ml-auto flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 opacity-70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-70" />
          <div className="w-3 h-3 rounded-full bg-green-500 opacity-70" />
        </div>
      </header>

      <div className="flex flex-1 h-[calc(100vh-57px)] overflow-hidden relative">
        
        {/* ── BARRA LATERAL IZQUIERDA CON PANEL DE CÁMARA INCORPORADO ── */}
        <aside className="w-52 border-r border-zinc-800 p-4 flex flex-col gap-1 flex-shrink-0 bg-zinc-950 overflow-y-auto custom-scrollbar">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Método</p>
          {PARSERS.map((p) => (
            <button
              key={p.id}
              disabled={!p.ready}
              onClick={() => p.ready && handleMethodChange(p.id)}
              className={`text-left px-3 py-2 rounded text-xs transition-all ${
                !p.ready ? "text-zinc-600 cursor-not-allowed" : method === p.id ? "bg-green-400/10 text-green-400 border border-green-400/30" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {p.ready ? "▶ " : "○ "}{p.label}
            </button>
          ))}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Visualizar</p>
            <button
              onClick={handleAutomata}
              disabled={automataLoading}
              className="w-full text-left px-3 py-2 rounded text-xs transition-all text-purple-400 hover:text-purple-300 hover:bg-purple-400/10 border border-purple-400/20"
            >
              {automataLoading ? "⟳ Generando..." : "◈ Autómatas LR"}
            </button>
          </div>

          {/* ── PANEL DE CÁMARA UNIFICADO EN DOS COLUMNAS (EJE Y VERTICAL) ── */}
          {activeTab === "automata" && automata && (
            <div className="mt-5 pt-4 border-t border-zinc-800 flex flex-col gap-3 shrink-0">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Cámara Grafo</p>
              
              <div className="flex gap-2.5 bg-zinc-900/40 p-2 rounded border border-zinc-800/60">
                {/* Columna Izquierda: Sliders Horizontales (Zoom y Eje X) */}
                <div className="flex flex-col gap-3 flex-1 min-w-0 justify-center">
                  {/* Zoom */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                      <span>🔍 Zoom</span>
                      <span className="text-zinc-400">{Math.round(zoom * 100)}%</span>
                    </div>
                    <input type="range" min="0.15" max="3.0" step="0.02" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className="w-full accent-purple-500 h-1 bg-zinc-900 rounded appearance-none cursor-pointer" />
                  </div>

                  {/* Eje X */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                      <span>↔ Eje X</span>
                      <span className="text-zinc-400">{panX}px</span>
                    </div>
                    <input type="range" min="-1200" max="1200" step="5" value={panX} onChange={e => setPanX(parseInt(e.target.value))} className="w-full accent-cyan-500 h-1 bg-zinc-900 rounded appearance-none cursor-pointer" />
                  </div>
                </div>

                {/* Separador de columna */}
                <div className="w-[1px] bg-zinc-800 self-stretch my-0.5" />

                {/* Columna Derecha: Slider Vertical del Eje Y con gran recorrido */}
                <div className="flex flex-col items-center justify-between w-11 py-0.5">
                  <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wide leading-none">↕ Y</span>
                  <div className="flex-1 flex items-center justify-center relative my-1.5 w-4">
                    <input 
                      type="range" 
                      min="-1200" 
                      max="1200" 
                      step="5" 
                      value={panY} 
                      onChange={e => setPanY(parseInt(e.target.value))} 
                      style={{ appearance: 'slider-vertical', WebkitAppearance: 'slider-vertical' } as any}
                      className="h-20 w-1.5 accent-yellow-500 bg-zinc-900 rounded cursor-pointer" 
                    />
                  </div>
                  <span className="text-[9px] text-zinc-400 font-mono leading-none">{panY}px</span>
                </div>
              </div>

              {/* Botón de Restablecimiento */}
              <button onClick={() => { setZoom(1.0); setPanX(0); setPanY(0); }} className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] text-zinc-400 font-bold uppercase rounded tracking-wider transition-colors">
                Resetear Vista
              </button>
            </div>
          )}
        </aside>

        {/* Workspace Central */}
        <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-zinc-950 relative">
          
          {/* Bloque 1: Entradas e IA */}
          <div className="flex flex-col flex-shrink-0 pb-4">
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
                  className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs text-green-300 resize-none focus:outline-none focus:border-green-400/50"
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
                  className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs text-yellow-300 focus:outline-none focus:border-yellow-400/50"
                />
                <p className="text-xs text-zinc-600 mt-1">Tokens separados por espacios</p>
                <button
                  onClick={() => handleParse()}
                  disabled={loading}
                  className="mt-auto bg-green-400/10 border border-green-400/40 text-green-400 text-xs px-6 py-3 rounded hover:bg-green-400/20 font-bold uppercase tracking-widest"
                >
                  {loading ? "Analizando..." : "▶  Analizar"}
                </button>
              </div>
            </div>

            {error && <div className="mx-6 mt-4 p-3 bg-red-950/50 border border-red-800 rounded text-red-400 text-xs">✗ {error}</div>}

            {lrResponse?.result.conflicts && lrResponse.result.conflicts.length > 0 && (
              <div className="mx-6 mt-4 p-3 bg-yellow-950/50 border border-yellow-800 rounded text-yellow-400 text-xs flex flex-col gap-1">
                <strong>⚠ Conflictos detectados en {method.toUpperCase()}:</strong>
                <div className="max-h-24 overflow-y-auto">
                  {lrResponse.result.conflicts.map((c, i) => <div key={i} className="text-yellow-500">{c}</div>)}
                </div>
              </div>
            )}

            {/* Asistente IA */}
            {(isTabularResponse ? lrResponse?.ai_triggered : rdResponse?.ai_triggered) && (
              <div className="mx-6 mt-4 p-4 bg-indigo-950/30 border border-indigo-500/40 rounded-lg shadow-lg flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-indigo-400 text-lg">✨</span>
                  <h3 className="text-indigo-300 font-bold tracking-wide uppercase text-xs">Sugerencia de IA</h3>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-zinc-300 max-h-64 overflow-y-auto pr-2 custom-scrollbar bg-black/20 p-3 rounded border border-indigo-500/20">
                  <ReactMarkdown>{(isTabularResponse ? lrResponse?.ai_explanation : rdResponse?.ai_explanation) || ""}</ReactMarkdown>
                </div>
                {(isTabularResponse ? lrResponse?.ai_fixed : rdResponse?.ai_fixed) && (
                  <button
                    onClick={() => {
                      const fixed = isTabularResponse ? lrResponse?.ai_fixed : rdResponse?.ai_fixed;
                      if (fixed) { setGrammarText(fixed); handleParse(fixed); }
                    }}
                    className="mt-2 self-start bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded font-bold uppercase tracking-widest flex items-center gap-2"
                  >
                    ✨ Aceptar gramática corregida y reintentar
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bloque 2: Tableros Gráficos */}
          {(hasResponse || automata) && (
            <div className="flex flex-col p-6 pt-2 gap-4 flex-shrink-0">
              <div className="flex items-center gap-4">
                {currentResult && (
                  <>
                    <span className={`px-3 py-1 rounded text-xs font-bold border ${currentResult.is_valid ? "bg-green-400/10 border-green-400/40 text-green-400" : "bg-red-400/10 border-red-400/40 text-red-400"}`}>
                      {currentResult.is_valid ? "✓ ACEPTADA" : "✗ RECHAZADA"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {currentResult.tokens_consumed}/{currentResult.total_tokens} tokens · {currentResult.steps.length} pasos
                    </span>
                  </>
                )}
                <div className="ml-auto flex gap-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1 text-xs rounded transition-all ${activeTab === tab.id ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {activeTab === "table" && lrResponse && <ExportPdfButton result={lrResponse.result} method={method} />}
              </div>

              {currentResult && !currentResult.is_valid && currentResult.error_message && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded text-xs text-red-300 whitespace-pre-wrap">{currentResult.error_message}</div>
              )}

              {/* Render de Paneles de Visualización */}
              <div className="h-[75vh] min-h-[600px] overflow-y-auto rounded border border-zinc-800 bg-zinc-900 relative">
                {activeTab === "steps" && !isTabularResponse && rdResponse && <RDStepsView response={rdResponse} />}
                {activeTab === "steps" && isTabularResponse && lrResponse && <LRStepsView response={lrResponse} method={method} />}
                
                {activeTab === "table" && lrResponse && (
                  <div ref={lrTableRef}>
                    <LRTableView result={lrResponse.result} method={method} />
                  </div>
                )}

                {activeTab === "tree" && (
                  <div className="p-4">
                    {currentResult?.parse_tree ? (
                      <TreeNode node={currentResult.parse_tree as TreeNodeType} depth={0} />
                    ) : (
                      <p className="text-zinc-600 text-xs">No hay árbol disponible (cadena rechazada).</p>
                    )}
                  </div>
                )}

                {activeTab === "grammar" && currentGrammar && (
                  <GrammarView
                    grammar={currentGrammar}
                    generatedFunctions={rdResponse?.generated_functions}
                    lrResult={isTabularResponse ? lrResponse?.result : undefined}
                  />
                )}

                {activeTab === "automata" && automata && (
                  <AutomataViewComponent 
                    automata={automata} 
                    view={automataView} 
                    setView={setAutomataView} 
                    zoom={zoom}
                    panX={panX}
                    panY={panY}
                    setZoom={setZoom}
                    setPanX={setPanX}
                    setPanY={setPanY}
                  />
                )}
              </div>
            </div>
          )}

          {/* Franja Desplegable del Teclado Fijo */}
          <div className="sticky bottom-0 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800 z-50 w-full flex-shrink-0 px-4 py-2 mt-auto">
            <div className="flex flex-col items-start w-full">
              <button
                onClick={() => { setShowKeyboard(!showKeyboard); }}
                className={`px-4 py-1.5 rounded-t-md text-[11px] font-bold uppercase tracking-widest border-t border-x transition-all flex items-center gap-2 -mt-[42px] mb-2 ${
                  showKeyboard ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800" : "bg-green-400/10 border-green-400/40 text-green-400 shadow-[0_-4px_12px_rgba(74,222,128,0.15)] animate-pulse"
                }`}
              >
                {showKeyboard ? "✕ Ocultar Teclado" : "⌨ Mostrar Teclado"}
              </button>
              {showKeyboard && (
                <div className="w-full pt-1">
                  <VirtualKeyboard target={activeField} onInsert={kbInsert} onBackspace={kbBackspace} onEnter={kbEnter} onAnalyze={() => handleParse()} loading={loading} />
                </div>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
import { useState, useRef } from "react";

// ─── COMPONENTES MODULARIZADOS ──────────────────────────────────────────────
import { GrammarView } from "./components/GrammarView";
import { SLRTableView } from "./components/SLRTableView";
import { AutomataView } from "./components/AutomataView";
import { StaticAutomataGraph } from "./components/StaticAutomataGraph";
import { TreeNode } from "./components/TreeNode";

// ─── CONSTANTES Y TIPOS ──────────────────────────────────────────────────────
import { DEFAULT_GRAMMAR, DEFAULT_INPUT, PARSERS } from "./constans/parser";
import type { ParserMethod, GrammarInfo, SLRParseResult, AutomataResponse, GraphNode, GraphLink, TreeNodeType } from "./types/parser";

// ─── COMPONENTE TECLADO VIRTUAL INTEGRADO ───────────────────────────────────
interface VirtualKeyboardProps {
  onInsert: (symbol: string) => void;
  target: "grammar" | "input";
}

const KEYBOARD_GROUPS = [
  {
    label: "Gramática",
    keys: [
      { symbol: "->", title: "Producción" },
      { symbol: "|", title: "Alternativa" },
      { symbol: "ε", title: "Epsilon" },
      { symbol: "λ", title: "Lambda" },
    ],
  },
  {
    label: "Terminales comunes",
    keys: [
      { symbol: "id", title: "Identificador" },
      { symbol: "num", title: "Número" },
      { symbol: "+", title: "Suma" },
      { symbol: "-", title: "Resta" },
      { symbol: "*", title: "Multiplicación" },
      { symbol: "/", title: "División" },
      { symbol: "(", title: "Paréntesis abre" },
      { symbol: ")", title: "Paréntesis cierra" },
      { symbol: ";", title: "Punto y coma" },
      { symbol: ",", title: "Coma" },
      { symbol: "=", title: "Igual" },
    ],
  },
  {
    label: "No Terminales",
    keys: [
      { symbol: "E", title: "Expresión" },
      { symbol: "T", title: "Término" },
      { symbol: "F", title: "Factor" },
      { symbol: "S", title: "Sentencia" },
    ],
  },
];

function VirtualKeyboard({ onInsert, target }: VirtualKeyboardProps) {
  const [activeGroup, setActiveGroup] = useState(0);
  const group = KEYBOARD_GROUPS[activeGroup];

  return (
    <div className="border border-[#18181b] bg-[#0c0d0e] p-2 shrink-0">
      <div className="flex gap-1 mb-2 items-center">
        {KEYBOARD_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setActiveGroup(i)}
            className={`px-2 py-0.5 text-[9px] font-bold transition-all ${activeGroup === i
                ? "bg-[#1f2937] text-zinc-200 border border-[#374151]"
                : "text-[#52525b] hover:text-zinc-400"
              }`}
          >
            {g.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-[#3f3f46]">
          [Insertando en: <span className={target === "grammar" ? "text-[#22c55e]" : "text-[#eab308]"}>{target === "grammar" ? "gramática" : "cadena"}</span>]
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {group.keys.map((key) => (
          <button
            key={key.symbol}
            onClick={() => onInsert(key.symbol)}
            title={key.title}
            className="px-2 py-1 text-[11px] font-mono bg-[#111217] border border-[#18181b] text-zinc-300 hover:text-[#22c55e] hover:border-[#22c55e]/40 transition-all"
          >
            {key.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL APP ────────────────────────────────────────────────
export default function App() {
  const [selectedMethod, setSelectedMethod] = useState<ParserMethod>("lalr1");
  const [grammarRaw, setGrammarRaw] = useState<string>(`E -> E + T | T
T -> T * F | F
F -> ( E ) | id`);
  const [inputString, setInputString] = useState<string>(DEFAULT_INPUT);
  const [loading, setLoading] = useState<boolean>(false);

  // Control de foco dinámico para el Teclado Virtual
  const [keyboardTarget, setKeyboardTarget] = useState<"grammar" | "input">("grammar");
  const grammarRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Estados de datos
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const [grammarInfo, setGrammarInfo] = useState<GrammarInfo | null>(null);
  const [slrResult, setSlrResult] = useState<SLRParseResult | null>(null);
  const [automataData, setAutomataData] = useState<AutomataResponse | null>(null);
  const [parseTree, setParseTree] = useState<TreeNodeType | null>(null);

  // Determinar si el método seleccionado pertenece a la familia LR
  const isLRMethod = ["lr0", "slr1", "lalr1", "lr1"].includes(selectedMethod);

  // Cambiar método cargando su respectiva gramática por defecto de forma segura
  const handleMethodChange = (method: ParserMethod) => {
    setSelectedMethod(method);

    // Limpiar estados previos para evitar incongruencias visuales
    setGraphData({ nodes: [], links: [] });
    setGrammarInfo(null);
    setSlrResult(null);
    setAutomataData(null);
    setParseTree(null);

    // Asignar gramática según corresponda sin romper módulos externos
    if (method === "recursive-descent" || method === "ll1") {
      setGrammarRaw(DEFAULT_GRAMMAR);
    } else {
      setGrammarRaw(`E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id`);
    }
  };

  // Inserción inteligente de caracteres respetando la posición del cursor
  const handleInsertSymbol = (symbol: string) => {
    if (keyboardTarget === "grammar") {
      const el = grammarRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = el.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);

      const symbolWithSpacing = (symbol === "->") ? " -> " : (symbol === "|") ? " | " : symbol;

      setGrammarRaw(before + symbolWithSpacing + after);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + symbolWithSpacing.length, start + symbolWithSpacing.length);
      }, 0);
    } else {
      const el = inputRef.current;
      if (!el) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const text = el.value;
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);

      const symbolWithSpacing = text.endsWith(" ") || start === 0 ? symbol : ` ${symbol}`;

      setInputString(before + symbolWithSpacing + after);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + symbolWithSpacing.length, start + symbolWithSpacing.length);
      }, 0);
    }
  };

  const handleProcessGrammar = async () => {
    if (!grammarRaw.trim()) return;
    setLoading(true);

    // Limpiamos estados previos antes de pintar la nueva consulta
    setGraphData({ nodes: [], links: [] });
    setGrammarInfo(null);
    setSlrResult(null);
    setAutomataData(null);
    setParseTree(null);

    // Sanitizamos el string para evitar problemas con saltos de línea de SOs (\r\n)
    const cleanedGrammar = grammarRaw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join("\n");

    try {
      // 1. PETICIÓN PRINCIPAL DE PARSEO
      const parseUrl = `http://localhost:8000/parse/${selectedMethod}`;
      const parseResponse = await fetch(parseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grammar_text: cleanedGrammar,
          input_string: inputString.trim(),
        }),
      });

      if (!parseResponse.ok) {
        try {
          const errorData = await parseResponse.json();
          alert(`❌ Error del Analizador (${selectedMethod}):\n${errorData.detail}`);
        } catch {
          alert(`❌ Error en el servidor: ${parseResponse.statusText}`);
        }
        setLoading(false);
        return;
      }

      const parseData = await parseResponse.json();

      // Guardamos la información base de la gramática si está disponible
      if (parseData.grammar) setGrammarInfo(parseData.grammar);
      
      // Control seguro sobre el objeto result
      if (parseData.result) {
        setSlrResult(parseData.result);
        if (parseData.result.parse_tree) {
          setParseTree(parseData.result.parse_tree);
        }
      }

      // 2. PETICIÓN ADICIONAL DE AUTÓMATAS (Solo si es un método de la familia LR)
      if (isLRMethod) {
        const automataResponse = await fetch("http://localhost:8000/grammar/automata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grammar_text: cleanedGrammar,
          }),
        });

        if (automataResponse.ok) {
          const automataDataReceived = await automataResponse.json();
          setAutomataData(automataDataReceived);

          // Controlamos de forma segura que el backend envíe estados para el AFD del grafo
          if (automataDataReceived && automataDataReceived.afd && automataDataReceived.afd.states) {
            const nodes = automataDataReceived.afd.states.map((s: any) => ({
              id: s.id,
              label: s.label || `I${s.id}`,
              isStart: !!s.is_start,
              isAccept: !!s.is_accept,
              items: s.items || []
            }));

            const links = automataDataReceived.afd.transitions.map((t: any) => ({
              source: t.from,
              target: t.to,
              symbol: t.symbol,
            }));

            setGraphData({ nodes, links });
          }
        }
      }

    } catch (err) {
      console.error("❌ Error en la conexión con FastAPI:", err);
      alert("No se pudo conectar con el servidor de FastAPI. Verifica que esté corriendo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-[#0a0b0d] text-[#71717a] font-mono flex flex-col overflow-hidden text-[11px] antialiased select-none">

      {/* ─── HEADER / TOPBAR ─── */}
      <header className="h-7 bg-[#0a0b0d] border-b border-[#18181b] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-[#22c55e] font-bold">
          <span>&lt;/&gt;</span>
          <span className="text-zinc-300 font-medium tracking-tight text-[11px]">ANALIZADOR SINTÁCTICO</span>
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
        </div>
      </header>

      {/* ─── CUERPO PRINCIPAL ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR IZQUIERDO */}
        <aside className="w-48 bg-[#0a0b0d] border-r border-[#18181b] flex flex-col pt-2 shrink-0 justify-between">
          <div className="flex flex-col">
            {/* Bloque Método */}
            <div className="px-3 py-1">
              <span className="text-[10px] font-bold text-[#3f3f46] uppercase tracking-wider block mb-1">METODO</span>
              <nav className="flex flex-col space-y-0.5">
                {PARSERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleMethodChange(p.id)}
                    className={`w-full text-left px-2 py-0.5 transition-colors text-[11px] ${selectedMethod === p.id
                        ? "text-[#22c55e] bg-[#052e16]/30 font-medium border-l-2 border-[#22c55e] -ml-3 pl-2.5"
                        : "text-[#52525b] hover:text-zinc-300"
                      }`}
                  >
                    {selectedMethod === p.id ? "▶ " : "  "}{p.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Bloque Visualizar CONDICIONADO A FAMILIA LR */}
            {isLRMethod && (
              <div className="px-3 py-1 mt-3">
                <span className="text-[10px] font-bold text-[#3f3f46] uppercase tracking-wider block mb-1">VISUALIZAR</span>
                <nav className="flex flex-col">
                  <button className="w-full text-left px-2 py-0.5 text-[#a855f7] font-medium border-l-2 border-[#a855f7] bg-[#581c87]/10 -ml-3 pl-2.5">
                    ◆ Autómatas LR
                  </button>
                </nav>
              </div>
            )}
          </div>

          {/* Identificador inferior */}
          <div className="p-3 border-t border-[#18181b] flex items-center gap-1.5 text-zinc-400">
            <span>💻</span>
            <span className="font-semibold text-[11px]">DiazB)</span>
          </div>
        </aside>

        {/* CONTENIDO DE TRABAJO DERECHO */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* SECCIÓN SUPERIOR INPUTS */}
          <div className="flex h-36 border-b border-[#18181b] shrink-0 bg-[#0a0b0d]">

            {/* 1. Contenedor Gramática */}
            <div className="w-[55%] p-3 border-r border-[#18181b] flex flex-col">
              <span className="text-[10px] font-bold text-[#3f3f46] uppercase tracking-wider mb-1 block">GRAMATICA</span>
              <textarea
                ref={grammarRef}
                value={grammarRaw}
                onFocus={() => setKeyboardTarget("grammar")}
                onChange={(e) => setGrammarRaw(e.target.value)}
                className="w-full flex-1 bg-transparent text-[#22c55e] font-mono text-[11px] resize-none focus:outline-none leading-relaxed outline-none"
                spellCheck={false}
              />
            </div>

            {/* 2. Contenedor Cadena de Entrada + Botón Analizar */}
            <div className="w-[45%] p-3 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-[#3f3f46] uppercase tracking-wider block">CADENA DE ENTRADA</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputString}
                  onFocus={() => setKeyboardTarget("input")}
                  onChange={(e) => setInputString(e.target.value)}
                  className="w-full bg-transparent text-[#eab308] font-mono text-[11px] focus:outline-none outline-none font-bold tracking-wide"
                />
                <span className="text-[10px] text-[#3f3f46] block">Tokens separados por espacios</span>
              </div>

              <button
                onClick={handleProcessGrammar}
                disabled={loading}
                className="w-full py-1 bg-[#052e16]/20 border border-[#14532d]/40 hover:bg-[#052e16]/40 text-[#22c55e] text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 tracking-widest uppercase rounded-sm"
              >
                <span>▶</span> {loading ? "PROCESANDO..." : "ANALIZAR"}
              </button>
            </div>
          </div>

          {/* TECLADO VIRTUAL INTEGRADO */}
          <VirtualKeyboard onInsert={handleInsertSymbol} target={keyboardTarget} />

          {/* ─── SECCIÓN INFERIOR COMPLETA RESULTADOS ─── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#07080a] border-t border-[#18181b]">

            {/* Barra de Pestañas Condicionada */}
            <div className="h-7 bg-[#0a0b0d] border-b border-[#18181b] flex items-center shrink-0 text-[10px]">
              {isLRMethod ? (
                <>
                  <div className="bg-[#1e1b4b]/30 text-[#c084fc] px-3 h-full flex items-center font-bold border-r border-[#18181b] border-l border-l-[#a855f7]">
                    <span className="mr-1">◆</span> Autómatas LR
                  </div>
                  <div className="text-[#3f3f46] px-3 font-medium">
                    Autómata LR
                  </div>
                </>
              ) : (
                <div className="text-[#3f3f46] px-3 font-medium">
                  Resultados del Analizador {selectedMethod.toUpperCase()}
                </div>
              )}
            </div>

            {/* Contenedor del Grafo / Resultados con renderizado seguro */}
            <div className="flex-1 overflow-auto p-4 relative">
              {grammarInfo || slrResult || graphData.nodes.length > 0 ? (
                <div className="w-full h-full relative">
                  
                  {/* El grafo solo se monta si es método LR y hay nodos cargados */}
                  {isLRMethod && graphData.nodes.length > 0 && (
                    <StaticAutomataGraph data={graphData} />
                  )}

                  <div className="mt-6 space-y-6">
                    {slrResult && <SLRTableView result={slrResult} />}
                    {grammarInfo && <GrammarView grammar={grammarInfo} slrResult={slrResult ?? undefined} />}
                    {automataData && isLRMethod && <AutomataView {...({ nfa: automataData.afn, graphData } as any)} />}
                    {parseTree && (
                      <div className="p-3 bg-[#0a0b0d] border border-[#18181b]">
                        <TreeNode node={parseTree} depth={0} />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#3f3f46]">
                  Presiona ANALIZAR para enviar la gramática al servidor...
                </div>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
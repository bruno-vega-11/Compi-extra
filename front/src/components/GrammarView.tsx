import type { GrammarInfo, SLRParseResult } from "../types/parser";

interface GrammarViewProps {
  grammar: GrammarInfo;
  generatedFunctions?: { 
    function_name: string; 
    cases: { production: string; triggered_by_tokens: string[] }[] 
  }[];
  slrResult?: SLRParseResult;
}

export function GrammarView({ grammar, generatedFunctions, slrResult }: GrammarViewProps) {
  // Salvaguarda en caso de que grammar o sus propiedades vengan indefinidas
  const productions = grammar?.productions ?? {};
  const first = slrResult?.first ?? grammar?.first ?? {};
  const follow = slrResult?.follow ?? grammar?.follow ?? {};

  return (
    <div className="p-4 grid grid-cols-2 gap-6">
      {/* Sección Izquierda: Producciones */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Producciones</p>
        {Object.entries(productions).map(([nt, prods]) => (
          <div key={nt} className="mb-2 text-sm font-mono">
            <span className="text-cyan-400">{nt}</span>
            <span className="text-zinc-500"> → </span>
            <span className="text-zinc-300">
              {prods?.map((p) => p.join(" ")).join(" | ") ?? "ε"}
            </span>
          </div>
        ))}
      </div>

      {/* Sección Derecha: FIRST y FOLLOW */}
      <div className="flex flex-col gap-4 font-mono">
        {/* Conjuntos FIRST */}
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3 font-sans">FIRST</p>
          {Object.entries(first).map(([nt, set]) => (
            <div key={nt} className="text-xs mb-1">
              <span className="text-cyan-400">FIRST({nt})</span>
              <span className="text-zinc-500"> = </span>
              <span className="text-green-300">
                {"{ "}{(set as string[] || []).join(", ")}{" }"}
              </span>
            </div>
          ))}
        </div>

        {/* Conjuntos FOLLOW */}
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3 font-sans">FOLLOW</p>
          {Object.entries(follow).map(([nt, set]) => (
            <div key={nt} className="text-xs mb-1">
              <span className="text-cyan-400">FOLLOW({nt})</span>
              <span className="text-zinc-500"> = </span>
              <span className="text-yellow-300">
                {"{ "}{(set as string[] || []).join(", ")}{" }"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Funciones generadas dinámicamente (Opcional) */}
      {generatedFunctions && generatedFunctions.length > 0 && (
        <div className="col-span-2">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Funciones generadas dinámicamente</p>
          <div className="grid grid-cols-2 gap-3">
            {generatedFunctions.map((fn) => (
              <div key={fn.function_name} className="bg-zinc-800 rounded p-3 border border-zinc-700 font-mono">
                <p className="text-green-400 text-xs font-bold mb-2 font-sans">{fn.function_name}()</p>
                {fn.cases.map((c, i) => (
                  <div key={i} className="text-xs mb-1">
                    <span className="text-zinc-500">if token in </span>
                    <span className="text-yellow-400">
                      [{ (c.triggered_by_tokens || []).join(", ") }]
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
  );
}
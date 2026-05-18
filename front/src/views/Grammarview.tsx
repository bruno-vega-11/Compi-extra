import type { GrammarInfo, LRParseResult, RDApiResponse } from "../types";

interface Props {
  grammar: GrammarInfo;
  generatedFunctions?: RDApiResponse["generated_functions"];
  lrResult?: LRParseResult;
}

export function GrammarView({ grammar, generatedFunctions, lrResult }: Props) {
  const first  = lrResult?.first  ?? grammar.first;
  const follow = lrResult?.follow ?? grammar.follow;

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
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
            Funciones generadas dinámicamente
          </p>
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
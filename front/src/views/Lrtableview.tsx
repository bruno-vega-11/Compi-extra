import type { LRParseResult } from "../types";
import type { ParserMethod } from "../types";

function cellColor(val: string) {
  if (!val) return "text-zinc-700";
  if (val === "acc") return "text-green-400 font-bold";
  if (val.startsWith("s")) return "text-cyan-400";
  if (val.startsWith("r")) return "text-yellow-400";
  if (val.includes("→")) return "text-purple-300";
  if (val.includes("/")) return "text-red-400 font-bold";
  return "text-zinc-300";
}

export function LRTableView({
  result,
  method,
}: {
  result: LRParseResult;
  method: ParserMethod;
}) {
  const { action_table, goto_table } = result;
  const terms    = action_table.terminals;
  const nonterms = goto_table.nonterminals;
  const isLL1    = method === "ll1";

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
          <thead className="sticky top-0 bg-zinc-800 z-10">
            <tr>
              <th className="px-3 py-2 text-zinc-400 border border-zinc-700 text-left" rowSpan={2}>Estado</th>
              <th
                className="px-3 py-2 text-cyan-400 border border-zinc-700 text-center"
                colSpan={terms.length}
              >
                ACTION
              </th>
              {!isLL1 && (
                <th
                  className="px-3 py-2 text-purple-400 border border-zinc-700 text-center"
                  colSpan={nonterms.length}
                >
                  GOTO
                </th>
              )}
            </tr>
            <tr>
              {terms.map(t => (
                <th key={t} className="px-3 py-2 text-zinc-400 border border-zinc-700 text-center">{t}</th>
              ))}
              {!isLL1 && nonterms.map(n => (
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
                {!isLL1 && nonterms.map(n => (
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

      {!isLL1 && (
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
      )}
    </div>
  );
}
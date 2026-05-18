import type { SLRParseResult } from "../types/parser";

interface SLRTableViewProps {
  result: SLRParseResult | null | undefined; // Permitimos nulos para la carga inicial
}

export function SLRTableView({ result }: SLRTableViewProps) {
  // 1. Cláusula de seguridad si no hay datos procesados
  if (!result || !result.action_table || !result.goto_table) {
    return (
      <div className="p-6 text-zinc-500 text-xs italic text-center border border-dashed border-zinc-800 rounded-xl">
        Esperando análisis de gramática para generar las tablas SLR(1)...
      </div>
    );
  }

  const { action_table, goto_table } = result;
  const terms = action_table.terminals || [];
  const nonterms = goto_table.nonterminals || [];

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
      {/* Listado de Producciones Indexadas */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Producciones</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {action_table.productions?.map((p) => (
            <span key={p.index} className="text-xs font-mono">
              <span className="text-yellow-400">r{p.index}</span>
              <span className="text-zinc-500"> : </span>
              <span className="text-zinc-300">{p.production}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tabla de Acción e Ir-A (SLR Parsing Table) */}
      <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950/50">
        <table className="text-xs border-collapse w-full">
          <thead className="sticky top-0 bg-zinc-900 z-10">
            <tr>
              <th className="px-3 py-2 text-zinc-400 border border-zinc-800 text-left bg-zinc-900" rowSpan={2}>Estado</th>
              <th className="px-3 py-2 text-cyan-400 border border-zinc-800 text-center bg-zinc-900/80" colSpan={terms.length}>ACTION</th>
              <th className="px-3 py-2 text-purple-400 border border-zinc-800 text-center bg-zinc-900/80" colSpan={nonterms.length}>GOTO</th>
            </tr>
            <tr>
              {terms.map((t) => <th key={t} className="px-3 py-2 text-zinc-500 border border-zinc-800 text-center font-mono">{t}</th>)}
              {nonterms.map((n) => <th key={n} className="px-3 py-2 text-zinc-500 border border-zinc-800 text-center font-mono">{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {action_table.rows?.map((actionRow) => {
              // 2. Buscar la fila correspondiente en GOTO usando el ID del estado, no el índice del array
              const gotoRow = goto_table.rows?.find((gr) => gr.state === actionRow.state);

              return (
                <tr key={actionRow.state} className="hover:bg-zinc-900 border-b border-zinc-900/50">
                  <td className="px-3 py-2 text-zinc-400 border border-zinc-800 font-bold text-center bg-zinc-950">{actionRow.state}</td>
                  
                  {/* Celdas de ACTION */}
                  {terms.map((t) => {
                    // Cast dinámico seguro para evitar que TS bloquee la lectura de propiedades dinámicas
                    const cellValue = (actionRow as Record<string, any>)[t] || "";
                    return (
                      <td key={t} className={`px-3 py-2 border border-zinc-800 text-center font-mono ${cellColor(cellValue)}`}>
                        {cellValue}
                      </td>
                    );
                  })}
                  
                  {/* Celdas de GOTO */}
                  {nonterms.map((n) => {
                    const cellValue = gotoRow ? (gotoRow as Record<string, any>)[n] || "" : "";
                    return (
                      <td key={n} className={`px-3 py-2 border border-zinc-800 text-center font-mono ${cellValue ? "text-purple-400" : "text-zinc-800"}`}>
                        {cellValue}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Colección de Items de Clausura por Estado */}
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Items por estado</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {result.states?.map((s) => (
            <div key={s.id} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800 shadow-sm">
              <p className="text-purple-400 text-xs font-bold mb-2">I{s.id}</p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                {s.items?.map((item, i) => (
                  <div key={i} className="text-xs text-zinc-300 font-mono tracking-wide">{item}</div>
                ))}
              </div>
              
              {s.transitions && Object.keys(s.transitions).length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-800/60 flex flex-wrap gap-x-3 gap-y-1">
                  {Object.entries(s.transitions).map(([sym, dst]) => (
                    <span key={sym} className="text-xs font-mono">
                      <span className="text-yellow-400">{sym}</span>
                      <span className="text-zinc-500"> → </span>
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
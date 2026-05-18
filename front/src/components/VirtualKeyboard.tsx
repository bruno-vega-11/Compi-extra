import { useState } from "react";

export type KeyboardTarget = "grammar" | "input";

interface VirtualKeyboardProps {
  target: KeyboardTarget;
  onInsert: (symbol: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onAnalyze: () => void;
  loading?: boolean;
}

const ROWS_UPPER = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
];

const GRAMMAR_KEYS: { label: string; value: string; color?: "cyan"|"purple"|"yellow" }[] = [
  { label: "->",  value: "->",   color: "cyan"   },
  { label: "|",   value: " | ",  color: "cyan"   },
  { label: "ε",   value: "ε",    color: "purple" },
  { label: "λ",   value: "λ",    color: "purple" },
  { label: "id",  value: "id",   color: "yellow" },
  { label: "num", value: "num",  color: "yellow" },
  { label: "+",   value: "+"  },
  { label: "-",   value: "-"  },
  { label: "*",   value: "*"  },
  { label: "/",   value: "/"  },
  { label: "(",   value: "("  },
  { label: ")",   value: ")"  },
  { label: "{",   value: "{"  },
  { label: "}",   value: "}"  },
  { label: "[",   value: "["  },
  { label: "]",   value: "]"  },
  { label: ";",   value: ";"  },
  { label: ",",   value: ","  },
  { label: "=",   value: "="  },
  { label: "==",  value: "==" },
  { label: "!=",  value: "!=" },
  { label: "<",   value: "<"  },
  { label: ">",   value: ">"  },
  { label: "<=",  value: "<=" },
  { label: ">=",  value: ">=" },
  { label: "'",   value: "'"  },
  { label: "\"",  value: "\"" },
  { label: "_",   value: "_"  },
  { label: "$",   value: "$"  },
  { label: "#",   value: "#"  },
];

const COLOR_CLS = {
  cyan:   "text-cyan-400   border-cyan-800   hover:border-cyan-500   hover:bg-cyan-400/10",
  purple: "text-purple-400 border-purple-800 hover:border-purple-500 hover:bg-purple-400/10",
  yellow: "text-yellow-400 border-yellow-800 hover:border-yellow-500 hover:bg-yellow-400/10",
};
const BASE_KEY = "inline-flex items-center justify-center rounded border bg-zinc-800/80 font-mono text-xs transition-all active:scale-95 active:bg-zinc-700 cursor-pointer select-none";
const NORMAL   = "text-zinc-300 border-zinc-700 hover:text-green-400 hover:border-green-400/40 hover:bg-green-400/5";

function kc(color?: "cyan"|"purple"|"yellow") {
  return `${BASE_KEY} ${color ? COLOR_CLS[color] : NORMAL}`;
}

export function VirtualKeyboard({
  target,
  onInsert,
  onBackspace,
  onEnter,
  onAnalyze,
  loading,
}: VirtualKeyboardProps) {
  const [shift, setShift] = useState(false);

  function pressKey(raw: string) {
    const v = shift ? raw.toUpperCase() : raw.toLowerCase();
    onInsert(/^[a-zA-Z0-9]$/.test(v) ? v : raw);
    if (shift && /^[a-zA-Z]$/.test(raw)) setShift(false);
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 px-5 pt-3 pb-4 select-none">

      {/* Header */}
      <div className="mb-3">
        <span className="text-[10px] text-zinc-600 tracking-widest uppercase">
          teclado →{" "}
          <span className={target === "grammar" ? "text-green-400" : "text-yellow-400"}>
            {target === "grammar" ? "gramática" : "cadena de entrada"}
          </span>
        </span>
      </div>

      <div className="flex gap-4">

        {/* ── Main keyboard panel ── */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">

          {/* QWERTY: cada tecla es flex-1 → ocupa todo el ancho sin márgenes */}
          <div className="flex flex-col gap-1.5">
            {ROWS_UPPER.map((row, ri) => (
              <div key={ri} className="flex gap-1.5">
                {row.map(ch => (
                  <button
                    key={ch}
                    onClick={() => pressKey(ch)}
                    className={`${kc()} h-10 flex-1`}
                  >
                    {shift ? ch : ch.toLowerCase()}
                  </button>
                ))}
              </div>
            ))}

            {/* Action row */}
            <div className="flex gap-1.5 mt-0.5">
              <button
                onClick={() => setShift(s => !s)}
                className={`h-10 px-4 shrink-0 rounded border text-xs font-mono transition-all cursor-pointer ${
                  shift
                    ? "bg-green-400/15 border-green-400/50 text-green-400"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                }`}
              >
                ⇧ Shift
              </button>
              <button onClick={() => onInsert(" ")} className={`${kc()} h-10 flex-1`}>
                espacio
              </button>
              {target === "grammar" && (
                <button onClick={onEnter} className={`${kc()} h-10 px-4 shrink-0`}>
                  ↵ Enter
                </button>
              )}
              <button
                onClick={onBackspace}
                className="h-10 px-4 shrink-0 rounded border bg-zinc-800 border-zinc-700 font-mono text-xs text-zinc-400 hover:text-red-400 hover:border-red-400/40 transition-all cursor-pointer"
              >
                ⌫
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Symbols */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-zinc-600 tracking-widest uppercase">Símbolos</p>
            <div className="flex flex-wrap gap-1.5">
              {GRAMMAR_KEYS.map(k => (
                <button
                  key={k.label}
                  onClick={() => onInsert(k.value)}
                  title={k.label}
                  className={`${kc(k.color)} h-10 px-3 min-w-[2.5rem]`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* ── Analizar ── */}
        <div className="flex shrink-0">
          <button
            onClick={onAnalyze}
            disabled={loading}
            className="w-full px-7 rounded border text-xs font-mono tracking-widest uppercase transition-all
              bg-green-400/10 border-green-400/40 text-green-400
              hover:bg-green-400/20 hover:border-green-400
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "⟳\nAnalizando" : "▶\nAnalizar"}
          </button>
        </div>

      </div>
    </div>
  );
}
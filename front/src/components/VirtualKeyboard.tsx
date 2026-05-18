// ─── Virtual Keyboard ────────────────────────────────────────────────────────
// Pega este componente en tu App.tsx junto a los otros componentes (TreeNode, etc.)
// Luego úsalo dentro del panel de inputs (ver instrucciones abajo)

import { useState } from "react";

interface VirtualKeyboardProps {
  onInsert: (symbol: string) => void;
  target: "grammar" | "input";
}

const KEYBOARD_GROUPS = [
  {
    label: "Gramática",
    keys: [
      { symbol: "->",  title: "Producción" },
      { symbol: "|",   title: "Alternativa" },
      { symbol: "ε",   title: "Epsilon" },
      { symbol: "λ",   title: "Lambda" },
    ],
  },
  {
    label: "Terminales comunes",
    keys: [
      { symbol: "id",  title: "Identificador" },
      { symbol: "num", title: "Número" },
      { symbol: "+",   title: "Suma" },
      { symbol: "-",   title: "Resta" },
      { symbol: "*",   title: "Multiplicación" },
      { symbol: "/",   title: "División" },
      { symbol: "(",   title: "Paréntesis abre" },
      { symbol: ")",   title: "Paréntesis cierra" },
      { symbol: "{",   title: "Llave abre" },
      { symbol: "}",   title: "Llave cierra" },
      { symbol: "[",   title: "Corchete abre" },
      { symbol: "]",   title: "Corchete cierra" },
      { symbol: ";",   title: "Punto y coma" },
      { symbol: ",",   title: "Coma" },
      { symbol: "=",   title: "Igual" },
      { symbol: "==",  title: "Igual igual" },
      { symbol: "!=",  title: "Distinto" },
      { symbol: "<",   title: "Menor que" },
      { symbol: ">",   title: "Mayor que" },
      { symbol: "<=",  title: "Menor igual" },
      { symbol: ">=",  title: "Mayor igual" },
    ],
  },
  {
    label: "No Terminales comunes",
    keys: [
      { symbol: "E",    title: "Expresión" },
      { symbol: "T",    title: "Término" },
      { symbol: "F",    title: "Factor" },
      { symbol: "S",    title: "Sentencia" },
      { symbol: "P",    title: "Programa" },
      { symbol: "B",    title: "Bloque" },
      { symbol: "D",    title: "Declaración" },
      { symbol: "L",    title: "Lista" },
    ],
  },
];

export function VirtualKeyboard({ onInsert, target }: VirtualKeyboardProps) {
  const [activeGroup, setActiveGroup] = useState(0);
  const group = KEYBOARD_GROUPS[activeGroup];

  return (
    <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/80 p-2">
      {/* Tabs de grupo */}
      <div className="flex gap-1 mb-2">
        {KEYBOARD_GROUPS.map((g, i) => (
          <button
            key={g.label}
            onClick={() => setActiveGroup(i)}
            className={`px-2 py-0.5 text-[10px] rounded transition-all ${
              activeGroup === i
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {g.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-700 self-center pr-1">
          → {target === "grammar" ? "gramática" : "cadena"}
        </span>
      </div>

      {/* Teclas */}
      <div className="flex flex-wrap gap-1">
        {group.keys.map((key) => (
          <button
            key={key.symbol}
            onClick={() => onInsert(key.symbol)}
            title={key.title}
            className="px-2 py-1 rounded text-xs font-mono
                       bg-zinc-800 border border-zinc-700
                       text-zinc-300 hover:text-green-400
                       hover:border-green-400/40 hover:bg-green-400/5
                       transition-all active:scale-95"
          >
            {key.symbol}
          </button>
        ))}
      </div>
    </div>
  );
}
import type { ParserMethod, AutomataView } from "../types";

export const PARSERS: { id: ParserMethod; label: string; ready: boolean }[] = [
  { id: "recursive-descent", label: "Descenso Recursivo", ready: true },
  { id: "ll1",   label: "LL(1)",   ready: true },
  { id: "lr0",   label: "LR(0)",   ready: true },
  { id: "slr1",  label: "SLR(1)",  ready: true },
  { id: "lalr1", label: "LALR(1)", ready: true },
  { id: "lr1",   label: "LR(1)",   ready: true },
];

export const DEFAULT_GRAMMAR = `E -> T E2
E2 -> + T E2 | ε
T -> F T2
T2 -> * F T2 | ε
F -> ( E ) | id`;

export const DEFAULT_GRAMMAR_LR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

export const DEFAULT_INPUT = "id + id * id";

export const RD_STEP_COLORS: Record<string, string> = {
  call:    "text-cyan-400",
  check:   "text-yellow-400",
  match:   "text-green-400",
  epsilon: "text-purple-400",
  success: "text-green-300",
  error:   "text-red-400",
};

export const RD_STEP_ICONS: Record<string, string> = {
  call:    "→",
  check:   "?",
  match:   "✓",
  epsilon: "ε",
  success: "★",
  error:   "✗",
};

export const LR_STEP_COLORS: Record<string, string> = {
  shift:   "text-cyan-400",
  reduce:  "text-yellow-400",
  accept:  "text-green-300",
  error:   "text-red-400",
  match:   "text-green-400",
  predict: "text-purple-400",
};

export const LR_STEP_ICONS: Record<string, string> = {
  shift:   "⇒",
  reduce:  "↩",
  accept:  "★",
  error:   "✗",
  match:   "✓",
  predict: "→",
};

export const AUTOMATA_VIEW_LABELS: Record<AutomataView, string> = {
  afd:     "LR(0) DFA",
  afn:     "LR(0) NFA",
  lr1_afn: "LR(1) NFA",
  lr1:     "LR(1) DFA",
  lalr1:   "LALR(1)",
};
import type { ParserMethod } from "../types/parser";

// ─── CONSTANTES DE CONFIGURACIÓN ─────────────────────────────────────────────

export const PARSERS: { id: ParserMethod; label: string; ready: boolean }[] = [
  { id: "recursive-descent", label: "Descenso Recursivo", ready: true },
  { id: "ll1",   label: "LL(1)",   ready: false },
  { id: "lr0",   label: "LR(0)",   ready: false },
  { id: "slr1",  label: "SLR(1)",  ready: true },
  { id: "lalr1", label: "LALR(1)", ready: false },
  { id: "lr1",   label: "LR(1)",   ready: false },
];

// Gramática LL(1) / Descenso Recursivo por defecto (Factorizada y sin recursión izquierda)
export const DEFAULT_GRAMMAR = `E -> T E2
E2 -> + T E2 | ε
T -> F T2
T2 -> * F T2 | ε
F -> ( E ) | id`;

// Gramática clásica LR / SLR por defecto (Soporta recursión izquierda nativa)
export const DEFAULT_GRAMMAR_SLR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;

export const DEFAULT_INPUT = "id + id * id";

// ─── CONFIGURACIÓN DE HISTORIAL (DESCENSO RECURSIVO) ──────────────────────────

// Definimos los literales de paso permitidos para un tipado estricto e infalible
export type RdStepType = "call" | "check" | "match" | "epsilon" | "success" | "error";

export const RD_STEP_COLORS: Record<RdStepType, string> = {
  call: "text-cyan-400", 
  check: "text-yellow-400", 
  match: "text-green-400",
  epsilon: "text-purple-400", 
  success: "text-green-300", 
  error: "text-red-400",
};

export const RD_STEP_ICONS: Record<RdStepType, string> = {
  call: "→", 
  check: "?", 
  match: "✓", 
  epsilon: "ε", 
  success: "★", 
  error: "✗",
};

// ─── CONFIGURACIÓN DE HISTORIAL (SLR PARSING) ─────────────────────────────────

// Definimos las acciones sintácticas estándar de un parser Shift-Reduce
export type SlrStepType = "shift" | "reduce" | "accept" | "error";

export const SLR_STEP_COLORS: Record<SlrStepType, string> = {
  shift: "text-cyan-400", 
  reduce: "text-yellow-400", 
  accept: "text-green-300", 
  error: "text-red-400",
};

export const SLR_STEP_ICONS: Record<SlrStepType, string> = {
  shift: "⇒", 
  reduce: "↩", 
  accept: "★", 
  error: "✗",
};
export type ParserMethod = "recursive-descent" | "ll1" | "lr0" | "slr1" | "lalr1" | "lr1";

// ─── PARSER DESCENSO RECURSIVO (RD) ──────────────────────────────────────────

export interface RDParseStep {
  step_number: number;
  action: "call" | "check" | "match" | "epsilon" | "success" | "error";
  description: string;
  current_token: string;
  remaining_input: string[];
  production_used?: string;
}

export interface RDParseResult {
  is_valid: boolean;
  parse_tree: object | null;
  steps: RDParseStep[];
  error_message: string | null;
  tokens_consumed: number;
  total_tokens: number;
}

export interface RDApiResponse {
  method: string;
  grammar: GrammarInfo;
  generated_functions?: { 
    function_name: string; 
    cases: { production: string; triggered_by_tokens: string[] }[] 
  }[];
  result: RDParseResult;
}

// ─── PARSER LR(0) / SLR(1) ───────────────────────────────────────────────────

export interface SLRParseStep {
  step_number: number;
  action: "shift" | "reduce" | "accept" | "error";
  description: string;
  stack: number[];
  remaining_input: string[];
  production_used?: string;
}

export interface ActionTable {
  terminals: string[];
  // Se cambia a any para permitir la propiedad row.state de control junto a las llaves dinámicas
  rows: Record<string, any>[]; 
  productions: { index: number; production: string }[];
}

export interface GotoTable {
  nonterminals: string[];
  rows: Record<string, any>[];
}

export interface SLRParseResult {
  is_valid: boolean;
  steps: SLRParseStep[];
  action_table: ActionTable;
  goto_table: GotoTable;
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
  states: { id: number; items: string[]; transitions: Record<string, number> }[];
  conflicts: string[];
  error_message: string | null;
  tokens_consumed: number;
  total_tokens: number;
}

export interface SLRApiResponse {
  method: string;
  grammar: GrammarInfo;
  result: SLRParseResult;
}

// ─── AUTOMATAS & ESTRUCTURAS INTERNAS DEL BACKEND ─────────────────────────────

export interface NFAState {
  id: string; 
  label: string; 
  is_accept: boolean; 
  is_start: boolean;
  lhs: string; 
  rhs: string[]; 
  dot: number;
}

export interface NFATransition { 
  from: string; 
  to: string; 
  symbol: string; 
  type: "real" | "epsilon"; 
}

export interface DFAItem { 
  label: string; 
  lhs: string; 
  rhs: string[]; 
  dot: number; 
}

export interface DFAState { 
  id: string; 
  label: string; 
  items: DFAItem[]; 
  afn_states: string[]; 
  is_accept: boolean; 
  is_start: boolean; 
}

export interface DFATransition { 
  from: string; 
  to: string; 
  symbol: string; 
}

export interface AutomataResponse {
  afn: { 
    type: string; 
    states: NFAState[]; 
    transitions: NFATransition[]; 
    epsilon_transitions: NFATransition[]; 
    start_state: string; 
    accept_states: string[]; 
  };
  afd: { 
    type: string; 
    states: DFAState[]; 
    transitions: DFATransition[]; 
    start_state: string; 
    accept_states: string[]; 
  };
}

export interface GrammarInfo {
  start_symbol: string;
  productions: Record<string, string[][]>;
  terminals: string[];
  non_terminals: string[];
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
}

// ─── TIPOS EXCLUSIVOS PARA RENDERIZADO DE GRAFOS SVG (FRONTEND) ────────────────

export interface GraphNode { 
  id: string; 
  label: string; 
  isStart: boolean; 
  isAccept: boolean; 
  items?: any[]; // Cambiado a any[] para tolerar strings de NFA u objetos complejos de DFA
}

export interface GraphLink { 
  source: string; 
  target: string; 
  symbol: string; 
  type?: "real" | "epsilon"; 
}

export interface TreeNodeType {
  symbol: string;
  is_terminal: boolean;
  matched_token?: string;
  children?: TreeNodeType[];
}
// ─── Parser Types ──────────────────────────────────────────────────────────────

export type ParserMethod = "recursive-descent" | "ll1" | "lr0" | "slr1" | "lalr1" | "lr1";
export type AutomataView = "afd" | "afn" | "lr1_afn" | "lr1" | "lalr1";

// ─── Recursive Descent ────────────────────────────────────────────────────────

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
    cases: { production: string; triggered_by_tokens: string[] }[];
  }[];
  result: RDParseResult;
}

// ─── LR Family ───────────────────────────────────────────────────────────────

export interface LRParseStep {
  step_number: number;
  action: "shift" | "reduce" | "accept" | "error" | "match" | "predict";
  description: string;
  stack: (number | string)[];
  remaining_input: string[];
  production_used?: string;
}

export interface ActionTable {
  terminals: string[];
  rows: Record<string, string>[];
  productions: { index: number; production: string }[];
}

export interface GotoTable {
  nonterminals: string[];
  rows: Record<string, string>[];
}

export interface LRParseResult {
  is_valid: boolean;
  steps: LRParseStep[];
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

export interface LRApiResponse {
  method: string;
  grammar: GrammarInfo;
  result: LRParseResult;
}

// ─── Grammar ─────────────────────────────────────────────────────────────────

export interface GrammarInfo {
  start_symbol: string;
  productions: Record<string, string[][]>;
  terminals: string[];
  non_terminals: string[];
  first: Record<string, string[]>;
  follow: Record<string, string[]>;
}

// ─── NFA / DFA ───────────────────────────────────────────────────────────────

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

// ─── LR(1) / LALR(1) ────────────────────────────────────────────────────────

export interface LR1Item {
  label: string;
  lhs: string;
  rhs: string[];
  dot: number;
  lookahead: string;
  completed: boolean;
}

export interface LALR1Item {
  label: string;
  lhs: string;
  rhs: string[];
  dot: number;
  lookaheads: string[];
  completed: boolean;
}

export interface LR1State {
  id: string;
  label: string;
  items: LR1Item[];
  is_accept: boolean;
  is_start: boolean;
}

export interface LALR1State {
  id: string;
  label: string;
  items: LALR1Item[];
  lr1_ids: string[];
  is_accept: boolean;
  is_start: boolean;
}

export interface LR1Automata {
  type: string;
  states: LR1State[];
  transitions: DFATransition[];
  start_state: string;
  accept_states: string[];
}

export interface LALR1Automata {
  type: string;
  states: LALR1State[];
  transitions: DFATransition[];
  start_state: string;
  accept_states: string[];
}

export interface LR1NFAState {
  id: string;
  label: string;
  is_accept: boolean;
  is_start: boolean;
  lhs: string;
  rhs: string[];
  dot: number;
  lookahead: string;
  completed: boolean;
}

export interface LR1NFAAutomata {
  type: string;
  states: LR1NFAState[];
  transitions: NFATransition[];
  epsilon_transitions: NFATransition[];
  start_state: string;
  accept_states: string[];
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
  lr1_afn: LR1NFAAutomata;
  lr1: LR1Automata;
  lalr1: LALR1Automata;
}

// ─── Graph ───────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  isStart: boolean;
  isAccept: boolean;
  items?: string[];
}

export interface GraphLink {
  source: string;
  target: string;
  symbol: string;
  type?: "real" | "epsilon";
}

// ─── Tree ────────────────────────────────────────────────────────────────────

export interface TreeNodeType {
  symbol: string;
  is_terminal: boolean;
  matched_token?: string;
  children?: TreeNodeType[];
}
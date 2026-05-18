from __future__ import annotations
from dataclasses import dataclass, field
from collections import defaultdict
from typing import Optional

from grammar.grammar import Grammar, EPSILON
from parsers.descenso_recursivo import ParseNode


# ══════════════════════════════════════════════════════════════════════════════
# Item LR(0)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Item:
    lhs: str
    rhs: tuple
    dot: int

    @property
    def completed(self) -> bool:
        return self.dot >= len(self.rhs)

    @property
    def next_symbol(self) -> Optional[str]:
        return None if self.completed else self.rhs[self.dot]

    def advance(self) -> Item:
        return Item(self.lhs, self.rhs, self.dot + 1)

    def __repr__(self) -> str:
        rhs = list(self.rhs)
        rhs.insert(self.dot, "•")
        body = " ".join(rhs) if rhs else EPSILON
        return f"[{self.lhs} → {body}]"


# ══════════════════════════════════════════════════════════════════════════════
# Autómata LR(0)
# ══════════════════════════════════════════════════════════════════════════════

def _norm_rhs(rhs) -> tuple:
    """Normaliza una rhs: epsilon en cualquier forma → tupla vacía."""
    if rhs in ([], [EPSILON], ['ε'], (EPSILON,), ('ε',)):
        return ()
    return tuple(rhs)


class LR0Automaton:

    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self.states: list[frozenset[Item]] = []
        self.transitions: dict[tuple[int, str], int] = {}
        self._build()

    def _closure(self, items: set[Item]) -> frozenset[Item]:
        closure = set(items)
        changed = True
        while changed:
            changed = False
            to_add = set()
            for item in closure:
                B = item.next_symbol
                if B and B in self.grammar.non_terminals:
                    for rhs in self.grammar.productions.get(B, []):
                        new_item = Item(B, _norm_rhs(rhs), 0)
                        if new_item not in closure:
                            to_add.add(new_item)
                            changed = True
            closure |= to_add
        return frozenset(closure)

    def _goto(self, state: frozenset[Item], symbol: str) -> frozenset[Item]:
        moved = {item.advance() for item in state if item.next_symbol == symbol}
        return self._closure(moved) if moved else frozenset()

    def _build(self):
        start = self.grammar.start_symbol
        start_rhs = _norm_rhs(self.grammar.productions[start][0])
        initial = self._closure({Item(start, start_rhs, 0)})

        self.states = [initial]
        state_index: dict[frozenset[Item], int] = {initial: 0}
        worklist = [initial]

        while worklist:
            current = worklist.pop()
            idx = state_index[current]
            symbols = {item.next_symbol for item in current if item.next_symbol}
            for sym in symbols:
                nxt = self._goto(current, sym)
                if not nxt:
                    continue
                if nxt not in state_index:
                    state_index[nxt] = len(self.states)
                    self.states.append(nxt)
                    worklist.append(nxt)
                self.transitions[(idx, sym)] = state_index[nxt]


# ══════════════════════════════════════════════════════════════════════════════
# Tabla SLR(1)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class SLR1Table:
    action: dict = field(default_factory=lambda: defaultdict(list))
    goto: dict = field(default_factory=dict)
    conflicts: list = field(default_factory=list)

    def has_conflicts(self) -> bool:
        return bool(self.conflicts)


def build_slr1_table(aug_grammar: Grammar, orig_grammar: Grammar, automaton: LR0Automaton) -> SLR1Table:
    table = SLR1Table()
    prods_list = aug_grammar.productions_list()
    aug_start = aug_grammar.start_symbol

    for i, state in enumerate(automaton.states):
        for item in state:
            sym = item.next_symbol

            if sym:
                j = automaton.transitions.get((i, sym))
                if j is None:
                    continue
                if sym in aug_grammar.terminals:
                    entry = f"s{j}"
                    if entry not in table.action[(i, sym)]:
                        table.action[(i, sym)].append(entry)
                elif sym in aug_grammar.non_terminals:
                    table.goto[(i, sym)] = j
            else:
                if item.lhs == aug_start:
                    if "acc" not in table.action[(i, "$")]:
                        table.action[(i, "$")].append("acc")
                else:
                    prod_idx = next(
                        idx for idx, (lhs, r) in enumerate(prods_list)
                        if lhs == item.lhs and _norm_rhs(r) == item.rhs
                    )
                    entry = f"r{prod_idx}"
                    for term in orig_grammar.follow(item.lhs):
                        if entry not in table.action[(i, term)]:
                            table.action[(i, term)].append(entry)

    for (state, sym), actions in table.action.items():
        if len(actions) > 1:
            table.conflicts.append(
                f"Conflicto en estado {state}, símbolo '{sym}': {actions}"
            )

    return table


# ══════════════════════════════════════════════════════════════════════════════
# Resultado
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ParseStep:
    step_number: int
    action: str
    description: str
    stack: list
    remaining_input: list
    production_used: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "step_number":     self.step_number,
            "action":          self.action,
            "description":     self.description,
            "stack":           self.stack,
            "remaining_input": self.remaining_input,
            "production_used": self.production_used,
        }


@dataclass
class ParseResult:
    is_valid: bool
    steps: list
    action_table: dict
    goto_table: dict
    first: dict
    follow: dict
    states: list
    conflicts: list
    error_message: Optional[str]
    tokens_consumed: int
    total_tokens: int
    parse_tree: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "is_valid":        self.is_valid,
            "steps":           self.steps,
            "action_table":    self.action_table,
            "goto_table":      self.goto_table,
            "first":           self.first,
            "follow":          self.follow,
            "states":          self.states,
            "conflicts":       self.conflicts,
            "error_message":   self.error_message,
            "tokens_consumed": self.tokens_consumed,
            "total_tokens":    self.total_tokens,
            "parse_tree":      self.parse_tree,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Parser SLR(1)
# ══════════════════════════════════════════════════════════════════════════════

class SLR1Parser:

    def __init__(self, grammar: Grammar):
        self.orig_grammar = grammar
        self.aug_grammar  = grammar.augment()
        self.automaton    = LR0Automaton(self.aug_grammar)
        self.table        = build_slr1_table(self.aug_grammar, self.orig_grammar, self.automaton)

    def parse(self, input_string: str) -> ParseResult:
        tokens = input_string.strip().split() if input_string.strip() else []
        tokens_eof = tokens + ["$"]

        stack: list[int] = [0]
        node_stack: list[ParseNode] = []
        pos = 0
        steps: list[ParseStep] = []
        step_n = 0
        prods_list = self.aug_grammar.productions_list()

        def add_step(action, description, production=None):
            nonlocal step_n
            step_n += 1
            steps.append(ParseStep(
                step_number=step_n,
                action=action,
                description=description,
                stack=list(stack),
                remaining_input=list(tokens_eof[pos:]),
                production_used=production,
            ))

        while True:
            state = stack[-1]
            token = tokens_eof[pos]
            actions = self.table.action.get((state, token), [])

            if not actions:
                add_step(
                    "error",
                    f"✗ Token '{token}' inesperado en estado {state}. "
                    f"No existe acción definida."
                )
                return self._make_result(
                    is_valid=False,
                    steps=steps,
                    error_message=self._build_error_msg(token, pos, tokens),
                    tokens_consumed=pos,
                    total_tokens=len(tokens),
                )

            action = actions[0]

            if action == "acc":
                add_step("accept", "✓ Cadena ACEPTADA.")
                parse_tree = node_stack[0].to_dict() if node_stack else None
                return self._make_result(
                    is_valid=True,
                    steps=steps,
                    error_message=None,
                    tokens_consumed=pos,
                    total_tokens=len(tokens),
                    parse_tree=parse_tree,
                )

            elif action.startswith("s"):
                next_state = int(action[1:])
                add_step("shift", f"Shift '{token}' → estado {next_state}.")
                stack.append(next_state)
                node_stack.append(ParseNode(symbol=token, is_terminal=True, matched_token=token))
                pos += 1

            elif action.startswith("r"):
                prod_idx  = int(action[1:])
                lhs, rhs  = prods_list[prod_idx]
                rhs_norm  = _norm_rhs(rhs)
                prod_str  = f"{lhs} → {' '.join(rhs) if rhs_norm else EPSILON}"

                popped_nodes = []
                for _ in rhs_norm:
                    stack.pop()
                    if node_stack:
                        popped_nodes.append(node_stack.pop())
                popped_nodes.reverse()

                goto_state = self.table.goto.get((stack[-1], lhs))
                if goto_state is None:
                    add_step("error", f"✗ GOTO indefinido en estado {stack[-1]}, '{lhs}'.")
                    return self._make_result(
                        is_valid=False,
                        steps=steps,
                        error_message=f"GOTO indefinido tras reducir por '{prod_str}'.",
                        tokens_consumed=pos,
                        total_tokens=len(tokens),
                    )

                stack.append(goto_state)
                new_node = ParseNode(symbol=lhs, children=popped_nodes)
                node_stack.append(new_node)
                add_step("reduce", f"Reduce [{prod_str}] → estado {goto_state}.", production=prod_str)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _make_result(self, *, is_valid, steps, error_message, tokens_consumed, total_tokens, parse_tree=None) -> ParseResult:
        action_table, goto_table = self._format_tables()
        return ParseResult(
            is_valid=is_valid,
            steps=[s.to_dict() for s in steps],
            action_table=action_table,
            goto_table=goto_table,
            first={
                nt: sorted(v - {EPSILON}) + (["ε"] if EPSILON in v else [])
                for nt, v in self.orig_grammar._first.items()
            },
            follow={
                nt: sorted(v - {"$"}) + (["$"] if "$" in v else [])
                for nt, v in self.orig_grammar._follow.items()
            },
            states=self._states_repr(),
            conflicts=self.table.conflicts,
            error_message=error_message,
            tokens_consumed=tokens_consumed,
            total_tokens=total_tokens,
            parse_tree=parse_tree,
        )

    def _format_tables(self) -> tuple[dict, dict]:
        prods_list   = self.aug_grammar.productions_list()
        num_states   = len(self.automaton.states)
        terminals    = sorted(self.aug_grammar.terminals | {"$"})
        nonterminals = list(self.orig_grammar.productions.keys())

        action_rows = []
        for i in range(num_states):
            row: dict = {"state": i}
            for t in terminals:
                row[t] = "/".join(self.table.action.get((i, t), []))
            action_rows.append(row)

        productions_legend = [
            {"index": idx, "production": f"{lhs} → {' '.join(rhs) if _norm_rhs(rhs) else EPSILON}"}
            for idx, (lhs, rhs) in enumerate(prods_list)
        ]

        action_table = {
            "terminals":   terminals,
            "rows":        action_rows,
            "productions": productions_legend,
        }

        goto_rows = []
        for i in range(num_states):
            row = {"state": i}
            for nt in nonterminals:
                g = self.table.goto.get((i, nt))
                row[nt] = str(g) if g is not None else ""
            goto_rows.append(row)

        goto_table = {
            "nonterminals": nonterminals,
            "rows":         goto_rows,
        }

        return action_table, goto_table

    def _build_error_msg(self, token: str, pos: int, tokens: list) -> str:
        context = tokens[max(0, pos - 2): pos]
        msg  = f"Error de sintaxis en la posición {pos + 1}.\n"
        msg += f"Token problemático: '{token}'.\n"
        if context:
            msg += f"Tokens anteriores: {' '.join(context)}.\n"
        msg += (
            "\nEl analizador SLR(1) no encontró ninguna acción válida "
            "para el token actual en el estado actual. "
            "Verifica que la cadena pertenezca al lenguaje definido por la gramática."
        )
        return msg

    def _states_repr(self) -> list[dict]:
        result = []
        for i, state in enumerate(self.automaton.states):
            result.append({
                "id": i,
                "items": [repr(item) for item in sorted(state, key=repr)],
                "transitions": {
                    sym: dst
                    for (src, sym), dst in self.automaton.transitions.items()
                    if src == i
                },
            })
        return result
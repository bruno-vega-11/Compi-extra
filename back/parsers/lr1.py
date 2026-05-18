"""
lr1.py
-----
Parser LR(1) completo con items LR(1) y tabla ACTION/GOTO.
"""
from __future__ import annotations
from typing import Dict, List, Tuple, Set, FrozenSet, Any

from grammar.grammar import Grammar, EPSILON
from parsers.descenso_recursivo import ParseResult as RDParseResult, ParseNode
from dataclasses import dataclass, field
from collections import defaultdict
from typing import Optional


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
            "step_number": self.step_number,
            "action": self.action,
            "description": self.description,
            "stack": self.stack,
            "remaining_input": self.remaining_input,
            "production_used": self.production_used,
        }


class LR1Item:
    def __init__(self, head: str, body: List[str], dot: int, lookahead: FrozenSet[str]):
        self.head = head
        self.body = body
        self.dot = dot
        self.lookahead = lookahead

    def next_symbol(self):
        if self.dot < len(self.body):
            return self.body[self.dot]
        return None

    def is_complete(self):
        return self.dot >= len(self.body)

    def advance(self):
        return LR1Item(self.head, self.body, self.dot + 1, self.lookahead)

    def core(self):
        return (self.head, tuple(self.body), self.dot)

    def __eq__(self, other: Any) -> bool:
        return isinstance(other, LR1Item) and self.core() == other.core() and self.lookahead == other.lookahead

    def __hash__(self) -> int:
        return hash((self.core(), self.lookahead))

    def __repr__(self) -> str:
        rhs = list(self.body)
        rhs.insert(self.dot, '•')
        lookahead = ",".join(sorted(self.lookahead))
        return f"{self.head} -> {' '.join(rhs)}, {{{lookahead}}}"


class LR1Parser:
    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self.augmented_start = f"{grammar.start_symbol}'"
        self._build_augmented()
        self.states: List[Set[LR1Item]] = []
        self._build_automaton()
        self.action: Dict[Tuple[int, str], Tuple[str, Any]] = {}
        self.goto: Dict[Tuple[int, str], int] = {}
        self.conflicts: list = []
        self._build_parsing_table()

    def _build_augmented(self):
        self.aug_productions = {**self.grammar.productions}
        if self.augmented_start in self.aug_productions:
            raise ValueError("Nombre del símbolo aumentado ya existe en la gramática.")
        self.aug_productions[self.augmented_start] = [[self.grammar.start_symbol]]

    def _normalize_body(self, body: List[str]) -> List[str]:
        return [] if body == [EPSILON] else body

    def _closure(self, items: Set[LR1Item]) -> Set[LR1Item]:
        closure: Dict[Tuple[str, Tuple[str, ...], int], Set[str]] = {}
        for it in items:
            key = it.core()
            closure.setdefault(key, set()).update(it.lookahead)

        changed = True
        while changed:
            changed = False
            for core, lookahead in list(closure.items()):
                head, body, dot = core
                if dot >= len(body):
                    continue
                symbol = body[dot]
                if symbol not in self.aug_productions:
                    continue
                tail = list(body[dot + 1 :])
                # iterate over a snapshot to avoid "set changed size" errors
                for la in list(lookahead):
                    first = self.grammar._first_of_sequence(tail + [la])
                    for prod in self.aug_productions[symbol]:
                        prod = self._normalize_body(prod)
                        new_core = (symbol, tuple(prod), 0)
                        for terminal in first - {EPSILON}:
                            current = closure.setdefault(new_core, set())
                            if terminal not in current:
                                current.add(terminal)
                                changed = True
                        if EPSILON in first:
                            current = closure.setdefault(new_core, set())
                            if la not in current:
                                current.add(la)
                                changed = True

        return {LR1Item(head, list(body), dot, frozenset(lookahead)) for (head, body, dot), lookahead in closure.items()}

    def _goto(self, items: Set[LR1Item], symbol: str) -> Set[LR1Item]:
        moved = {itm.advance() for itm in items if itm.next_symbol() == symbol}
        return self._closure(moved)

    def _build_automaton(self):
        start_item = LR1Item(self.augmented_start, self.aug_productions[self.augmented_start][0], 0, frozenset({"$"}))
        start_state = self._closure({start_item})
        states = [start_state]
        transitions = {}

        changed = True
        while changed:
            changed = False
            for i, state in enumerate(list(states)):
                symbols = {it.next_symbol() for it in state if it.next_symbol()}
                for sym in symbols:
                    tgt = self._goto(state, sym)
                    if not tgt:
                        continue
                    if tgt not in states:
                        states.append(tgt)
                        changed = True
                    transitions[(i, sym)] = states.index(tgt)

        self.states = states
        self.transitions = transitions

    def _build_parsing_table(self):
        for i, state in enumerate(self.states):
            for it in state:
                if not it.is_complete():
                    a = it.next_symbol()
                    if a not in self.aug_productions and (i, a) in self.transitions:
                        j = self.transitions[(i, a)]
                        key = (i, a)
                        if key in self.action and self.action[key] != ("shift", j):
                            self.conflicts.append(f"Conflicto ACTION en estado {i} sobre '{a}': {self.action[key]} vs ('shift',{j})")
                        else:
                            self.action[key] = ("shift", j)
                else:
                    if it.head == self.augmented_start:
                        for t in it.lookahead:
                            if t != "$":
                                raise ValueError(f"Símbolo de lookahead inválido en aceptación: {t}")
                            key = (i, "$" )
                            if key in self.action and self.action[key] != ("accept", 0):
                                self.conflicts.append(f"Conflicto ACTION en estado {i} sobre '$': {self.action[key]} vs ('accept',0)")
                            else:
                                self.action[key] = ("accept", 0)
                    else:
                        rule_idx = (it.head, tuple(it.body))
                        for t in it.lookahead:
                            key = (i, t)
                            if key in self.action and self.action[key] != ("reduce", rule_idx):
                                self.conflicts.append(f"Conflicto reduce en estado {i} sobre '{t}': {self.action[key]} vs ('reduce',{rule_idx})")
                            else:
                                self.action[key] = ("reduce", rule_idx)

            for (s, sym), j in self.transitions.items():
                if s == i and sym in self.aug_productions:
                    self.goto[(i, sym)] = j

    def get_automaton(self):
        return {
            "states": [[repr(it) for it in st] for st in self.states],
            "transitions": {f"{s}->{sym}": t for (s, sym), t in self.transitions.items()},
        }

    def get_table(self):
        return {
            "action": {f"{s},{a}": v for (s, a), v in self.action.items()},
            "goto": {f"{s},{A}": j for (s, A), j in self.goto.items()},
        }

    def parse(self, input_string: str) -> RDParseResult:
        tokens = input_string.strip().split() if input_string.strip() else []
        tokens_eof = tokens + ["$"]

        state_stack: List[int] = [0]
        node_stack: List[ParseNode] = []
        pos = 0
        steps: List[ParseStep] = []
        step_n = 0
        prods_list = self._build_productions_list()

        def add_step(action, description, production=None):
            nonlocal step_n
            step_n += 1
            steps.append(ParseStep(
                step_number=step_n,
                action=action,
                description=description,
                stack=list(state_stack),
                remaining_input=list(tokens_eof[pos:]),
                production_used=production,
            ))

        try:
            while True:
                state = state_stack[-1]
                token = tokens_eof[pos]
                action = self.action.get((state, token))
                if action is None:
                    add_step(
                        "error",
                        f"✗ Token '{token}' inesperado en estado {state}. No existe acción definida."
                    )
                    return self._make_result(
                        is_valid=False,
                        steps=steps,
                        error_message=f"Tabla LR(1): no hay acción para (estado {state}, '{token}').",
                        tokens_consumed=pos,
                        total_tokens=len(tokens),
                        parse_tree=None,
                    )

                kind, val = action
                if kind == "shift":
                    add_step("shift", f"Shift '{token}' → estado {val}.")
                    node = ParseNode(symbol=token, is_terminal=True, matched_token=token)
                    node_stack.append(node)
                    state_stack.append(val)
                    pos += 1
                elif kind == "reduce":
                    head, body = val
                    body = list(body)
                    prod_str = f"{head} → {' '.join(body) if body else EPSILON}"
                    
                    popped_nodes = []
                    if body:
                        for _ in body:
                            state_stack.pop()
                            if node_stack:
                                popped_nodes.append(node_stack.pop())
                    popped_nodes.reverse()
                    
                    goto_state = self.goto.get((state_stack[-1], head))
                    if goto_state is None:
                        add_step("error", f"✗ GOTO indefinido en estado {state_stack[-1]}, '{head}'.")
                        return self._make_result(
                            is_valid=False,
                            steps=steps,
                            error_message=f"Goto no definido para (estado {state_stack[-1]}, '{head}').",
                            tokens_consumed=pos,
                            total_tokens=len(tokens),
                            parse_tree=None,
                        )
                    
                    add_step("reduce", f"Reduce [{prod_str}] → estado {goto_state}.", production=prod_str)
                    state_stack.append(goto_state)
                    new_node = ParseNode(symbol=head, children=popped_nodes)
                    node_stack.append(new_node)
                elif kind == "accept":
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
                else:
                    add_step("error", f"✗ Acción desconocida: {kind}")
                    return self._make_result(
                        is_valid=False,
                        steps=steps,
                        error_message=f"Acción desconocida: {kind}",
                        tokens_consumed=pos,
                        total_tokens=len(tokens),
                        parse_tree=None,
                    )

        except Exception as e:
            return self._make_result(
                is_valid=False,
                steps=steps,
                error_message=str(e),
                tokens_consumed=pos,
                total_tokens=len(tokens),
                parse_tree=None,
            )

    # Result formatting similar to SLR1Parser
    def _build_productions_list(self) -> List[Tuple[str, List[str]]]:
        """Devuelve las producciones en forma lineal."""
        prods_list = []
        for lhs, rhss in self.aug_productions.items():
            for rhs in rhss:
                prods_list.append((lhs, rhs))
        return prods_list

    def _format_tables(self) -> tuple[dict, dict]:
        prods_list = []
        for lhs, rhss in self.aug_productions.items():
            for rhs in rhss:
                prods_list.append((lhs, rhs))

        num_states = len(self.states)
        terminals = sorted(set(self.grammar.terminals) | {"$"})
        nonterminals = list(self.grammar.productions.keys())

        action_rows = []
        for i in range(num_states):
            row = {"state": i}
            for t in terminals:
                a = self.action.get((i, t))
                if not a:
                    row[t] = ""
                else:
                    kind, val = a
                    if kind == "shift":
                        row[t] = f"s{val}"
                    elif kind == "accept":
                        row[t] = "acc"
                    elif kind == "reduce":
                        lhs, rhs = val
                        # find index
                        idx = next((idx for idx, (L, R) in enumerate(prods_list) if L == lhs and tuple(R) == rhs), None)
                        row[t] = f"r{idx}" if idx is not None else ""
                    else:
                        row[t] = ""
            action_rows.append(row)

        productions_legend = [
            {"index": idx, "production": f"{lhs} → {' '.join(rhs) if rhs else EPSILON}"}
            for idx, (lhs, rhs) in enumerate(prods_list)
        ]

        action_table = {"terminals": terminals, "rows": action_rows, "productions": productions_legend}

        goto_rows = []
        for i in range(num_states):
            row = {"state": i}
            for nt in nonterminals:
                g = self.goto.get((i, nt))
                row[nt] = str(g) if g is not None else ""
            goto_rows.append(row)

        goto_table = {"nonterminals": nonterminals, "rows": goto_rows}
        return action_table, goto_table

    def _states_repr(self) -> list[dict]:
        result = []
        for i, state in enumerate(self.states):
            result.append({
                "id": i,
                "items": [repr(item) for item in sorted(state, key=repr)],
                "transitions": {sym: dst for (src, sym), dst in self.transitions.items() if src == i},
            })
        return result

    def _make_result(self, *, is_valid: bool, steps: list, error_message: Optional[str], tokens_consumed: int, total_tokens: int, parse_tree: Optional[dict] = None) -> dict:
        action_table, goto_table = self._format_tables()
        first = {
            nt: sorted(v - {EPSILON}) + (["ε"] if EPSILON in v else [])
            for nt, v in self.grammar._first.items()
        }
        follow = {
            nt: sorted(v - {"$"}) + (["$"] if "$" in v else [])
            for nt, v in self.grammar._follow.items()
        }
        return {
            "is_valid": is_valid,
            "parse_tree": parse_tree,
            "steps": [s.to_dict() for s in steps],
            "action_table": action_table,
            "goto_table": goto_table,
            "first": first,
            "follow": follow,
            "states": self._states_repr(),
            "conflicts": self.conflicts,
            "error_message": error_message,
            "tokens_consumed": tokens_consumed,
            "total_tokens": total_tokens,
        }

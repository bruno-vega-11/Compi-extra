"""
slr1.py
------
Parser SLR(1) usando el autómata LR(0) y conjuntos FOLLOW para reducciones.

Este parser construye el mismo autómata LR(0) que `lr0.py` pero en lugar de
aplicar reducciones en todos los terminales, solo las aplica en los símbolos de
FOLLOW del no terminal reducido.
"""
from __future__ import annotations
from typing import Dict, List, Tuple, Set, Any

from grammar.grammar import Grammar, EPSILON
from parsers.descenso_recursivo import ParseResult, ParseNode


class Item:
    def __init__(self, head: str, body: List[str], dot: int):
        self.head = head
        self.body = body
        self.dot = dot

    def next_symbol(self):
        if self.dot < len(self.body):
            return self.body[self.dot]
        return None

    def is_complete(self):
        return self.dot >= len(self.body)

    def advance(self):
        return Item(self.head, self.body, self.dot + 1)

    def key(self):
        return (self.head, tuple(self.body), self.dot)

    def __eq__(self, other: Any) -> bool:
        return isinstance(other, Item) and self.key() == other.key()

    def __hash__(self) -> int:
        return hash(self.key())

    def __repr__(self) -> str:
        rhs = list(self.body)
        rhs.insert(self.dot, '•')
        return f"{self.head} -> {' '.join(rhs)}"


class SLR1Parser:
    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self.augmented_start = f"{grammar.start_symbol}'"
        self._build_augmented()
        self.states: List[Set[Item]] = []
        self._build_automaton()
        self.action: Dict[Tuple[int, str], Tuple[str, Any]] = {}
        self.goto: Dict[Tuple[int, str], int] = {}
        self._build_parsing_table()

    def _build_augmented(self):
        self.aug_productions = {**self.grammar.productions}
        if self.augmented_start in self.aug_productions:
            raise ValueError("Nombre del símbolo aumentado ya existe en la gramática.")
        self.aug_productions[self.augmented_start] = [[self.grammar.start_symbol]]

    def _normalize_body(self, body: List[str]) -> List[str]:
        return [] if body == [EPSILON] else body

    def _closure(self, items: Set[Item]) -> Set[Item]:
        closure = set(items)
        added = True
        while added:
            added = False
            for it in list(closure):
                sym = it.next_symbol()
                if sym and sym in self.aug_productions:
                    for prod in self.aug_productions[sym]:
                        prod = self._normalize_body(prod)
                        new_item = Item(sym, prod, 0)
                        if new_item not in closure:
                            closure.add(new_item)
                            added = True
        return closure

    def _goto(self, items: Set[Item], symbol: str) -> Set[Item]:
        moved = set()
        for it in items:
            if it.next_symbol() == symbol:
                moved.add(it.advance())
        return self._closure(moved)

    def _build_automaton(self):
        start_item = Item(self.augmented_start, self.aug_productions[self.augmented_start][0], 0)
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
                    j = states.index(tgt)
                    transitions[(i, sym)] = j

        self.states = states
        self.transitions = transitions

    def _build_parsing_table(self):
        for i, state in enumerate(self.states):
            for it in state:
                if not it.is_complete():
                    a = it.next_symbol()
                    if (i, a) in self.transitions and a not in self.aug_productions:
                        j = self.transitions[(i, a)]
                        key = (i, a)
                        if key in self.action and self.action[key] != ("shift", j):
                            raise ValueError(f"Conflicto ACTION en estado {i} sobre '{a}'")
                        self.action[key] = ("shift", j)
                else:
                    if it.head == self.augmented_start:
                        key = (i, "$")
                        if key in self.action and self.action[key] != ("accept", 0):
                            raise ValueError(f"Conflicto ACTION en estado {i} sobre '$'")
                        self.action[key] = ("accept", 0)
                    else:
                        for t in self.grammar.follow(it.head):
                            key = (i, t)
                            rule_idx = (it.head, tuple(it.body))
                            if key in self.action and self.action[key] != ("reduce", rule_idx):
                                raise ValueError(f"Conflicto reduce en estado {i} sobre '{t}'")
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

    def parse(self, input_string: str) -> ParseResult:
        tokens = input_string.strip().split()
        if not tokens:
            return ParseResult(False, None, [], "La cadena de entrada está vacía.", 0, 0)

        tokens.append("$")
        state_stack: List[int] = [0]
        node_stack: List[ParseNode] = []
        pos = 0

        try:
            while True:
                state = state_stack[-1]
                a = tokens[pos] if pos < len(tokens) else "$"
                action = self.action.get((state, a))
                if action is None:
                    raise ValueError(f"Tabla SLR(1): no hay acción para (estado {state}, '{a}').")

                kind, val = action
                if kind == "shift":
                    node = ParseNode(symbol=a, is_terminal=True, matched_token=a)
                    node_stack.append(node)
                    state_stack.append(val)
                    pos += 1
                elif kind == "reduce":
                    head, body = val
                    body = list(body)
                    children = []
                    for _ in range(len(body)):
                        if not node_stack:
                            raise ValueError("Error interno en reducción: pila de nodos vacía.")
                        children.insert(0, node_stack.pop())
                        state_stack.pop()
                    new_node = ParseNode(symbol=head, children=children)
                    node_stack.append(new_node)
                    goto_state = self.goto.get((state_stack[-1], head))
                    if goto_state is None:
                        raise ValueError(f"Goto no definido para (estado {state_stack[-1]}, '{head}').")
                    state_stack.append(goto_state)
                elif kind == "accept":
                    root = node_stack[0].to_dict() if node_stack else None
                    return ParseResult(True, root, [], None, pos, len(tokens) - 1)
                else:
                    raise ValueError(f"Acción desconocida: {kind}")

        except Exception as e:
            return ParseResult(False, None, [], str(e), pos, len(tokens) - 1)

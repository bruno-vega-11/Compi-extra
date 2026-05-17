"""
lalr1.py
------
Parser LALR(1) construido a partir de la colección LR(1) y estados fusionados
por núcleo LR(0).
"""
from __future__ import annotations
from typing import Dict, List, Tuple, Set, FrozenSet, Any

from grammar.grammar import Grammar, EPSILON
from parsers.descenso_recursivo import ParseResult, ParseNode


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


class LALR1Parser:
    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self.augmented_start = f"{grammar.start_symbol}'"
        self._build_augmented()
        self.states: List[Set[LR1Item]] = []
        self.transitions: Dict[Tuple[int, str], int] = {}
        self._build_lr1_automaton()
        self._merge_states()
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
                for la in lookahead:
                    first = self.grammar._first_of_sequence(tail + [la])
                    for prod in self.aug_productions[symbol]:
                        prod = self._normalize_body(prod)
                        new_core = (symbol, tuple(prod), 0)
                        current = closure.setdefault(new_core, set())
                        for terminal in first - {EPSILON}:
                            if terminal not in current:
                                current.add(terminal)
                                changed = True
                        if EPSILON in first and la not in current:
                            current.add(la)
                            changed = True

        return {LR1Item(head, list(body), dot, frozenset(lookahead)) for (head, body, dot), lookahead in closure.items()}

    def _goto(self, items: Set[LR1Item], symbol: str) -> Set[LR1Item]:
        moved = {itm.advance() for itm in items if itm.next_symbol() == symbol}
        return self._closure(moved)

    def _build_lr1_automaton(self):
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

    def _state_core(self, state: Set[LR1Item]) -> FrozenSet[Tuple[str, Tuple[str, ...], int]]:
        return frozenset({item.core() for item in state})

    def _merge_states(self):
        core_to_index: Dict[FrozenSet[Tuple[str, Tuple[str, ...], int]], int] = {}
        merged_items: List[Dict[Tuple[str, Tuple[str, ...], int], Set[str]]] = []
        state_mapping: Dict[int, int] = {}

        for idx, state in enumerate(self.states):
            core = self._state_core(state)
            if core not in core_to_index:
                core_to_index[core] = len(merged_items)
                merged_items.append({})
            merged_idx = core_to_index[core]
            state_mapping[idx] = merged_idx
            target = merged_items[merged_idx]
            for item in state:
                key = item.core()
                target.setdefault(key, set()).update(item.lookahead)

        merged_states: List[Set[LR1Item]] = []
        for state_dict in merged_items:
            merged_states.append({LR1Item(head, list(body), dot, frozenset(lookahead)) for (head, body, dot), lookahead in state_dict.items()})

        merged_transitions: Dict[Tuple[int, str], int] = {}
        for (src, sym), dst in self.transitions.items():
            new_src = state_mapping[src]
            new_dst = state_mapping[dst]
            key = (new_src, sym)
            if key in merged_transitions and merged_transitions[key] != new_dst:
                raise ValueError(f"Conflicto en transición LALR para estado {new_src} y símbolo {sym}.")
            merged_transitions[key] = new_dst

        self.states = merged_states
        self.transitions = merged_transitions

    def _build_parsing_table(self):
        for i, state in enumerate(self.states):
            for it in state:
                if not it.is_complete():
                    a = it.next_symbol()
                    if a not in self.aug_productions and (i, a) in self.transitions:
                        j = self.transitions[(i, a)]
                        key = (i, a)
                        if key in self.action and self.action[key] != ("shift", j):
                            raise ValueError(f"Conflicto ACTION en estado {i} sobre '{a}'")
                        self.action[key] = ("shift", j)
                else:
                    if it.head == self.augmented_start:
                        for t in it.lookahead:
                            if t != "$":
                                raise ValueError(f"Símbolo de lookahead inválido en aceptación: {t}")
                            key = (i, "$" )
                            if key in self.action and self.action[key] != ("accept", 0):
                                raise ValueError(f"Conflicto ACTION en estado {i} sobre '$'")
                            self.action[key] = ("accept", 0)
                    else:
                        rule_idx = (it.head, tuple(it.body))
                        for t in it.lookahead:
                            key = (i, t)
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
                    raise ValueError(f"Tabla LALR(1): no hay acción para (estado {state}, '{a}').")

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

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, FrozenSet

from grammar.grammar import Grammar, EPSILON as EPS


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _norm_rhs(rhs) -> tuple:
    """Normaliza epsilon en cualquier forma → tupla vacía."""
    if rhs in ([], [EPS], ['ε'], (EPS,), ('ε',)):
        return ()
    return tuple(rhs)


# ══════════════════════════════════════════════════════════════════════════════
# Item LR(1)
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Item1:
    lhs: str
    rhs: tuple
    dot: int
    lookahead: str

    @property
    def completed(self) -> bool:
        return self.dot >= len(self.rhs)

    @property
    def next_symbol(self) -> Optional[str]:
        return None if self.completed else self.rhs[self.dot]

    @property
    def after_dot(self) -> tuple:
        return self.rhs[self.dot + 1:] if self.dot + 1 <= len(self.rhs) else ()

    def advance(self) -> Item1:
        return Item1(self.lhs, self.rhs, self.dot + 1, self.lookahead)

    @property
    def core(self) -> tuple:
        return (self.lhs, self.rhs, self.dot)

    def label(self) -> str:
        rhs = list(self.rhs)
        rhs.insert(self.dot, "•")
        body = " ".join(rhs) if rhs else EPS
        return f"{self.lhs} → {body},  {self.lookahead}"

    def __repr__(self) -> str:
        return self.label()


# ══════════════════════════════════════════════════════════════════════════════
# FIRST
# ══════════════════════════════════════════════════════════════════════════════

def compute_first(grammar: Grammar) -> dict[str, set[str]]:
    terminals     = grammar.terminals
    non_terminals = grammar.non_terminals
    productions   = grammar.productions

    first: dict[str, set[str]] = {}

    for t in terminals:
        first[t] = {t}
    for nt in non_terminals:
        first[nt] = set()
    first[EPS] = {EPS}

    changed = True
    while changed:
        changed = False
        for nt, prods in productions.items():
            for rhs in prods:
                if not rhs or rhs == [EPS]:
                    if EPS not in first[nt]:
                        first[nt].add(EPS)
                        changed = True
                    continue
                for sym in rhs:
                    sym_first = first.get(sym, {sym})
                    before = len(first[nt])
                    first[nt] |= sym_first - {EPS}
                    if len(first[nt]) != before:
                        changed = True
                    if EPS not in sym_first:
                        break
                else:
                    if EPS not in first[nt]:
                        first[nt].add(EPS)
                        changed = True

    return first


def first_of_string(
    symbols: tuple,
    lookahead: str,
    first: dict[str, set[str]],
) -> set[str]:
    result: set[str] = set()
    for sym in symbols:
        sym_first = first.get(sym, {sym})
        result |= sym_first - {EPS}
        if EPS not in sym_first:
            return result
    result.add(lookahead)
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Clausura LR(1)
# ══════════════════════════════════════════════════════════════════════════════

def lr1_closure(
    items: frozenset[Item1],
    grammar: Grammar,
    first: dict[str, set[str]],
) -> frozenset[Item1]:
    closure: set[Item1] = set(items)
    worklist: list[Item1] = list(items)
    non_terminals = grammar.non_terminals

    while worklist:
        item = worklist.pop()
        B = item.next_symbol
        if B is None or B not in non_terminals:
            continue
        beta = item.after_dot
        for la in first_of_string(beta, item.lookahead, first):
            for rhs in grammar.productions.get(B, []):
                new_item = Item1(B, _norm_rhs(rhs), 0, la)
                if new_item not in closure:
                    closure.add(new_item)
                    worklist.append(new_item)

    return frozenset(closure)


# ══════════════════════════════════════════════════════════════════════════════
# Goto LR(1)
# ══════════════════════════════════════════════════════════════════════════════

def lr1_goto(
    state: frozenset[Item1],
    symbol: str,
    grammar: Grammar,
    first: dict[str, set[str]],
) -> frozenset[Item1]:
    moved = frozenset(
        item.advance()
        for item in state
        if item.next_symbol == symbol
    )
    return lr1_closure(moved, grammar, first) if moved else frozenset()


# ══════════════════════════════════════════════════════════════════════════════
# AFD LR(1)
# ══════════════════════════════════════════════════════════════════════════════

def build_lr1_afd(aug_grammar: Grammar) -> dict:
    first = compute_first(aug_grammar)

    start_sym  = aug_grammar.start_symbol
    start_rhs  = _norm_rhs(aug_grammar.productions[start_sym][0])
    start_item = Item1(start_sym, start_rhs, 0, "$")
    start_set  = lr1_closure(frozenset({start_item}), aug_grammar, first)

    state_id: dict[frozenset[Item1], str] = {start_set: "d0"}
    states_list: list[frozenset[Item1]]   = [start_set]
    afd_states:      list[dict] = []
    afd_transitions: list[dict] = []
    afd_accept:      list[str]  = []

    worklist = [start_set]

    while worklist:
        state = worklist.pop(0)
        did   = state_id[state]

        symbols: set[str] = {item.next_symbol for item in state if item.next_symbol}

        for sym in sorted(symbols):
            next_state = lr1_goto(state, sym, aug_grammar, first)
            if not next_state:
                continue
            if next_state not in state_id:
                new_id = f"d{len(state_id)}"
                state_id[next_state] = new_id
                states_list.append(next_state)
                worklist.append(next_state)
            afd_transitions.append({
                "from":   did,
                "to":     state_id[next_state],
                "symbol": sym,
            })

        is_accept = any(item.completed for item in state)
        is_start  = (did == "d0")

        items_info = sorted(
            [
                {
                    "label":     item.label(),
                    "lhs":       item.lhs,
                    "rhs":       list(item.rhs),
                    "dot":       item.dot,
                    "lookahead": item.lookahead,
                    "completed": item.completed,
                }
                for item in state
            ],
            key=lambda x: x["label"],
        )

        afd_states.append({
            "id":        did,
            "label":     f"I{did[1:]}",
            "items":     items_info,
            "is_accept": is_accept,
            "is_start":  is_start,
        })

        if is_accept:
            afd_accept.append(did)

    return {
        "type":          "lr1_afd",
        "states":        afd_states,
        "transitions":   afd_transitions,
        "start_state":   "d0",
        "accept_states": afd_accept,
    }


# ══════════════════════════════════════════════════════════════════════════════
# AFD LALR(1)
# ══════════════════════════════════════════════════════════════════════════════

def _core(state: frozenset[Item1]) -> frozenset[tuple]:
    return frozenset(item.core for item in state)


def build_lalr1_afd(lr1: dict, aug_grammar: Grammar) -> dict:
    core_to_lr1: dict[frozenset[tuple], list[str]] = {}
    id_to_state: dict[str, dict] = {s["id"]: s for s in lr1["states"]}

    for state in lr1["states"]:
        core_key = frozenset(
            (it["lhs"], tuple(it["rhs"]), it["dot"])
            for it in state["items"]
        )
        core_to_lr1.setdefault(core_key, []).append(state["id"])

    lr1_to_lalr: dict[str, str] = {}
    lalr_groups: dict[str, list[str]] = {}

    for core_key, lr1_ids in core_to_lr1.items():
        lr1_ids_sorted = sorted(lr1_ids)
        rep     = lr1_ids_sorted[0]
        lalr_id = f"m{rep[1:]}"
        if "d0" in lr1_ids:
            lalr_id = "m0"
        for lid in lr1_ids:
            lr1_to_lalr[lid] = lalr_id
        lalr_groups[lalr_id] = lr1_ids_sorted

    lalr_states: list[dict] = []
    lalr_accept: list[str]  = []

    for lalr_id, lr1_ids in lalr_groups.items():
        merged: dict[tuple, set[str]] = {}
        for lid in lr1_ids:
            for it in id_to_state[lid]["items"]:
                core = (it["lhs"], tuple(it["rhs"]), it["dot"])
                merged.setdefault(core, set()).add(it["lookahead"])

        items_info = sorted(
            [
                {
                    "label": (
                        f"{lhs} → {' '.join(list(rhs)) or EPS},  "
                        f"{'/'.join(sorted(las))}"
                    ),
                    "lhs":       lhs,
                    "rhs":       list(rhs),
                    "dot":       dot,
                    "lookaheads": sorted(las),
                    "completed": dot >= len(rhs),
                }
                for (lhs, rhs, dot), las in merged.items()
            ],
            key=lambda x: x["label"],
        )

        is_accept = any(it["completed"] for it in items_info)
        is_start  = (lalr_id == "m0")

        lalr_states.append({
            "id":        lalr_id,
            "label":     f"I{lalr_id[1:]}",
            "items":     items_info,
            "lr1_ids":   lr1_ids,
            "is_accept": is_accept,
            "is_start":  is_start,
        })

        if is_accept:
            lalr_accept.append(lalr_id)

    seen_trans: set[tuple] = set()
    lalr_transitions: list[dict] = []

    for t in lr1["transitions"]:
        src = lr1_to_lalr[t["from"]]
        dst = lr1_to_lalr[t["to"]]
        sym = t["symbol"]
        key = (src, dst, sym)
        if key not in seen_trans:
            seen_trans.add(key)
            lalr_transitions.append({"from": src, "to": dst, "symbol": sym})

    return {
        "type":          "lalr1_afd",
        "states":        lalr_states,
        "transitions":   lalr_transitions,
        "start_state":   "m0",
        "accept_states": lalr_accept,
    }


# ══════════════════════════════════════════════════════════════════════════════
# AFN LR(1)
# ══════════════════════════════════════════════════════════════════════════════

def build_lr1_afn(aug_grammar: Grammar) -> dict:
    first         = compute_first(aug_grammar)
    non_terminals = aug_grammar.non_terminals

    start_sym  = aug_grammar.start_symbol
    start_rhs  = _norm_rhs(aug_grammar.productions[start_sym][0])
    start_item = Item1(start_sym, start_rhs, 0, "$")

    all_items: list[Item1] = []
    seen:      set[Item1]  = set()
    queue: list[Item1] = [start_item]

    while queue:
        item = queue.pop(0)
        if item in seen:
            continue
        seen.add(item)
        all_items.append(item)

        B = item.next_symbol

        if B is not None:
            adv = item.advance()
            if adv not in seen:
                queue.append(adv)

        if B is not None and B in non_terminals:
            beta = item.after_dot
            for la in first_of_string(beta, item.lookahead, first):
                for rhs in aug_grammar.productions.get(B, []):
                    child = Item1(B, _norm_rhs(rhs), 0, la)
                    if child not in seen:
                        queue.append(child)

    item_id: dict[Item1, str] = {item: f"n{i}" for i, item in enumerate(all_items)}

    states = []
    accept_states = []
    for item in all_items:
        nid       = item_id[item]
        is_accept = item.completed
        is_start  = (item == start_item)
        states.append({
            "id":        nid,
            "label":     item.label(),
            "is_accept": is_accept,
            "is_start":  is_start,
            "lhs":       item.lhs,
            "rhs":       list(item.rhs),
            "dot":       item.dot,
            "lookahead": item.lookahead,
            "completed": is_accept,
        })
        if is_accept:
            accept_states.append(nid)

    transitions = []
    for item in all_items:
        sym = item.next_symbol
        if sym is None:
            continue
        adv = item.advance()
        if adv in item_id:
            transitions.append({
                "from":   item_id[item],
                "to":     item_id[adv],
                "symbol": sym,
                "type":   "real",
            })

    epsilon_transitions = []
    for item in all_items:
        B = item.next_symbol
        if B is None or B not in non_terminals:
            continue
        beta = item.after_dot
        for la in first_of_string(beta, item.lookahead, first):
            for rhs in aug_grammar.productions.get(B, []):
                child = Item1(B, _norm_rhs(rhs), 0, la)
                if child in item_id:
                    epsilon_transitions.append({
                        "from":   item_id[item],
                        "to":     item_id[child],
                        "symbol": "ε",
                        "type":   "epsilon",
                    })

    return {
        "type":                "lr1_afn",
        "states":              states,
        "transitions":         transitions,
        "epsilon_transitions": epsilon_transitions,
        "start_state":         item_id[start_item],
        "accept_states":       accept_states,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Punto de entrada
# ══════════════════════════════════════════════════════════════════════════════

def grammar_to_lr1_automata(grammar: Grammar) -> dict:
    aug     = grammar.augment()
    lr1_afn = build_lr1_afn(aug)
    lr1     = build_lr1_afd(aug)
    lalr1   = build_lalr1_afd(lr1, aug)
    return {"lr1_afn": lr1_afn, "lr1": lr1, "lalr1": lalr1}
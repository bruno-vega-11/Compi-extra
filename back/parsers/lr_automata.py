from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

from grammar.grammar import Grammar, EPSILON as EPS

afn_EPSILON = "ε"


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _norm_rhs(rhs) -> tuple:
    """Normaliza epsilon en cualquier forma → tupla vacía."""
    if rhs in ([], [EPS], ['ε'], (EPS,), ('ε',)):
        return ()
    return tuple(rhs)


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

    def label(self) -> str:
        rhs = list(self.rhs)
        rhs.insert(self.dot, "•")
        return f"{self.lhs} → {' '.join(rhs) if rhs else EPS}"

    def __repr__(self) -> str:
        return self.label()


# ══════════════════════════════════════════════════════════════════════════════
# AFN
# ══════════════════════════════════════════════════════════════════════════════

def build_afn(aug_grammar: Grammar) -> dict:
    nts = aug_grammar.non_terminals

    # Generar todos los items posibles
    all_items: list[Item] = []
    for lhs, prods in aug_grammar.productions.items():
        for rhs in prods:
            rhs_t = _norm_rhs(rhs)
            for dot in range(len(rhs_t) + 1):
                all_items.append(Item(lhs, rhs_t, dot))

    item_id: dict[Item, str] = {item: f"n{i}" for i, item in enumerate(all_items)}

    # Estado inicial: S' → • S
    start_sym  = aug_grammar.start_symbol
    start_rhs  = _norm_rhs(aug_grammar.productions[start_sym][0])
    start_item = Item(start_sym, start_rhs, 0)

    # Nodos
    states = []
    accept_states = []
    for item in all_items:
        nid = item_id[item]
        is_accept = item.completed
        states.append({
            "id":        nid,
            "label":     item.label(),
            "is_accept": is_accept,
            "is_start":  item == start_item,
            "lhs":       item.lhs,
            "rhs":       list(item.rhs),
            "dot":       item.dot,
        })
        if is_accept:
            accept_states.append(nid)

    # Transiciones reales (avanzar el punto)
    transitions = []
    for item in all_items:
        sym = item.next_symbol
        if sym is None:
            continue
        advanced = item.advance()
        if advanced in item_id:
            transitions.append({
                "from":   item_id[item],
                "to":     item_id[advanced],
                "symbol": sym,
                "type":   "real",
            })

    # Transiciones épsilon (expansión de no-terminales)
    epsilon_transitions = []
    for item in all_items:
        B = item.next_symbol
        if B and B in nts:
            for rhs in aug_grammar.productions.get(B, []):
                target = Item(B, _norm_rhs(rhs), 0)
                if target in item_id:
                    epsilon_transitions.append({
                        "from":   item_id[item],
                        "to":     item_id[target],
                        "symbol": afn_EPSILON,
                        "type":   "epsilon",
                    })

    return {
        "type":                "afn",
        "states":              states,
        "transitions":         transitions,
        "epsilon_transitions": epsilon_transitions,
        "start_state":         item_id[start_item],
        "accept_states":       accept_states,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Clausura épsilon
# ══════════════════════════════════════════════════════════════════════════════

def epsilon_closure(afn_ids: set[str], eps_trans: list[dict]) -> frozenset[str]:
    """Todos los estados alcanzables desde afn_ids siguiendo solo aristas ε."""
    closure = set(afn_ids)
    worklist = list(afn_ids)
    index: dict[str, list[str]] = {}
    for t in eps_trans:
        index.setdefault(t["from"], []).append(t["to"])
    while worklist:
        cur = worklist.pop()
        for tgt in index.get(cur, []):
            if tgt not in closure:
                closure.add(tgt)
                worklist.append(tgt)
    return frozenset(closure)


# ══════════════════════════════════════════════════════════════════════════════
# AFD  (construcción de subconjuntos)
# ══════════════════════════════════════════════════════════════════════════════

def build_afd(afn: dict) -> dict:
    """Convierte el AFN en AFD por subconjuntos."""
    # Índice de transiciones reales
    real_index: dict[tuple[str, str], list[str]] = {}
    for t in afn["transitions"]:
        real_index.setdefault((t["from"], t["symbol"]), []).append(t["to"])

    # Lookup de info de nodos AFN
    afn_info: dict[str, dict]   = {s["id"]: s for s in afn["states"]}
    afn_accept: set[str]        = set(afn["accept_states"])

    initial = epsilon_closure({afn["start_state"]}, afn["epsilon_transitions"])

    afd_states:      list[dict] = []
    afd_transitions: list[dict] = []
    afd_accept:      list[str]  = []

    subset_to_id: dict[frozenset[str], str] = {initial: "d0"}
    worklist = [initial]

    while worklist:
        subset = worklist.pop(0)
        did    = subset_to_id[subset]

        items = sorted(
            [afn_info[nid] for nid in subset],
            key=lambda x: x["label"]
        )

        is_accept = bool(subset & afn_accept)
        is_start  = (did == "d0")

        afd_states.append({
            "id":         did,
            "label":      f"I{did[1:]}",
            "items":      items,
            "afn_states": sorted(subset),
            "is_accept":  is_accept,
            "is_start":   is_start,
        })

        if is_accept:
            afd_accept.append(did)

        # Símbolos posibles desde este subconjunto
        symbols: set[str] = set()
        for nid in subset:
            for (fid, sym) in real_index:
                if fid == nid:
                    symbols.add(sym)

        for sym in sorted(symbols):
            moved: set[str] = set()
            for nid in subset:
                moved |= set(real_index.get((nid, sym), []))
            if not moved:
                continue
            next_subset = epsilon_closure(moved, afn["epsilon_transitions"])
            if next_subset not in subset_to_id:
                new_id = f"d{len(subset_to_id)}"
                subset_to_id[next_subset] = new_id
                worklist.append(next_subset)
            afd_transitions.append({
                "from":   did,
                "to":     subset_to_id[next_subset],
                "symbol": sym,
            })

    return {
        "type":          "afd",
        "states":        afd_states,
        "transitions":   afd_transitions,
        "start_state":   "d0",
        "accept_states": afd_accept,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Punto de entrada
# ══════════════════════════════════════════════════════════════════════════════

def grammar_to_automata(grammar: Grammar) -> dict:
    aug = grammar.augment()
    afn = build_afn(aug)
    afd = build_afd(afn)
    return {"afn": afn, "afd": afd}
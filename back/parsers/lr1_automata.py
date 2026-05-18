from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, FrozenSet

from grammar.grammar import Grammar, EPSILON as EPS

# Símbolo épsilon estándar para visualización
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
# AFN LR(1) — con construction_order integrado
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

    # Mapeo previo de conexiones para estructurar el orden de pasos de forma limpia
    connections_by_node: dict[str, list[dict]] = {nid: [] for nid in item_id.values()}

    # Transiciones reales (Avanzar el punto •)
    for item in all_items:
        sym = item.next_symbol
        if sym is None:
            continue
        adv = item.advance()
        if adv in item_id:
            connections_by_node[item_id[item]].append({
                "to":      item_id[adv],
                "symbol":   sym,
                "type":     "real",
                "reason":   f"{item.label()} avanza con '{sym}' → {adv.label()}",
            })

    # Transiciones épsilon (Expansión de No Terminales)
    for item in all_items:
        B = item.next_symbol
        if B is None or B not in non_terminals:
            continue
        beta = item.after_dot
        for la in first_of_string(beta, item.lookahead, first):
            for rhs in aug_grammar.productions.get(B, []):
                child = Item1(B, _norm_rhs(rhs), 0, la)
                if child in item_id:
                    connections_by_node[item_id[item]].append({
                        "to":      item_id[child],
                        "symbol":   afn_EPSILON,
                        "type":     "epsilon",
                        "reason":   f"{item.label()} espera a '{B}', ε-cierre abre {child.label()}",
                    })

    states = []
    accept_states = []
    transitions = []
    epsilon_transitions = []
    construction_order = []
    step = 0

    for item in all_items:
        nid       = item_id[item]
        is_accept = item.completed
        is_start  = (item == start_item)

        states.append({
            "id":         nid,
            "label":      item.label(),
            "is_accept":  is_accept,
            "is_start":   is_start,
            "lhs":        item.lhs,
            "rhs":        list(item.rhs),
            "dot":        item.dot,
            "lookahead":  item.lookahead,
            "completed":  is_accept,
            "connections": connections_by_node[nid],
        })

        construction_order.append({
            "step":        step,
            "type":        "add_state",
            "state_id":    nid,
            "is_accept":   is_accept,
            "is_start":    is_start,
            "items":       [item.label()],
            "description": f"Agregar item LR(1): {item.label()}",
        })
        step += 1

        if is_accept:
            accept_states.append(nid)

        for conn in connections_by_node[nid]:
            entry = {"from": nid, "to": conn["to"], "symbol": conn["symbol"]}
            if conn["type"] == "epsilon":
                epsilon_transitions.append(entry)
            else:
                transitions.append(entry)

            construction_order.append({
                "step":        step,
                "type":        "add_transition",
                "from":        nid,
                "to":          conn["to"],
                "symbol":      conn["symbol"],
                "trans_type":  conn["type"],
                "description": conn["reason"],
            })
            step += 1

    return {
        "type":                "lr1_afn",
        "states":              states,
        "transitions":         transitions,
        "epsilon_transitions": epsilon_transitions,
        "start_state":         item_id[start_item],
        "accept_states":       accept_states,
        "construction_order":  construction_order,
    }


# ══════════════════════════════════════════════════════════════════════════════
# AFD LR(1) — con todos los subpasos de construcción (GOTO, Clausura, etc.)
# ══════════════════════════════════════════════════════════════════════════════

def build_lr1_afd(aug_grammar: Grammar) -> dict:
    first = compute_first(aug_grammar)
    non_terminals = aug_grammar.non_terminals

    # Generamos los ID estables del AFN para mapear "afn_nodes" en la interfaz
    start_sym  = aug_grammar.start_symbol
    start_rhs  = _norm_rhs(aug_grammar.productions[start_sym][0])
    start_item = Item1(start_sym, start_rhs, 0, "$")

    afn_items: list[Item1] = []
    afn_seen:  set[Item1]  = set()
    afn_queue: list[Item1] = [start_item]
    while afn_queue:
        item = afn_queue.pop(0)
        if item in afn_seen: continue
        afn_seen.add(item)
        afn_items.append(item)
        B = item.next_symbol
        if B is not None:
            adv = item.advance()
            if adv not in afn_seen: afn_queue.append(adv)
        if B is not None and B in non_terminals:
            beta = item.after_dot
            for la in first_of_string(beta, item.lookahead, first):
                for rhs in aug_grammar.productions.get(B, []):
                    child = Item1(B, _norm_rhs(rhs), 0, la)
                    if child not in afn_seen: afn_queue.append(child)
    
    afn_item_id = {item: f"n{i}" for i, item in enumerate(afn_items)}

    # Inicialización del AFD
    start_set = lr1_closure(frozenset({start_item}), aug_grammar, first)

    state_id: dict[frozenset[Item1], str] = {start_set: "d0"}
    states_list: list[frozenset[Item1]]   = [start_set]
    afd_states:      list[dict] = []
    afd_transitions: list[dict] = []
    afd_accept:      list[str]  = []

    worklist = [start_set]
    construction_order = []
    step_num = 0

    # ── Paso 0: Clausura Inicial (Nace I0) ──
    initial_labels = sorted([item.label() for item in start_set])
    initial_afn_nodes = sorted([afn_item_id[item] for item in start_set if item in afn_item_id])
    
    construction_order.append({
        "step":        step_num,
        "type":        "epsilon_closure",
        "state_id":    "d0",
        "is_new":      True,
        "afn_nodes":   initial_afn_nodes,
        "items":       initial_labels,
        "is_start":    True,
        "is_accept":   any(item.completed for item in start_set),
        "description": f"ε-clausura de item inicial → nace I0",
    })
    step_num += 1

    while worklist:
        state = worklist.pop(0)
        did   = state_id[state]
        dfa_label = f"I{did[1:]}"

        is_accept = any(item.completed for item in state)
        is_start  = (did == "d0")
        item_labels = sorted([item.label() for item in state])
        state_afn_nodes = sorted([afn_item_id[item] for item in state if item in afn_item_id])

        # ── Paso: Registrar nuevo estado procesado ──
        if did != "d0":
            construction_order.append({
                "step":        step_num,
                "type":        "add_state",
                "state_id":    did,
                "afn_nodes":   state_afn_nodes,
                "items":       item_labels,
                "is_start":    is_start,
                "is_accept":   is_accept,
                "description": f"Estado {dfa_label} = {{{', '.join(item_labels)}}}",
            })
            step_num += 1

        symbols: set[str] = {item.next_symbol for item in state if item.next_symbol}

        for sym in sorted(symbols):
            # Calcular conjunto movido por el símbolo (GOTO básico)
            moved = frozenset(item.advance() for item in state if item.next_symbol == sym)
            if not moved:
                continue

            # ── Paso: Calcular GOTO ──
            moved_labels = sorted([item.label() for item in moved])
            moved_afn_nodes = sorted([afn_item_id[item] for item in moved if item in afn_item_id])
            
            construction_order.append({
                "step":        step_num,
                "type":        "compute_goto",
                "from":        did,
                "symbol":      sym,
                "afn_nodes":   moved_afn_nodes,
                "items":       moved_labels,
                "description": f"GOTO({dfa_label}, '{sym}') desplaza punto • ante '{sym}'",
            })
            step_num += 1

            # Calcular Clausura del conjunto movido
            next_state = lr1_closure(moved, aug_grammar, first)
            closure_labels = sorted([item.label() for item in next_state])
            closure_afn_nodes = sorted([afn_item_id[item] for item in next_state if item in afn_item_id])
            is_new = next_state not in state_id

            if is_new:
                new_id = f"d{len(state_id)}"
                state_id[next_state] = new_id
                states_list.append(next_state)
                worklist.append(next_state)

            target_id   = state_id[next_state]
            target_label = f"I{target_id[1:]}"

            # ── Paso: Clausura del GOTO calculado (Nace o reusa un estado) ──
            construction_order.append({
                "step":        step_num,
                "type":        "epsilon_closure",
                "from":        did,
                "symbol":      sym,
                "state_id":    target_id,
                "is_new":      is_new,
                "afn_nodes":   closure_afn_nodes,
                "items":       closure_labels,
                "is_accept":   any(item.completed for item in next_state),
                "description": f"ε-clausura del GOTO anterior → {'nace ' if is_new else 'reusa '}{target_label}",
            })
            step_num += 1

            # Registrar arista de transición
            afd_transitions.append({
                "from":   did,
                "to":     target_id,
                "symbol": sym,
            })

            # ── Paso: Nueva transición en el grafo del AFD ──
            construction_order.append({
                "step":         step_num,
                "type":         "add_transition",
                "from":         did,
                "to":           target_id,
                "symbol":       sym,
                "is_new_state": is_new,
                "description":  f"Conectar {dfa_label} ──{sym}──► {target_label}",
            })
            step_num += 1

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
            "label":     dfa_label,
            "items":     items_info,
            "is_accept": is_accept,
            "is_start":  is_start,
        })

        if is_accept:
            afd_accept.append(did)

    return {
        "type":                "lr1_afd",
        "states":              afd_states,
        "transitions":         afd_transitions,
        "start_state":         "d0",
        "accept_states":       afd_accept,
        "construction_order":  construction_order,
    }


# ══════════════════════════════════════════════════════════════════════════════
# AFD LALR(1) — con historial dinámico de fusión de núcleos
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
    construction_order = []
    step_num = 0

    # Procesar y registrar la agrupación de estados con núcleos idénticos
    for lalr_id, lr1_ids in sorted(lalr_groups.items(), key=lambda x: int(x[0][1:])):
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

        state_entry = {
            "id":        lalr_id,
            "label":     f"I{lalr_id[1:]}",
            "items":     items_info,
            "lr1_ids":   lr1_ids,
            "is_accept": is_accept,
            "is_start":  is_start,
        }
        lalr_states.append(state_entry)

        if is_accept:
            lalr_accept.append(lalr_id)

        # ── Paso LALR: Fusión de estados LR(1) ──
        item_labels = [it["label"] for it in items_info]
        origen_str = ", ".join([f"I{x[1:]}" for x in lr1_ids])
        
        construction_order.append({
            "step":        step_num,
            "type":        "add_state",
            "state_id":    lalr_id,
            "afn_nodes":   [], # Vacío ya que LALR opera unificando el AFD LR(1)
            "items":       item_labels,
            "is_start":    is_start,
            "is_accept":   is_accept,
            "description": f"Unificar {origen_str} en el estado LALR I{lalr_id[1:]} por simetría de núcleos",
        })
        step_num += 1

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

            # ── Paso LALR: Mapear transiciones consolidadas ──
            construction_order.append({
                "step":         step_num,
                "type":         "add_transition",
                "from":         src,
                "to":           dst,
                "symbol":       sym,
                "is_new_state": False,
                "description":  f"Enlazar transición consolidada: I{src[1:]} ──{sym}──► I{dst[1:]}",
            })
            step_num += 1

    return {
        "type":                "lalr1_afd",
        "states":              lalr_states,
        "transitions":         lalr_transitions,
        "start_state":         "m0",
        "accept_states":       lalr_accept,
        "construction_order":  construction_order,
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
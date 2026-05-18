from __future__ import annotations
from dataclasses import dataclass
from typing import Optional

from grammar.grammar import Grammar, EPSILON as EPS

afn_EPSILON = "ε"

def _norm_rhs(rhs) -> tuple:
    if rhs in ([], [EPS], ['ε'], (EPS,), ('ε',)):
        return ()
    return tuple(rhs)

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

    all_items: list[Item] = []
    for lhs, prods in aug_grammar.productions.items():
        for rhs in prods:
            rhs_t = _norm_rhs(rhs)
            for dot in range(len(rhs_t) + 1):
                all_items.append(Item(lhs, rhs_t, dot))

    item_id: dict[Item, str] = {item: f"n{i}" for i, item in enumerate(all_items)}

    start_sym  = aug_grammar.start_symbol
    start_rhs  = _norm_rhs(aug_grammar.productions[start_sym][0])
    start_item = Item(start_sym, start_rhs, 0)

    connections_by_node: dict[str, list[dict]] = {nid: [] for nid in item_id.values()}

    # Transiciones reales
    for item in all_items:
        sym = item.next_symbol
        if sym is None:
            continue
        advanced = item.advance()
        if advanced in item_id:
            connections_by_node[item_id[item]].append({
                "to":         item_id[advanced],
                "symbol":     sym,
                "type":       "real",
                "from_label": item.label(),
                "to_label":   advanced.label(),
                "reason":     f"{item.label()} avanza con '{sym}' → {advanced.label()}",
            })

    # Transiciones épsilon
    for item in all_items:
        B = item.next_symbol
        if B and B in nts:
            for rhs in aug_grammar.productions.get(B, []):
                target = Item(B, _norm_rhs(rhs), 0)
                if target in item_id:
                    connections_by_node[item_id[item]].append({
                        "to":         item_id[target],
                        "symbol":     afn_EPSILON,
                        "type":       "epsilon",
                        "from_label": item.label(),
                        "to_label":   target.label(),
                        "reason":     f"{item.label()} espera '{B}', ε-cierre abre {target.label()}",
                    })

    states = []
    accept_states = []
    transitions = []
    epsilon_transitions = []
    construction_order = []
    step = 0

    for item in all_items:
        nid = item_id[item]
        is_accept = item.completed
        is_start  = item == start_item

        states.append({
            "id":          nid,
            "label":       item.label(),
            "is_accept":   is_accept,
            "is_start":    is_start,
            "lhs":         item.lhs,
            "rhs":         list(item.rhs),
            "dot":         item.dot,
            "connections": connections_by_node[nid],
        })

        construction_order.append({
            "step":        step,
            "type":        "add_state",
            "state_id":    nid,
            "is_accept":   is_accept,
            "is_start":    is_start,
            "items":       [item.label()],
            "description": f"Agregar item: {item.label()}",
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
        "type":                "afn",
        "states":              states,
        "start_state":         item_id[start_item],
        "accept_states":       accept_states,
        "transitions":         transitions,
        "epsilon_transitions": epsilon_transitions,
        "construction_order":  construction_order,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ε-clausura
# ══════════════════════════════════════════════════════════════════════════════

def epsilon_closure(afn_ids: set[str], afn_states: list[dict]) -> frozenset[str]:
    closure = set(afn_ids)
    worklist = list(afn_ids)
    eps_index = {}
    for s in afn_states:
        eps_index[s["id"]] = [c["to"] for c in s["connections"] if c["type"] == "epsilon"]
    while worklist:
        cur = worklist.pop()
        for tgt in eps_index.get(cur, []):
            if tgt not in closure:
                closure.add(tgt)
                worklist.append(tgt)
    return frozenset(closure)


# ══════════════════════════════════════════════════════════════════════════════
# AFD — construction_order corregido
# ══════════════════════════════════════════════════════════════════════════════

def build_afd(afn: dict) -> dict:
    real_index = {}
    for s in afn["states"]:
        for c in s["connections"]:
            if c["type"] == "real":
                real_index.setdefault((s["id"], c["symbol"]), []).append(c["to"])

    afn_info   = {s["id"]: s for s in afn["states"]}
    afn_accept = set(afn["accept_states"])
    initial    = epsilon_closure({afn["start_state"]}, afn["states"])

    subset_to_id: dict[frozenset[str], str] = {initial: "d0"}
    worklist     = [initial]
    afd_connections: dict[str, list[dict]] = {}
    afd_states   = []
    afd_accept   = []
    transitions  = []
    construction_order = []
    step_num     = 0

    # ── Paso 0: ε-clausura del estado inicial → nace I0 ──────────────────────
    initial_labels = sorted([afn_info[nid]["label"] for nid in initial])
    construction_order.append({
        "step":        step_num,
        "type":        "epsilon_closure",
        "state_id":    "d0",        # el estado que nace aquí
        "is_new":      True,
        "afn_nodes":   sorted(initial),
        "items":       initial_labels,
        "is_start":    True,
        "is_accept":   bool(initial & afn_accept),
        "description": (
            f"ε-clausura({{inicio}}) = {{{', '.join(initial_labels)}}}"
            f" → nace I0"
        ),
    })
    step_num += 1

    while worklist:
        subset = worklist.pop(0)
        did    = subset_to_id[subset]
        afd_connections[did] = []

        items     = sorted([afn_info[nid] for nid in subset], key=lambda x: x["label"])
        is_accept = bool(subset & afn_accept)
        is_start  = (did == "d0")
        dfa_label = f"I{did[1:]}"

        if is_accept:
            afd_accept.append(did)

        # ── Paso: add_state solo para d1, d2, … (d0 ya se registró arriba) ──
        if did != "d0":
            item_labels = [it["label"] for it in items]
            construction_order.append({
                "step":        step_num,
                "type":        "add_state",
                "state_id":    did,
                "afn_nodes":   sorted(subset),
                "items":       item_labels,
                "is_start":    is_start,
                "is_accept":   is_accept,
                "description": f"Estado {dfa_label} = {{{', '.join(item_labels)}}}",
            })
            step_num += 1

        # Símbolos salientes
        symbols = set()
        for nid in subset:
            for (fid, sym) in real_index:
                if fid == nid:
                    symbols.add(sym)

        for sym in sorted(symbols):
            moved = set()
            for nid in subset:
                moved |= set(real_index.get((nid, sym), []))
            if not moved:
                continue

            # ── Paso: GOTO ───────────────────────────────────────────────────
            moved_labels = sorted([afn_info[nid]["label"] for nid in moved])
            construction_order.append({
                "step":        step_num,
                "type":        "compute_goto",
                "from":        did,
                "symbol":      sym,
                "afn_nodes":   sorted(moved),
                "items":       moved_labels,
                "description": (
                    f"GOTO({dfa_label}, '{sym}') mueve a"
                    f" {{{', '.join(moved_labels)}}}"
                ),
            })
            step_num += 1

            # ── Paso: ε-clausura del GOTO → aquí nace el estado si es nuevo ─
            next_subset    = epsilon_closure(moved, afn["states"])
            closure_labels = sorted([afn_info[nid]["label"] for nid in next_subset])
            is_new         = next_subset not in subset_to_id

            if is_new:
                new_id = f"d{len(subset_to_id)}"
                subset_to_id[next_subset] = new_id
                worklist.append(next_subset)

            target_id    = subset_to_id[next_subset]
            target_label = f"I{target_id[1:]}"

            construction_order.append({
                "step":        step_num,
                "type":        "epsilon_closure",
                "from":        did,
                "symbol":      sym,
                "state_id":    target_id,   # estado al que pertenece este closure
                "is_new":      is_new,       # True = nació aquí
                "afn_nodes":   sorted(next_subset),
                "items":       closure_labels,
                "is_accept":   bool(next_subset & afn_accept),
                "description": (
                    f"ε-clausura(GOTO({dfa_label}, '{sym}'))"
                    f" = {{{', '.join(closure_labels)}}}"
                    f" → {'nace ' if is_new else ''}{target_label}"
                    + (" (ya existía)" if not is_new else "")
                ),
            })
            step_num += 1

            afd_connections[did].append({"to": target_id, "symbol": sym})

            # ── Paso: transición registrada ───────────────────────────────────
            construction_order.append({
                "step":         step_num,
                "type":         "add_transition",
                "from":         did,
                "to":           target_id,
                "symbol":       sym,
                "is_new_state": is_new,
                "description":  (
                    f"{dfa_label} ──{sym}──► {target_label}"
                    + (" (estado nuevo)" if is_new else " (ya existía)")
                ),
            })
            step_num += 1

        afd_states.append({
            "id":         did,
            "label":      dfa_label,
            "items":      items,
            "afn_states": sorted(subset),
            "is_accept":  is_accept,
            "is_start":   is_start,
            "subset_id":  did,
        })

    for state in afd_states:
        state["connections"] = afd_connections[state["id"]]
        for conn in state["connections"]:
            transitions.append({
                "from":   state["id"],
                "to":     conn["to"],
                "symbol": conn["symbol"],
            })

    return {
        "type":               "afd",
        "states":              afd_states,
        "start_state":         "d0",
        "accept_states":       afd_accept,
        "transitions":         transitions,
        "construction_order":  construction_order,
    }


def grammar_to_automata(grammar: Grammar) -> dict:
    aug = grammar.augment()
    afn = build_afn(aug)
    afd = build_afd(afn)
    return {"afn": afn, "afd": afd}
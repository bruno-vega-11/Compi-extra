from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, FrozenSet

from grammar.grammar import Grammar, EPSILON as EPS

# ══════════════════════════════════════════════════════════════════════════════
# Item LR(1)  –  igual que LR(0) pero con un lookahead terminal
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class Item1:
    lhs: str
    rhs: tuple
    dot: int
    lookahead: str          # terminal (o "$" para EOF)

    # ── propiedades básicas ──────────────────────────────────────────────────

    @property
    def completed(self) -> bool:
        return self.dot >= len(self.rhs)

    @property
    def next_symbol(self) -> Optional[str]:
        return None if self.completed else self.rhs[self.dot]

    @property
    def after_dot(self) -> tuple:
        """Símbolos que vienen DESPUÉS del siguiente símbolo (usado para FIRST)."""
        return self.rhs[self.dot + 1:] if self.dot + 1 <= len(self.rhs) else ()

    def advance(self) -> Item1:
        return Item1(self.lhs, self.rhs, self.dot + 1, self.lookahead)

    # El "núcleo" es la parte LR(0): identifica la familia de items en LALR(1)
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
# FIRST  (necesario para calcular los lookaheads de clausura)
# ══════════════════════════════════════════════════════════════════════════════

def compute_first(grammar: Grammar) -> dict[str, set[str]]:
    """
    Devuelve FIRST(X) para cada símbolo X de la gramática.
    FIRST(a) = {a}  si 'a' es terminal.
    Itera hasta punto fijo para no-terminales.
    """
    terminals     = grammar.terminals          # conjunto de terminales
    non_terminals = grammar.non_terminals      # conjunto de no-terminales
    productions   = grammar.productions        # dict  NT -> list[list[str]]

    first: dict[str, set[str]] = {}

    # Inicializar
    for t in terminals:
        first[t] = {t}
    for nt in non_terminals:
        first[nt] = set()
    # Épsilon como símbolo especial
    first[EPS] = {EPS}

    changed = True
    while changed:
        changed = False
        for nt, prods in productions.items():
            for rhs in prods:
                # Si la producción es vacía  → ε ∈ FIRST(nt)
                if not rhs or rhs == [EPS]:
                    if EPS not in first[nt]:
                        first[nt].add(EPS)
                        changed = True
                    continue
                # Recorrer los símbolos de la producción
                for sym in rhs:
                    sym_first = first.get(sym, {sym})
                    before = len(first[nt])
                    first[nt] |= sym_first - {EPS}
                    if len(first[nt]) != before:
                        changed = True
                    if EPS not in sym_first:
                        break           # no puede derivar ε, parar
                else:
                    # Todos los símbolos pueden derivar ε
                    if EPS not in first[nt]:
                        first[nt].add(EPS)
                        changed = True

    return first


def first_of_string(
    symbols: tuple,
    lookahead: str,
    first: dict[str, set[str]],
) -> set[str]:
    """
    FIRST(symbols · lookahead).
    Usado para calcular los lookaheads al cerrar un item LR(1).
    """
    result: set[str] = set()
    for sym in symbols:
        sym_first = first.get(sym, {sym})
        result |= sym_first - {EPS}
        if EPS not in sym_first:
            return result
    # Todos los símbolos derivan ε → incluir el lookahead
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
    """
    Clausura canónica LR(1).
    Para cada item  [A → α • B β, a]  y cada producción  B → γ,
    agrega  [B → • γ, b]  para todo b ∈ FIRST(β a).
    """
    closure: set[Item1] = set(items)
    worklist: list[Item1] = list(items)
    non_terminals = grammar.non_terminals

    while worklist:
        item = worklist.pop()
        B = item.next_symbol
        if B is None or B not in non_terminals:
            continue
        # β es la cadena después de B, seguida del lookahead
        beta = item.after_dot
        for la in first_of_string(beta, item.lookahead, first):
            for rhs in grammar.productions.get(B, []):
                new_item = Item1(B, tuple(rhs), 0, la)
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
    """
    GOTO(state, symbol): avanza el punto en todos los items cuyo siguiente
    símbolo sea 'symbol', luego aplica clausura.
    """
    moved = frozenset(
        item.advance()
        for item in state
        if item.next_symbol == symbol
    )
    return lr1_closure(moved, grammar, first) if moved else frozenset()


# ══════════════════════════════════════════════════════════════════════════════
# Construcción del AFD LR(1)  (colección canónica de conjuntos de items LR(1))
# ══════════════════════════════════════════════════════════════════════════════

def build_lr1_afd(aug_grammar: Grammar) -> dict:
    """
    Devuelve el AFD LR(1) en el mismo formato que build_afd() del módulo LR(0).
    """
    first = compute_first(aug_grammar)

    # Item inicial: [S' → • S, $]
    start_sym  = aug_grammar.start_symbol
    start_rhs  = tuple(aug_grammar.productions[start_sym][0])
    start_item = Item1(start_sym, start_rhs, 0, "$")
    start_set  = lr1_closure(frozenset({start_item}), aug_grammar, first)

    # Colección canónica
    state_id: dict[frozenset[Item1], str] = {start_set: "d0"}
    states_list: list[frozenset[Item1]]   = [start_set]
    afd_states:      list[dict] = []
    afd_transitions: list[dict] = []
    afd_accept:      list[str]  = []

    worklist = [start_set]

    while worklist:
        state = worklist.pop(0)
        did   = state_id[state]

        # Símbolos con los que podemos avanzar desde este estado
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

        # Decidir si es estado de aceptación
        is_accept = any(item.completed for item in state)
        is_start  = (did == "d0")

        # Serializar items para el JSON de salida
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
            "id":       did,
            "label":    f"I{did[1:]}",
            "items":    items_info,
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
# Construcción del AFD LALR(1)
# (fusionar estados LR(1) que comparten el mismo núcleo LR(0))
# ══════════════════════════════════════════════════════════════════════════════

def _core(state: frozenset[Item1]) -> frozenset[tuple]:
    """Núcleo de un estado LR(1): conjunto de (lhs, rhs, dot) sin lookaheads."""
    return frozenset(item.core for item in state)


def build_lalr1_afd(lr1: dict, aug_grammar: Grammar) -> dict:
    """
    A partir del AFD LR(1) ya construido, fusiona estados con el mismo núcleo
    para obtener el AFD LALR(1).

    Devuelve el mismo formato de dict que build_lr1_afd().
    """
    # ── 1. Agrupar estados LR(1) por núcleo ─────────────────────────────────
    # core_key -> lista de ids LR(1)
    core_to_lr1: dict[frozenset[tuple], list[str]] = {}
    id_to_state: dict[str, dict] = {s["id"]: s for s in lr1["states"]}

    for state in lr1["states"]:
        # Reconstruir el núcleo desde los items serializados
        core_key = frozenset(
            (it["lhs"], tuple(it["rhs"]), it["dot"])
            for it in state["items"]
        )
        core_to_lr1.setdefault(core_key, []).append(state["id"])

    # ── 2. Asignar un id LALR a cada grupo ───────────────────────────────────
    #       Usamos el id LR(1) más pequeño del grupo como representante.
    lr1_to_lalr: dict[str, str] = {}
    lalr_groups: dict[str, list[str]] = {}   # lalr_id -> [lr1_ids]

    # Ordenar para que d0 siempre sea el start
    for core_key, lr1_ids in core_to_lr1.items():
        lr1_ids_sorted = sorted(lr1_ids)
        rep = lr1_ids_sorted[0]             # representante (menor id)
        lalr_id = f"m{rep[1:]}"             # "d3" → "m3"
        # Si d0 está en el grupo, ese grupo es el start
        if "d0" in lr1_ids:
            lalr_id = "m0"
        for lid in lr1_ids:
            lr1_to_lalr[lid] = lalr_id
        lalr_groups[lalr_id] = lr1_ids_sorted

    # ── 3. Construir estados LALR fusionando lookaheads ──────────────────────
    lalr_states: list[dict] = []
    lalr_accept: list[str]  = []

    for lalr_id, lr1_ids in lalr_groups.items():
        # Fusionar items: mismo núcleo, unión de lookaheads
        merged: dict[tuple, set[str]] = {}   # core -> {lookaheads}
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
                    "lookaheads": sorted(las),      # varios posibles
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
            "lr1_ids":   lr1_ids,              # para trazabilidad
            "is_accept": is_accept,
            "is_start":  is_start,
        })

        if is_accept:
            lalr_accept.append(lalr_id)

    # ── 4. Redirigir transiciones LR(1) al espacio LALR ─────────────────────
    seen_trans: set[tuple] = set()
    lalr_transitions: list[dict] = []

    for t in lr1["transitions"]:
        src  = lr1_to_lalr[t["from"]]
        dst  = lr1_to_lalr[t["to"]]
        sym  = t["symbol"]
        key  = (src, dst, sym)
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
# Misma lógica que el AFN LR(0): cada Item1 posible es un nodo.
# Transiciones reales  → avanzar el punto sobre un símbolo.
# Transiciones ε       → expansión de no-terminales (con lookahead propagado).
# ══════════════════════════════════════════════════════════════════════════════

def build_lr1_afn(aug_grammar: Grammar) -> dict:
    """
    Construye el AFN LR(1).

    Nodos   : todos los Item1 generables desde el item inicial.
    Reales  : [A → α • X β, a]  ──X──►  [A → α X • β, a]
    Épsilon : [A → α • B β, a]  ──ε──►  [B → • γ, b]
              para todo b ∈ FIRST(β a)  y  toda producción B → γ
    """
    first        = compute_first(aug_grammar)
    non_terminals = aug_grammar.non_terminals

    # ── Semilla: item inicial ────────────────────────────────────────────────
    start_sym  = aug_grammar.start_symbol
    start_rhs  = tuple(aug_grammar.productions[start_sym][0])
    start_item = Item1(start_sym, start_rhs, 0, "$")

    # ── BFS para descubrir todos los items alcanzables ───────────────────────
    # Empezamos desde start_item y seguimos transiciones reales + ε.
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

        # Transición real → item avanzado
        if B is not None:
            adv = item.advance()
            if adv not in seen:
                queue.append(adv)

        # Transiciones ε → items kernel de cada producción de B
        if B is not None and B in non_terminals:
            beta = item.after_dot
            for la in first_of_string(beta, item.lookahead, first):
                for rhs in aug_grammar.productions.get(B, []):
                    child = Item1(B, tuple(rhs), 0, la)
                    if child not in seen:
                        queue.append(child)

    # ── Asignar ids ──────────────────────────────────────────────────────────
    item_id: dict[Item1, str] = {item: f"n{i}" for i, item in enumerate(all_items)}

    # ── Serializar nodos ─────────────────────────────────────────────────────
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

    # ── Transiciones reales ──────────────────────────────────────────────────
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

    # ── Transiciones ε ───────────────────────────────────────────────────────
    epsilon_transitions = []
    for item in all_items:
        B = item.next_symbol
        if B is None or B not in non_terminals:
            continue
        beta = item.after_dot
        for la in first_of_string(beta, item.lookahead, first):
            for rhs in aug_grammar.productions.get(B, []):
                child = Item1(B, tuple(rhs), 0, la)
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
    """
    Devuelve un dict con:
      - "lr1_afn" : AFN LR(1)  (items individuales con ε-transiciones)
      - "lr1"     : AFD LR(1)  canónico  (subconjuntos del AFN)
      - "lalr1"   : AFD LALR(1) (fusión de estados LR(1) con igual núcleo)
    """
    aug      = grammar.augment()
    lr1_afn  = build_lr1_afn(aug)
    lr1      = build_lr1_afd(aug)
    lalr1    = build_lalr1_afd(lr1, aug)
    return {"lr1_afn": lr1_afn, "lr1": lr1, "lalr1": lalr1}
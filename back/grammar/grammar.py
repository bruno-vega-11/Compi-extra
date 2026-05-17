"""
grammar.py
----------
Representa una Gramática Libre de Contexto (GLC) ingresada por el usuario.

Formato de entrada esperado (texto plano):
    E -> E + T | T
    T -> T * F | F
    F -> ( E ) | id

Reglas:
  - El símbolo de la primera producción es el símbolo inicial.
  - Los símbolos en MAYÚSCULA o multi-carácter en mayúsculas son No Terminales.
  - Los demás tokens son Terminales (incluye 'id', '+', '*', etc.).
  - 'ε' o 'epsilon' representan la producción vacía.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Set, Tuple


EPSILON = "ε"


@dataclass
class Grammar:
    """Gramática Libre de Contexto."""

    # Símbolo inicial
    start_symbol: str = ""

    # Producciones: { "E": [["E", "+", "T"], ["T"]], ... }
    productions: Dict[str, List[List[str]]] = field(default_factory=dict)

    # Conjuntos derivados (se calculan bajo demanda)
    _terminals: Set[str] = field(default_factory=set, repr=False)
    _non_terminals: Set[str] = field(default_factory=set, repr=False)
    _first: Dict[str, Set[str]] = field(default_factory=dict, repr=False)
    _follow: Dict[str, Set[str]] = field(default_factory=dict, repr=False)

    # ------------------------------------------------------------------ #
    # Construcción desde texto plano
    # ------------------------------------------------------------------ #

    @classmethod
    def from_text(cls, text: str) -> "Grammar":
        """
        Parsea el texto ingresado por el usuario y devuelve una instancia Grammar.

        Formato aceptado:
            E -> E + T | T
            T -> ( E ) | id | ε
        """
        grammar = cls()
        lines = [l.strip() for l in text.strip().splitlines() if l.strip()]

        if not lines:
            raise ValueError("La gramática no puede estar vacía.")

        for line in lines:
            if "->" not in line:
                raise ValueError(f"Línea inválida (falta '->'): '{line}'")

            head, _, body = line.partition("->")
            head = head.strip()

            if not head:
                raise ValueError(f"No terminal vacío en: '{line}'")

            # Guardar el primero como símbolo inicial
            if not grammar.start_symbol:
                grammar.start_symbol = head

            alternatives = body.split("|")
            grammar.productions.setdefault(head, [])

            for alt in alternatives:
                symbols = alt.strip().split()
                if not symbols:
                    raise ValueError(f"Producción vacía en: '{line}'")
                # Normalizar epsilon
                symbols = [EPSILON if s in ("epsilon", "eps", "ε", "λ") else s for s in symbols]
                grammar.productions[head].append(symbols)

        grammar._compute_sets()
        return grammar

    # ------------------------------------------------------------------ #
    # Propiedades
    # ------------------------------------------------------------------ #

    @property
    def non_terminals(self) -> Set[str]:
        return set(self.productions.keys())

    @property
    def terminals(self) -> Set[str]:
        ts: Set[str] = set()
        for prods in self.productions.values():
            for prod in prods:
                for sym in prod:
                    if sym != EPSILON and sym not in self.productions:
                        ts.add(sym)
        return ts

    # ------------------------------------------------------------------ #
    # FIRST y FOLLOW
    # ------------------------------------------------------------------ #

    def _compute_sets(self):
        self._first = {nt: set() for nt in self.productions}
        self._follow = {nt: set() for nt in self.productions}
        self._follow[self.start_symbol].add("$")

        changed = True
        while changed:
            changed = False
            changed |= self._update_first()
            changed |= self._update_follow()

    def _update_first(self) -> bool:
        changed = False
        for nt, prods in self.productions.items():
            for prod in prods:
                for sym in prod:
                    if sym == EPSILON:
                        if EPSILON not in self._first[nt]:
                            self._first[nt].add(EPSILON)
                            changed = True
                        break
                    elif sym in self.productions:
                        before = len(self._first[nt])
                        self._first[nt] |= (self._first[sym] - {EPSILON})
                        if len(self._first[nt]) != before:
                            changed = True
                        if EPSILON not in self._first[sym]:
                            break
                    else:
                        if sym not in self._first[nt]:
                            self._first[nt].add(sym)
                            changed = True
                        break
                else:
                    if EPSILON not in self._first[nt]:
                        self._first[nt].add(EPSILON)
                        changed = True
        return changed

    def _update_follow(self) -> bool:
        changed = False
        for nt, prods in self.productions.items():
            for prod in prods:
                for i, sym in enumerate(prod):
                    if sym not in self.productions:
                        continue
                    # Lo que viene después de sym en esta producción
                    rest = prod[i + 1:]
                    first_rest = self._first_of_sequence(rest)
                    before = len(self._follow[sym])
                    self._follow[sym] |= (first_rest - {EPSILON})
                    if EPSILON in first_rest or not rest:
                        self._follow[sym] |= self._follow[nt]
                    if len(self._follow[sym]) != before:
                        changed = True
        return changed

    def _first_of_sequence(self, symbols: List[str]) -> Set[str]:
        result: Set[str] = set()
        for sym in symbols:
            if sym == EPSILON:
                result.add(EPSILON)
                break
            elif sym in self.productions:
                result |= (self._first[sym] - {EPSILON})
                if EPSILON not in self._first[sym]:
                    break
            else:
                result.add(sym)
                break
        else:
            result.add(EPSILON)
        return result

    def first(self, symbol: str) -> Set[str]:
        if symbol in self._first:
            return self._first[symbol]
        return {symbol}  # terminal → FIRST = él mismo

    def follow(self, symbol: str) -> Set[str]:
        return self._follow.get(symbol, set())

    # ------------------------------------------------------------------ #
    # Validaciones
    # ------------------------------------------------------------------ #

    def validate(self) -> List[str]:
        """
        Devuelve lista de advertencias/errores semánticos.
        Por ejemplo, símbolos usados que nunca se definen.
        """
        warnings: List[str] = []
        defined = set(self.productions.keys())
        for nt, prods in self.productions.items():
            for prod in prods:
                for sym in prod:
                    if sym != EPSILON and sym not in self.terminals and sym not in defined:
                        warnings.append(
                            f"Símbolo '{sym}' usado en producción de '{nt}' pero nunca definido."
                        )
        return warnings

    # ------------------------------------------------------------------ #
    # Aumento
    # ------------------------------------------------------------------ #
    
    def augment(self) -> Grammar:

        new_start = self.start_symbol + "'"

        while new_start in self.productions:
            new_start += "'"

        new_productions = {
            new_start: [[self.start_symbol]],
            **self.productions
        }

        return Grammar(
            start_symbol=new_start,
            productions=new_productions
        )
        
    def productions_list(self) -> List[Tuple[str, List[str]]]:
        """
        Devuelve las producciones en forma lineal:

        [
            ("E", ["E", "+", "T"]),
            ("E", ["T"]),
            ...
        ]
        """
        result = []

        for lhs, prods in self.productions.items():
            for rhs in prods:
                result.append((lhs, rhs))

        return result
    # ------------------------------------------------------------------ #
    # Representación
    # ------------------------------------------------------------------ #

    def to_dict(self) -> dict:
        """Serializable a JSON para la API."""
        return {
            "start_symbol": self.start_symbol,
            "productions": self.productions,
            "terminals": sorted(self.terminals),
            "non_terminals": sorted(self.non_terminals),
            "first": {k: sorted(v) for k, v in self._first.items()},
            "follow": {k: sorted(v) for k, v in self._follow.items()},
        }

    def __str__(self) -> str:
        lines = []
        for nt, prods in self.productions.items():
            rhs = " | ".join(" ".join(p) for p in prods)
            lines.append(f"{nt} -> {rhs}")
        return "\n".join(lines)
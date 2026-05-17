"""
ll1.py
------
Parser LL(1) predictivo con construcción de tabla.

Provee:
 - `LL1Parser(grammar)` construye la tabla predictiva (o lanza error si hay conflicto)
 - `parse(input_string)` realiza el parse usando la tabla y devuelve un ParseResult
 - `get_table()` devuelve la tabla en formato serializable
"""
from __future__ import annotations
from typing import Dict, List, Tuple, Optional

from grammar.grammar import Grammar, EPSILON
from parsers.descenso_recursivo import ParseResult, ParseNode


class LL1Parser:
    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self.table: Dict[Tuple[str, str], List[str]] = {}
        self._build_table()

    def _build_table(self):
        prods = self.grammar.productions
        for A, alternatives in prods.items():
            for alpha in alternatives:
                first_alpha = self.grammar._first_of_sequence(alpha)
                # Para cada terminal en FIRST(alpha) excepto ε
                for a in (first_alpha - {EPSILON}):
                    key = (A, a)
                    if key in self.table and self.table[key] != alpha:
                        raise ValueError(f"Conflicto LL(1) en celda {key}: {self.table[key]} vs {alpha}")
                    self.table[key] = alpha
                # Si ε está en FIRST(alpha), para cada b en FOLLOW(A) poner A->α en (A,b)
                if EPSILON in first_alpha:
                    for b in self.grammar.follow(A):
                        key = (A, b)
                        if key in self.table and self.table[key] != alpha:
                            raise ValueError(f"Conflicto LL(1) en celda {key}: {self.table[key]} vs {alpha}")
                        self.table[key] = alpha

    def get_table(self) -> Dict[str, Dict[str, List[str]]]:
        out: Dict[str, Dict[str, List[str]]] = {}
        for (A, a), prod in self.table.items():
            out.setdefault(A, {})[a] = prod
        return out

    def parse(self, input_string: str) -> ParseResult:
        tokens = input_string.strip().split()
        if not tokens:
            return ParseResult(False, None, [], "La cadena de entrada está vacía.", 0, 0)

        tokens.append("$")
        stack: List[Tuple[str, ParseNode]] = []
        root = ParseNode(symbol=self.grammar.start_symbol)
        stack.append((self.grammar.start_symbol, root))

        pos = 0
        steps = []

        try:
            while stack:
                symbol, node = stack.pop()
                current = tokens[pos] if pos < len(tokens) else "$"

                if symbol == EPSILON:
                    node.children.append(ParseNode(symbol=EPSILON, is_terminal=True))
                    continue

                # Terminal (incluye $)
                if symbol not in self.grammar.productions:
                    if symbol == current:
                        node.is_terminal = True
                        node.matched_token = current
                        pos += 1
                        continue
                    else:
                        raise ValueError(f"match(): se esperaba '{symbol}' pero se encontró '{current}'.")

                # Non-terminal: buscar producción en la tabla
                key = (symbol, current)
                prod = self.table.get(key)
                if prod is None:
                    raise ValueError(f"Tabla LL(1): no hay entrada para ({symbol}, '{current}').")

                # Crear nodos hijos y empujar en stack (en orden inverso)
                children = [ParseNode(s) for s in prod]
                node.children = children
                for child in reversed(children):
                    stack.append((child.symbol, child))

            if pos != len(tokens) - 1:
                leftover = " ".join(tokens[pos:])
                raise ValueError(f"Sobran tokens al finalizar parse: '{leftover}'")

            return ParseResult(True, root.to_dict(), [], None, pos, len(tokens) - 1)

        except Exception as e:
            return ParseResult(False, None, [], str(e), pos, len(tokens) - 1)

"""
recursive_descent.py
--------------------
Parser de Descenso Recursivo Puro con Backtracking.

NO usa FIRST ni FOLLOW. Para cada No Terminal, prueba sus producciones
una por una en orden. Si una falla, retrocede (restaura la posición) y
prueba la siguiente. Si ninguna funciona, falla.

Devuelve:
  - is_valid        : bool
  - parse_tree      : dict  (árbol de derivación)
  - steps           : list  (pasos uno a uno, incluyendo backtracking)
  - error_message   : str | None

LIMITACIÓN:
  No maneja recursión izquierda directa (E -> E + T) porque entra
  en recursión infinita. El parser la detecta y avisa.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional

from grammar.grammar import Grammar, EPSILON


# ──────────────────────────────────────────────────────────────────────────── #
# Estructuras de resultado
# ──────────────────────────────────────────────────────────────────────────── #

@dataclass
class ParseNode:
    """Nodo del árbol de derivación."""
    symbol: str
    children: List["ParseNode"] = field(default_factory=list)
    is_terminal: bool = False
    matched_token: Optional[str] = None

    def to_dict(self) -> dict:
        node: dict = {"symbol": self.symbol, "is_terminal": self.is_terminal}
        if self.is_terminal:
            node["matched_token"] = self.matched_token
        else:
            node["children"] = [c.to_dict() for c in self.children]
        return node


@dataclass
class ParseStep:
    """Un paso del proceso: expansión, match, backtrack, epsilon, éxito o error."""
    step_number: int
    action: str            # "expand" | "match" | "backtrack" | "epsilon" | "success" | "error"
    description: str
    current_token: str
    remaining_input: List[str]
    production_tried: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "step_number": self.step_number,
            "action": self.action,
            "description": self.description,
            "current_token": self.current_token,
            "remaining_input": self.remaining_input,
            "production_tried": self.production_tried,
        }


@dataclass
class ParseResult:
    """Resultado completo del parseo."""
    is_valid: bool
    parse_tree: Optional[dict]
    steps: List[dict]
    error_message: Optional[str]
    tokens_consumed: int
    total_tokens: int

    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "parse_tree": self.parse_tree,
            "steps": self.steps,
            "error_message": self.error_message,
            "tokens_consumed": self.tokens_consumed,
            "total_tokens": self.total_tokens,
        }


# ──────────────────────────────────────────────────────────────────────────── #
# Parser
# ──────────────────────────────────────────────────────────────────────────── #

class RecursiveDescentParser:
    """
    Descenso Recursivo Puro con Backtracking.
    No usa FIRST ni FOLLOW — prueba producciones en orden y retrocede si fallan.
    """

    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self._check_left_recursion()

    # ------------------------------------------------------------------ #
    # Validación previa
    # ------------------------------------------------------------------ #

    def _check_left_recursion(self):
        """Detecta recursión izquierda directa y avisa."""
        for nt, prods in self.grammar.productions.items():
            for prod in prods:
                if prod and prod[0] == nt:
                    raise ValueError(
                        f"Recursión izquierda directa detectada en '{nt}' "
                        f"(producción: {nt} -> {' '.join(prod)}). "
                        f"El descenso recursivo entraría en bucle infinito. "
                        f"Elimina la recursión izquierda antes de continuar."
                    )

    # ------------------------------------------------------------------ #
    # Punto de entrada
    # ------------------------------------------------------------------ #

    def parse(self, input_string: str) -> ParseResult:
        """
        Parsea una cadena. Los tokens van separados por espacios.
        Ejemplo: "( id + id ) * id"
        """
        tokens = input_string.strip().split()
        if not tokens:
            return ParseResult(
                is_valid=False,
                parse_tree=None,
                steps=[],
                error_message="La cadena de entrada está vacía.",
                tokens_consumed=0,
                total_tokens=0,
            )

        self._tokens = tokens
        self._pos = 0
        self._steps: List[ParseStep] = []
        self._step_counter = 0

        success, node = self._parse_nt(self.grammar.start_symbol)

        if success and self._pos == len(self._tokens):
            # Consumimos toda la entrada → cadena válida
            self._add_step(
                action="success",
                description="✓ Cadena aceptada. Todos los tokens fueron consumidos correctamente.",
                current_token="$",
                remaining=[],
            )
            return ParseResult(
                is_valid=True,
                parse_tree=node.to_dict(),
                steps=[s.to_dict() for s in self._steps],
                error_message=None,
                tokens_consumed=self._pos,
                total_tokens=len(self._tokens),
            )
        else:
            leftover = self._tokens[self._pos:]
            if success and leftover:
                error = (
                    f"El parser reconoció una parte de la cadena pero sobraron "
                    f"tokens sin consumir: '{' '.join(leftover)}'. "
                    f"Verifica que la gramática cubra toda la expresión."
                )
            else:
                error = self._build_error_message()

            self._add_step(
                action="error",
                description=f"✗ Cadena rechazada. {error}",
                current_token=self._current_token(),
                remaining=self._tokens[self._pos:],
            )
            return ParseResult(
                is_valid=False,
                parse_tree=None,
                steps=[s.to_dict() for s in self._steps],
                error_message=error,
                tokens_consumed=self._pos,
                total_tokens=len(self._tokens),
            )

    # ------------------------------------------------------------------ #
    # Núcleo recursivo
    # ------------------------------------------------------------------ #

    def _parse_nt(self, nt: str) -> tuple[bool, Optional[ParseNode]]:
        """
        Intenta parsear el No Terminal `nt` desde la posición actual.
        Prueba cada producción en orden. Si falla, hace backtrack.
        Retorna (éxito, nodo).
        """
        prods = self.grammar.productions.get(nt, [])

        for prod in prods:
            prod_str = f"{nt} -> {' '.join(prod)}"
            saved_pos = self._pos  # guardamos posición para posible backtrack

            self._add_step(
                action="expand",
                description=f"Intentando expandir '{nt}' con: {prod_str}",
                current_token=self._current_token(),
                remaining=self._tokens[self._pos:],
                production=prod_str,
            )

            success, children = self._parse_production(prod)

            if success:
                node = ParseNode(symbol=nt, children=children)
                return True, node
            else:
                # Backtrack: restauramos la posición
                self._pos = saved_pos
                self._add_step(
                    action="backtrack",
                    description=f"✗ Producción '{prod_str}' falló. Retrocediendo a posición {saved_pos + 1}.",
                    current_token=self._current_token(),
                    remaining=self._tokens[self._pos:],
                    production=prod_str,
                )

        # Ninguna producción funcionó para este NT
        return False, None

    def _parse_production(self, prod: List[str]) -> tuple[bool, List[ParseNode]]:
        """
        Intenta parsear todos los símbolos de una producción en secuencia.
        Retorna (éxito, lista de nodos hijos).
        """
        children: List[ParseNode] = []

        for symbol in prod:

            if symbol == EPSILON:
                self._add_step(
                    action="epsilon",
                    description="Producción ε: se deriva en cadena vacía, no se consume token.",
                    current_token=self._current_token(),
                    remaining=self._tokens[self._pos:],
                )
                children.append(ParseNode(symbol=EPSILON, is_terminal=True))

            elif symbol in self.grammar.productions:
                # No Terminal → llamada recursiva
                success, child_node = self._parse_nt(symbol)
                if not success:
                    return False, []
                children.append(child_node)

            else:
                # Terminal → debe coincidir con el token actual
                token = self._current_token()
                if token == symbol:
                    self._add_step(
                        action="match",
                        description=f"✓ Token '{token}' coincide con terminal '{symbol}'. Se avanza.",
                        current_token=token,
                        remaining=self._tokens[self._pos:],
                    )
                    children.append(
                        ParseNode(symbol=symbol, is_terminal=True, matched_token=token)
                    )
                    self._pos += 1
                else:
                    self._add_step(
                        action="backtrack",
                        description=f"✗ Se esperaba terminal '{symbol}' pero se encontró '{token}'.",
                        current_token=token,
                        remaining=self._tokens[self._pos:],
                    )
                    return False, []

        return True, children

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _current_token(self) -> str:
        if self._pos < len(self._tokens):
            return self._tokens[self._pos]
        return "$"

    def _add_step(
        self,
        action: str,
        description: str,
        current_token: str,
        remaining: List[str],
        production: Optional[str] = None,
    ):
        self._step_counter += 1
        self._steps.append(ParseStep(
            step_number=self._step_counter,
            action=action,
            description=description,
            current_token=current_token,
            remaining_input=remaining,
            production_tried=production,
        ))

    def _build_error_message(self) -> str:
        """Mensaje de error en lenguaje natural, listo para mostrar o enviar a la IA."""
        token = self._current_token()
        pos = self._pos + 1
        context = self._tokens[max(0, self._pos - 2): self._pos]

        msg = f"Error de sintaxis en la posición {pos}.\n"
        msg += f"Token problemático: '{token}'.\n"
        if context:
            msg += f"Tokens anteriores: {' '.join(context)}.\n"
        msg += (
            f"\nEl parser intentó todas las producciones posibles del símbolo "
            f"inicial '{self.grammar.start_symbol}' y ninguna pudo reconocer "
            f"la cadena completa. Verifica que la cadena pertenezca al lenguaje "
            f"definido por la gramática."
        )
        return msg
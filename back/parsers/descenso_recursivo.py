"""
recursive_descent.py
--------------------
Parser de Descenso Recursivo con funciones generadas dinámicamente.

Para cada No Terminal de la gramática del usuario se genera una función
parse_NT() en runtime. Cada función usa check() para mirar el token
actual y decidir qué producción tomar — exactamente igual al descenso
recursivo clásico escrito a mano, pero construido automáticamente.

Equivalencia con el descenso recursivo manual (C++/Java):

    Manual (hardcodeado):
        Exp* parseF() {
            if (check(Token::LPAREN)) { match(LPAREN); parseE(); match(RPAREN); }
            else if (check(Token::ID)) { match(ID); }
        }

    Este parser (dinámico):
        parse_F = genera_funcion("F", producciones_de_F)
        # internamente hace lo mismo: check() → match() o llamada recursiva

FIRST se usa SOLO como implementación del check() dinámico.
No hay backtracking. No hay tabla LL(1) explícita.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

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
    """Un paso del proceso de parseo."""
    step_number: int
    action: str          # "call" | "check" | "match" | "epsilon" | "success" | "error"
    description: str
    current_token: str
    remaining_input: List[str]
    production_used: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "step_number": self.step_number,
            "action": self.action,
            "description": self.description,
            "current_token": self.current_token,
            "remaining_input": self.remaining_input,
            "production_used": self.production_used,
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
# Excepción interna
# ──────────────────────────────────────────────────────────────────────────── #

class ParseError(Exception):
    def __init__(self, message: str, token: str, position: int):
        super().__init__(message)
        self.token = token
        self.position = position


# ──────────────────────────────────────────────────────────────────────────── #
# Parser principal
# ──────────────────────────────────────────────────────────────────────────── #

class RecursiveDescentParser:
    """
    Descenso Recursivo con funciones generadas dinámicamente.

    Al construirse, genera una función parse_X() por cada No Terminal X
    de la gramática. Cada función es equivalente a la que escribirías
    a mano en C++ o Java.
    """

    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self._check_left_recursion()

        # Diccionario: { "E": <función parse_E>, "T": <función parse_T>, ... }
        self._parse_functions: Dict[str, Callable[[], ParseNode]] = {}
        self._generate_functions()

    # ------------------------------------------------------------------ #
    # Generación de funciones (el núcleo del enfoque)
    # ------------------------------------------------------------------ #

    def _generate_functions(self):
        """
        Genera una función parse_NT() por cada No Terminal.

        Equivale a escribir a mano:
            Exp* parseE() { ... }
            Exp* parseT() { ... }
            Exp* parseF() { ... }
        pero de forma automática para cualquier gramática.
        """
        for nt in self.grammar.productions:
            # Capturamos 'nt' en el closure con argumento por defecto
            def make_parse_fn(non_terminal: str) -> Callable[[], ParseNode]:
                def parse_fn() -> ParseNode:
                    return self._parse_nt(non_terminal)
                parse_fn.__name__ = f"parse_{non_terminal}"
                return parse_fn

            self._parse_functions[nt] = make_parse_fn(nt)

    def _parse_nt(self, nt: str) -> ParseNode:
        """
        Función generada para el No Terminal `nt`.

        Equivale a:
            Stmt* parseNT() {
                if (check(TOKEN_A)) { /* producción 1 */ }
                else if (check(TOKEN_B)) { /* producción 2 */ }
                else throw error;
            }
        """
        self._add_step(
            action="call",
            description=f"Llamando a parse_{nt}() — token actual: '{self._current_token()}'",
            production=None,
        )

        prods = self.grammar.productions[nt]

        for prod in prods:
            # check(): ¿puede el token actual iniciar esta producción?
            if self._check(prod, nt):
                prod_str = f"{nt} -> {' '.join(prod)}"
                self._add_step(
                    action="check",
                    description=f"check() en parse_{nt}(): token '{self._current_token()}' "
                                f"puede iniciar '{prod_str}'. Entrando.",
                    production=prod_str,
                )
                # Ejecutar la producción símbolo por símbolo
                children = self._execute_production(nt, prod)
                return ParseNode(symbol=nt, children=children)

        # Ninguna producción pasó el check() → error
        expected = self._expected_for(nt)
        raise ParseError(
            f"parse_{nt}(): ninguna producción coincide con el token '{self._current_token()}'. "
            f"Se esperaba: {expected}.",
            self._current_token(),
            self._pos,
        )

    def _execute_production(self, nt: str, prod: List[str]) -> List[ParseNode]:
        """
        Ejecuta una producción símbolo por símbolo.

        Para terminales  → llama a match()
        Para no terminales → llama a la función parse_NT() generada
        Para ε           → registra paso y continúa
        """
        children: List[ParseNode] = []

        for symbol in prod:
            if symbol == EPSILON:
                self._add_step(
                    action="epsilon",
                    description=f"parse_{nt}(): producción ε, no se consume token.",
                    production=f"{nt} -> ε",
                )
                children.append(ParseNode(symbol=EPSILON, is_terminal=True))

            elif symbol in self.grammar.productions:
                # No Terminal → llamada recursiva a la función generada
                child = self._parse_functions[symbol]()
                children.append(child)

            else:
                # Terminal → match()
                child = self._match(symbol)
                children.append(child)

        return children

    # ------------------------------------------------------------------ #
    # check() y match() — el corazón del descenso recursivo
    # ------------------------------------------------------------------ #

    def _check(self, prod: List[str], nt: str) -> bool:
        """
        Equivale al check() de tu parser C++.

        Responde: ¿puede el token actual iniciar esta producción?
        Para prod = [ε]: verdadero si el token está en FOLLOW(nt).
        Para prod = [A, ...]: verdadero si el token está en FIRST(A...).
        """
        token = self._current_token()
        first = self.grammar._first_of_sequence(prod)

        if token in first:
            return True
        if EPSILON in first and token in self.grammar.follow(nt):
            return True
        return False

    def _match(self, expected: str) -> ParseNode:
        """
        Equivale al match() de tu parser C++.
        Consume el token actual si coincide, o lanza error.
        """
        token = self._current_token()
        if token != expected:
            raise ParseError(
                f"match(): se esperaba '{expected}' pero se encontró '{token}'.",
                token,
                self._pos,
            )
        self._add_step(
            action="match",
            description=f"match('{expected}'): token '{token}' consumido. ✓",
            production=None,
        )
        self._pos += 1
        return ParseNode(symbol=expected, is_terminal=True, matched_token=token)

    # ------------------------------------------------------------------ #
    # Punto de entrada público
    # ------------------------------------------------------------------ #

    def parse(self, input_string: str) -> ParseResult:
        """
        Parsea una cadena de tokens separados por espacios.
        Ejemplo: "id + id * id"
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

        try:
            # Llamamos a la función generada para el símbolo inicial
            # Equivale a: main() { parseE(); }
            root = self._parse_functions[self.grammar.start_symbol]()

            if self._pos < len(self._tokens):
                leftover = " ".join(self._tokens[self._pos:])
                raise ParseError(
                    f"Se esperaba fin de cadena pero sobran tokens: '{leftover}'.",
                    self._current_token(),
                    self._pos,
                )

            self._add_step(
                action="success",
                description="✓ Cadena aceptada. Fin de entrada alcanzado correctamente.",
                production=None,
            )
            return ParseResult(
                is_valid=True,
                parse_tree=root.to_dict(),
                steps=[s.to_dict() for s in self._steps],
                error_message=None,
                tokens_consumed=self._pos,
                total_tokens=len(self._tokens),
            )

        except ParseError as e:
            error_msg = self._build_error_message(str(e), e.token, e.position)
            self._add_step(
                action="error",
                description=f"✗ {str(e)}",
                production=None,
            )
            return ParseResult(
                is_valid=False,
                parse_tree=None,
                steps=[s.to_dict() for s in self._steps],
                error_message=error_msg,
                tokens_consumed=self._pos,
                total_tokens=len(self._tokens),
            )

    # ------------------------------------------------------------------ #
    # Validaciones
    # ------------------------------------------------------------------ #

    def _check_left_recursion(self):
        """Detecta recursión izquierda directa."""
        for nt, prods in self.grammar.productions.items():
            for prod in prods:
                if prod and prod[0] == nt:
                    raise ValueError(
                        f"Recursión izquierda directa en '{nt}' "
                        f"(producción: {nt} -> {' '.join(prod)}). "
                        f"El descenso recursivo entraría en bucle infinito."
                    )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _current_token(self) -> str:
        if self._pos < len(self._tokens):
            return self._tokens[self._pos]
        return "$"

    def _expected_for(self, nt: str) -> str:
        """Tokens válidos que podría esperar parse_NT()."""
        expected = set()
        for prod in self.grammar.productions.get(nt, []):
            first = self.grammar._first_of_sequence(prod)
            expected |= first - {EPSILON}
            if EPSILON in first:
                expected |= self.grammar.follow(nt)
        return ", ".join(f"'{t}'" for t in sorted(expected)) or "ninguno"

    def _add_step(self, action: str, description: str, production: Optional[str]):
        self._step_counter += 1
        self._steps.append(ParseStep(
            step_number=self._step_counter,
            action=action,
            description=description,
            current_token=self._current_token(),
            remaining_input=list(self._tokens[self._pos:]),
            production_used=production,
        ))

    def _build_error_message(self, raw: str, token: str, position: int) -> str:
        context = self._tokens[max(0, position - 2): position]
        msg = f"Error de sintaxis en la posición {position + 1}.\n"
        msg += f"Token problemático: '{token}'.\n"
        if context:
            msg += f"Contexto anterior: {' '.join(context)}.\n"
        msg += f"\nDetalle: {raw}\n"
        msg += (
            "\nEste mensaje puede enviarse a la IA para una explicación "
            "detallada en lenguaje natural."
        )
        return msg

    # ------------------------------------------------------------------ #
    # Información de las funciones generadas (útil para el frontend)
    # ------------------------------------------------------------------ #

    def get_generated_functions_info(self) -> List[dict]:
        """
        Devuelve información sobre las funciones generadas.
        El frontend puede mostrar esto para explicar el parser al usuario.
        """
        info = []
        for nt, prods in self.grammar.productions.items():
            cases = []
            for prod in prods:
                first = self.grammar._first_of_sequence(prod)
                tokens_that_trigger = first - {EPSILON}
                if EPSILON in first:
                    tokens_that_trigger |= self.grammar.follow(nt)
                cases.append({
                    "production": f"{nt} -> {' '.join(prod)}",
                    "triggered_by_tokens": sorted(tokens_that_trigger),
                })
            info.append({
                "function_name": f"parse_{nt}",
                "non_terminal": nt,
                "cases": cases,
            })
        return info
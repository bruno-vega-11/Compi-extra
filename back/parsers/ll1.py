"""
ll1.py
------
Parser LL(1) predictivo con construcción de tabla.

Provee:
 - `LL1Parser(grammar)` construye la tabla predictiva
 - `parse(input_string)` realiza el parse usando la tabla y devuelve un ParseResult compatible con LR
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional

from grammar.grammar import Grammar, EPSILON
from parsers.descenso_recursivo import ParseNode

# ══════════════════════════════════════════════════════════════════════════════
# Resultado
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ParseStep:
    step_number: int
    action: str       
    description: str
    stack: list
    remaining_input: list
    production_used: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "step_number":    self.step_number,
            "action":         self.action,
            "description":    self.description,
            "stack":          self.stack,
            "remaining_input": self.remaining_input,
            "production_used": self.production_used,
        }

@dataclass
class ParseResult:
    is_valid: bool
    steps: list
    action_table: dict   
    goto_table: dict    
    first: dict          
    follow: dict         
    states: list
    conflicts: list
    error_message: Optional[str]
    tokens_consumed: int
    total_tokens: int
    parse_tree: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "is_valid":        self.is_valid,
            "steps":           self.steps,
            "action_table":    self.action_table,
            "goto_table":      self.goto_table,
            "first":           self.first,
            "follow":          self.follow,
            "states":          self.states,
            "conflicts":       self.conflicts,
            "error_message":   self.error_message,
            "tokens_consumed": self.tokens_consumed,
            "total_tokens":    self.total_tokens,
            "parse_tree":      self.parse_tree,
        }

# ══════════════════════════════════════════════════════════════════════════════
# Parser LL(1)
# ══════════════════════════════════════════════════════════════════════════════

class LL1Parser:
    def __init__(self, grammar: Grammar):
        self.grammar = grammar
        self.table: Dict[Tuple[str, str], List[str]] = {}
        self.conflicts: list = []
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
                        self.conflicts.append(f"Conflicto LL(1) en celda {key}: {self.table[key]} vs {alpha}")
                    self.table[key] = alpha
                # Si ε está en FIRST(alpha), para cada b en FOLLOW(A) poner A->α en (A,b)
                if EPSILON in first_alpha:
                    for b in self.grammar.follow(A):
                        key = (A, b)
                        if key in self.table and self.table[key] != alpha:
                            self.conflicts.append(f"Conflicto LL(1) en celda {key}: {self.table[key]} vs {alpha}")
                        self.table[key] = alpha

    def get_table(self) -> Dict[str, Dict[str, List[str]]]:
        out: Dict[str, Dict[str, List[str]]] = {}
        for (A, a), prod in self.table.items():
            out.setdefault(A, {})[a] = prod
        return out

    def parse(self, input_string: str) -> ParseResult:
        tokens = input_string.strip().split() if input_string.strip() else []
        if not tokens:
            return self._make_result(
                is_valid=False,
                steps=[],
                error_message="La cadena de entrada está vacía.",
                tokens_consumed=0,
                total_tokens=0,
                parse_tree=None
            )

        tokens_eof = tokens + ["$"]
        root_node = ParseNode(symbol=self.grammar.start_symbol)
        stack = [("$", None), (self.grammar.start_symbol, root_node)]
        pos = 0
        steps: list[ParseStep] = []
        step_n = 0

        def add_step(action, description, production=None):
            nonlocal step_n
            step_n += 1
            steps.append(ParseStep(
                step_number=step_n,
                action=action,
                description=description,
                stack=[s[0] for s in stack],
                remaining_input=list(tokens_eof[pos:]),
                production_used=production,
            ))

        try:
            while stack:
                top, current_node = stack[-1]
                current = tokens_eof[pos]

                if top == "$":
                    if current == "$":
                        add_step("accept", "✓ Cadena ACEPTADA.")
                        stack.pop()
                        return self._make_result(
                            is_valid=True,
                            steps=steps,
                            error_message=None,
                            tokens_consumed=pos,
                            total_tokens=len(tokens),
                            parse_tree=root_node.to_dict()
                        )
                    else:
                        add_step("error", f"✗ Token '{current}' inesperado al final de la pila.")
                        return self._make_result(
                            is_valid=False,
                            steps=steps,
                            error_message=f"Se esperaba '$' pero se encontró '{current}'.",
                            tokens_consumed=pos,
                            total_tokens=len(tokens),
                            parse_tree=None
                        )

                elif top in self.grammar.terminals or top == EPSILON:
                    if top == EPSILON:
                        if current_node:
                            current_node.is_terminal = True
                        stack.pop()
                        add_step("match", "Se hizo match de ε (se elimina de la pila).")
                    elif top == current:
                        if current_node:
                            current_node.is_terminal = True
                            current_node.matched_token = current
                        stack.pop()
                        add_step("match", f"Se hizo match de '{current}'.")
                        pos += 1
                    else:
                        add_step("error", f"✗ Token '{current}' no coincide con el tope de la pila '{top}'.")
                        return self._make_result(
                            is_valid=False,
                            steps=steps,
                            error_message=f"Se esperaba '{top}' pero se encontró '{current}'.",
                            tokens_consumed=pos,
                            total_tokens=len(tokens),
                            parse_tree=None
                        )
                
                else:
                    # Non-terminal
                    key = (top, current)
                    prod = self.table.get(key)
                    if prod is None:
                        add_step("error", f"✗ No hay entrada en la tabla para ({top}, '{current}').")
                        return self._make_result(
                            is_valid=False,
                            steps=steps,
                            error_message=f"Error de sintaxis en el token '{current}'.",
                            tokens_consumed=pos,
                            total_tokens=len(tokens),
                            parse_tree=None
                        )

                    stack.pop()
                    if prod != [EPSILON] and prod != []:
                        children_nodes = [ParseNode(symbol=sym) for sym in prod]
                        if current_node:
                            current_node.children = children_nodes
                        for sym, child in zip(reversed(prod), reversed(children_nodes)):
                            stack.append((sym, child))
                    else:
                        if current_node:
                            current_node.children = [ParseNode(symbol=EPSILON, is_terminal=True)]
                    
                    prod_str = f"{top} → {' '.join(prod) if prod else EPSILON}"
                    add_step("predict", f"Reemplazar '{top}' usando {prod_str}.", production=prod_str)

            # Esto teóricamente no se alcanza si la gramática está bien formada, 
            # ya que el $ del stack debería coincidir con el $ de la entrada
            if pos != len(tokens_eof) - 1:
                leftover = " ".join(tokens_eof[pos:])
                return self._make_result(
                    is_valid=False,
                    steps=steps,
                    error_message=f"Sobran tokens al finalizar parse: '{leftover}'",
                    tokens_consumed=pos,
                    total_tokens=len(tokens),
                    parse_tree=None
                )
            
            return self._make_result(
                is_valid=True,
                steps=steps,
                error_message=None,
                tokens_consumed=pos,
                total_tokens=len(tokens),
                parse_tree=root_node.to_dict()
            )

        except Exception as e:
            return self._make_result(
                is_valid=False,
                steps=steps,
                error_message=str(e),
                tokens_consumed=pos,
                total_tokens=len(tokens),
                parse_tree=None
            )

    def _make_result(self, *, is_valid, steps, error_message, tokens_consumed, total_tokens, parse_tree=None) -> ParseResult:
        action_table = self._format_table()
        return ParseResult(
            is_valid=is_valid,
            steps=[s.to_dict() for s in steps],
            action_table=action_table,
            goto_table={"nonterminals": [], "rows": []},
            first={
                nt: sorted(v - {EPSILON}) + (["ε"] if EPSILON in v else [])
                for nt, v in self.grammar._first.items()
            },
            follow={
                nt: sorted(v - {"$"}) + (["$"] if "$" in v else [])
                for nt, v in self.grammar._follow.items()
            },
            states=[],
            conflicts=self.conflicts,
            error_message=error_message,
            tokens_consumed=tokens_consumed,
            total_tokens=total_tokens,
            parse_tree=parse_tree,
        )

    def _format_table(self) -> dict:
        terminals = sorted(self.grammar.terminals | {"$"})
        nonterminals = list(self.grammar.productions.keys())
        rows = []
        for nt in nonterminals:
            row: dict = {"state": nt}
            for t in terminals:
                prod = self.table.get((nt, t))
                if prod is not None:
                    row[t] = f"{nt} → {' '.join(prod) if prod else EPSILON}"
                else:
                    row[t] = ""
            rows.append(row)

        productions_legend = []
        for A, alternatives in self.grammar.productions.items():
            for alpha in alternatives:
                prod_str = f"{A} → {' '.join(alpha) if alpha else EPSILON}"
                if not any(p["production"] == prod_str for p in productions_legend):
                    productions_legend.append({
                        "index": len(productions_legend),
                        "production": prod_str
                    })

        return {
            "terminals": terminals,
            "rows": rows,
            "productions": productions_legend
        }

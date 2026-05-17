"""
server.py
---------
API principal del analizador sintáctico.
Construida con FastAPI.

Cada endpoint recibe la gramática y la cadena del usuario,
instancia el parser correspondiente y devuelve el resultado.

Estructura de rutas:
    POST /parse/recursive-descent   ← Descenso Recursivo  ✅ implementado
    POST /parse/ll1                 ← LL(1)               🔜 pendiente
    POST /parse/lr0                 ← LR(0)               🔜 pendiente
    POST /parse/slr1                ← SLR(1)              🔜 pendiente
    POST /parse/lalr1               ← LALR(1)             🔜 pendiente
    POST /parse/lr1                 ← LR(1)               🔜 pendiente
    POST /grammar/info              ← Info de la gramática (FIRST, FOLLOW, etc.)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from grammar.grammar import Grammar
from parsers.descenso_recursivo import RecursiveDescentParser

from parsers.lr_automata import grammar_to_automata
from parsers.slr1 import SLR1Parser
# ──────────────────────────────────────────────────────────────────────────── #
# App
# ──────────────────────────────────────────────────────────────────────────── #

app = FastAPI(
    title="Analizador Sintáctico API",
    description="API para análisis sintáctico con múltiples métodos de parsing.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # En producción reemplazar con el dominio del frontend
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────── #
# Schemas de entrada (lo que recibe el frontend)
# ──────────────────────────────────────────────────────────────────────────── #

class ParseRequest(BaseModel):
    """
    Cuerpo de cualquier petición de parseo.

    grammar_text: gramática en texto plano.
        Ejemplo:
            E -> T E2
            E2 -> + T E2 | ε
            T -> F T2
            T2 -> * F T2 | ε
            F -> ( E ) | id

    input_string: cadena a analizar, tokens separados por espacios.
        Ejemplo: "id + id * id"
    """
    grammar_text: str
    input_string: str


class GrammarRequest(BaseModel):
    """Cuerpo para consultar info de una gramática sin parsear."""
    grammar_text: str


# ──────────────────────────────────────────────────────────────────────────── #
# Helper: construir Grammar o lanzar 400
# ──────────────────────────────────────────────────────────────────────────── #

def build_grammar(grammar_text: str) -> Grammar:
    try:
        return Grammar.from_text(grammar_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Gramática inválida: {e}")


def _result_to_dict(result):
    """Normaliza el resultado del parser a dict.

    Acepta lo siguiente:
      - objeto con `to_dict()` (ParseResult antiguos)
      - dict ya formateado (nuevos parsers)
    """
    if isinstance(result, dict):
        return result
    if hasattr(result, "to_dict") and callable(result.to_dict):
        try:
            return result.to_dict()
        except Exception:
            pass
    # fallback
    return {"is_valid": False, "steps": [], "action_table": {}, "goto_table": {}, "first": {}, "follow": {}, "states": [], "conflicts": [], "error_message": str(result), "tokens_consumed": 0, "total_tokens": 0}


# ──────────────────────────────────────────────────────────────────────────── #
# Ruta raíz
# ──────────────────────────────────────────────────────────────────────────── #

@app.get("/")
def root():
    return {
        "message": "Analizador Sintáctico API",
        "parsers_available": [
            "recursive-descent",
            "ll1",
            "lr0",
            "slr1",
            "lalr1",
            "lr1",
        ],
    }


# ──────────────────────────────────────────────────────────────────────────── #
# Grammar info
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/grammar/info")
def grammar_info(request: GrammarRequest):
    """
    Devuelve información de la gramática: producciones, terminales,
    no terminales, conjuntos FIRST y FOLLOW.
    """
    grammar = build_grammar(request.grammar_text)
    warnings = grammar.validate()
    return {
        "grammar": grammar.to_dict(),
        "warnings": warnings,
    }



@app.post("/grammar/automata")
def grammar_automata(request: GrammarRequest):
    """
    Devuelve el AFN y AFD del proceso LR(0) para graficar en el frontend.

    """
    grammar = build_grammar(request.grammar_text)
    return grammar_to_automata(grammar)

# ──────────────────────────────────────────────────────────────────────────── #
# Descenso Recursivo  ✅
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/recursive-descent")
def parse_recursive_descent(request: ParseRequest):
    """
    Parseo por Descenso Recursivo con funciones generadas dinámicamente.

    Genera una función parse_NT() por cada No Terminal de la gramática,
    usando check() para decidir qué producción tomar — equivalente al
    descenso recursivo escrito a mano en C++ o Java.

    Requiere que la gramática sea LL(1) y sin recursión izquierda.
    """
    grammar = build_grammar(request.grammar_text)

    try:
        parser = RecursiveDescentParser(grammar)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = parser.parse(request.input_string)

    return {
        "method": "recursive-descent",
        "grammar": grammar.to_dict(),
        "generated_functions": parser.get_generated_functions_info(),
        "result": _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# LL(1)  🔜
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/ll1")
def parse_ll1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        from parsers.ll1 import LL1Parser
        parser = LL1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "method": "ll1",
        "grammar": grammar.to_dict(),
        "parsing_table": parser.get_table(),
        "result": _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# LR(0)  🔜
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/lr0")
def parse_lr0(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        from parsers.lr0 import LR0Parser
        parser = LR0Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "method": "lr0",
        "grammar": grammar.to_dict(),
        "automaton": parser.get_automaton(),
        "parsing_table": parser.get_table(),
        "result": _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# SLR(1)  🔜
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/slr1")
def parse_slr1(request: ParseRequest):

    grammar = build_grammar(request.grammar_text)
 
    try:
        parser = SLR1Parser(grammar)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al construir el parser: {e}")
 
    result = parser.parse(request.input_string)
 
    return {
        "method":  "slr1",
        "grammar": grammar.to_dict(),
        "result":  _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# LALR(1)  🔜
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/lalr1")
def parse_lalr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        from parsers.lalr1 import LALR1Parser
        parser = LALR1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "method": "lalr1",
        "grammar": grammar.to_dict(),
        "automaton": parser.get_automaton(),
        "parsing_table": parser.get_table(),
        "result": _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# LR(1)  🔜
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/lr1")
def parse_lr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        from parsers.lr1 import LR1Parser
        parser = LR1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "method": "lr1",
        "grammar": grammar.to_dict(),
        "automaton": parser.get_automaton(),
        "parsing_table": parser.get_table(),
        "result": _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# Entrypoint
# ──────────────────────────────────────────────────────────────────────────── #

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
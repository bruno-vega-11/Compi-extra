"""
server.py
---------
API principal del analizador sintáctico.
Construida con FastAPI.

Cada endpoint recibe la gramática y la cadena del usuario,
instancia el parser correspondiente y devuelve el resultado.

Estructura de rutas:
    POST /parse/recursive-descent  ← Descenso Recursivo  ✅ implementado
    POST /parse/ll1                ← LL(1)               🔜 pendiente
    POST /parse/lr0                ← LR(0)               ✅ implementado
    POST /parse/slr1               ← SLR(1)              ✅ implementado
    POST /parse/lalr1              ← LALR(1)             ✅ implementado
    POST /parse/lr1                ← LR(1)               ✅ implementado
    POST /grammar/info             ← Info de la gramática (FIRST, FOLLOW, etc.)
    POST /grammar/automata/all     ← Autómatas completos para el frontend
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
from parsers.lr0 import LR0Parser
from parsers.lr1 import LR1Parser
from parsers.lalr1 import LALR1Parser
from parsers.lr1_automata import grammar_to_lr1_automata 
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
    grammar_text: str
    input_string: str


class GrammarRequest(BaseModel):
    grammar_text: str


# ──────────────────────────────────────────────────────────────────────────── #
# Helpers
# ──────────────────────────────────────────────────────────────────────────── #

def build_grammar(grammar_text: str) -> Grammar:
    try:
        return Grammar.from_text(grammar_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Gramática inválida: {e}")


def _result_to_dict(result):
    """Normaliza el resultado del parser a dict."""
    if isinstance(result, dict):
        return result
    if hasattr(result, "to_dict") and callable(result.to_dict):
        try:
            return result.to_dict()
        except Exception:
            pass
    return {"is_valid": False, "steps": [], "action_table": {}, "goto_table": {}, "first": {}, "follow": {}, "states": [], "conflicts": [], "error_message": str(result), "tokens_consumed": 0, "total_tokens": 0}


def _format_automata(parser, is_lalr=False):
    """Formatea la estructura interna de los estados LR(1)/LALR(1) para el frontend."""
    states = []
    for i, state_set in enumerate(parser.states):
        items_formatted = []
        is_accept = False
        # Ordenamos los items para que se mantengan consistentes visualmente
        for it in sorted(state_set, key=repr):
            item_repr = repr(it)
            completed = it.is_complete()
            items_formatted.append({"label": item_repr, "completed": completed})
            
            # Chequeo de estado de aceptación (S' -> S •)
            if it.head == parser.augmented_start and completed:
                is_accept = True
        
        states.append({
            "id": str(i),
            "label": f"I{i}",
            "is_start": i == 0,
            "is_accept": is_accept,
            "items": items_formatted,
        })
        
    transitions = []
    for (src, sym), dst in parser.transitions.items():
        transitions.append({
            "from": str(src),
            "to": str(dst),
            "symbol": sym
        })
        
    return {
        "type": "LALR(1) DFA" if is_lalr else "LR(1) DFA",
        "states": states,
        "transitions": transitions,
        "start_state": "0",
        "accept_states": [s["id"] for s in states if s["is_accept"]]
    }


# ──────────────────────────────────────────────────────────────────────────── #
# Rutas Generales
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

@app.post("/grammar/info")
def grammar_info(request: GrammarRequest):
    grammar = build_grammar(request.grammar_text)
    warnings = grammar.validate()
    return {
        "grammar": grammar.to_dict(),
        "warnings": warnings,
    }


@app.post("/grammar/automata/all")
def grammar_automata_all(request: GrammarRequest):
    grammar = build_grammar(request.grammar_text)
    
    # 1. LR(0) NFA / DFA
    try:
        lr0_automata = grammar_to_automata(grammar)
    except Exception:
        lr0_automata = {"afn": None, "afd": None}

    # 2. LR(1) + LALR(1) + LR(1) NFA
    lr1_afn_data = None
    lr1_data     = None
    lalr1_data   = None
    try:
        lr1_automata = grammar_to_lr1_automata(grammar)
        lr1_afn_data = lr1_automata.get("lr1_afn")
        lr1_data     = lr1_automata.get("lr1")
        lalr1_data   = lr1_automata.get("lalr1")
    except Exception:
        import traceback
        traceback.print_exc()

    return {
        "afn":    lr0_automata.get("afn"),
        "afd":    lr0_automata.get("afd"),
        "lr1_afn": lr1_afn_data,
        "lr1":    lr1_data,
        "lalr1":  lalr1_data,
    }

# ──────────────────────────────────────────────────────────────────────────── #
# Endpoints de Parseo
# ──────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/recursive-descent")
def parse_recursive_descent(request: ParseRequest):
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
        "result": _result_to_dict(result),
    }


@app.post("/parse/lr0")
def parse_lr0(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = LR0Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    return {
        "method": "lr0",
        "grammar": grammar.to_dict(),
        "result": _result_to_dict(result),
    }


@app.post("/parse/slr1")
def parse_slr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = SLR1Parser(grammar)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Error al construir el parser: {e}")
    
    result = parser.parse(request.input_string)
    import traceback
    print("RESULT:", result)  # ← agrega esto
    return {
        "method":  "slr1",
        "grammar": grammar.to_dict(),
        "result":  _result_to_dict(result),
    }

@app.post("/parse/lalr1")
def parse_lalr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = LALR1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    return {
        "method": "lalr1",
        "grammar": grammar.to_dict(),
        "result": _result_to_dict(result),
    }


@app.post("/parse/lr1")
def parse_lr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = LR1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    return {
        "method": "lr1",
        "grammar": grammar.to_dict(),
        "result": _result_to_dict(result),
    }


# ──────────────────────────────────────────────────────────────────────────── #
# Entrypoint
# ──────────────────────────────────────────────────────────────────────────── #

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
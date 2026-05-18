"""
server.py
---------
API principal del analizador sintáctico. Construida con FastAPI.

══════════════════════════════════════════════════════════════════
FLUJO DE IA (automático, sin intervención del usuario)
══════════════════════════════════════════════════════════════════

PASO 1 — Frontend llama a  POST /parse/{method}
         con { grammar_text, input_string }

PASO 2 — Backend intenta parsear.
         Si falla  → llama internamente a Gemini y la respuesta incluye:
             ai_triggered   : true
             ai_explanation : Markdown con los pasos que el usuario debe seguir
                              (modo instructor)
             ai_fixed       : la gramática corregida en texto plano,
                              o null si la gramática es inherentemente
                              no corregible (ej. ambigua)
             errors         : lista de errores del parser

         Si pasa  → ai_triggered: false, los demás campos son null/[]

PASO 3 — Frontend muestra ai_explanation al usuario.
         Si ai_fixed != null, muestra la gramática corregida en un editor
         con un botón "Parsear gramática corregida".

PASO 4 — Usuario acepta (o edita) la gramática corregida.
         Frontend vuelve al PASO 1 con la nueva gramática.
══════════════════════════════════════════════════════════════════
"""

import sys
import os
import traceback
from typing import List, Optional

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from grammar.grammar import Grammar
from parsers.descenso_recursivo import RecursiveDescentParser
from parsers.lr_automata import grammar_to_automata
from parsers.lr1_automata import grammar_to_lr1_automata 
from parsers.slr1 import SLR1Parser
from parsers.lr0 import LR0Parser
from parsers.lr1 import LR1Parser
from parsers.lalr1 import LALR1Parser
from ai_analyzer import analyze_and_fix_grammar

# ─────────────────────────────────────────────────────────────────────────── #
# App
# ─────────────────────────────────────────────────────────────────────────── #

app = FastAPI(
    title="Analizador Sintáctico API",
    description="API para análisis sintáctico con múltiples métodos de parsing y soporte de IA.",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción reemplazar con el dominio del frontend
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────── #
# Schemas de entrada
# ─────────────────────────────────────────────────────────────────────────── #

class ParseRequest(BaseModel):
    grammar_text: str
    input_string: str


class GrammarRequest(BaseModel):
    grammar_text: str


# ─────────────────────────────────────────────────────────────────────────── #
# Helpers
# ─────────────────────────────────────────────────────────────────────────── #

def build_grammar(grammar_text: str) -> Grammar:
    try:
        return Grammar.from_text(grammar_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Gramática inválida: {e}")


def _result_to_dict(result) -> dict:
    """Normaliza el resultado del parser a dict."""
    if isinstance(result, dict):
        return result
    if hasattr(result, "to_dict") and callable(result.to_dict):
        try:
            return result.to_dict()
        except Exception:
            pass
    return {
        "is_valid": False,
        "steps": [],
        "action_table": {},
        "goto_table": {},
        "first": {},
        "follow": {},
        "states": [],
        "conflicts": [],
        "error_message": str(result),
        "tokens_consumed": 0,
        "total_tokens": 0,
    }


def _format_automata(parser, is_lalr=False) -> dict:
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


def _extract_errors(result_dict: dict) -> List[str]:
    """Extrae todos los errores y conflictos del resultado del parser."""
    errors: List[str] = []
    for conflict in result_dict.get("conflicts", []):
        errors.append(str(conflict))
    msg = result_dict.get("error_message")
    if msg:
        errors.append(str(msg))
    return errors


def _build_parse_response(
    method: str,
    grammar: Grammar,
    result_dict: dict,
    extra: Optional[dict] = None,
) -> dict:
    """
    Construye la respuesta estándar para todos los endpoints de parseo.
    Si el parseo falla, activa automáticamente la IA.
    """
    errors = _extract_errors(result_dict)
    failed = not result_dict.get("is_valid", False) or bool(errors)

    ai_explanation: Optional[str] = None
    ai_fixed: Optional[str] = None

    if failed and errors:
        grammar_text_for_ai = (
            grammar.to_text()
            if hasattr(grammar, "to_text")
            else result_dict.get("grammar_text", str(grammar))
        )
        ai_result = analyze_and_fix_grammar(
            grammar_text=grammar_text_for_ai,
            method=method,
            errors=errors,
        )
        ai_explanation = ai_result.get("explanation")
        ai_fixed = ai_result.get("fixed_grammar")

    response = {
        "method": method,
        "grammar": grammar.to_dict(),
        "result": result_dict,
        # ── Bloque IA ─────────────────────────────────────────────────────
        "ai_triggered":    failed,
        "errors":          errors,
        "ai_explanation":  ai_explanation,
        "ai_fixed":        ai_fixed,
        # ──────────────────────────────────────────────────────────────────
    }

    if extra:
        response.update(extra)

    return response


# ─────────────────────────────────────────────────────────────────────────── #
# Rutas generales
# ─────────────────────────────────────────────────────────────────────────── #

@app.get("/")
def root():
    return {
        "message": "Analizador Sintáctico API v2.1",
        "parsers_available": [
            "recursive-descent", "ll1", "lr0", "slr1", "lalr1", "lr1",
        ],
        "ai_behavior": (
            "La IA se activa automáticamente cuando un parser falla. "
            "Revisa ai_triggered, ai_explanation y ai_fixed en la respuesta."
        ),
    }


@app.post("/grammar/info")
def grammar_info(request: GrammarRequest):
    grammar = build_grammar(request.grammar_text)
    warnings = grammar.validate()
    return {"grammar": grammar.to_dict(), "warnings": warnings}


@app.post("/grammar/automata/all")
def grammar_automata_all(request: GrammarRequest):
    """Devuelve todos los autómatas disponibles para la gramática dada."""
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
        traceback.print_exc()

    return {
        "afn":     lr0_automata.get("afn"),
        "afd":     lr0_automata.get("afd"),
        "lr1_afn": lr1_afn_data,
        "lr1":     lr1_data,
        "lalr1":   lalr1_data,
    }


# ─────────────────────────────────────────────────────────────────────────── #
# Endpoints de parseo
# ─────────────────────────────────────────────────────────────────────────── #

@app.post("/parse/recursive-descent")
def parse_recursive_descent(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = RecursiveDescentParser(grammar)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = parser.parse(request.input_string)
    return _build_parse_response(
        method="recursive-descent",
        grammar=grammar,
        result_dict=_result_to_dict(result),
        extra={"generated_functions": parser.get_generated_functions_info()},
    )


@app.post("/parse/ll1")
def parse_ll1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        from parsers.ll1 import LL1Parser
        parser = LL1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _build_parse_response("ll1", grammar, _result_to_dict(result))


@app.post("/parse/lr0")
def parse_lr0(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = LR0Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _build_parse_response("lr0", grammar, _result_to_dict(result))


@app.post("/parse/slr1")
def parse_slr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = SLR1Parser(grammar)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Error al construir el parser: {e}")

    result = parser.parse(request.input_string)
    print("RESULT:", result)  # Para propósitos de debug
    return _build_parse_response("slr1", grammar, _result_to_dict(result))


@app.post("/parse/lalr1")
def parse_lalr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = LALR1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _build_parse_response("lalr1", grammar, _result_to_dict(result))


@app.post("/parse/lr1")
def parse_lr1(request: ParseRequest):
    grammar = build_grammar(request.grammar_text)
    try:
        parser = LR1Parser(grammar)
        result = parser.parse(request.input_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _build_parse_response("lr1", grammar, _result_to_dict(result))


# ─────────────────────────────────────────────────────────────────────────── #
# Entrypoint
# ─────────────────────────────────────────────────────────────────────────── #

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
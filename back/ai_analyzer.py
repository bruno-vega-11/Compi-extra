"""
ai_analyzer.py
--------------
Integración con Gemini para análisis y corrección automática de gramáticas.

Función pública:
    analyze_and_fix_grammar(grammar_text, method, errors) -> dict

El dict devuelto siempre tiene estas dos claves:
    "explanation"   : str        — Markdown modo instructor, explica el problema
                                   y los pasos para corregirlo.
    "fixed_grammar" : str | None — Gramática corregida en texto plano lista para
                                   parsear, o None si la gramática NO es
                                   corregible automáticamente (ej. ambigüedad
                                   inherente, problema semántico, etc.).
"""

import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)
else:
    print("Warning: GEMINI_API_KEY no encontrada en las variables de entorno.")

# ──────────────────────────────────────────────────────────────────────────── #
# Prompt principal
# ──────────────────────────────────────────────────────────────────────────── #

_SYSTEM_PROMPT = """
Eres un experto en teoría de compiladores y análisis sintáctico.
Tu rol es el de INSTRUCTOR: cuando una gramática falla con un método de parsing,
debes explicar al estudiante qué está mal y cómo corregirlo paso a paso.

Se te entregará:
  - La gramática original (en texto plano, formato: No-terminal -> producción | producción)
  - El método de parsing que falló (ej. SLR(1), LL(1), LR(1), etc.)
  - Los errores detectados por el parser

Debes responder ÚNICAMENTE con un objeto JSON con exactamente estas dos claves:

{
  "explanation": "<Markdown con la explicación y los pasos>",
  "fixed_grammar": "<gramática corregida en texto plano>" | null
}

Reglas para "explanation":
  - Usa Markdown.
  - Primero explica en 1-2 líneas qué tipo de problema tiene la gramática.
  - Luego da los pasos numerados que el estudiante debe seguir para corregirla,
    como si fuera una clase. Ejemplo:
      ## Problema: Recursividad por la izquierda
      La gramática tiene producciones de la forma A → Aα, lo cual impide
      que los parsers LL(k) y de descenso recursivo funcionen.

      ### Pasos para corregirlo:
      1. Identifica las producciones con recursividad izquierda: ...
      2. Aplica la transformación A → αA' y A' → βA' | ε
      3. ...
  - Si la gramática es AMBIGUA o tiene un problema que NO se puede corregir
    automáticamente manteniendo el lenguaje igual, explícalo claramente y
    deja fixed_grammar en null.

Reglas para "fixed_grammar":
  - Si el problema ES corregible automáticamente (recursividad izquierda,
    factor común izquierdo, etc.), escribe aquí ÚNICAMENTE las producciones
    corregidas en texto plano.
    Formato: una producción por línea, usando | para alternativas.
    Ejemplo:
      E -> T E'
      E' -> + T E' | &
      T -> F T'
      T' -> * F T' | &
      F -> ( E ) | id
    (Usa & para representar ε / lambda / vacío)
  - Si NO es corregible automáticamente, este campo debe ser null (sin comillas).

NO incluyas nada fuera del JSON. No pongas ```json ni explicaciones adicionales.
"""

# ──────────────────────────────────────────────────────────────────────────── #
# Función pública
# ──────────────────────────────────────────────────────────────────────────── #

def analyze_and_fix_grammar(
    grammar_text: str,
    method: str,
    errors: list,
) -> dict:
    """
    Llama a Gemini para analizar los errores de la gramática y, si es posible,
    generar una versión corregida.

    Parámetros:
        grammar_text : str       — Gramática original en texto plano
        method       : str       — Método de parsing que falló
        errors       : list[str] — Errores reportados por el parser

    Retorna:
        {
          "explanation"   : str,        — Markdown con explicación + pasos
          "fixed_grammar" : str | None  — Gramática corregida o None
        }
    """
    if not API_KEY:
        return {
            "explanation": (
                "**Error de configuración:**\n"
                "La clave `GEMINI_API_KEY` no está configurada en el backend. "
                "Revisa el archivo `.env`."
            ),
            "fixed_grammar": None,
        }

    errors_text = "\n".join(f"- {e}" for e in errors)

    user_prompt = f"""
    Gramática:
    ```
    {grammar_text}
    ```

    Método de parsing: {method}

    Errores detectados:
    {errors_text}

    Analiza la gramática, explica el problema como instructor y devuelve el JSON
    solicitado. Recuerda: fixed_grammar debe ser null si no es corregible automáticamente.
    """

    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=_SYSTEM_PROMPT,
        )
        response = model.generate_content(user_prompt)
        raw = response.text.strip()

        # Limpiar posibles marcadores de código que Gemini a veces agrega
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]          # quita el primer ```json
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.rsplit("```", 1)[0].strip()  # quita el último ```

        parsed = json.loads(raw)

        return {
            "explanation":   parsed.get("explanation", "Sin explicación disponible."),
            "fixed_grammar": parsed.get("fixed_grammar"),  # None si no es corregible
        }

    except json.JSONDecodeError:
        # Gemini devolvió algo que no es JSON válido; devolvemos el texto como explicación
        return {
            "explanation": response.text if "response" in dir() else "Error al procesar la respuesta de la IA.",
            "fixed_grammar": None,
        }
    except Exception as e:
        return {
            "explanation": f"**Error al consultar la IA:**\n{str(e)}",
            "fixed_grammar": None,
        }
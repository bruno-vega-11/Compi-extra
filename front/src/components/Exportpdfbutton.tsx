import { useState } from "react";
import type { LRParseResult } from "../types";
import type { ParserMethod } from "../types";

interface ExportPdfButtonProps {
  result: LRParseResult;
  method: ParserMethod;
}

// Reemplaza caracteres que Helvetica/jsPDF no renderiza bien
function safe(s: string): string {
  return String(s ?? "")
    .replace(/→/g, "->")
    .replace(/ε/g,  "e")
    .replace(/λ/g,  "l")
    .replace(/[^\x20-\x7E]/g, "?");  // cualquier otro no-ASCII -> ?
}

export function ExportPdfButton({ result, method }: ExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const { action_table, goto_table, states } = result;
      const terms    = action_table.terminals;
      const nonterms = goto_table.nonterminals;
      const isLL1    = method === "ll1";
      const allCols  = isLL1 ? terms : [...terms, ...nonterms];
      const rows     = action_table.rows;

      const PW = 841.89;
      const PH = 595.28;
      const M  = 28;

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

      // ── Paleta ────────────────────────────────────────────────────────────
      const BLACK  : [number,number,number] = [15,  15,  15 ];
      const DGRAY  : [number,number,number] = [55,  55,  55 ];
      const MGRAY  : [number,number,number] = [120, 120, 120];
      const LGRAY  : [number,number,number] = [210, 210, 210];
      const XLGRAY : [number,number,number] = [245, 245, 245];
      const WHITE  : [number,number,number] = [255, 255, 255];
      const HEADBG : [number,number,number] = [35,  35,  45 ];
      const ALTBG  : [number,number,number] = [248, 248, 252];

      const COL_ACC   : [number,number,number] = [22,  130,  60 ];
      const COL_SHIFT : [number,number,number] = [20,  100, 180 ];
      const COL_RED   : [number,number,number] = [150,  80,   0 ];
      const COL_CONF  : [number,number,number] = [180,  30,  30 ];
      const COL_GOTO  : [number,number,number] = [100,  50, 180 ];

      function cellColor(val: string): [number,number,number] {
        if (!val)                 return MGRAY;
        if (val === "acc")        return COL_ACC;
        if (val.startsWith("s")) return COL_SHIFT;
        if (val.startsWith("r")) return COL_RED;
        if (val.includes("/"))   return COL_CONF;
        return DGRAY;
      }

      // ── Helpers ───────────────────────────────────────────────────────────
      function drawCell(
        str: string,
        x: number, y: number, w: number, h: number,
        color: [number,number,number],
        bold = false,
        size = 7.5,
        bg?: [number,number,number],
      ) {
        // fondo
        pdf.setFillColor(...(bg ?? WHITE));
        pdf.rect(x, y, w, h, "F");
        // borde
        pdf.setDrawColor(...LGRAY);
        pdf.setLineWidth(0.3);
        pdf.rect(x, y, w, h, "S");
        // texto: truncar si no cabe
        if (!str) return;
        pdf.setFont("Helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        let s = safe(str);
        while (s.length > 1 && pdf.getTextWidth(s) > w - 5) s = s.slice(0, -1);
        pdf.text(s, x + w / 2, y + h / 2 + size * 0.35, { align: "center" });
      }

      let Y = M;

      // ── Título ────────────────────────────────────────────────────────────
      pdf.setFont("Helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(...BLACK);
      pdf.text(`Tabla de analisis ${method.toUpperCase()}`, M, Y + 12);
      Y += 24;

      // ── Producciones ──────────────────────────────────────────────────────
      pdf.setFont("Helvetica", "bold");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...MGRAY);
      pdf.text("PRODUCCIONES", M, Y);
      Y += 10;

      // Cada producción en su propia línea con índice destacado
      for (const p of action_table.productions) {
        const idx  = `r${p.index}`;
        const prod = safe(p.production);

        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(...COL_RED);
        const iw = pdf.getTextWidth(idx);
        pdf.text(idx, M, Y);

        pdf.setFont("Helvetica", "normal");
        pdf.setTextColor(...DGRAY);
        pdf.text(` : ${prod}`, M + iw, Y);
        Y += 11;
      }
      Y += 6;

      // ── Dimensiones de tabla ──────────────────────────────────────────────
      const ROW_H  = 16;
      const HEAD_H = 15;
      const COL_ST = 38;

      const availW = PW - M * 2 - COL_ST;
      const COL_W  = Math.max(26, Math.floor(availW / allCols.length));
      const TW     = COL_ST + COL_W * allCols.length;
      const TX     = (PW - TW) / 2;

      // ── Header row 1: ACTION / GOTO ───────────────────────────────────────
      // Fondo header
      pdf.setFillColor(...HEADBG);
      pdf.rect(TX, Y, TW, HEAD_H, "F");

      // "Estado"
      drawCell("Estado", TX, Y, COL_ST, HEAD_H, WHITE, true, 7, HEADBG);

      // "ACTION"
      const actionW = COL_W * terms.length;
      drawCell("ACTION", TX + COL_ST, Y, actionW, HEAD_H, WHITE, true, 8, HEADBG);

      // "GOTO"
      if (!isLL1 && nonterms.length > 0) {
        const gotoW = COL_W * nonterms.length;
        const gotoX = TX + COL_ST + actionW;
        drawCell("GOTO", gotoX, Y, gotoW, HEAD_H, LGRAY, true, 8, HEADBG);
        // separador ACTION | GOTO
        pdf.setDrawColor(...MGRAY);
        pdf.setLineWidth(0.8);
        pdf.line(gotoX, Y, gotoX, Y + HEAD_H);
      }
      Y += HEAD_H;

      // ── Header row 2: nombres de columnas ─────────────────────────────────
      drawCell("", TX, Y, COL_ST, HEAD_H, WHITE, false, 7, HEADBG);
      let CX = TX + COL_ST;
      for (const col of allCols) {
        const isNT = !isLL1 && nonterms.includes(col);
        drawCell(safe(col), CX, Y, COL_W, HEAD_H, isNT ? LGRAY : WHITE, true, 7, HEADBG);
        CX += COL_W;
      }
      Y += HEAD_H;

      // ── Filas de datos ────────────────────────────────────────────────────
      for (let i = 0; i < rows.length; i++) {
        if (Y + ROW_H > PH - M) {
          pdf.addPage();
          pdf.setFillColor(...WHITE); pdf.rect(0, 0, PW, PH, "F");
          Y = M;
        }
        const row   = rows[i];
        const rowBg = i % 2 === 0 ? WHITE : ALTBG;

        // Celda estado
        drawCell(String(row.state), TX, Y, COL_ST, ROW_H, DGRAY, true, 8, XLGRAY);

        CX = TX + COL_ST;

        // ACTION
        for (const t of terms) {
          const val = row[t] ?? "";
          drawCell(safe(val), CX, Y, COL_W, ROW_H, cellColor(val), !!val, 7.5, rowBg);
          CX += COL_W;
        }

        // GOTO
        if (!isLL1) {
          for (const n of nonterms) {
            const raw = goto_table.rows[i]?.[n];
            const val = raw != null ? String(raw) : "";
            drawCell(safe(val), CX, Y, COL_W, ROW_H, val ? COL_GOTO : MGRAY, !!val, 7.5, rowBg);
            CX += COL_W;
          }
        }

        Y += ROW_H;
      }

      // ── Items por estado (solo no-LL1) ────────────────────────────────────
      if (!isLL1 && states?.length) {
        Y += 16;
        if (Y + 30 > PH - M) { pdf.addPage(); pdf.setFillColor(...WHITE); pdf.rect(0,0,PW,PH,"F"); Y = M; }

        pdf.setFont("Helvetica", "bold"); pdf.setFontSize(6.5);
        pdf.setTextColor(...MGRAY);
        pdf.text("ITEMS POR ESTADO", M, Y);
        Y += 12;

        const ICOL_W = (PW - M * 2 - 8) / 2;
        const GAP    = 6;
        let col      = 0;
        let rowY     = Y;       // Y donde empieza la fila actual de dos columnas
        let rowMaxH  = 0;       // altura máxima del par actual

        const drawStateBox = (s: typeof states[0], bx: number, by: number) => {
          const hasT  = Object.keys(s.transitions).length > 0;
          const lines = s.items.length + (hasT ? 1 : 0);
          const boxH  = 14 + lines * 10 + 8;

          pdf.setFillColor(...XLGRAY); pdf.rect(bx, by, ICOL_W, boxH, "F");
          pdf.setFillColor(...HEADBG); pdf.rect(bx, by, ICOL_W, 13,   "F");
          pdf.setDrawColor(...LGRAY);  pdf.setLineWidth(0.3);
          pdf.rect(bx, by, ICOL_W, boxH, "S");

          pdf.setFont("Helvetica", "bold"); pdf.setFontSize(7.5);
          pdf.setTextColor(...WHITE);
          pdf.text(`I${s.id}`, bx + 6, by + 9);

          let IY = by + 22;
          pdf.setFont("Helvetica", "normal"); pdf.setFontSize(7);
          pdf.setTextColor(...DGRAY);
          for (const item of s.items) {
            pdf.text(safe(item), bx + 6, IY);
            IY += 10;
          }
          if (hasT) {
            pdf.setTextColor(...MGRAY);
            const tStr = Object.entries(s.transitions)
              .map(([sym, dst]) => `${safe(sym)} -> I${dst}`)
              .join("   ");
            pdf.text(tStr, bx + 6, IY);
          }
          return boxH;
        };

        for (const s of states) {
          const hasT  = Object.keys(s.transitions).length > 0;
          const lines = s.items.length + (hasT ? 1 : 0);
          const boxH  = 14 + lines * 10 + 8;

          // Si este box no cabe en la página actual, nueva página
          if (rowY + boxH > PH - M) {
            pdf.addPage();
            pdf.setFillColor(...WHITE); pdf.rect(0, 0, PW, PH, "F");
            rowY    = M;
            rowMaxH = 0;
            col     = 0;
          }

          const BX = M + col * (ICOL_W + 8);
          const bh = drawStateBox(s, BX, rowY);
          rowMaxH  = Math.max(rowMaxH, bh);

          if (col === 0) {
            // columna izquierda: esperar la derecha antes de avanzar Y
            col = 1;
          } else {
            // columna derecha: ya tenemos el par completo, avanzar Y
            rowY   += rowMaxH + GAP;
            rowMaxH = 0;
            col     = 0;
          }
        }
        // Si quedó un box solo en col izquierda, avanzar Y igualmente
        if (col === 1) rowY += rowMaxH + GAP;
      }

      pdf.save(`tabla-${method}.pdf`);
    } catch (err) {
      console.error("Error exportando PDF:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      title="Exportar tabla como PDF"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-mono transition-all
        bg-zinc-800 border-zinc-700 text-zinc-400
        hover:text-zinc-100 hover:border-zinc-500 hover:bg-zinc-700
        disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {exporting
        ? <><span className="animate-spin inline-block">⟳</span> Exportando…</>
        : <>↓ PDF</>}
    </button>
  );
}
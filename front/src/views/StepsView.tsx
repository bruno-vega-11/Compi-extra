import type { RDApiResponse, LRApiResponse, ParserMethod } from "../types";
import { RD_STEP_COLORS, RD_STEP_ICONS, LR_STEP_COLORS, LR_STEP_ICONS } from "../constans";

export function RDStepsView({ response }: { response: RDApiResponse }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-800 text-zinc-400">
        <tr>
          <th className="px-3 py-2 text-left w-10">#</th>
          <th className="px-3 py-2 text-left w-20">Acción</th>
          <th className="px-3 py-2 text-left">Descripción</th>
          <th className="px-3 py-2 text-left w-24">Token actual</th>
          <th className="px-3 py-2 text-left w-36">Entrada restante</th>
        </tr>
      </thead>
      <tbody>
        {response.result.steps.map((step) => (
          <tr key={step.step_number} className="border-t border-zinc-800 hover:bg-zinc-800/50">
            <td className="px-3 py-2 text-zinc-600">{step.step_number}</td>
            <td className={`px-3 py-2 font-bold ${RD_STEP_COLORS[step.action] ?? "text-zinc-400"}`}>
              {RD_STEP_ICONS[step.action]} {step.action}
            </td>
            <td className="px-3 py-2 text-zinc-300">{step.description}</td>
            <td className="px-3 py-2 text-yellow-400">{step.current_token}</td>
            <td className="px-3 py-2 text-zinc-500">{step.remaining_input.join(" ") || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LRStepsView({
  response,
  method,
}: {
  response: LRApiResponse;
  method: ParserMethod;
}) {
  if (response.result.steps.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-zinc-600 text-xs">
        No hay pasos disponibles / Implementación sin trazabilidad del stack
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-zinc-800 text-zinc-400">
        <tr>
          <th className="px-3 py-2 text-left w-10">#</th>
          <th className="px-3 py-2 text-left w-20">Acción</th>
          <th className="px-3 py-2 text-left w-32">Pila</th>
          <th className="px-3 py-2 text-left">Descripción</th>
          <th className="px-3 py-2 text-left w-36">Entrada restante</th>
          <th className="px-3 py-2 text-left w-32">Producción</th>
        </tr>
      </thead>
      <tbody>
        {response.result.steps.map((step) => (
          <tr key={step.step_number} className="border-t border-zinc-800 hover:bg-zinc-800/50">
            <td className="px-3 py-2 text-zinc-600">{step.step_number}</td>
            <td className={`px-3 py-2 font-bold ${LR_STEP_COLORS[step.action] ?? "text-zinc-400"}`}>
              {LR_STEP_ICONS[step.action]} {step.action}
            </td>
            <td className={`px-3 py-2 font-mono ${method === "ll1" ? "text-purple-400" : "text-cyan-400"}`}>
              [{step.stack.join(" ")}]
            </td>
            <td className="px-3 py-2 text-zinc-300">{step.description}</td>
            <td className="px-3 py-2 text-zinc-500">{step.remaining_input.join(" ") || "—"}</td>
            <td className="px-3 py-2 text-yellow-400 text-xs">{step.production_used ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
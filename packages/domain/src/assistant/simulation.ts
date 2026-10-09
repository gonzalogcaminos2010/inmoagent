import type { AssistantDraft } from "../types.js";
export function requestsHuman(text: string) {
  return /\b(humano|persona|asesor|operador)\b/i.test(text);
}
export function simulate(d: AssistantDraft, text: string) {
  if (requestsHuman(text))
    return "Simulación: solicité atención humana. No habrá más respuestas automáticas hasta reanudación explícita.";
  return `Simulación · ${d.businessName}: ${d.approvedKnowledge} Horario de atención: ${d.hours}. Podemos dejar tu consulta al responsable humano; no confirmamos propiedades, precios ni disponibilidad.`;
}

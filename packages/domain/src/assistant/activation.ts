import type { AssistantDraft, Readiness } from "../types.js";
import { fail } from "../errors.js";
export function validateDraft(d: AssistantDraft) {
  if (!d.businessName.trim()) fail(400, "Falta nombre del negocio");
  if (!d.approvedKnowledge.trim()) fail(400, "Falta conocimiento aprobado");
  if (!d.ownerMembershipId.trim()) fail(400, "Falta responsable humano");
  if (!d.handoffRules.trim()) fail(400, "Faltan reglas de pase humano");
}
export function readiness(
  d: AssistantDraft | null,
  created: boolean,
): Readiness {
  const blockers = [
    "Proveedor de IA no configurado",
    "Canal real no verificado",
    "Falta presupuesto autorizado",
  ];
  if (!d?.ownerMembershipId) blockers.push("Falta responsable humano");
  if (!d?.approvedKnowledge) blockers.push("Falta conocimiento aprobado");
  return { created, channelConnected: false, responding: false, blockers };
}

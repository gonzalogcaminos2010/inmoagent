import { test, expect } from "vitest";
import {
  validateDraft,
  readiness,
} from "../../packages/domain/src/assistant/activation.js";
const draft = {
  businessName: "Río",
  approvedKnowledge: "Ejemplo ficticio",
  tone: "Cercano",
  hours: "9 a 18",
  handoffRules: "Pedir humano",
  ownerMembershipId: "member-a-admin",
  mode: "simulated" as const,
};
test("wizard validates approved knowledge and human owner; created differs from real readiness", () => {
  expect(() => validateDraft({ ...draft, approvedKnowledge: "" })).toThrow(
    "conocimiento",
  );
  expect(() => validateDraft({ ...draft, ownerMembershipId: "" })).toThrow(
    "responsable",
  );
  const r = readiness(draft, true);
  expect(r).toMatchObject({
    created: true,
    channelConnected: false,
    responding: false,
  });
  expect(r.blockers.join(" ")).toContain("Proveedor");
  expect(r.blockers.join(" ")).toContain("presupuesto");
});

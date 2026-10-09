import React from "react";
import type { WizardDraft } from "../../../../../packages/contracts/src/dto.js";
export function RulesStep({
  draft,
  change,
  members,
}: {
  draft: WizardDraft;
  change: (key: string, value: string) => void;
  members: { id: string; role: string }[];
}) {
  return (
    <>
      <h2>Un tono claro y un humano a cargo</h2>
      <label>
        Tono
        <input
          value={draft.tone}
          onChange={(e) => change("tone", e.target.value)}
        />
      </label>
      <label>
        Horarios
        <input
          value={draft.hours}
          onChange={(e) => change("hours", e.target.value)}
        />
      </label>
      <label>
        Responsable humano
        <select
          value={draft.ownerMembershipId}
          onChange={(e) => change("ownerMembershipId", e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.role === "admin" ? "Administrador" : "Operador"} · {m.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reglas de pase
        <textarea
          value={draft.handoffRules}
          onChange={(e) => change("handoffRules", e.target.value)}
        />
      </label>
    </>
  );
}

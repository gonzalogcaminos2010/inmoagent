import React from "react";
import type { WizardDraft } from "../../../../../packages/contracts/src/dto.js";
export function BusinessStep({
  draft,
  change,
}: {
  draft: WizardDraft;
  change: (key: string, value: string) => void;
}) {
  return (
    <>
      <h2>El conocimiento empieza en tu negocio</h2>
      <p>
        Usá sólo contenido ficticio aprobado. La demo no tiene un catálogo de
        propiedades.
      </p>
      <label>
        Nombre del negocio
        <input
          value={draft.businessName}
          onChange={(e) => change("businessName", e.target.value)}
        />
      </label>
      <label>
        Conocimiento aprobado
        <textarea
          rows={5}
          value={draft.approvedKnowledge}
          placeholder="Ejemplo ficticio: qué puede responder y cuándo debe derivar."
          onChange={(e) => change("approvedKnowledge", e.target.value)}
        />
      </label>
    </>
  );
}

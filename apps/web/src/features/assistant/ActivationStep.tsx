import React from "react";
import type { WizardDraft } from "../../../../../packages/contracts/src/dto.js";
export function ActivationStep({
  draft,
  confirmed,
  setConfirmed,
  busy,
  testId,
  published,
  publish,
  id,
  real,
}: {
  draft: WizardDraft;
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  busy: boolean;
  testId: string;
  published: boolean;
  publish: () => Promise<void>;
  id: string;
  real: () => Promise<void>;
}) {
  return (
    <>
      <h2>Revisá y publicá la simulación</h2>
      <dl>
        <dt>Negocio</dt>
        <dd>{draft.businessName}</dd>
        <dt>Conocimiento</dt>
        <dd>{draft.approvedKnowledge}</dd>
        <dt>Responsable</dt>
        <dd>{draft.ownerMembershipId}</dd>
      </dl>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Confirmo que el conocimiento ficticio está aprobado
      </label>
      <button
        disabled={!confirmed || !testId || busy || published}
        onClick={publish}
      >
        Publicar simulación
      </button>
      {published && <p role="status">Simulación publicada</p>}
      <div className="readiness">
        <p>Agente creado: {id ? "sí" : "no"}</p>
        <p>Canal real conectado: no</p>
        <p>Agente respondiendo en modo real: no</p>
      </div>
      <button className="secondary" onClick={real}>
        Intentar activar IA real
      </button>
    </>
  );
}

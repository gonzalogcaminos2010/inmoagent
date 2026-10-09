import { BusinessStep } from "./BusinessStep.js";
import { RulesStep } from "./RulesStep.js";
import { TestStep } from "./TestStep.js";
import { ConnectionStep } from "./ConnectionStep.js";
import { ActivationStep } from "./ActivationStep.js";
import React, { useEffect, useState } from "react";
import { api, showError, type Context } from "../../api.js";
const steps = ["Negocio", "Reglas", "Prueba", "Canal", "Revisión"];
export function Wizard({ ctx }: { ctx: Context }) {
  const [step, setStep] = useState(0),
    [id, setId] = useState(""),
    [draft, setDraft] = useState({
      businessName:
        ctx.tenantId === "tenant-a" ? "Río Propiedades" : "Sur Inmuebles",
      approvedKnowledge: "",
      tone: "Cercano y claro",
      hours: "Lunes a viernes, de 9 a 18",
      handoffRules:
        "Derivar si pide un humano, falta información o hay un fallo.",
      ownerMembershipId: ctx.membershipId,
      mode: "simulated",
    }),
    [members, setMembers] = useState<any[]>([]),
    [testId, setTestId] = useState(""),
    [reply, setReply] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [published, setPublished] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    Promise.all([
      api.request<any[]>("/memberships"),
      api.request<any[]>("/assistant/drafts"),
    ])
      .then(([members, rows]) => {
        setMembers(members);
        const d = rows.filter((d) => d.businessName).at(-1);
        if (d) {
          setId(d.id);
          setDraft({
            businessName: d.businessName,
            approvedKnowledge: d.approvedKnowledge,
            tone: d.tone,
            hours: d.hours,
            handoffRules: d.handoffRules,
            ownerMembershipId: d.ownerMembershipId,
            mode: d.mode,
          });
        }
      })
      .catch((e) => showError(e, setError))
      .finally(() => setReady(true));
  }, []);
  function change(key: string, value: string) {
    setKey(crypto.randomUUID());
    setDraft((d) => ({ ...d, [key]: value }));
    setTestId("");
    setPublished(false);
    setConfirmed(false);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api.request<{ id: string }>(
        id ? "/assistant/drafts/" + id : "/assistant/drafts",
        id ? "PUT" : "POST",
        draft,
      );
      setId(result.id);
      setKey(crypto.randomUUID());
      setTestId("");
      setStep((s) => s + 1);
    } catch (e) {
      showError(e, setError);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError("");
    try {
      const r = await api.request("/assistant/drafts/" + id + "/test", "POST", {
        prompt: "Hola, quiero hacer una consulta",
      });
      setTestId(r.testId);
      setReply(r.reply);
    } catch (e) {
      showError(e, setError);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      await api.request("/assistant/drafts/" + id + "/publish", "POST", {
        testId,
        idempotencyKey: key,
      });
      setPublished(true);
    } catch (e) {
      showError(e, setError);
    } finally {
      setBusy(false);
    }
  }
  async function real() {
    const r = await api.request("/assistant/" + id + "/readiness");
    setError("Activación real bloqueada: " + r.blockers.join("; "));
  }
  if (!ready) return <p>Cargando borrador guardado…</p>;
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">Configuración guiada · sólo administrador</p>
          <h1>Crear asistente</h1>
        </div>
        <span className="pill">Simulación</span>
      </div>
      <div className="steps" aria-label="Pasos del asistente">
        {steps.map((name, i) => (
          <div
            key={name}
            className={i === step ? "current" : i < step ? "done" : ""}
          >
            <b>{i + 1}</b>
            <span>{name}</span>
          </div>
        ))}
      </div>
      <section className="panel wizard">
        <p className="eyebrow">Paso {step + 1} de 5</p>
        {step === 0 && <BusinessStep draft={draft} change={change} />}
        {step === 1 && (
          <RulesStep draft={draft} change={change} members={members} />
        )}
        {step === 2 && (
          <TestStep busy={busy} test={test} testId={testId} reply={reply} />
        )}
        {step === 3 && <ConnectionStep />}
        {step === 4 && (
          <ActivationStep
            draft={draft}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
            busy={busy}
            testId={testId}
            published={published}
            publish={publish}
            id={id}
            real={real}
          />
        )}
        {error && <p role="alert">{error}</p>}
        <div className="wizard-footer">
          {step > 0 && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setStep((s) => s - 1)}
            >
              Volver
            </button>
          )}
          {step < 2 && (
            <button disabled={busy || ctx.role !== "admin"} onClick={save}>
              Guardar y continuar
            </button>
          )}
          {step === 2 && (
            <button disabled={!testId} onClick={() => setStep(3)}>
              Continuar
            </button>
          )}
          {step === 3 && <button onClick={() => setStep(4)}>Continuar</button>}
        </div>
      </section>
    </>
  );
}

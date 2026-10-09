import { formatFollowUp, parseFollowUp } from "./next-action-time.js";
import React, { useEffect, useState } from "react";
import { api, showError } from "../../api.js";
export function Detail({ id }: { id: string }) {
  const [q, setQ] = useState<any>(null),
    [members, setMembers] = useState<any[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const refresh = () =>
    api
      .request("/inquiries/" + id)
      .then(setQ)
      .catch((e) => showError(e, setError));
  useEffect(() => {
    refresh();
    api
      .request<any[]>("/memberships")
      .then(setMembers)
      .catch((e) => showError(e, setError));
  }, [id]);
  const change = (key: string, value: string) => setQ({ ...q, [key]: value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.request("/inquiries/" + id, "PATCH", {
        ownerMembershipId: q.ownerMembershipId,
        nextAction: q.nextAction,
        nextActionAt: q.nextActionAt,
        status: q.status,
        result: q.result || "",
      });
      setStatus("Seguimiento guardado");
    } catch (e) {
      showError(e, setError);
    }
  }
  async function action(kind: string) {
    try {
      await api.request(
        "/conversations/" + q.conversations[0].id + "/" + kind,
        "POST",
        kind === "pause" ? { reason: "Intervención del operador" } : {},
      );
      await refresh();
    } catch (e) {
      showError(e, setError);
    }
  }
  if (!q) return <p>{error || "Cargando consulta…"}</p>;
  return (
    <>
      <button className="link" onClick={() => (location.hash = "inquiries")}>
        ← Volver a consultas
      </button>
      <div className="title-row">
        <div>
          <p className="eyebrow">Seguimiento humano</p>
          <h1>{q.interest || "Detalle de consulta"}</h1>
        </div>
        <span className="pill">Simulación</span>
      </div>
      <div className="detail-grid">
        <form className="panel" onSubmit={save}>
          <h2>Responsable y próximo paso</h2>
          <label>
            Responsable
            <select
              value={q.ownerMembershipId}
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
            Estado
            <select
              value={q.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="new">Nueva</option>
              <option value="active">En atención</option>
              <option value="closed">Cerrada</option>
            </select>
          </label>
          <label>
            Próximo paso
            <input
              value={q.nextAction}
              onChange={(e) => change("nextAction", e.target.value)}
              required={q.status !== "closed"}
            />
          </label>
          <label>
            Fecha del próximo paso · Catamarca (UTC−3)
            <input
              type="datetime-local"
              value={formatFollowUp(q.nextActionAt)}
              onChange={(e) =>
                change("nextActionAt", parseFollowUp(e.target.value))
              }
              required
            />
          </label>
          {q.status === "closed" && (
            <label>
              Resultado de cierre
              <textarea
                value={q.result || ""}
                onChange={(e) => change("result", e.target.value)}
                required
              />
            </label>
          )}
          <button>Guardar seguimiento</button>
          {status && <p role="status">{status}</p>}
          {error && <p role="alert">{error}</p>}
        </form>
        <section className="panel">
          <h2>Conversación y pase humano</h2>
          <p>
            {q.conversations[0]?.paused
              ? "Asistente pausado"
              : "Simulación habilitada para mensajes nuevos"}
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => action("pause")}>
              Pausar asistente
            </button>
            <button className="secondary" onClick={() => action("resume")}>
              Reanudar explícitamente
            </button>
            <button className="secondary" onClick={() => action("handoff")}>
              Confirmar pase simulado
            </button>
          </div>
          <p>
            Pase simulado: {q.conversations[0]?.handoffStatus || "sin pedido"}
          </p>
          <div className="transcript">
            {q.messages.map((m: any) => (
              <article className={"message " + m.direction} key={m.id}>
                <small>
                  {m.direction === "incoming"
                    ? "Visitante ficticio"
                    : "Simulación"}{" "}
                  · versión registrada
                </small>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

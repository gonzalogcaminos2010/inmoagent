import React, { useEffect, useState } from "react";
import { api, showError } from "../../api.js";
export function Operation() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    api
      .request("/operation")
      .then(setData)
      .catch((e) => showError(e, setError));
  useEffect(() => {
    load();
  }, []);
  async function pause() {
    try {
      await api.request("/operation/pause", "POST", {
        paused: !data.tenant.paused,
      });
      await load();
    } catch (e) {
      showError(e, setError);
    }
  }
  async function scenario(value: string) {
    try {
      await api.request("/operation/scenario", "POST", { scenario: value });
    } catch (e) {
      showError(e, setError);
    }
  }
  return (
    <>
      <p className="eyebrow">Control humano y límites</p>
      <h1>Operación</h1>
      <div className="stats">
        <article>
          <span>IA real</span>
          <strong className="stat-word">Desactivada</strong>
          <small>Proveedor no configurado</small>
        </article>
        <article>
          <span>Chatwoot</span>
          <strong className="stat-word">Simulación</strong>
          <small>Sin conexión real</small>
        </article>
        <article>
          <span>WhatsApp</span>
          <strong className="stat-word">No conectado</strong>
          <small>Etapa posterior</small>
        </article>
      </div>
      {data && (
        <div className="detail-grid">
          <section className="panel">
            <h2>Pausa general del cliente</h2>
            <p>
              {data.tenant.paused
                ? "Respuestas simuladas pausadas"
                : "Respuestas simuladas habilitadas"}
            </p>
            <button onClick={pause}>
              {data.tenant.paused
                ? "Reanudar explícitamente cliente"
                : "Pausar cliente"}
            </button>
            <p>Una reanudación no revive tareas descartadas.</p>
            <label>
              Escenario de entrega simulada
              <select
                defaultValue="normal"
                onChange={(e) => scenario(e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="transient">Fallo transitorio</option>
                <option value="permanent">Fallo permanente</option>
                <option value="uncertain">Timeout conciliable</option>
                <option value="unreconcilable">
                  Entrega incierta sin confirmación
                </option>
              </select>
            </label>
          </section>
          <section className="panel">
            <h2>Cola y consumo</h2>
            <p>Mensajes de demo registrados: {data.messageCount}</p>
            <p>
              Consumo de proveedor de IA: 0. Esta simulación no realiza llamadas
              pagas.
            </p>
            <button className="secondary" onClick={load}>
              Actualizar operación
            </button>
            {data.jobs.length ? (
              <ul>
                {data.jobs.map((j: any) => (
                  <li key={j.id}>
                    <span className="pill">{j.status}</span> Intentos:{" "}
                    {j.attempts}
                    <p>{j.error || "Tarea de simulación pendiente"}</p>
                    {j.canRetry && (
                      <button
                        className="link"
                        onClick={() => {
                          api
                            .request(
                              "/operation/jobs/" + j.id + "/retry",
                              "POST",
                              {},
                            )
                            .then(load)
                            .catch((e) => showError(e, setError));
                        }}
                      >
                        Reintento manual controlado
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Sin tareas pendientes ni errores de entrega.</p>
            )}
          </section>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

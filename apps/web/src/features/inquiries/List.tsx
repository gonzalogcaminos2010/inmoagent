import { followUpZone } from "./next-action-time.js";
import React, { useEffect, useState } from "react";
import { api, showError } from "../../api.js";
export function List() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    api
      .request<any[]>("/inquiries")
      .then(setRows)
      .catch((e) => showError(e, setError));
  }, []);
  const open = rows.filter((q) => q.status !== "closed"),
    late = open.filter((q) => Date.parse(q.nextActionAt) < Date.now());
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">Cada consulta, con un siguiente paso</p>
          <h1>Consultas</h1>
        </div>
        <button
          className="secondary"
          onClick={() =>
            api
              .request<any[]>("/inquiries")
              .then(setRows)
              .catch((e) => showError(e, setError))
          }
        >
          Actualizar
        </button>
      </div>
      <div className="stats">
        <article>
          <span>Consultas abiertas</span>
          <strong>{open.length}</strong>
          <small>Con responsable asignado</small>
        </article>
        <article>
          <span>Próximos pasos vencidos</span>
          <strong>{late.length}</strong>
          <small>Para revisar con el equipo</small>
        </article>
        <article>
          <span>Origen</span>
          <strong className="stat-word">Simulación</strong>
          <small>Sin envíos ni IA reales</small>
        </article>
      </div>
      <div className="panel">
        <div className="title-row">
          <h2>Seguimiento del equipo</h2>
          <label className="compact">
            Filtrar estado
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="new">Nuevas</option>
              <option value="active">En atención</option>
              <option value="closed">Cerradas</option>
            </select>
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        {!rows.length ? (
          <div className="empty">
            <span>↗</span>
            <h3>Tu próxima consulta empieza acá</h3>
            <p>
              Creá un asistente, probalo y abrí una sesión de chat con datos
              ficticios.
            </p>
            <button onClick={() => (location.hash = "wizard")}>
              Empezar configuración
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Consulta</th>
                  <th>Estado</th>
                  <th>Responsable</th>
                  <th>Próximo paso</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((q) => filter === "all" || q.status === filter)
                  .map((q) => (
                    <tr key={q.id}>
                      <td>
                        <button
                          className="link"
                          onClick={() => (location.hash = "inquiry/" + q.id)}
                        >
                          {q.interest || "Consulta de demo"}
                        </button>
                        <small>Chat web · datos ficticios</small>
                      </td>
                      <td>
                        <span className={"pill " + q.status}>
                          {q.status === "new"
                            ? "Nueva"
                            : q.status === "active"
                              ? "En atención"
                              : "Cerrada"}
                        </span>
                      </td>
                      <td>
                        {q.ownerMembershipId.includes("operator")
                          ? "Operador"
                          : "Administrador"}
                      </td>
                      <td>
                        {q.nextAction}
                        <small>
                          {new Date(q.nextActionAt).toLocaleString("es-AR", {
                            timeZone: followUpZone,
                            hourCycle: "h23",
                          })}
                        </small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

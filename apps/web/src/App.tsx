import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, showError, type Context } from "./api.js";
import { List } from "./features/inquiries/List.js";
import { Detail } from "./features/inquiries/Detail.js";
import { Wizard } from "./features/assistant/Wizard.js";
import { ChatDemo } from "./features/chat/ChatDemo.js";
import { Operation } from "./features/operation/Operation.js";
import "./style.css";
function App() {
  const [ctx, setCtx] = useState<Context | null>(null),
    [identity, setIdentity] = useState("a-admin"),
    [route, setRoute] = useState(location.hash.slice(1) || "inquiries"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || "inquiries");
    window.addEventListener("hashchange", onHash);
    api
      .request("/session")
      .then((s) => {
        api.setToken(s.csrfToken);
        setCtx(s.ctx);
        setIdentity(
          s.ctx.tenantId === "tenant-b"
            ? "b-admin"
            : s.ctx.role === "operator"
              ? "a-operator"
              : "a-admin",
        );
      })
      .catch(() => {});
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  async function login(value = identity) {
    setBusy(true);
    setError("");
    try {
      const c = await api.switchIdentity(value);
      setCtx(c);
      setIdentity(value);
      location.hash = "inquiries";
      setRoute("inquiries");
    } catch (e) {
      showError(e, setError);
    } finally {
      setBusy(false);
    }
  }
  const selector = (
    <label className="identity">
      Identidad de demo
      <select
        value={identity}
        disabled={busy}
        onChange={(e) =>
          ctx ? login(e.target.value) : setIdentity(e.target.value)
        }
      >
        <option value="a-admin">Río · Administrador</option>
        <option value="a-operator">Río · Operador</option>
        <option value="b-admin">Sur · Administrador</option>
      </select>
    </label>
  );
  if (!ctx)
    return (
      <div className="login-wrap">
        <section className="login panel">
          <div className="brand">
            <span className="brand-mark">i</span> inmoagent
          </div>
          <p className="eyebrow">Piloto acompañado · demo local</p>
          <h1>Cada consulta tiene un próximo paso.</h1>
          <p>
            Probá cómo recibir, asignar y seguir una consulta inmobiliaria con
            el equipo humano a cargo.
          </p>
          <div className="notice">
            <strong>Simulación con datos ficticios</strong>
            <p>
              Sin IA activa, Chatwoot real ni conexión WhatsApp. Acceso de demo
              sólo en este entorno local.
            </p>
          </div>
          {selector}
          <button disabled={busy} onClick={() => login()}>
            Entrar a demo
          </button>
          {error && <p role="alert">{error}</p>}
        </section>
        <div className="login-visual">
          <span className="orb"></span>
          <p>
            Atención clara.
            <br />
            Seguimiento visible.
            <br />
            <b>Control humano.</b>
          </p>
        </div>
      </div>
    );
  const tenant =
    ctx.tenantId === "tenant-a" ? "Río Propiedades" : "Sur Inmuebles";
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">i</span> inmoagent
        </div>
        <div className="tenant">
          <small>CLIENTE ACTIVO</small>
          <strong>{tenant}</strong>
          <span>{ctx.role === "admin" ? "Administrador" : "Operador"}</span>
        </div>
        <nav aria-label="Navegación principal">
          {[
            ["inquiries", "Consultas", "↗"],
            ["wizard", "Crear asistente", "✧"],
            ["chat", "Chat de prueba", "◌"],
            ["operation", "Operación", "◫"],
          ].map(([key, name, icon]) => (
            <button
              key={key}
              className={route.startsWith(key!) ? "active" : ""}
              onClick={() => (location.hash = key!)}
            >
              <span aria-hidden="true">{icon}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="pill">Simulación</span>
          <p>
            Datos ficticios.
            <br />
            Siempre con control humano.
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span className="header-name">
            Espacio de trabajo <small>Demo local</small>
          </span>
          {selector}
          <button
            className="link"
            onClick={() =>
              api
                .logout()
                .then(() => {
                  setCtx(null);
                  location.hash = "";
                })
                .catch((e) => showError(e, setError))
            }
          >
            Salir
          </button>
        </header>
        <main key={ctx.membershipId}>
          {error && <p role="alert">{error}</p>}
          {route === "wizard" ? (
            <Wizard ctx={ctx} />
          ) : route === "chat" ? (
            <ChatDemo />
          ) : route === "operation" ? (
            <Operation />
          ) : route.startsWith("inquiry/") ? (
            <Detail key={route} id={route.slice(8)} />
          ) : (
            <List />
          )}
        </main>
        <footer>
          Inmoagent · Simulación local. Ningún canal ni proveedor real está
          conectado.
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

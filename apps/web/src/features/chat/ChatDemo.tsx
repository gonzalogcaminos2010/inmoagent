import React, { useEffect, useRef, useState } from "react";
import { api, showError } from "../../api.js";
export function ChatDemo() {
  const [session, setSession] = useState<{
      id: string;
      chatToken: string;
    } | null>(null),
    [chat, setChat] = useState<any>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ text: string; clientMessageId: string } | null>(
    null,
  );
  async function start() {
    setError("");
    try {
      const r = await api.request("/chat/sessions", "POST", {});
      setSession(r);
      setChat(null);
      pending.current = null;
    } catch (e) {
      showError(e, setError);
    }
  }
  useEffect(() => {
    if (!session) return;
    let live = true;
    const poll = async () => {
      try {
        const r = await api.request(
          "/public/chat/sessions/" + session.id,
          "GET",
          undefined,
          { "x-chat-token": session.chatToken },
        );
        if (live) setChat(r);
      } catch (e) {
        if (live) showError(e, setError);
      }
    };
    poll();
    const timer = setInterval(poll, 500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    if (!pending.current || pending.current.text !== text)
      pending.current = { text, clientMessageId: crypto.randomUUID() };
    try {
      await api.request(
        "/public/chat/sessions/" + session.id + "/messages",
        "POST",
        pending.current,
        { "x-chat-token": session.chatToken },
      );
      pending.current = null;
      setText("");
    } catch (e) {
      showError(e, setError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">Recorrido de atención · datos ficticios</p>
          <h1>Chat de prueba</h1>
        </div>
        <span className="pill">Simulación</span>
      </div>
      <div className="chat-grid">
        <section className="panel chat-panel">
          <div className="title-row">
            <h2>Visitante de demo</h2>
            <button className="secondary" onClick={start} disabled={busy}>
              Nueva sesión de chat
            </button>
          </div>
          <div className="notice">
            Simulación determinista. No hay IA, propiedades ni disponibilidad
            reales.
          </div>
          {chat?.paused && (
            <div className="paused">
              <strong>Asistente pausado</strong>
              <p>
                El equipo humano tiene la consulta. Pase simulado:{" "}
                {chat.handoffStatus || "pendiente"}.
              </p>
            </div>
          )}
          <div className="transcript">
            {!session && (
              <p className="muted">
                Abrí una sesión después de publicar un asistente simulado.
              </p>
            )}
            {chat?.messages?.map((m: any) => (
              <article key={m.id} className={"message " + m.direction}>
                <small>
                  {m.direction === "incoming"
                    ? "Visitante ficticio"
                    : "Simulación"}
                </small>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
          <form onSubmit={send}>
            <label>
              Mensaje
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4000}
                required
                disabled={!session}
              />
            </label>
            <button disabled={!session || busy || !text.trim()}>
              Enviar mensaje
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </section>
        <aside className="panel">
          <h2>Probá el pase humano</h2>
          <p>
            Escribí “Quiero un humano”. La pausa se registra antes de encolar
            respuestas y conserva un responsable y un próximo paso.
          </p>
          <ol>
            <li>Mandá una consulta ficticia.</li>
            <li>Pedí atención humana.</li>
            <li>Revisá el seguimiento en Consultas.</li>
          </ol>
          <p className="muted">
            Reiniciar crea otra sesión; las consultas anteriores se conservan.
          </p>
        </aside>
      </div>
    </>
  );
}

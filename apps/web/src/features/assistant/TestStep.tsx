import React from "react";
export function TestStep({
  busy,
  test,
  testId,
  reply,
}: {
  busy: boolean;
  test: () => Promise<void>;
  testId: string;
  reply: string;
}) {
  return (
    <>
      <h2>Probá antes de publicar</h2>
      <p>
        Respuesta determinista basada en tu conocimiento. No usa un modelo de
        IA.
      </p>
      <button disabled={busy} onClick={test}>
        Probar simulación
      </button>
      {testId && (
        <>
          <p role="status">Prueba satisfactoria de esta revisión</p>
          <blockquote>{reply}</blockquote>
        </>
      )}
    </>
  );
}

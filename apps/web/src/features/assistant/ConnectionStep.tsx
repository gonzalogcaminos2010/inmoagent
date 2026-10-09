import React from "react";
export function ConnectionStep() {
  return (
    <>
      <h2>Chat web de prueba</h2>
      <p>
        La prueba web funciona en esta demo local y utiliza datos ficticios.
      </p>
      <div className="notice">
        <strong>WhatsApp no conectado</strong>
        <p>
          Una conexión futura requiere consentimiento, acceso autorizado a Meta,
          verificaciones y un canal validado. Esta demo no conecta ni envía
          WhatsApp.
        </p>
      </div>
      <p>Chatwoot: adaptador simulado. No hay una bandeja real conectada.</p>
    </>
  );
}

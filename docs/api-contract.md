# API local v0
Base http://127.0.0.1:3001, proxy web /api. JSON; rechaza propiedades adicionales. No recibe tenant_id, Account, inbox ni URL remota.
POST /demo/session {identity:a-admin|a-operator|b-admin}; GET /session; DELETE /session. Cookie HttpOnly SameSite=Strict, 2h; mutaciones Origin exacto y x-csrf-token. Cambio identidad rota y revoca.
GET /inquiries, /inquiries/export, /inquiries/:id; PATCH /inquiries/:id {ownerMembershipId,nextAction,nextActionAt,status,result?}; GET /memberships.
GET/POST /assistant/drafts; GET/PUT /assistant/drafts/:id; POST /assistant/drafts/:id/test {prompt}; POST .../publish {testId,idempotencyKey}; GET /assistant/:id/readiness; GET /assistant/versions. Publicación sólo admin.
POST /chat/sessions {configId?} devuelve id, chatToken, mode. GET /chat/sessions/:id; POST .../messages {clientMessageId,text}. IDs de mensajes estables por intento, duplicados devuelven recibo anterior.
/public/chat/sessions/:id GET y /messages POST requieren x-chat-token efímero ligado en servidor a exactamente una sesión y tenant; mutaciones también Origin. Token público no accede panel, listados, configuraciones ni otras sesiones; no se guarda en localStorage. Reinicio del servidor invalida capacidades, pero conserva consultas/mensajes en DB.
POST /conversations/:id/pause {reason}, /resume {}, /handoff {}. Pase siempre simulado. GET /operation; POST /operation/pause {paused}; /scenario {scenario:normal|uncertain|transient|permanent|unreconcilable}; /jobs/:id/retry {}. Cambio escenario sólo admin y sin red.
Errores: 400 validación, 401 sesión, 403 permiso/Origin/CSRF, 404 recurso no autorizado o ausente, 409 estado/prueba/reintento, 429 límites. 500 saneado sin SQL/credenciales.
Exportación sólo JSON del tenant de sesión. Sin webhooks reales ni endpoints para URLs remotas: la superficie de SSRF/integración está ausente.

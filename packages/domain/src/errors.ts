export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}
export function requireAdmin(ctx: { role: string }) {
  if (ctx.role !== "admin") fail(403, "Se requiere administrador");
}

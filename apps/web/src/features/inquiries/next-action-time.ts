// Seguimiento en America/Argentina/Catamarca (UTC−3), independiente del navegador.
export const followUpZone = "America/Argentina/Catamarca";
export function formatFollowUp(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: followUpZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function parseFollowUp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const date = new Date(value + ":00-03:00");
  return Number.isFinite(date.getTime()) &&
    formatFollowUp(date.toISOString()) === value
    ? date.toISOString()
    : "";
}

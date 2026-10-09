export type Context = {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: string;
};
class Api {
  private csrf = "";
  private epoch = 0;
  private pending = new Set<AbortController>();
  setToken(token: string) {
    this.csrf = token;
  }
  async request<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController(),
      epoch = this.epoch;
    this.pending.add(controller);
    try {
      const r = await fetch("/api" + path, {
        method,
        credentials: "same-origin",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.csrf ? { "x-csrf-token": this.csrf } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = r.status === 204 ? undefined : await r.json();
      if (epoch !== this.epoch)
        throw new DOMException("Cliente cambiado", "AbortError");
      if (!r.ok) throw Error(data.error ?? "No se pudo completar");
      return data as T;
    } finally {
      this.pending.delete(controller);
    }
  }
  cancel() {
    this.epoch++;
    for (const c of this.pending) c.abort();
    this.pending.clear();
  }
  async switchIdentity(identity: string) {
    this.cancel();
    const result = await this.request<{ ctx: Context; csrfToken: string }>(
      "/demo/session",
      "POST",
      { identity },
    );
    this.csrf = result.csrfToken;
    return result.ctx;
  }
  async logout() {
    await this.request("/session", "DELETE");
    this.cancel();
    this.csrf = "";
  }
}
export const api = new Api();
export const showError = (e: unknown, set: (s: string) => void) => {
  if ((e as Error).name !== "AbortError") set((e as Error).message);
};

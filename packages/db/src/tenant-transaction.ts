import { Pool, type PoolClient } from "pg";
import {
  businessTables,
  type Table,
  type RecordData,
  type TenantContext,
  type Tx,
  type DbPort,
} from "../../domain/src/types.js";
export const tables = businessTables;
class TenantTx implements Tx {
  constructor(
    readonly ctx: TenantContext,
    private client: PoolClient,
  ) {}
  private table(t: Table) {
    if (!tables.includes(t)) throw Error("Tabla no autorizada");
    return t;
  }
  async get<T extends RecordData = RecordData>(
    t: Table,
    id: string,
    lock = false,
  ): Promise<T | null> {
    const r = await this.client.query(
      `SELECT data FROM ${this.table(t)} WHERE tenant_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [this.ctx.tenantId, id],
    );
    return r.rows[0]?.data ?? null;
  }
  async list<T extends RecordData = RecordData>(t: Table): Promise<T[]> {
    const r = await this.client.query(
      `SELECT data FROM ${this.table(t)} WHERE tenant_id=$1 ORDER BY id`,
      [this.ctx.tenantId],
    );
    return r.rows.map((r) => r.data);
  }
  async save<T extends RecordData>(t: Table, v: T) {
    if (v.tenantId !== this.ctx.tenantId) throw Error("Cliente ajeno");
    const immutable = t === "assistant_versions";
    await this.client.query(
      `INSERT INTO ${this.table(t)}(tenant_id,id,data) VALUES($1,$2,$3) ${immutable ? "" : "ON CONFLICT(tenant_id,id) DO UPDATE SET data=EXCLUDED.data"}`,
      [v.tenantId, v.id, v],
    );
  }
  async remove(t: Table, id: string) {
    const r = await this.client.query(
      `DELETE FROM ${this.table(t)} WHERE tenant_id=$1 AND id=$2`,
      [this.ctx.tenantId, id],
    );
    return (r.rowCount ?? 0) > 0;
  }
  async reserveBudget(
    id: string,
    key: string,
    period: string,
    estimatedMinor: number,
    currency: string,
  ) {
    const r = await this.client.query(
      "SELECT reserve_demo_budget($1,$2,$3,$4,$5) AS id",
      [id, key, period, estimatedMinor, currency],
    );
    return r.rows[0].id as string;
  }
  async settleBudget(id: string, actualMinor: number, release: boolean) {
    await this.client.query("SELECT settle_demo_budget($1,$2,$3)", [
      id,
      actualMinor,
      release,
    ]);
  }
  async lock(key: string, shared = false) {
    await this.client.query(
      `SELECT ${shared ? "pg_advisory_xact_lock_shared" : "pg_advisory_xact_lock"}(hashtextextended($1,0))`,
      [this.ctx.tenantId + ":" + key],
    );
  }
}
export class Database implements DbPort {
  private pool: Pool;
  constructor(
    url = process.env.DATABASE_URL ??
      "postgres://inmo_app@127.0.0.1:55432/inmoagent",
  ) {
    this.pool = new Pool({ connectionString: url, max: 6 });
  }
  async withTenant<T>(
    ctx: TenantContext,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      const role = await c.query(
        "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      );
      const owner = await c.query(
        "SELECT tableowner=current_user AS owner FROM pg_tables WHERE schemaname='public' AND tablename='memberships'",
      );
      if (
        role.rows[0]?.rolsuper ||
        role.rows[0]?.rolbypassrls ||
        owner.rows[0]?.owner
      )
        throw Error("Rol de aplicación inseguro");
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id',$1,true)", [
        ctx.tenantId,
      ]);
      const tx = new TenantTx(ctx, c);
      const m = await tx.get("memberships", ctx.membershipId);
      if (
        !m ||
        m.userId !== ctx.userId ||
        m.role !== ctx.role ||
        m.active !== true
      )
        throw Object.assign(Error("Membresía no autorizada"), {
          statusCode: 403,
        });
      const result = await fn(tx);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}

import type { AiPort } from "./port.js";
import type { TenantContext } from "../../../domain/src/types.js";
export class DisabledAiAdapter implements AiPort {
  async generate(
    _ctx: TenantContext,
    _id: string,
  ): Promise<{ text: string; tokens: number }> {
    throw Error("Proveedor no configurado");
  }
}

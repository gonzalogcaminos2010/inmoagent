import type { TenantContext } from "../../../domain/src/types.js";
export interface AiPort {
  generate(
    ctx: TenantContext,
    conversationId: string,
  ): Promise<{ text: string; tokens: number }>;
}

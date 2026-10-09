export type TenantContext = {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: "admin" | "operator" | "platform";
};
export interface Clock {
  now(): Date;
}
export interface Random {
  jitter(maxMs: number): number;
}
export const businessTables = [
  "tenants",
  "memberships",
  "assistant_drafts",
  "assistant_versions",
  "assistant_tests",
  "inquiries",
  "conversations",
  "messages",
  "integrations",
  "events",
  "jobs",
  "outbox",
  "usage",
  "audit",
  "public_sessions",
  "reservations",
] as const;
export type Table = (typeof businessTables)[number];
export interface RecordData {
  id: string;
  tenantId: string;
  [key: string]: unknown;
}
export interface Tx {
  readonly ctx: TenantContext;
  get<T extends RecordData = RecordData>(
    table: Table,
    id: string,
    lock?: boolean,
  ): Promise<T | null>;
  list<T extends RecordData = RecordData>(table: Table): Promise<T[]>;
  save<T extends RecordData>(table: Table, value: T): Promise<void>;
  remove(table: Table, id: string): Promise<boolean>;
  lock(key: string, shared?: boolean): Promise<void>;
  reserveBudget(
    id: string,
    key: string,
    period: string,
    estimatedMinor: number,
    currency: string,
  ): Promise<string>;
  settleBudget(
    id: string,
    actualMinor: number,
    release: boolean,
  ): Promise<void>;
}
export interface DbPort {
  withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T>;
}
export type AssistantDraft = {
  businessName: string;
  approvedKnowledge: string;
  tone: string;
  hours: string;
  handoffRules: string;
  ownerMembershipId: string;
  mode: "simulated" | "real" | "disabled";
};
export interface DraftRecord extends RecordData, AssistantDraft {
  revision: number;
}
export interface AssistantVersion extends RecordData, AssistantDraft {
  draftId: string;
  version: number;
  revision: number;
  approvedBy: string;
  publishedAt: string;
  publicationKey: string;
}
export type Readiness = {
  created: boolean;
  channelConnected: boolean;
  responding: boolean;
  blockers: string[];
};
export interface Inquiry extends RecordData {
  status: "new" | "active" | "closed";
  ownerMembershipId: string;
  nextAction: string;
  nextActionAt: string;
  contact?: string;
  interest?: string;
  result?: string;
}
export interface Conversation extends RecordData {
  inquiryId: string;
  paused: boolean;
  revision: number;
  pauseReason?: string;
  handoffStatus?: "pending" | "confirmed" | "failed";
}
export interface ChatSession extends RecordData {
  configId: string;
  conversationId?: string;
  messageCount: number;
  messageTimes: number[];
  expiresAt: string;
}
export type IncomingMessage = {
  clientMessageId: string;
  text: string;
  sessionId: string;
};
export type AcceptedMessage = {
  messageId: string;
  inquiryId: string;
  conversationId: string;
  mode: "simulated";
  paused: boolean;
};
export interface Job extends RecordData {
  conversationId: string;
  configId: string;
  conversationRevision: number;
  logicalKey: string;
  status:
    "pending" | "claimed" | "confirmed" | "discarded" | "review" | "uncertain";
  attempts: number;
  runAt: string;
  firstAttemptAt: string;
  failureKind?: "transient" | "permanent" | "uncertain";
  text: string;
  error?: string;
  leaseUntil?: string;
  externalId?: string;
}

export type Delivery = {
  status: "confirmed" | "uncertain" | "failed";
  externalId?: string;
  retryable: boolean;
};
export interface Sender {
  send(
    ctx: TenantContext,
    id: string,
    text: string,
    key: string,
  ): Promise<Delivery>;
}
export type NormalizedEvent = {
  externalId: string;
  accountId: string;
  inboxId: string;
  conversationExternalId: string;
  kind: "message" | "human_activity" | "status";
  occurredAt: string;
  payload: unknown;
};

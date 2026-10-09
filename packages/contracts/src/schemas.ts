export const text = (maxLength = 2000) => ({ type: "string", maxLength });
export const id = { type: "string", minLength: 1, maxLength: 120 };
export const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", additionalProperties: false, properties, required });
export const draftSchema = object({
  businessName: text(200),
  approvedKnowledge: text(6000),
  tone: text(120),
  hours: text(200),
  handoffRules: text(1000),
  ownerMembershipId: text(120),
  mode: { type: "string", enum: ["simulated", "real", "disabled"] },
});
export const messageSchema = object({
  text: { type: "string", minLength: 1, maxLength: 2000 },
  clientMessageId: id,
});
export const inquiryPatch = object(
  {
    ownerMembershipId: id,
    nextAction: text(500),
    nextActionAt: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["new", "active", "closed"] },
    result: text(1000),
  },
  ["ownerMembershipId", "nextAction", "nextActionAt", "status"],
);

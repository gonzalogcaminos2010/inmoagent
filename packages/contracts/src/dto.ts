export type Mode = "simulated" | "real" | "disabled";
export type WizardDraft = {
  businessName: string;
  approvedKnowledge: string;
  tone: string;
  hours: string;
  handoffRules: string;
  ownerMembershipId: string;
  mode: string;
};

import { test, expect } from "vitest";
import {
  formatFollowUp,
  parseFollowUp,
} from "../../apps/web/src/features/inquiries/next-action-time.js";
test("Catamarca UTC-3 displays and roundtrips without using browser timezone", () => {
  expect(formatFollowUp("2026-10-09T01:30:00.000Z")).toBe("2026-10-08T22:30");
  expect(parseFollowUp("2026-10-08T22:30")).toBe("2026-10-09T01:30:00.000Z");
  expect(parseFollowUp(formatFollowUp("2026-12-31T03:00:00.000Z"))).toBe(
    "2026-12-31T03:00:00.000Z",
  );
  expect(formatFollowUp("2027-01-01T02:59:00.000Z")).toBe("2026-12-31T23:59");
});
test("empty or invalid date stays empty without throwing during editing", () => {
  expect(formatFollowUp("")).toBe("");
  expect(parseFollowUp("")).toBe("");
  expect(parseFollowUp("2026-02-30T10:00")).toBe("");
});

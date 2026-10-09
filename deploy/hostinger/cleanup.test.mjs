import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanupSandbox } from "./cleanup.mjs";
test("down failure always deletes temporary hash and never removes live volume", () => {
  const calls = [];
  cleanupSandbox({
    owned: true,
    tags: ["own-tag"],
    down: () => {
      calls.push("down");
      throw Error("down failed");
    },
    removeVolume: () => calls.push("volume"),
    removeTag: (t) => calls.push(t),
    removeTemp: () => calls.push("temp"),
    report: (e) => calls.push(e.message),
  });
  assert.deepEqual(calls, ["down", "down failed", "own-tag", "temp"]);
});
test("volume/tag failures are reported but cannot prevent secret cleanup", () => {
  const calls = [];
  cleanupSandbox({
    owned: true,
    tags: ["tag1", "tag2"],
    down: () => {},
    removeVolume: () => {
      throw Error("volume failed");
    },
    removeTag: (t) => {
      calls.push(t);
      if (t === "tag1") throw Error("tag failed");
    },
    removeTemp: () => calls.push("temp"),
    report: (e) => calls.push(e.message),
  });
  assert.deepEqual(calls, [
    "volume failed",
    "tag1",
    "tag failed",
    "tag2",
    "temp",
  ]);
});

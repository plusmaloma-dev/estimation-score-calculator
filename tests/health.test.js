import assert from "node:assert/strict";
import test from "node:test";

test("project CI smoke test", () => {
  assert.equal("estimation-score-calculator:ready", "estimation-score-calculator:ready");
});

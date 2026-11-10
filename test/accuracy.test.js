// The accuracy figures shown on the page must match what the rules score today, and must not slip.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { evaluate } = require("../scripts/eval.js");

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "corpus", f), "utf8"));
const shown = (() => { const box = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/accuracy.js"), "utf8"), box); return box.window.NZRedactAccuracy; })();

test("the figures on the page are up to date (run npm run eval after changing a rule)", () => {
  const blind = evaluate(load("nz-docs-holdout.json")), main = evaluate(load("nz-docs.json"));
  assert.equal(shown.blind.structuredRecall, blind.structuredRecall);
  assert.equal(shown.blind.precision, blind.precision);
  assert.equal(shown.main.structuredRecall, main.structuredRecall);
});

test("no slipping back: the main set keeps finding every number, date, email, phone and address", () => {
  const main = evaluate(load("nz-docs.json"));
  assert.equal(main.structuredRecall, 1);
  assert.ok(main.precision >= 0.94, String(main.precision));
  assert.ok(main.negativesKept >= 145, String(main.negativesKept));
});

test("every labelled value in the test documents appears word for word in its text", () => {
  for (const f of ["nz-docs.json", "nz-docs-holdout.json"]) {
    for (const d of load(f)) for (const e of d.expected) assert.ok(d.text.includes(e.value), `${d.id}: ${e.value}`);
  }
});

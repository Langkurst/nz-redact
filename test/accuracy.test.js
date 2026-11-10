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
  const blind = evaluate(load("nz-docs-holdout.json")), names = evaluate(load("nz-docs-names-blind.json")), main = evaluate(load("nz-docs.json"));
  assert.equal(shown.version, require("../src/nz-redact.js").version);
  assert.equal(shown.blind.structuredRecall, blind.structuredRecall);
  assert.equal(shown.blind.precision, blind.precision);
  assert.equal(shown.blind.nameRecall, blind.nameRecall);
  assert.equal(shown.blind.nameRecallSure, blind.nameRecallSure);
  assert.equal(shown.names.nameRecall, names.nameRecall);
  assert.equal(shown.names.nameHit, names.nameHit);
  assert.equal(shown.names.precision, names.precision);
  assert.equal(shown.names.negativesKept, names.negativesKept);
  assert.equal(shown.main.structuredRecall, main.structuredRecall);
});

test("no slipping back: the main set keeps finding every number, date, email, phone and address", () => {
  const main = evaluate(load("nz-docs.json"));
  assert.equal(main.structuredRecall, 1);
  assert.ok(main.precision >= 0.94, String(main.precision));
  assert.ok(main.negativesKept >= 145, String(main.negativesKept));
});

test("the second blind set (names) keeps its measured figures: 59 of 90 names, 6 wrong, 70 of 74 look-alikes left alone", () => {
  const names = evaluate(load("nz-docs-names-blind.json")), row = names.types.find((t) => t.type === "name");
  assert.equal(names.documents, 30);
  assert.equal(names.nameExpected, 90);
  assert.equal(names.nameHit, 59);
  assert.equal(row.falseAlarms, 6);
  assert.equal(names.negatives, 74);
  assert.equal(names.negativesKept, 70);
});

test("every labelled value in the test documents appears word for word in its text", () => {
  for (const f of ["nz-docs.json", "nz-docs-holdout.json", "nz-docs-names-blind.json"]) {
    for (const d of load(f)) for (const e of d.expected) assert.ok(d.text.includes(e.value), `${d.id}: ${e.value}`);
  }
});

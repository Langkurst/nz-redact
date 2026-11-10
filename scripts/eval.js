/*
  Measures NZ Redact on the hand-labelled documents in test/corpus (nz-docs.json, nz-docs-holdout.json
  and nz-docs-names-blind.json) and writes the
  results to app/accuracy.js, which the web page shows. Run:  npm run eval
  The documents were written and labelled without looking at the rules, so the figures are honest.
*/
const fs = require("fs");
const path = require("path");
const R = require("../src/nz-redact.js");

const LABELS = { ird: "IRD number", bank: "Bank account", nhi: "NHI number", card: "Card number", licence: "Driver licence",
  passport: "Passport number", dob: "Date of birth", email: "Email address", phone: "Phone number", name: "Name", address: "Street address" };
const norm = (s) => String(s).replace(/[\s\-().]/g, "").toLowerCase();
const same = (a, b) => { const x = norm(a), y = norm(b); return x === y || (x.length > 5 && y.length > 5 && (x.includes(y) || y.includes(x))); };

// Name figures for one way of scanning. A name finding is right when it matches a labelled name, or is another copy of one.
// Recall counts labelled names found. Precision counts findings that are right. The maybe figures cover only the possible-name tier.
function nameStats(docs, options) {
  let expected = 0, hit = 0, findings = 0, correct = 0, maybeFindings = 0, maybeCorrect = 0;
  for (const d of docs) {
    const names = R.scan(d.text, options).filter((f) => f.type === "name");
    const labelled = d.expected.filter((e) => e.type === "name");
    const used = new Set();
    for (const e of labelled) {
      expected++;
      const i = names.findIndex((f, j) => !used.has(j) && same(f.text, e.value));
      if (i >= 0) { used.add(i); hit++; }
    }
    names.forEach((f, j) => {
      const ok = used.has(j) || labelled.some((e) => same(f.text, e.value));
      findings++; if (ok) correct++;
      if (f.maybe) { maybeFindings++; if (ok) maybeCorrect++; }
    });
  }
  return { expected, hit, findings, correct, maybeFindings, maybeCorrect };
}

function evaluate(docs) {
  const t = {};
  Object.keys(LABELS).forEach((k) => { t[k] = { type: k, label: LABELS[k], supported: !!R.TYPES[k], expected: 0, found: 0, missed: 0, falseAlarms: 0, examples: [] }; });
  let negatives = 0, negativesKept = 0;
  for (const d of docs) {
    const found = R.scan(d.text);
    const used = new Set();
    for (const e of d.expected) {
      const row = t[e.type];
      if (!row) continue;
      row.expected++;
      const i = found.findIndex((f, j) => !used.has(j) && f.type === e.type && same(f.text, e.value));
      if (i >= 0) { used.add(i); row.found++; }
      else { row.missed++; if (row.examples.length < 5) row.examples.push(`missed ${e.value} in ${d.id}`); }
    }
    found.forEach((f, j) => {
      if (used.has(j)) return;
      // Each value is labelled once per document, so a second copy of a labelled value is not a false alarm.
      if (d.expected.some((e) => e.type === f.type && same(f.text, e.value))) return;
      // A finding that matches a label of another type still counts against the type it was reported as.
      t[f.type].falseAlarms++;
      if (t[f.type].examples.length < 5) t[f.type].examples.push(`false alarm ${f.text} in ${d.id}`);
    });
    for (const n of d.negatives || []) {
      negatives++;
      if (!found.some((f) => same(f.text, n.value))) negativesKept++;
    }
  }
  const sup = Object.values(t).filter((r) => r.supported);
  const exp = sup.reduce((s, r) => s + r.expected, 0), hit = sup.reduce((s, r) => s + r.found, 0), fa = sup.reduce((s, r) => s + r.falseAlarms, 0);
  const part = (rows) => { const e = rows.reduce((s, r) => s + r.expected, 0); return e ? rows.reduce((s, r) => s + r.found, 0) / e : 0; };
  const allNames = nameStats(docs), sureNames = nameStats(docs, { maybe: false });
  return { version: R.version, documents: docs.length, recall: exp ? hit / exp : 0, precision: hit + fa ? hit / (hit + fa) : 1,
    structuredRecall: part(sup.filter((r) => r.type !== "name")), nameRecall: part(sup.filter((r) => r.type === "name")),
    nameRecallSure: sureNames.expected ? sureNames.hit / sureNames.expected : 0,
    namePrecision: allNames.findings ? allNames.correct / allNames.findings : 1,
    namePrecisionSure: sureNames.findings ? sureNames.correct / sureNames.findings : 1,
    nameExpected: allNames.expected, nameHit: allNames.hit, nameFindings: allNames.findings, nameCorrect: allNames.correct,
    nameMaybeFindings: allNames.maybeFindings,
    nameMaybePrecision: allNames.maybeFindings ? allNames.maybeCorrect / allNames.maybeFindings : 1,
    negatives, negativesKept, types: Object.values(t).filter((r) => r.expected || r.falseAlarms) };
}

module.exports = { evaluate };

if (require.main === module) {
  const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "../test/corpus", f), "utf8"));
  const strip = (res) => Object.assign({}, res, { types: res.types.map(({ examples, ...r }) => r) });
  const sets = { blind: evaluate(load("nz-docs-holdout.json")), names: evaluate(load("nz-docs-names-blind.json")), main: evaluate(load("nz-docs.json")) };
  fs.writeFileSync(path.join(__dirname, "../app/accuracy.js"),
    "/* Generated by scripts/eval.js from test/corpus. Do not edit by hand. */\nwindow.NZRedactAccuracy = " +
    JSON.stringify({ version: R.version, blind: strip(sets.blind), names: strip(sets.names), main: strip(sets.main) }, null, 1) + ";\n");
  for (const [name, res] of Object.entries(sets)) {
    const structured = res.types.some((r) => r.type !== "name" && r.expected) ? ` Numbers, dates, emails, phones and addresses: ${(res.structuredRecall * 100).toFixed(1)}% found.` : "";
    console.log(`\n${name}: ${res.documents} documents.${structured} Names: ${(res.nameRecall * 100).toFixed(1)}% (${res.nameHit} of ${res.nameExpected}). ${(res.precision * 100).toFixed(1)}% of findings right. ${res.negativesKept}/${res.negatives} look-alikes left alone.`);
    const p = (x) => (x * 100).toFixed(1) + "%";
    console.log(`  Names: recall ${p(res.nameRecallSure)} sure only, ${p(res.nameRecall)} with possible names. Precision ${p(res.namePrecisionSure)} sure only, ${p(res.namePrecision)} with possible names; the possible names alone ${p(res.nameMaybePrecision)} (${res.nameMaybeFindings} findings).`);
    for (const r of res.types) console.log(`  ${r.label.padEnd(16)} expected ${String(r.expected).padStart(3)}  found ${String(r.found).padStart(3)}  missed ${String(r.missed).padStart(3)}  false ${String(r.falseAlarms).padStart(3)}`);
  }
}

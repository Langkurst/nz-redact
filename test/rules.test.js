// Tests for the detection rules. Run from the project folder:  npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/nz-redact.js");
const vectors = require("./fixtures/nz-vectors.json");

const types = (text) => P.scan(text).map((f) => f.type);
const texts = (text) => P.scan(text).map((f) => f.text);

// python-stdnum is an independent check, but Inland Revenue's current specification wins where they differ.
// Every disagreement must be one of the documented differences below; anything else fails.
const digits = (n) => String(n).replace(/\D/g, "");

test(`IRD numbers: ${vectors.ird.length} cases agree with ${vectors.source}, except the new upper range`, () => {
  const wrong = vectors.ird.filter(([n, valid]) => P.irdIsValid(n) !== valid);
  // Inland Revenue's 2026 to 2027 specification raised the upper limit from 150,000,000 to 200,000,000.
  const unexplained = wrong.filter(([n, valid]) => !(valid === false && +digits(n) > 150000000 && +digits(n) <= 200000000));
  assert.deepEqual(unexplained.slice(0, 5), [], `${unexplained.length} disagree for another reason`);
  assert.ok(vectors.ird.some(([, v]) => v) && vectors.ird.some(([, v]) => !v), "the set holds valid and invalid numbers");
});

test("IRD: Inland Revenue's own examples, and the raised upper limit", () => {
  for (const n of ["49091850", "35901981", "49098576", "136410132", "150000009"]) assert.ok(P.irdIsValid(n), n);
  for (const n of ["136410133", "9125568", "200000017"]) assert.equal(P.irdIsValid(n), false, n);
  // Open question: Inland Revenue's Example 3 calls 150000026 valid, but its written steps do not. The steps are followed.
  assert.equal(P.irdIsValid("150000026"), false);
});

// Inland Revenue's algorithms E and G add the digits of each product (so 18 counts as 9); python-stdnum uses
// the remainder after dividing by 9 (so 18 counts as 0). This is an independent implementation of the spec.
function bankSpecEG(n) {
  const w = n.slice(0, 2) === "09" ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 4, 3, 2, 0, 0, 1] : [0, 0, 0, 0, 0, 0, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1];
  const ds = (x) => Math.floor(x / 10) + (x % 10);
  const sum = [...n].reduce((s, d, i) => s + ds(ds(w[i] * +d)), 0);
  return sum % (n.slice(0, 2) === "09" ? 11 : 10) === 0;
}
const sixteen = (n) => { const p = String(n).split("-"); return p[0].padStart(2, "0") + p[1].padStart(4, "0") + p[2].slice(-7).padStart(7, "0") + p[3].slice(-3).padStart(3, "0"); };

test(`Bank accounts: ${vectors.bank.length} cases agree with ${vectors.source}, except where Inland Revenue's spec differs`, () => {
  const wrong = vectors.bank.filter(([n, valid]) => P.bankIsValid(n) !== valid);
  const unexplained = wrong.filter(([n]) => {
    const parts = String(n).split("-");
    if (["09", "26", "28", "29"].includes(parts[0])) return P.bankIsValid(n) !== bankSpecEG(sixteen(n));  // E and G
    if (parts[3] && parts[3].length === 4 && parts[3][0] === "0") return false;  // a 4-digit suffix, which Inland Revenue allows
    return true;
  });
  assert.deepEqual(unexplained.slice(0, 5), [], `${unexplained.length} disagree for another reason`);
});

test("Bank accounts: Inland Revenue's examples, the newer bank codes, and the E and G digit sums", () => {
  for (const n of ["01-902-0068389-00", "08-6523-1954512-001", "26-2600-0320871-032", "05-8884-0001004-000", "88-8800-0001008-000",
    "09-0000-0000065-001", "01-0902-0068389-0000"]) assert.ok(P.bankIsValid(n), n);
  assert.equal(P.bankIsValid("26-2600-3200096-032"), false, "a product of 18 counts as 9, not 0");
});

test("NHI: the six examples Health New Zealand publishes are valid", () => {
  for (const n of ["ZAA0067", "ZAA0075", "ZAA0083", "ACA31FM", "ASE37QK", "ARE62RS"]) assert.ok(P.nhiIsValid(n), n);
});

test("NHI: changing the check character always makes it invalid", () => {
  for (const n of ["ZAA0067", "ZAA0075", "ZAA0083"]) {
    for (let d = 0; d <= 9; d++) if (String(d) !== n[6]) assert.equal(P.nhiIsValid(n.slice(0, 6) + d), false, n.slice(0, 6) + d);
  }
  for (const n of ["ACA31FM", "ASE37QK", "ARE62RS"]) {
    for (const c of "ABCDEFGHJKLMNPQRSTUVWXYZ") if (c !== n[6]) assert.equal(P.nhiIsValid(n.slice(0, 6) + c), false, n.slice(0, 6) + c);
  }
});

test("NHI current format: a check value of 10 becomes the digit 0", () => {
  // Z=24, A=1, A=1, 0, 1, 3: 168+6+5+0+3+6 = 188; 188 mod 11 = 1; 11 - 1 = 10, written as 0.
  assert.ok(P.nhiIsValid("ZAA0130"));
  for (let d = 1; d <= 9; d++) assert.equal(P.nhiIsValid("ZAA013" + d), false);
});

test("NHI new format: a sum that divides exactly by 23 gives the check letter Y (HISO 10046:2025)", () => {
  // A,A,A,0,0,P: 7+6+5+0+0+28 = 46 = 2 x 23. The standard's own example ABK09WY is one of these.
  assert.ok(P.nhiIsValid("AAA00PY"));
  assert.ok(P.nhiIsValid("ABK09WY"));
  assert.ok(P.nhiIsValid("ZAA00PY"));
  for (const c of "ABCDEFGHJKLMNPQRSTUVWX") assert.equal(P.nhiIsValid("AAA00P" + c), false, "AAA00P" + c);
  for (const n of ["ZBN77VL", "ZZZ00AC", "ZGM93JM", "ZTK51KX", "AGA96HP", "AUU09JQ", "AXS21SG", "AJS01WR", "AGL22AT"]) assert.ok(P.nhiIsValid(n), n);
});

test("NHI: the letters I and O are never part of an NHI", () => {
  assert.equal(P.nhiIsValid("ZIA0067"), false);
  assert.equal(P.nhiIsValid("ZOA0067"), false);
});

test("cards: the Luhn check", () => {
  assert.ok(P.luhnIsValid("4111 1111 1111 1111"));
  assert.ok(!P.luhnIsValid("4111 1111 1111 1112"));
});

const SAMPLE = [
  "Hi team, can you update Sam's file before Friday?",
  "IRD 49-098-576, NHI ZAA0067, pay to 01-0902-0068389-00.",
  "Mobile 021 123 4567, home (09) 123 4567, email sam.example@example.co.nz.",
  "Driver licence AB123456. Passport LA654321. DOB: 12/03/1985.",
  "Card on file 4111 1111 1111 1111.",
].join("\n");

test("finds each kind of detail in a realistic note, once each", () => {
  const found = P.scan(SAMPLE);
  assert.deepEqual(found.map((f) => f.type), ["ird", "nhi", "bank", "phone", "phone", "email", "licence", "passport", "dob", "card"]);
  assert.deepEqual(found.map((f) => f.text), ["49-098-576", "ZAA0067", "01-0902-0068389-00", "021 123 4567", "(09) 123 4567", "sam.example@example.co.nz", "AB123456", "LA654321", "12/03/1985", "4111 1111 1111 1111"]);
  for (const f of found) assert.ok(f.why && f.label, "every finding says why");
});

test("the cleaned copy keeps the wording and removes every detail", () => {
  const found = P.scan(SAMPLE);
  const cleaned = P.clean(SAMPLE, found);
  for (const f of found) assert.ok(!cleaned.includes(f.text), `${f.text} still present`);
  assert.match(cleaned, /IRD \[IRD NUMBER\], NHI \[NHI NUMBER\], pay to \[BANK ACCOUNT\]\./);
  assert.match(cleaned, /^Hi team, can you update Sam's file before Friday\?/);
  assert.equal(P.scan(cleaned).length, 0, "nothing left to find");
});

test("phone formats people actually write", () => {
  for (const p of ["021 123 4567", "0211234567", "022-123-4567", "+64 21 123 4567", "+64 9 123 4567", "(09) 123 4567", "09 123 4567", "03-123 4567"]) {
    assert.deepEqual(types(`Call ${p} today`), ["phone"], p);
  }
});

test("numbers too long or too short for an NZ phone are not reported as phones", () => {
  for (const t of ["Ref 09 1234 56789", "Ref 021 12345", "Ref 03 123 45"]) assert.deepEqual(types(t), [], t);
});

test("where two kinds overlap, only the stronger one is reported", () => {
  // 049 098 576 is a valid IRD number and also has the shape of an Auckland landline.
  assert.deepEqual(types("IRD 049 098 576"), ["ird"]);
});

test("does not flag ordinary business text", () => {
  const ordinary = [
    "Order 4500012904 for 300 units at $1,234.50 arrived on 10/11/2026.",
    "Product code AB123456 is out of stock.",
    "Invoice INV-20418, total $2,518.50 including GST.",
    "The meeting is at 10:30 on 12 March 2026 in room 4021.",
    "Version 1.433 passed 3,000 tests.",
  ];
  for (const t of ordinary) assert.deepEqual(types(t), [], t);
});

test("an IRD number with a wrong check digit is not reported as one", () => {
  assert.ok(!types("IRD 49-098-577").includes("ird"));
});

test("a bank account is reported as a bank account, not as a phone number", () => {
  assert.deepEqual(types("Pay 01-0902-0068389-00 today"), ["bank"]);
});

test("a licence-like code needs the word licence, driver or passport nearby", () => {
  assert.deepEqual(types("Ref AB123456"), []);
  assert.deepEqual(types("DL AB123456"), ["licence"]);
  assert.deepEqual(types("passport no. LA654321"), ["passport"]);
});

test("can be limited to chosen kinds of detail", () => {
  const found = P.scan(SAMPLE, { types: ["email", "ird"] });
  assert.deepEqual(found.map((f) => f.type), ["ird", "email"]);
});

test("scanning does not change the text, and finds the same things twice", () => {
  const copy = String(SAMPLE);
  assert.deepEqual(texts(SAMPLE), texts(copy));
  assert.equal(SAMPLE, copy);
});

test("numbered placeholders: the same value always gets the same number", () => {
  const text = "IRD 49-098-576 and again 49 098 576. Mobile 021 123 4567, office (09) 123 4567, mobile 021-123-4567.";
  const r = P.redact(text, P.scan(text));
  assert.equal(r.text, "IRD [IRD_1] and again [IRD_1]. Mobile [PHONE_1], office [PHONE_2], mobile [PHONE_1].");
  assert.deepEqual(Object.keys(r.map), ["[IRD_1]", "[PHONE_1]", "[PHONE_2]"]);
});

test("putting details back: an AI reply with the placeholders gets the real details", () => {
  const r = P.redact(SAMPLE, P.scan(SAMPLE));
  const reply = "Done. I have updated the file for [IRD_1] and will email [email_1] today. Bank [BANK_ACCOUNT_1] is noted. [PHONE_9] is unknown.";
  const back = P.restore(reply, r.map);
  assert.match(back.text, /file for 49-098-576 and will email sam\.example@example\.co\.nz today\. Bank 01-0902-0068389-00/);
  assert.equal(back.restored, 3);
  assert.deepEqual(back.unknown, ["[PHONE_9]"]);
});

test("the redacted copy has nothing left to find, and restoring it gives the original back", () => {
  const r = P.redact(SAMPLE, P.scan(SAMPLE));
  assert.equal(P.scan(r.text).length, 0);
  assert.equal(P.restore(r.text, r.map).text, SAMPLE);
});

test("dates of birth in the formats people write", () => {
  const dobs = (t) => P.scan(t).filter((f) => f.type === "dob").map((f) => f.text);
  assert.deepEqual(dobs("DOB 2018-06-30"), ["2018-06-30"]);
  assert.deepEqual(dobs("D.O.B: 21st Feb 1979"), ["21st Feb 1979"]);
  assert.deepEqual(dobs("born Mar 5 1954"), ["Mar 5 1954"]);
  assert.deepEqual(dobs("His dob is 17/08/2001"), ["17/08/2001"]);
  assert.deepEqual(dobs("DOB ............. 11 / 05 / 1989"), ["11 / 05 / 1989"]);
  assert.deepEqual(dobs("birthday is 12 March"), ["12 March"]);
  assert.deepEqual(dobs("Delivered on 10/11/2026. Meeting 2026-11-10."), [], "other dates are left alone");
});

test("spreadsheet rows: the column heading says what a value is", () => {
  const got = (t) => P.scan(t).map((f) => f.type + ":" + f.text);
  assert.deepEqual(got("name,dob,mobile\nTom,05/01/1990,0211234987"), ["name:Tom", "dob:05/01/1990", "phone:0211234987"]);
  assert.deepEqual(got("Employee\tDOB\tLicence\nMark\t14/07/1976\tDF338210"), ["name:Mark", "dob:14/07/1976", "licence:DF338210"]);
  assert.deepEqual(got("Item\tDelivered\tCode\nHinge\t14/07/2026\tDF338210"), [], "columns with other headings are left alone");
});

test("bank accounts written without separators, and short branch numbers", () => {
  assert.deepEqual(P.scan("acct 030104122347472").map((f) => f.type), ["bank"]);
  assert.deepEqual(P.scan("acct 01-902-0068389-00").map((f) => f.type), ["bank"]);
  assert.deepEqual(P.scan("ref 4500012904123456"), [], "a long reference number with a bad checksum is left alone");
});

test("freephone numbers, and IRD-style groups are not phones", () => {
  assert.deepEqual(P.scan("call 0800 438 279").map((f) => f.type), ["phone"]);
  assert.deepEqual(P.scan("rejected 048-642-943 again"), []);
});

test("licence with a space and lowercase, passport with one letter", () => {
  assert.deepEqual(P.scan("licence number HM 402917").map((f) => f.text), ["HM 402917"]);
  assert.deepEqual(P.scan("driver licence ab123456").map((f) => f.text), ["ab123456"]);
  assert.deepEqual(P.scan("passport (N482019)").map((f) => f.type), ["passport"]);
});

test("street addresses, with or without suburb, city and postcode", () => {
  const addr = (t) => P.scan(t).filter((f) => f.type === "address").map((f) => f.text);
  assert.deepEqual(addr("Lives at 56 Hinemoa Street, Birkenhead, Auckland 0626 now"), ["56 Hinemoa Street, Birkenhead, Auckland 0626"]);
  assert.deepEqual(addr("unit 5/112 Great South Rd, Papatoetoe"), ["unit 5/112 Great South Rd, Papatoetoe"]);
  assert.deepEqual(addr("deliver to 7 Puriri st, Whang\u0101rei."), ["7 Puriri st, Whang\u0101rei"]);
  assert.deepEqual(addr("Order 300 units by Friday. Row 12 Aisle 4."), [], "numbers next to ordinary words are left alone");
});

test("names where the text says it is a name, and not company names", () => {
  const names = (t) => P.scan(t).filter((f) => f.type === "name").map((f) => f.text);
  assert.deepEqual(names("Patient: Eru Waaka\nDOB: 1972-10-05"), ["Eru Waaka"]);
  assert.deepEqual(names("Hi Daniel,\nthanks"), ["Daniel"]);
  assert.deepEqual(names("Thanks\nBex"), ["Bex"]);
  assert.deepEqual(names("referral to Dr Anjali Mehta today"), ["Anjali Mehta"]);
  assert.deepEqual(names("Hi team, invoice from Tidy Gardens rejected. Customer: Kowhai Builders Ltd"), []);
});

test("two-column spreadsheet rows count, but a sentence with a comma is not a heading", () => {
  const got = (t) => P.scan(t).map((f) => f.type + ":" + f.text);
  assert.deepEqual(got("name,dob\nAroha,01/02/1990\n"), ["name:Aroha", "dob:01/02/1990"]);
  assert.deepEqual(got("Name, please call back.\nThanks, Bob"), []);
});

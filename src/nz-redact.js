/*!
  NZ Redact 1.0.0. Finds New Zealand personal details in text and replaces them with numbered
  placeholders, so the text can go into an AI tool. Puts the details back into the answer afterwards.
  Plain rules: no AI, no network, no storage. MIT licence. https://github.com/Langkurst/nz-redact

  Works as a browser script (window.NZRedact) and as a CommonJS module (require("./nz-redact.js")).

  Sources for the rules:
  - IRD numbers: Inland Revenue's check-digit method (primary weights 3,2,7,6,5,4,3,2, secondary
    weights 7,4,3,2,5,2,7,6, valid range 10,000,000 to 150,000,000). Cross-checked against python-stdnum.
  - Bank accounts: the checksum algorithms Inland Revenue publishes for bank account validation
    (algorithms A, B, D, E, F, G and X). Cross-checked against python-stdnum. The branch register is not used.
  - NHI numbers: Health New Zealand's two formats, AAANNNC (mod 11 check digit) and AAANNAX
    (mod 23 check letter), tested against the examples Health New Zealand publishes.
  - Card numbers: the Luhn check.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NZRedact = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var NHI_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I and O are never used; A = 1 ... Z = 24

  // ---------- check-digit rules ----------

  function irdIsValid(raw) {
    var n = String(raw).replace(/[\s-]/g, "");
    if (!/^\d{8,9}$/.test(n)) return false;
    var value = parseInt(n, 10);
    // Inland Revenue's 2026 to 2027 specification: valid numbers run from 10,000,000 to 200,000,000.
    if (value < 10000000 || value > 200000000) return false;
    var body = n.slice(0, -1);
    while (body.length < 8) body = "0" + body;
    var primary = [3, 2, 7, 6, 5, 4, 3, 2], secondary = [7, 4, 3, 2, 5, 2, 7, 6];
    function check(weights) {
      var sum = 0;
      for (var i = 0; i < 8; i++) sum += weights[i] * Number(body[i]);
      return ((-sum % 11) + 11) % 11;
    }
    var c = check(primary);
    if (c === 10) c = check(secondary);
    return c !== 10 && String(c) === n[n.length - 1];
  }

  function nhiValue(ch) {
    if (/\d/.test(ch)) return Number(ch);
    return NHI_LETTERS.indexOf(ch) + 1;
  }
  function nhiIsValid(raw) {
    var s = String(raw).toUpperCase();
    var current = /^[A-HJ-NP-Z]{3}\d{4}$/.test(s);
    var expanded = /^[A-HJ-NP-Z]{3}\d{2}[A-HJ-NP-Z]{2}$/.test(s);
    if (!current && !expanded) return false;
    var sum = 0;
    for (var i = 0; i < 6; i++) sum += nhiValue(s[i]) * (7 - i);
    if (current) {
      var m = sum % 11;
      if (m === 0) return false;
      var digit = 11 - m;
      if (digit === 10) digit = 0;
      return String(digit) === s[6];
    }
    // New format (HISO 10046:2025): the check letter is at position 23 minus (sum mod 23), counting
    // A = 1. A remainder of 0 gives position 23, which is Y. Example from the standard: ABK09WY.
    var r = sum % 23;
    return NHI_LETTERS[23 - r - 1] === s[6];
  }

  var BANK_ALGORITHM = {
    "01": "A", "02": "A", "03": "A", "04": "A", "06": "A", "08": "D", "09": "E", "10": "A", "11": "A",
    "12": "A", "13": "A", "14": "A", "15": "A", "16": "A", "17": "A", "18": "A", "19": "A", "20": "A",
    "21": "A", "22": "A", "23": "A", "24": "A", "25": "F", "26": "G", "27": "A", "28": "G", "29": "G",
    "30": "A", "31": "X", "33": "F", "35": "A", "38": "A", "05": "A", "88": "A"
  };
  var BANK_WEIGHTS = {
    A: [0, 0, 6, 3, 7, 9, 0, 10, 5, 8, 4, 2, 1, 0, 0, 0],
    B: [0, 0, 0, 0, 0, 0, 0, 10, 5, 8, 4, 2, 1, 0, 0, 0],
    D: [0, 0, 0, 0, 0, 0, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0],
    E: [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 4, 3, 2, 0, 0, 1],
    F: [0, 0, 0, 0, 0, 0, 1, 7, 3, 1, 7, 3, 1, 0, 0, 0],
    G: [0, 0, 0, 0, 0, 0, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1],
    X: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };
  var BANK_MODULI = { A: [11, 11], B: [11, 11], D: [11, 11], E: [9, 11], F: [10, 10], G: [9, 10], X: [1, 1] };

  function bankCompact(raw) {
    var parts = String(raw).trim().replace(/ /g, "-").split("-").filter(function (p) { return p !== ""; });
    var pad = function (s, n) { while (s.length < n) s = "0" + s; return s; };
    // Inland Revenue allows up to 8 digits for the account base and 4 for the suffix. A leading zero in
    // either is dropped to fit the 16-digit layout the checksum weights use.
    var trim = function (s, n) { return s.length > n && /^0+$/.test(s.slice(0, s.length - n)) ? s.slice(s.length - n) : s; };
    if (parts.length === 4) return pad(parts[0], 2) + pad(parts[1], 4) + pad(trim(parts[2], 7), 7) + pad(trim(parts[3], 3), 3);
    var joined = parts.join("");
    return joined.slice(0, 13) + pad(joined.slice(13), 3);
  }
  function bankIsValid(raw) {
    var n = bankCompact(raw);
    if (!/^\d{16}$/.test(n)) return false;
    var algorithm = BANK_ALGORITHM[n.slice(0, 2)];
    if (!algorithm) return false;                       // unknown bank code
    if (algorithm === "A" && n.slice(6, 13) >= "0990000") algorithm = "B";
    var w = BANK_WEIGHTS[algorithm], mod = BANK_MODULI[algorithm], sum = 0;
    for (var i = 0; i < 16; i++) {
      var c = w[i] * Number(n[i]);
      // Algorithms E and G add the two digits of each product, and again if needed (so 18 counts as 9).
      if (algorithm === "E" || algorithm === "G") { c = Math.floor(c / 10) + (c % 10); c = Math.floor(c / 10) + (c % 10); }
      sum += c;
    }
    return sum % mod[1] === 0;
  }

  function luhnIsValid(raw) {
    var d = String(raw).replace(/[\s-]/g, "");
    if (!/^\d{13,19}$/.test(d)) return false;
    var sum = 0;
    for (var i = 0; i < d.length; i++) {
      var x = Number(d[d.length - 1 - i]);
      if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; }
      sum += x;
    }
    return sum % 10 === 0;
  }

  // ---------- detectors ----------
  // Each returns matches {type, start, end, text, why}. Higher priority wins where matches overlap.

  var TYPES = {
    ird: { label: "IRD number", tag: "[IRD NUMBER]", token: "IRD", group: "id", priority: 9 },
    bank: { label: "Bank account", tag: "[BANK ACCOUNT]", token: "BANK_ACCOUNT", group: "money", priority: 9 },
    nhi: { label: "NHI number", tag: "[NHI NUMBER]", token: "NHI", group: "id", priority: 9 },
    card: { label: "Card number", tag: "[CARD NUMBER]", token: "CARD", group: "money", priority: 8 },
    licence: { label: "Driver licence", tag: "[DRIVER LICENCE]", token: "DRIVER_LICENCE", group: "id", priority: 7 },
    passport: { label: "Passport number", tag: "[PASSPORT NUMBER]", token: "PASSPORT", group: "id", priority: 7 },
    dob: { label: "Date of birth", tag: "[DATE OF BIRTH]", token: "DATE_OF_BIRTH", group: "contact", priority: 6 },
    email: { label: "Email address", tag: "[EMAIL]", token: "EMAIL", group: "contact", priority: 5 },
    phone: { label: "Phone number", tag: "[PHONE]", token: "PHONE", group: "contact", priority: 4 },
    address: { label: "Street address", tag: "[ADDRESS]", token: "ADDRESS", group: "people", priority: 6 },
    name: { label: "Name", tag: "[NAME]", token: "NAME", group: "people", priority: 3 }
  };
  var GROUPS = { id: "Identity numbers", money: "Money", contact: "Contact details", people: "Names and addresses" };

  function each(re, text, fn) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(text))) {
      fn(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  var MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  var DATE = [
    "\\d{1,2} ?[\\/.\\-] ?\\d{1,2} ?[\\/.\\-] ?\\d{2,4}",                   // 12/03/1985, 9/9/85, 11 / 05 / 1989
    "\\d{4}-\\d{1,2}-\\d{1,2}",                                           // 1985-03-12
    "\\d{1,2}(?:st|nd|rd|th)? (?:of )?" + MONTH + "(?:,? \\d{4})?",       // 21st Feb 1979, 12 March
    MONTH + " \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}"                           // Mar 5 1954, March 12, 1985
  ].join("|");
  var DATE_ONLY = new RegExp("^(?:" + DATE + ")$", "i");
  // Words for people's names: a capital letter, then letters (macrons, hyphens and apostrophes allowed).
  var WORD = "[A-Z\u0100\u0112\u012A\u014C\u016A][A-Za-z\u0101\u0113\u012B\u014D\u016B\u0100\u0112\u012A\u014C\u016A'\u2019-]+";
  var INITIAL = "[A-Z]\\.";
  var PERSON = "(?:(?:" + WORD + "|" + INITIAL + ") ){0,3}" + WORD;
  var NOT_NAMES = /^(team|all|everyone|there|folks|guys|both|you|again|thanks|thank|cheers|regards|hello|hi|kia|ora|morning|afternoon|evening|sir|madam|admin|accounts|payroll|support|customer|client|staff|the|a|an|re|fw|fwd|yes|no|ok|okay|please|team's)$/i;
  var BUSINESS = /\b(ltd|limited|inc|group|co|company|holdings|trust|builders|building|electrical|plumbing|dental|medical|gardens|outdoors|services|solutions|supplies|imports|fittings|hardware|construction|motors|cafe|store|shop|bank|council|ministry|school|college|university|hospital|clinic|pharmacy|xero|myob|google|microsoft)\b/i;
  var STREET = "(?:street|st|road|rd|avenue|ave|place|pl|lane|ln|drive|dr|crescent|cres|terrace|tce|way|close|court|ct|grove|parade|highway|hwy|quay|rise|square|mews|esplanade|boulevard|glade|heights|track|row)";
  function columnType(cell) {
    var c = cell.trim().toLowerCase().replace(/[_\s.]+/g, " ");
    if (/^(name|full name|first name|first names|last name|surname|employee|employee name|student|student name|parent|caregiver|guardian|contact|contact name|customer|client|patient|tenant)$/.test(c)) return "name";
    if (/^(address|home address|street address|postal address)$/.test(c)) return "address";
    if (/^(dob|d o b|date of birth|birth ?date|born)$/.test(c)) return "dob";
    if (/licen[cs]e/.test(c)) return "licence";
    if (/passport/.test(c)) return "passport";
    return null;
  }
  function before(text, index, size) { return text.slice(Math.max(0, index - size), index).toLowerCase(); }

  var DETECTORS = [
    function ird(text, out) {
      each(/(?<![\w-])(\d{2,3}[\s-]?\d{3}[\s-]?\d{3})(?![\w-])/g, text, function (m) {
        if (irdIsValid(m[1])) out.push({ type: "ird", start: m.index, end: m.index + m[1].length, text: m[1], why: "8 or 9 digits, with a valid IRD check digit" });
      });
    },
    function bank(text, out) {
      var why = "bank, branch, account and suffix, with a valid bank checksum";
      each(/(?<![\w-])(\d{2}[- ]\d{3,4}[- ]\d{7,8}[- ]\d{2,4})(?![\w-])/g, text, function (m) {
        if (bankIsValid(m[1])) out.push({ type: "bank", start: m.index, end: m.index + m[1].length, text: m[1], why: why });
      });
      // Written without separators: 15 or 16 digits. Only a known bank code with a valid checksum counts.
      each(/(?<![\w-])(\d{15,16})(?![\w-])/g, text, function (m) {
        if (bankIsValid(m[1])) out.push({ type: "bank", start: m.index, end: m.index + m[1].length, text: m[1], why: why });
      });
    },
    function nhi(text, out) {
      each(/(?<![A-Za-z0-9])([A-HJ-NP-Z]{3}\d{4}|[A-HJ-NP-Z]{3}\d{2}[A-HJ-NP-Z]{2})(?![A-Za-z0-9])/g, text, function (m) {
        if (nhiIsValid(m[1])) out.push({ type: "nhi", start: m.index, end: m.index + m[1].length, text: m[1], why: "NHI format, with a valid check character" });
      });
    },
    function card(text, out) {
      each(/(?<![\d-])((?:\d[ -]?){12,18}\d)(?![\d-])/g, text, function (m) {
        var d = m[1].replace(/[ -]/g, "");
        if (/^(4|5[1-5]|2[2-7]|3[47]|6)/.test(d) && luhnIsValid(d)) out.push({ type: "card", start: m.index, end: m.index + m[1].length, text: m[1], why: "13 to 19 digits that pass the card (Luhn) check" });
      });
    },
    function licenceOrPassport(text, out) {
      // Licence: 2 letters and 6 digits. Passport: 1 or 2 letters and 6 or 7 digits. Either only next to its word.
      each(/(?<![A-Za-z0-9])([A-Za-z]{1,2} ?\d{6,7})(?![A-Za-z0-9])/g, text, function (m) {
        var v = m[1], near = before(text, m.index, 48);
        var lic = /^[A-Za-z]{2} ?\d{6}$/.test(v), pass = /^[A-Za-z]{1,2}\d{6,7}$/.test(v);
        if (pass && /passport/.test(near)) out.push({ type: "passport", start: m.index, end: m.index + v.length, text: v, why: "letters and digits after the word passport" });
        else if (lic && /licen[cs]e|driver|\bdl\b/.test(near)) out.push({ type: "licence", start: m.index, end: m.index + v.length, text: v, why: "2 letters and 6 digits after the word licence or driver" });
      });
    },
    function tableColumns(text, out) {
      // Spreadsheet rows pasted as text: a header row names the column, so a date under "DOB" is a date of birth.
      var lines = text.split("\n"), offset = 0, header = null, sep = null;
      lines.forEach(function (line) {
        var d = line.indexOf("\t") !== -1 ? "\t" : (line.indexOf(",") !== -1 ? "," : null);
        var cells = d ? line.split(d) : [];
        var named = cells.map(columnType);
        // A heading row: at least one known column, and every cell short, like a spreadsheet heading (not a sentence).
        var heading = d && named.some(Boolean) && cells.every(function (c) { return !/\d{3}/.test(c) && /^[\w .()#\/-]{0,30}$/.test(c.trim()) && c.trim().split(" ").length <= 4; });
        if (heading) { header = named; sep = d; }
        else if (header && d === sep && cells.length === header.length) {
          var at = offset;
          cells.forEach(function (cell, i) {
            var v = cell.trim(), start = at + cell.indexOf(v), kind = header[i];
            if (kind === "dob" && DATE_ONLY.test(v)) out.push({ type: "dob", start: start, end: start + v.length, text: v, why: "a date in a date of birth column" });
            if (kind === "licence" && /^[A-Za-z]{2} ?\d{6}$/.test(v)) out.push({ type: "licence", start: start, end: start + v.length, text: v, why: "2 letters and 6 digits in a licence column" });
            if (kind === "passport" && /^[A-Za-z]{1,2}\d{6,7}$/.test(v)) out.push({ type: "passport", start: start, end: start + v.length, text: v, why: "letters and digits in a passport column" });
            if (kind === "name" && new RegExp("^" + PERSON + "$").test(v) && !NOT_NAMES.test(v.split(" ")[0]) && !BUSINESS.test(v)) out.push({ type: "name", start: start, end: start + v.length, text: v, why: "a value in a name column" });
            if (kind === "address" && /\d/.test(v) && /[A-Za-z]{3}/.test(v)) out.push({ type: "address", start: start, end: start + v.length, text: v, why: "a value in an address column" });
            at += cell.length + 1;
          });
        } else if (!d) header = null;
        offset += line.length + 1;
      });
    },
    function dob(text, out) {
      // A date shortly after DOB, date of birth, born or birthday, in any common format.
      var re = new RegExp("(?:\\bdob\\b|\\bd\\.o\\.b\\b\\.?|date of birth|\\bborn\\b|birth ?date|birthday|b'?day)[^\\n\\d]{0,24}?(" + DATE + ")", "gi");
      each(re, text, function (m) {
        var start = m.index + m[0].length - m[1].length;
        out.push({ type: "dob", start: start, end: start + m[1].length, text: m[1], why: "a date after DOB, date of birth or born" });
      });
    },
    function address(text, out) {
      // NZ street address: optional flat or unit, a number, 1 to 3 words, a street type, then up to three
      // place names separated by commas (a line break is allowed after a comma), and an optional postcode.
      var re = new RegExp("(?<![\\w/])((?:(?:flat|unit|apt) ?\\d+[a-z]?(?:,? ?|\\/)|\\d+[a-z]?\\/)?\\d{1,5}[a-z]?,? (?:" + WORD + " ){0,2}" + WORD + " " + STREET +
        "\\b\\.?(?:,[ \\n]?" + WORD + "(?: " + WORD + "){0,2}(?: \\d{4})?){0,3}(?: \\d{4})?)", "gi");
      each(re, text, function (m) {
        var v = m[1].replace(/[,.\s]+$/, "");
        out.push({ type: "address", start: m.index, end: m.index + v.length, text: v, why: "a number, a street name and a street type" });
      });
    },
    function name(text, out) {
      function add(m, v, why) {
        var words = v.split(" ");
        while (words.length && NOT_NAMES.test(words[words.length - 1].replace(/[.,]$/, ""))) words.pop();
        if (!words.length || NOT_NAMES.test(words[0])) return;
        v = words.join(" ");
        if (BUSINESS.test(v)) return;                                   // a company, not a person
        if (words.length === 1 && /^[A-Z]{2,4}$/.test(v)) return;        // short capitals are usually codes
        var start = m.index + m[0].lastIndexOf(v);
        if (start >= m.index) out.push({ type: "name", start: start, end: start + v.length, text: v, why: why });
      }
      // After a label such as Name:, Patient: or Employee:, including dotted form layouts.
      each(new RegExp("\\b(?:full name|first names?|surname|last name|name|employee|patient|pt|student|customer|caller|contact|referee|applicant|tenant|client|parent|guardian|caregiver|driver|staff member|new starter)\\b[ \\t]*(?::|\\.{2,}|-)?[ \\t]*(" + PERSON + ")", "g"), text, function (m) {
        add(m, m[1], "a name after a label such as Name or Patient");
      });
      each(new RegExp("\\b(?:Name|Full name|Employee|Patient|Student|Customer|Caller|Contact|Referee|Applicant|Tenant|Client|From)\\b[ \\t]*(?::|\\.{2,})[ \\t]*(" + PERSON + ")", "g"), text, function (m) {
        add(m, m[1], "a name after a label such as Name or Patient");
      });
      // Titles and phrases: Dr Anjali Mehta, Ms Huang, my son Callum Price, my name's Corey Banks.
      each(new RegExp("\\b(?:Dr|Mr|Mrs|Ms|Miss|Mx)\\.? (" + PERSON + ")", "g"), text, function (m) { add(m, m[1], "a name after a title such as Dr or Ms"); });
      each(new RegExp("\\b(?:my (?:name is|name's|son|daughter|partner|wife|husband|mum|dad|child)|this is|it's|its) (" + PERSON + ")", "gi"), text, function (m) {
        if (/^[A-Z\u0100-\u016B]/.test(m[1])) add(m, m[1], "a name after words such as my name is");
      });
      // Greetings at the start of a line, and sign-offs on the line after.
      each(new RegExp("(?:^|\\n)[ \\t]*(?:hi|hey|hello|dear|kia ora|morena|tēnā koe)[ ,]+(" + PERSON + ")", "gi"), text, function (m) {
        if (/^[A-Z\u0100-\u016B]/.test(m[1])) add(m, m[1], "a name in a greeting");
      });
      each(new RegExp("(?:^|\\n)[ \\t]*(?:cheers|thanks|thank you|regards|kind regards|ngā mihi|nga mihi|many thanks|best),?[ \\t]*\\n[ \\t]*(" + PERSON + ")[ \\t]*(?=\\n|$)", "gi"), text, function (m) {
        add(m, m[1], "a name signing off a message");
      });
    },
    function email(text, out) {
      each(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, text, function (m) {
        out.push({ type: "email", start: m.index, end: m.index + m[0].length, text: m[0], why: "an email address" });
      });
    },
    function phone(text, out) {
      // NZ mobiles (02x), landlines (03 to 09) and the +64 forms, with spaces, dashes or brackets.
      each(/(?<![\w+])((?:\+64|0064)[\s-]?\(?0?([2-9])\)?|\(?0([2-9])\)?)[\s-]?(\d[\d\s-]{5,10}\d)(?![\w-])/g, text, function (m) {
        var area = m[2] || m[3];
        var rest = m[4].replace(/[\s-]/g, "");
        var ok = area === "2" ? /^\d{7,9}$/.test(rest) : /^\d{7}$/.test(rest);
        if (/^\d{3}-\d{3}-\d{3}$/.test(m[0])) ok = false;  // 3-3-3 grouping is how IRD numbers are written, not phones
        if (/^0(800|900|508)/.test(m[0].replace(/[\s()-]/g, ""))) ok = false;  // freephone numbers, handled below
        if (ok) out.push({ type: "phone", start: m.index, end: m.index + m[0].length, text: m[0], why: area === "2" ? "an NZ mobile number" : "an NZ landline number" });
      });
      each(/(?<![\w+])((?:0800|0508|0900)[\s-]?\d{3}[\s-]?\d{3,4})(?![\w-])/g, text, function (m) {
        out.push({ type: "phone", start: m.index, end: m.index + m[1].length, text: m[1], why: "an NZ 0800, 0508 or 0900 number" });
      });
    }
  ];

  // Keep the strongest match where two overlap: higher priority first, then the longer match.
  function resolve(found) {
    found.sort(function (a, b) {
      return (TYPES[b.type].priority - TYPES[a.type].priority) || ((b.end - b.start) - (a.end - a.start)) || (a.start - b.start);
    });
    var kept = [];
    found.forEach(function (f) {
      var clash = kept.some(function (k) { return f.start < k.end && k.start < f.end; });
      if (!clash) kept.push(f);
    });
    return kept.sort(function (a, b) { return a.start - b.start; });
  }

  /* scan(text, {types}) -> findings. types: list of type keys to look for (default: all). */
  function scan(text, options) {
    var wanted = (options && options.types) || Object.keys(TYPES);
    var found = [];
    DETECTORS.forEach(function (detect) { detect(String(text), found); });
    return resolve(found.filter(function (f) { return wanted.indexOf(f.type) !== -1; })).map(function (f) {
      f.label = TYPES[f.type].label;
      return f;
    });
  }

  /* clean(text, findings) -> the text with each finding replaced by its tag. */
  function clean(text, findings) {
    var out = "", at = 0;
    findings.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (f) {
      out += text.slice(at, f.start) + TYPES[f.type].tag;
      at = f.end;
    });
    return out + text.slice(at);
  }


  function sameValue(f) { return f.type + ":" + f.text.replace(/[\s\-()]/g, "").toLowerCase(); }

  /* redact(text, findings) -> {text, map, items}
     Each detail becomes a numbered placeholder such as [IRD_1]. The same value always gets the same
     placeholder, so an AI's answer still makes sense and the details can be put back afterwards. */
  function redact(text, findings) {
    var counters = {}, byValue = {}, map = {}, out = "", at = 0;
    var items = findings.slice().sort(function (a, b) { return a.start - b.start; }).map(function (f) {
      var key = sameValue(f);
      if (!byValue[key]) {
        var t = TYPES[f.type].token;
        counters[t] = (counters[t] || 0) + 1;
        byValue[key] = "[" + t + "_" + counters[t] + "]";
        map[byValue[key]] = f.text;
      }
      return Object.assign({}, f, { token: byValue[key] });
    });
    items.forEach(function (f) { out += text.slice(at, f.start) + f.token; at = f.end; });
    return { text: out + text.slice(at), map: map, items: items };
  }

  /* restore(text, map) -> {text, restored, unknown}
     Puts the original details back into text that contains the placeholders, such as an AI's reply. */
  function restore(text, map) {
    var restored = 0, unknown = [];
    var out = String(text).replace(/\[\s*([A-Za-z_]+_\d+)\s*\]/g, function (whole, inner) {
      var token = "[" + inner.toUpperCase() + "]";
      if (Object.prototype.hasOwnProperty.call(map, token)) { restored++; return map[token]; }
      unknown.push(whole);
      return whole;
    });
    return { text: out, restored: restored, unknown: unknown };
  }

  return {
    version: "1.0.0",
    TYPES: TYPES,
    irdIsValid: irdIsValid,
    nhiIsValid: nhiIsValid,
    bankIsValid: bankIsValid,
    luhnIsValid: luhnIsValid,
    scan: scan,
    clean: clean,
    redact: redact,
    restore: restore,
    GROUPS: GROUPS
  };
});

/*!
  NZ Redact 1.1.0. Finds New Zealand personal details in text and replaces them with numbered
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
    name: { label: "Name", tag: "[NAME]", token: "NAME", group: "people", priority: 3 },
    // Text the person chose to remove themselves. The rules never find it; scan() adds it when asked.
    added: { label: "Added by you", tag: "[REMOVED]", token: "REMOVED", group: "added", priority: 10 }
  };
  var GROUPS = { id: "Identity numbers", money: "Money", contact: "Contact details", people: "Names and addresses", added: "Added by you" };

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

  // ---------- possible names (the lower-confidence tier) ----------
  // A list of given names common in New Zealand, written from general knowledge of who lives here: English
  // and European, Maori, Samoan, Tongan and other Pacific, Chinese, Indian, Korean, Filipino and others.
  // Stored without macrons and in lower case; the lookup does the same to the text.
  var FIRST_NAMES = (
    "james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander patrick frank raymond jack dennis jerry tyler aaron adam nathan henry peter zachary douglas harold kyle walter ethan jeremy carl keith roger gerald christian terry sean arthur austin noah lawrence jesse joe bryan billy bruce albert gabriel logan alan wayne roy ralph randy eugene vincent russell elijah louis bobby philip johnny " +
    "mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret sandra ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca sharon laura cynthia kathleen amy angela shirley anna brenda pamela emma nicole helen samantha katherine christine debra rachel carolyn janet catherine maria heather diane ruth julie olivia joyce virginia kelly lauren christina joan evelyn judith megan andrea cheryl hannah jacqueline martha gloria teresa ann sara madison frances kathryn janice jean abigail alice judy sophia grace denise amber doris marilyn danielle beverly isabella theresa diana natalie brittany charlotte marie kayla alexis lori " +
    "jane anne sam bex ben tim tom jo jen kate katie liz beth jess steph nic nick chris matt dan dave mike pete rob andy tony hamish angus fraser callum ewan lachlan murray graeme grant glen trevor kerry shane craig darren brent rhys bryce kirsty kirsten tracey tracy sheryl raewyn lynette lyn lynley bronwyn robyn jocelyn sue wendy gail glenys maureen noeline noelene colleen dianne leanne jenny jenna kylie nikki tania tanya tammy vicki vikki belinda melanie naomi georgia holly isla mia ella ava chloe zoe harper lucy lily ruby sophie amelia evie millie poppy matilda tessa hayley jemma jade freya imogen indi piper stella willow maddison paige shelley sonia stacey toni trish vanessa yvonne zara " +
    "oliver leo lucas liam hunter finn jayden mason cooper archie hugo oscar felix max theo harry charlie freddie toby jake josh luke cameron connor blake dylan jordan riley hayden mitchell brad brett clint curtis dean doug gavin gordon ian ivan jeff jim jimmy kurt lloyd neil nigel norman owen phil ray rex rod ross rupert simon stuart ted vaughan warren wesley alistair bernard clive colin dwayne errol gareth garth graham greg howard ken kieran leon malcolm marcus martin maurice melvin miles noel oliver pat dennis ronnie rusty seth spencer stan todd tristan victor wade xavier " +
    "aroha hemi rangi wiremu tane hine kahu nikau mere hone rawiri tipene ngaire hana hinemoa huia ihaka kiri mahina maia manaia manu matiu maui miriama moana ngaio nikora paora pita rahera rangimarie rewi riki rina ripeka tamati tamihana tamara tawhiri tiaki tiana timoti wikitoria hirini ihipera kahurangi anaru hoani heeni rihari pare aroha atawhai awhina eruera hohepa hoana irihapeti kaea kereama mihaere mereana meri ngahuia parekura poihipi rawinia reremoana rihi rongo tahu taika tama tamahou tomairangi tuhoe wairua waimarie whetu wi " +
    "sione losa tasi ioane tevita siosaia mele lupe malia leilani sefa pele talia vaea lagi sina fiona filipo alofa tomasi semisi viliami saia sitiveni lesieli seini litia mosese soane taniela folau ofa tupou aleki leota alesana tusi lili vaiola maka petelo tavita iosefa ruta epeli apisai josefa seru sera mereani losana vilimaina fetu faleolo masina mafi toa fia lemalu fuimaono tofilau ioana setu sefo mataio sifa tuala ana vili manase pita soifua " +
    "wei ming jing hui yan xin lei hong mei ling hua fang xiao lin tao jie yong ying yang jian wen kai hao jia xue ping qing rui ting zhen mingyu xiaoming jiahui weiwei yuki hiro kenji akira takeshi haruto yuna sakura mika " +
    "arjun priya raj rahul amit anil sunil vijay sanjay rohan rohit vikram ravi ramesh suresh mahesh deepak ashok rajesh manoj nikhil nitin pooja neha anjali sunita anita kavita sangeeta meera geeta sita lakshmi divya shreya ananya aditya aarav vivek varun kunal gaurav harpreet gurpreet manpreet jaspreet simran navneet jasdeep amandeep balwinder paramjit harjit gurdeep kuljit sukhdev ranjit tejinder mandeep rajinder parminder kiran asha usha rekha seema shweta swati mohan krishna ganesh hari dinesh mukesh naveen prakash satish venkat srinivas vishal yash farhan imran ahmed ali omar mohammed muhammad hassan hussein fatima ayesha aisha zainab khalid tariq bilal yusuf ibrahim sana nadia layla samira " +
    "minjun jiwoo seung hyun jin soo eun joon jisoo junho sungmin jiyeon hyejin haeun seoyeon taehyung dongwoo " +
    "jose juan rosa carlos miguel luis pedro ramon ricardo eduardo mariel jasmine angelica kristine josephine rowena divina lorna imelda corazon cristina jericho jeremiah " +
    "pieter johan hendrik willem marek piotr tomasz krzysztof olga natasha dmitri sergei vladimir pavel mateusz luca marco matteo giovanni paolo sofia giulia francesca hans klaus stefan lars erik anders ingrid astrid pierre claire amelie camille mathieu antoine jorge pablo diego javier alejandro carmen lucia isabel ahmad mehmet ayse nikolai elena katarina tatiana yuri boris gregor andrzej magda " +
    // Words that are also names. They only count with a surname after them, or in a phrase such as "spoke to".
    "will may bill hope rose summer june april august faith joy don jan dawn ivy iris daisy violet sky rich sandy chase bob art coral crystal pearl olive penny cliff christian"
  ).split(/\s+/);
  var AMBIGUOUS = "will may bill hope rose summer june april august faith joy grace frank mark pat don jan dawn ivy iris daisy violet amber jade sky rich sandy chase bob art coral crystal pearl olive penny cliff christian hunter mason ray dean earl holly ruby lily poppy willow stella piper max miles noel sue rex rod rusty seth wade major".split(" ");

  // Words that are never part of a possible name: places, months, days, Maori words common in NZ English,
  // organisations, and everyday words that start a sentence or name a role.
  var STOP_WORDS = (
    // places: cities, towns, regions, and Auckland, Wellington and Christchurch suburbs
    "auckland wellington christchurch hamilton tauranga dunedin napier hastings palmerston north south east west central nelson rotorua whangarei invercargill whanganui wanganui gisborne new plymouth timaru masterton levin taupo queenstown blenheim oamaru greymouth westport hokitika kaitaia kerikeri paihia whitianga thames tairua coromandel waihi paeroa matamata morrinsville cambridge awamutu otorohanga taumarunui tokoroa putaruru whakatane opotiki kawerau wairoa dannevirke woodville pahiatua feilding marton bulls otaki paraparaumu waikanae porirua upper lower hutt petone lyttelton kaikoura hanmer ashburton rangiora kaiapoi rolleston lincoln methven geraldine twizel wanaka cromwell alexandra arrowtown gore balclutha mosgiel stewart island bluff riverton anau milford franz josef fox glacier akaroa waiheke great barrier kapiti wairarapa northland waikato taranaki manawatu horowhenua otago southland canterbury marlborough tasman westland bay plenty coast cape reinga zealand australia sydney melbourne brisbane perth adelaide canberra fiji samoa tonga india china korea japan england scotland wales ireland london " +
    "ponsonby parnell remuera epsom eden newmarket grey lynn mount albert roskill onehunga ellerslie penrose otahuhu papatoetoe manukau manurewa papakura takanini pukekohe botany howick pakuranga panmure innes mission kohimarama orakei glendowie heliers birkenhead takapuna devonport northcote glenfield albany browns orewa whangaparaoa silverdale henderson titirangi avondale blockhouse point chevalier herne freemans grafton kingsland sandringham mangere otara flat ranui massey westgate hobsonville kumeu helensville warkworth wellsford waiuku " +
    "kelburn karori newtown kilbirnie miramar lyall johnsonville tawa khandallah ngaio brooklyn thorndon aro victoria cuba courtenay oriental seatoun eastbourne naenae taita wainuiomata stokes valley avalon silverstream trentham " +
    "riccarton fendalton merivale papanui sydenham addington linwood sumner brighton halswell hornby burnside ilam albans spreydon cashmere opawa woolston " +
    // months and days
    "january february march jun jul aug sep sept oct nov dec jan feb mar apr monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun " +
    // Maori words common in New Zealand English
    "matariki aotearoa whanau kia ora kaitiaki hui marae mihi tangi iwi hapu korero koha pakeha kai mahi haka waka ako tamariki rangatahi tena koe nga haere mai kaha pai te reo maori whare taonga whenua awa maunga wai whatu kapa kohanga ka " +
    // organisations
    "ird acc kiwibank anz asb bnz westpac countdown woolworths pak'nsave paknsave spark one nz vodafone 2degrees skinny bp mobil warehouse bunnings mitre10 fonterra xero myob google microsoft amazon apple facebook instagram zoom teams slack gmail outlook winz msd work income health police customs immigration ministry education housing plunket starship kiwisaver kiwirail studylink westfield aa nzta mpi ird's acc's ird acc inland revenue hnz pharmac bupa ryman " +
    // everyday words that start sentences or name roles
    "the this that these those there then thank thanks please can could would should is are was were has have had do does did i we you he she it they my our your his her their and but or so if when while where what who why how as at in on of to for from by with not no yes ok hi hello dear cheers regards kind best sent subject cc date re fw fwd note notes ref order item total amount invoice payment refund tax account accounts bank phone mobile email address name customer client patient student staff manager team office home work school hospital clinic pharmacy council department reception payroll support admin sales service services meeting appointment visit call mum dad nana koro aunty uncle sir madam mr mrs ms miss dr mx all everyone folks guys both again morning afternoon evening landlord tenant parent teacher doctor nurse supplier boss director owner member members applicant applicants referee contact caller employee employer family friend friends some any each every other another here now today tomorrow yesterday also just only still very much more most many few little last next first second third final urgent update reminder hey kia sorry attached see let ring text emailed rang called wants asked said says tel ph mob dob nhi ird tax code form claim policy quote rate rates year years week weeks day days hour hours minutes time times on-site site store shop cafe street road avenue place lane drive crescent terrace way close court grove parade highway quay rise square mews esplanade boulevard glade heights track row st rd ave pl ln dr cres tce hwy ct apt unit flat " +
    "details information section figure table appendix page chapter below above attached commissioner minister mayor prime president chair chairperson chairman spokesperson judge officer constable sergeant inspector principal coach captain government company committee board court tribunal union authority agency provider centre center group branch head headquarters hq iwi trust department division unit sector industry customer customers clients users people person someone anyone nobody everybody somebody management finance legal compliance security operations marketing technology digital data system systems project projects programme program plan plans report reports budget budgets contract contracts lease leases mt lake port fort saint"
  ).split(/\s+/);
  var STOP = Object.create(null), FIRST = Object.create(null), AMB = Object.create(null);
  STOP_WORDS.forEach(function (w) { STOP[w] = true; });
  FIRST_NAMES.forEach(function (w) { FIRST[w] = true; });
  AMBIGUOUS.forEach(function (w) { AMB[w] = true; FIRST[w] = true; });

  var LETTER = "A-Za-zÀ-ɏ";
  var STRONG_BEFORE = ["spoke to", "talked to", "talk to", "spoken to", "speak to", "ask", "asked", "tell", "told", "cc", "cc'd", "called", "call", "rang", "ring", "emailed", "texted", "messaged", "met", "thanks", "thank you", "thanks to", "ping", "pass to", "give to", "send to", "sent to", "forward to"];
  var WEAK_BEFORE = ["with", "for", "from", "by", "behalf of", "regarding"];
  var SPEECH_AFTER = ["said", "says", "rang", "called", "emailed", "asked", "wants", "texted", "replied", "mentioned", "confirmed", "messaged", "told", "wrote", "reckons"];
  var VERB_AFTER = SPEECH_AFTER.concat(["is", "has", "was", "will", "can", "would", "could", "works", "started", "starts", "left", "sent", "rings", "calls", "emails", "thinks", "lives", "arrives", "arrived"]);
  var STREET_WORDS = new RegExp("^" + STREET + "$", "i");
  var CAP_START = /^[A-ZÀ-ÞĀ-ſ]/;

  function lookup(w) {
    return w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function tokenise(text) {
    var toks = [], re = new RegExp("[" + LETTER + "]+(?:['’-][" + LETTER + "]+)*", "g"), m;
    while ((m = re.exec(text))) {
      var w = m[0], end = m.index + w.length;
      var poss = /^(.{2,}?)['’]s$/i.exec(w);                      // Sam's gives Sam
      if (poss) { w = poss[1]; end = m.index + w.length; }
      toks.push({
        w: w, s: m.index, e: end, key: lookup(w),
        cap: CAP_START.test(w),
        mixed: CAP_START.test(w) && /[a-zß-ÿāēīōū]/.test(w)   // a capital, but not ALL CAPITALS
      });
    }
    return toks;
  }
  function sentenceStart(text, at) {
    var i = at - 1;
    while (i >= 0 && /[ \t"'(*•>\-]/.test(text[i])) i--;
    return i < 0 || text[i] === "\n" || /[.!?:]/.test(text[i]);
  }
  function lineStart(text, at) {
    var i = at - 1;
    while (i >= 0 && /[ \t"'(*•>\-]/.test(text[i])) i--;
    return i < 0 || text[i] === "\n";
  }

  function possibleNames(text, out) {
    var toks = tokenise(text);
    var added = {};
    function gap(i) { return i + 1 < toks.length ? text.slice(toks[i].e, toks[i + 1].s) : null; }
    function adj(i) { return gap(i) === " " ? toks[i + 1] : null; }
    function surnameLike(t) {
      return !!t && t.mixed && t.w.length >= 2 && !STOP[t.key] && !AMB[t.key] && !STREET_WORDS.test(t.w);
    }
    function wordsBefore(i, n) {                                          // the n words before token i, when they run straight on from it
      var p = [];
      for (var k = i - 1; k >= 0 && p.length < n; k--) {
        if (gap(k) !== " ") break;
        p.unshift(toks[k].key);
      }
      return p;
    }
    function push(a, b, why) {                                            // tokens a to b inclusive
      var start = toks[a].s, end = toks[b].e, key = start + ":" + end;
      if (added[key]) return;
      var value = text.slice(start, end);
      var next = adj(b);
      if (next && (STREET_WORDS.test(next.w) || BUSINESS.test(next.w))) return;     // Victoria Street, Grace Dental
      if (BUSINESS.test(value)) return;
      var prev = a > 0 && gap(a - 1) === " " ? toks[a - 1] : null;
      if (prev && /^(mt|mount|lake|port|fort|saint|st|cape|new|north|south|east|west|upper|lower|te)$/.test(prev.key)) return;
      added[key] = true;
      out.push({ type: "name", maybe: true, start: start, end: end, text: value, why: why });
    }
    function spanFrom(i) {                                                // a name from token i, plus a following surname-like word
      var n = adj(i);
      if (!surnameLike(n)) return i;
      var n2 = adj(i + 1);
      if (FIRST[n.key] && surnameLike(n2)) return i + 2;                  // a middle name
      return i + 1;
    }
    function nameWord(t) { return t.mixed && t.w.length >= 3 && !/['’](?:ve|ll|d|m|re|t)$/i.test(t.w) && (!STOP[t.key] || !!AMB[t.key]); }

    toks.forEach(function (t, i) {
      if (!t.mixed) return;
      var amb = !!AMB[t.key], known = !!FIRST[t.key];
      var ss = sentenceStart(text, t.s);

      // 1. A known given name, with a surname after it when there is one.
      if (known && (!STOP[t.key] || amb)) {
        var last = spanFrom(i);
        if (last > i) push(i, last, amb ? "a name that is also a word, followed by a surname-like word" : "a common first name followed by a surname-like word");
        else if (!amb) {
          var nx = adj(i);
          if (!ss) push(i, i, "a common first name");
          else if (nx && VERB_AFTER.indexOf(nx.key) !== -1) push(i, i, "a common first name followed by a verb such as said or is");
        }
      }

      // 2. A name after phrases such as spoke to, ask, cc, with, for, from; or before said, rang, emailed.
      if (nameWord(t)) {
        var one = wordsBefore(i, 1)[0], two = wordsBefore(i, 2).join(" ");
        var strong = STRONG_BEFORE.indexOf(one) !== -1 || STRONG_BEFORE.indexOf(two) !== -1;
        var weak = WEAK_BEFORE.indexOf(one) !== -1 || WEAK_BEFORE.indexOf(two) !== -1;
        var end2 = spanFrom(i);
        if (strong) push(i, end2, "a name after a phrase such as spoke to or ask");
        else if (weak && end2 > i) push(i, end2, "two capitalised words after with, for or from");
        var after = adj(end2);
        if (after) {
          var third = adj(end2 + 1), isOff = after.key === "is" && third && third.key === "off", hasBeen = after.key === "has" && third && third.key === "been";
          if (SPEECH_AFTER.indexOf(after.key) !== -1 || isOff || hasBeen) push(i, end2, "a name followed by a word such as said, rang or emailed");
        }
      }
    });

    // 3. An initial and a surname: B. Thompson.
    each(/(?<![A-Za-z])([A-Z])\. ?([A-Z][A-Za-zāēīōū'’-]{2,})/g, text, function (m) {
      var sur = m[2], k = lookup(sur);
      if (STOP[k] || AMB[k] || STREET_WORDS.test(sur) || !/[a-z]/.test(sur) || lineStart(text, m.index)) return;
      var key = m.index + ":" + (m.index + m[0].length);
      if (added[key]) return;
      added[key] = true;
      out.push({ type: "name", maybe: true, start: m.index, end: m.index + m[0].length, text: m[0], why: "an initial followed by a surname-like word" });
    });

    // 4. A first name at the start of a chat line: "jess: whats the number".
    each(/(?:^|\n)[ \t]*([A-Za-z]{2,12}):[ \t]/g, text, function (m) {
      var k = lookup(m[1]);
      if (!FIRST[k] || AMB[k] || STOP[k]) return;
      var start = m.index + m[0].indexOf(m[1]);
      out.push({ type: "name", maybe: true, start: start, end: start + m[1].length, text: m[1], why: "a first name at the start of a chat line" });
    });
  }

  // 5. The same name again: once a name is found, other copies of it in the text are very likely the same person.
  function repeatedNames(text, found, out) {
    var seen = {};
    found.forEach(function (f) {
      if (f.type !== "name") return;
      var words = f.text.replace(/^(?:Dr|Mr|Mrs|Ms|Miss|Mx)\.? /, "").split(" ").filter(function (w) { return !/^[A-Z]\.$/.test(w); });
      var parts = words.length > 1 ? [words.join(" ")].concat(words) : words;
      parts.forEach(function (p) {
        var k = lookup(p);
        if (seen[p] || p.length < 3 || !CAP_START.test(p) || /[\d.]/.test(p)) return;
        if (STOP[k] || AMB[k] || STREET_WORDS.test(p)) return;
        seen[p] = true;
        var single = p.indexOf(" ") === -1;
        var re = new RegExp("(?<![" + LETTER + "'’-])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\  // Keep the strongest match where two overlap") + "(?![" + LETTER + "-])", "g");
        each(re, text, function (m) {
          if (single && !FIRST[k] && sentenceStart(text, m.index)) return;       // a surname that is also a word, opening a sentence
          out.push({ type: "name", maybe: true, start: m.index, end: m.index + p.length, text: p, why: "the same name appears elsewhere" });
        });
      });
    });
  }

  // Keep the strongest match where two overlap: higher priority first, then the longer match.
  function resolve(found) {
    found.sort(function (a, b) {
      return ((TYPES[b.type].priority - (b.maybe ? 0.5 : 0)) - (TYPES[a.type].priority - (a.maybe ? 0.5 : 0))) || ((b.end - b.start) - (a.end - a.start)) || (a.start - b.start);
    });
    var kept = [];
    found.forEach(function (f) {
      var clash = kept.some(function (k) { return f.start < k.end && k.start < f.end; });
      if (!clash) kept.push(f);
    });
    return kept.sort(function (a, b) { return a.start - b.start; });
  }

  /* Every whole-word copy of each value the person chose, ignoring capitals. */
  function addedFindings(text, values, out) {
    (values || []).forEach(function (v) {
      v = String(v).trim();
      if (!v) return;
      var pattern = v.split(/\s+/).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("\\s+");
      var re = new RegExp("(?<![" + LETTER + "0-9_])" + pattern + "(?![" + LETTER + "0-9_])", "gi");
      each(re, text, function (m) {
        out.push({ type: "added", start: m.index, end: m.index + m[0].length, text: m[0], why: "text you chose to remove" });
      });
    });
  }

  /* scan(text, {types, maybe, added}) -> findings.
     types: list of type keys to look for (default: all the rules).
     maybe: false leaves out the possible names (findings with maybe: true). They are included by default.
     added: text the person chose to remove; every whole-word copy of it comes back as type "added". */
  function scan(text, options) {
    options = options || {};
    text = String(text);
    var wanted = options.types || Object.keys(TYPES);
    var found = [];
    DETECTORS.forEach(function (detect) { detect(text, found); });
    if (options.maybe !== false) {
      possibleNames(text, found);
      repeatedNames(text, resolve(found.filter(function (f) { return f.type === "name"; })), found);
    }
    addedFindings(text, options.added, found);
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


  // The same value gets the same placeholder. Text the person added keeps its capitals, so it comes back as written.
  function sameValue(f) { return f.type === "added" ? "added:" + f.text : f.type + ":" + f.text.replace(/[\s\-()]/g, "").toLowerCase(); }

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
    version: "1.1.0",
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

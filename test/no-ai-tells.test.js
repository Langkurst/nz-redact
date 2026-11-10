// The page must not carry the look people now recognise as made by AI. Each test below is one line of the
// "Mechanical check" list of design tells: italic accent words in headings, all-caps labels, wide letter-spacing on
// small text, middle-dot strings, decorative 01 / 02 / 03, the overused font families, coloured left rules on cards,
// big numbers over small captions, animation that plays without the visitor doing anything, and a cream page.
// It reads index.html, app/app.css and app/app.js as they are. Run with:  npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("index.html");
const css = read("app/app.css");
const js = read("app/app.js");

// ---------- a small CSS reader: rules (with their @media), custom properties, keyframes, font faces ----------
function parseCss(source) {
  const src = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [], keyframes = [], fontFaces = [];
  (function walk(text, media) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < text.length && depth) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(prelude)) walk(body, prelude);
      else if (/^@(-webkit-)?keyframes\b/.test(prelude)) keyframes.push({ name: prelude.split(/\s+/)[1], body });
      else if (/^@font-face/.test(prelude)) fontFaces.push(decls(body));
      else if (!prelude.startsWith("@")) rules.push({ selector: prelude, media, decls: decls(body) });
      i = j;
    }
  })(src, "");
  return { rules, keyframes, fontFaces };
}
function decls(body) {
  const out = [];
  for (const part of body.split(/;(?![^(]*\))/)) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    out.push({ prop: part.slice(0, at).trim().toLowerCase(), value: part.slice(at + 1).trim() });
  }
  return out;
}
const sheet = parseCss(css);

// Custom properties for each theme, so var(--x) can be resolved.
function vars(theme) {
  const v = {};
  for (const r of sheet.rules) {
    const root = r.selector === ":root" || (theme === "dark" && r.selector === ':root[data-theme="dark"]');
    if (!root || r.media) continue;
    for (const d of r.decls) if (d.prop.startsWith("--")) v[d.prop] = d.value;
  }
  return v;
}
function resolve(value, v, depth = 0) {
  if (depth > 10) return value;
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/g, (_, name, fallback) => resolve(v[name] != null ? v[name] : (fallback || ""), v, depth + 1));
}
const LIGHT = vars("light");
const val = (d) => resolve(d.value, LIGHT);

// Font size of a rule in px, if it sets one (rem and em are taken against 16 px).
function sizePx(value) {
  const nums = [...String(value).matchAll(/(-?[\d.]+)(px|rem|em)\b/g)].map(([, n, u]) => (u === "px" ? +n : +n * 16));
  return nums.length ? Math.max(...nums) : null;
}

// Visible text: the body without tags, scripts and styles, with entities decoded.
const visible = html.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&middot;|&#183;|&#xb7;/gi, "·").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
// Strings in the page script, which become visible text too.
const scriptStrings = [...js.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("\n");

// ---------- the checks, one per tell ----------
function checks() {
  const hits = [];
  const fail = (tell, where) => hits.push(`${tell}: ${where}`);

  // 1. Italic inside a main heading (the "one italic serif word" headline).
  const headings = [...html.matchAll(/<(h[12])\b([^>]*)>([\s\S]*?)<\/\1>/g)];
  const headingClasses = new Set();
  for (const [, tag, attrs, inner] of headings) {
    if (/<(em|i|cite|var|dfn)\b/.test(inner)) fail("italic in a heading", `<${tag}> contains ${inner.match(/<(em|i|cite|var|dfn)\b/)[0]}`);
    for (const [, list] of (attrs + inner).matchAll(/class="([^"]+)"/g)) list.split(/\s+/).forEach((c) => headingClasses.add(c));
  }
  for (const r of sheet.rules) {
    for (const d of r.decls) {
      const italic = (d.prop === "font-style" && /italic|oblique/.test(val(d))) || (d.prop === "font" && /\b(italic|oblique)\b/.test(val(d)));
      if (!italic) continue;
      const aimsAtHeading = /(^|[\s,>+~(])h[12]\b/.test(r.selector) || [...headingClasses].some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(r.selector));
      if (aimsAtHeading) fail("italic in a heading", r.selector);
    }
  }

  // 2. All-caps labels: text-transform uppercase (or small caps) anywhere except keyboard keys.
  for (const r of sheet.rules) for (const d of r.decls) {
    const caps = (d.prop === "text-transform" && /uppercase/.test(val(d))) || (/^font-variant(-caps)?$/.test(d.prop) && /small-caps|all-petite|unicase|titling/.test(val(d)));
    if (!caps) continue;
    const onlyKeys = r.selector.split(",").every((s) => /(^|\s|>)kbd\s*$|\.kbd\s*$/.test(s.trim()));
    if (!onlyKeys) fail("uppercase label", r.selector);
  }

  // 3. Letter-spacing above 0.02em on text under 16 px (the tracked-out eyebrow).
  for (const r of sheet.rules) {
    const ls = r.decls.find((d) => d.prop === "letter-spacing");
    if (!ls) continue;
    const v = val(ls);
    if (/^(normal|0|inherit|initial|unset)$/.test(v)) continue;
    const fsDecl = r.decls.find((d) => d.prop === "font-size");
    const size = fsDecl ? sizePx(val(fsDecl)) : null;
    const m = v.match(/(-?[\d.]+)(em|px|rem)/);
    if (!m) { fail("letter-spacing that cannot be checked", `${r.selector} { letter-spacing: ${v} }`); continue; }
    const em = m[2] === "em" ? +m[1] : (m[2] === "px" ? +m[1] : +m[1] * 16) / (size || 16);
    if (em > 0.02 && (size == null || size < 16)) fail("letter-spacing over 0.02em on small text", `${r.selector} { letter-spacing: ${v} }`);
  }

  // 4. Meta strings joined with middle dots.
  if (/[\s ]·[\s ]/.test(visible)) fail("middle dot between words", "index.html");
  if (/ · |\\u00B7|&middot;/.test(scriptStrings)) fail("middle dot between words", "app/app.js");
  for (const r of sheet.rules) for (const d of r.decls) if (d.prop === "content" && /·|\\00b7|\\b7/i.test(d.value)) fail("middle dot between words", r.selector);

  // 5. Decorative 01 / 02 / 03 markers.
  const padded = [...html.matchAll(/>\s*(0[1-9])\.?\s*</g)].map((m) => m[1]);
  if (padded.length) fail("decorative 01 / 02 / 03", `index.html shows ${padded.join(", ")} as its own element`);
  if (/decimal-leading-zero/.test(css)) fail("decorative 01 / 02 / 03", "decimal-leading-zero counter");
  for (const r of sheet.rules) for (const d of r.decls) if (d.prop === "content" && /["']0[1-9]/.test(d.value)) fail("decorative 01 / 02 / 03", r.selector);
  if (/padStart\(\s*2\s*,\s*["']0["']\s*\)/.test(js)) fail("decorative 01 / 02 / 03", "app/app.js pads numbers with a zero");

  // 6. The overused font families. Geist Mono stays only for placeholders and code that people copy.
  const banned = /Instrument Serif|Space Grotesk|Fraunces|Newsreader|\bInter\b|Geist(?! Mono)/;
  const families = [
    ...sheet.fontFaces.map((f) => (f.find((d) => d.prop === "font-family") || {}).value || ""),
    ...sheet.rules.flatMap((r) => r.decls.filter((d) => d.prop === "font-family" || d.prop === "font" || d.prop.startsWith("--")).map((d) => d.value)),
  ];
  for (const f of families) if (banned.test(f)) fail("overused font family", f.match(banned)[0]);
  for (const [, href] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) if (/inter|newsreader|geist-?sans|instrument|grotesk|fraunces|fonts\.googleapis/i.test(href)) fail("overused font family", href);
  for (const file of fs.readdirSync(path.join(ROOT, "app/fonts"))) {
    if (/^(license)?(inter|newsreader|instrument|spacegrotesk|fraunces|geist(?!mono))/i.test(file.replace(/[-_ ]/g, ""))) fail("overused font family", `app/fonts/${file}`);
  }
  for (const r of sheet.rules) {
    if (!r.decls.some((d) => /var\(--mono\)|Geist Mono/.test(d.value) && /^(font|font-family)$/.test(d.prop))) continue;
    if (!r.selector.split(",").every((s) => /\b(code|pre)\b|\.tok\b|\.ph\b|\.hit-token\b/.test(s))) fail("mono used for atmosphere", r.selector);
  }

  // 7. A coloured left rule on cards and notes.
  for (const r of sheet.rules) for (const d of r.decls) {
    const v = val(d);
    if (/^border-(left|inline-start)(-width)?$/.test(d.prop)) {
      const w = (v.match(/([\d.]+)px/) || [])[1];
      if ((w && +w > 1) || /\b(medium|thick)\b/.test(v) || /([\d.]+)(rem|em)/.test(v)) fail("coloured left rule", `${r.selector} { ${d.prop}: ${v} }`);
    }
    if (d.prop === "box-shadow" && /inset\s+([2-9]|\d{2,})px\s+0(px)?\s+0/.test(v)) fail("coloured left rule", `${r.selector} { box-shadow: ${v} }`);
  }

  // 8. A big number with a small caption: nothing on the page is set above 40 px.
  for (const r of sheet.rules) for (const d of r.decls) {
    if (d.prop !== "font-size") continue;
    const px = sizePx(val(d));
    if (px != null && px > 40) fail("big display number", `${r.selector} { font-size: ${d.value} }`);
  }

  // 9. Animation that runs without the visitor doing anything. An animation may only hang off a state that the
  //    visitor causes: a class the script adds (never present in the page as served) or :hover, :active, :focus.
  for (const r of sheet.rules) for (const d of r.decls) {
    if (!/^animation(-name)?$/.test(d.prop) || /^none\b/.test(d.value) || /prefers-reduced-motion/.test(r.media)) continue;
    const states = (r.selector.match(/\.is-[\w-]+/g) || []);
    const pseudo = /:(hover|active|focus|focus-visible|focus-within)\b/.test(r.selector);
    const servedWithIt = states.filter((c) => new RegExp(`class="[^"]*\\b${c.slice(1)}\\b`).test(html));
    const addedByScript = states.filter((c) => js.includes(`"${c.slice(1)}"`));
    if (!(pseudo || addedByScript.length) || servedWithIt.length) fail("animation without a user action", `${r.selector} { ${d.prop}: ${d.value} }`);
  }
  if (/@property\b/.test(css)) fail("animation without a user action", "@property (used for load-time sweeps)");
  if (/IntersectionObserver|requestAnimationFrame|\.animate\(|setInterval\(/.test(js)) fail("animation without a user action", "app/app.js has load or scroll driven animation code");

  // 10. A cream page: warm hue, very light, and not neutral.
  for (const r of sheet.rules) {
    if (!/^(html|body|:root)$/.test(r.selector) || r.media) continue;
    for (const d of r.decls) {
      if (!/^background(-color)?$/.test(d.prop)) continue;
      for (const hex of val(d).match(/#[0-9a-f]{3,8}\b/gi) || []) if (isCream(hex)) fail("cream page background", `${r.selector} ${hex}`);
    }
  }
  const lightThemeColor = (html.match(/name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: light\)"/) || [])[1];
  if (lightThemeColor && isCream(lightThemeColor)) fail("cream page background", `theme-color ${lightThemeColor}`);
  const manifest = JSON.parse(read("manifest.webmanifest"));
  if (isCream(manifest.background_color)) fail("cream page background", `manifest ${manifest.background_color}`);

  // Also on the list: a bold lead word followed by the explanation ("Nothing is sent. The page...").
  const boldLead = html.match(/<(p|li)\b[^>]*>\s*(?:<[^>]+>\s*)*<(strong|b)>[^<]{1,40}[.:]\s*<\/\2>/);
  if (boldLead) fail("bold lead sentence", boldLead[0]);

  return hits;
}

// Cream: OKLCH lightness above 94% and chroma above 0.005, with a warm hue (30 to 60 degrees in HSL terms,
// which is about 60 to 100 degrees in OKLCH). Both readings of "hue 30 to 60" are checked.
function isCream(color) {
  let hex = String(color).replace("#", "");
  if (!/^[0-9a-f]{3,8}$/i.test(hex)) return false;
  if (hex.length <= 4) hex = hex.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, Bb), H = (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hsl = 0;
  if (max !== min) {
    const d = max - min;
    hsl = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hsl = (hsl * 60 + 360) % 360;
  }
  return L > 0.94 && C > 0.005 && ((hsl >= 30 && hsl <= 60) || (H >= 60 && H <= 100));
}

test("the cream check itself: catches cream and ivory, leaves white, grey and the dark page alone", () => {
  for (const c of ["#f7f3ea", "#faf6ee", "#fbf7f0", "#f5f0e6"]) assert.equal(isCream(c), true, c);
  for (const c of ["#ffffff", "#fafafa", "#f3f3f3", "#f8fafc", "#141414"]) assert.equal(isCream(c), false, c);
});

test("the CSS reader finds the rules, so the checks below are not passing on an empty list", () => {
  assert.ok(sheet.rules.length > 50, String(sheet.rules.length));
  assert.ok(sheet.fontFaces.length >= 4);
  assert.ok(LIGHT["--page"], "the page colour is defined");
});

const ALL = checks();
const only = (tell) => ALL.filter((h) => h.startsWith(tell + ":"));
for (const tell of [
  "italic in a heading",
  "uppercase label",
  "letter-spacing over 0.02em on small text",
  "middle dot between words",
  "decorative 01 / 02 / 03",
  "overused font family",
  "mono used for atmosphere",
  "coloured left rule",
  "big display number",
  "animation without a user action",
  "cream page background",
  "bold lead sentence",
]) {
  test(`no AI tell: ${tell}`, () => assert.deepEqual(only(tell), []));
}
test("no AI tell of a kind this file does not name (for example a letter-spacing value it cannot read)", () => {
  assert.deepEqual(ALL.filter((h) => !/^(italic in a heading|uppercase label|letter-spacing over 0\.02em on small text|middle dot between words|decorative 01 \/ 02 \/ 03|overused font family|mono used for atmosphere|coloured left rule|big display number|animation without a user action|cream page background|bold lead sentence):/.test(h)), []);
});

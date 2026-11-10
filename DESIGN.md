# DESIGN.md for NZ Redact

Feel (one sentence): a cool, exact light instrument, like a well-made desktop tool, where the only movement is the tool doing its job.
Main reference: attio.com, "Light Precision" (values measured from its computed styles on 10 Nov 2026).
Borrowed detail (the only one): from linear.app, Inter's OpenType features `cv01` + `ss03` and the in-between variable weights 510 and 590.
Borrow decisions and values only. No logo, wording, images or code from any reference site.

## Fonts

All self-hosted in `app/fonts/` (the security policy allows fonts from this site only).

| Role | Face | Settings |
| --- | --- | --- |
| Display and text | Inter variable with the optical-size axis (`inter-latin-opsz-normal.woff2`, `inter-latin-ext-opsz-normal.woff2` for macrons and other Latin letters), SIL OFL 1.1 | `font-optical-sizing: auto`, so large sizes render as Inter Display. `font-feature-settings: "cv01", "ss03"` everywhere. |
| Serif accent | Newsreader italic (`newsreader-latin-wght-italic.woff2`), SIL OFL 1.1 | One word only: "before" in the headline. Weight 400. |
| Mono | Geist Mono (already in `app/fonts`), SIL OFL 1.1 | Placeholders such as `[IRD_1]`, detected values, small labels, counts, the app footer. Sentence case, never uppercase. |

Type scale and rules:

- h1: `clamp(2.5rem, 1.2rem + 3.4vw, 4rem)` (40 to 64 px), weight 590, tracking -0.03em, line-height 1.0, `text-wrap: balance`.
- h2: `clamp(1.75rem, 1.25rem + 1.6vw, 2.5rem)` (28 to 40 px), weight 590, tracking -0.025em, line-height 1.08.
- h3: 20 px, weight 590, tracking -0.012em.
- Big numbers (found count, accuracy): weight 590, tracking -0.035em, line-height 0.95, tabular figures.
- Body: 16 px / 1.6, weight 510 (medium-weight body), tracking -0.006em. Lede 18 px / 1.55.
- Small UI text: 13 to 14 px, weight 510. Buttons 14 px / 510.
- The user's own text in the editor: 16 px / 1.8, weight 400, same features on the text box and the highlight layer so they line up.
- Fallback: a metric-matched "Inter Fallback" (`local(Arial)`, size-adjust 107.4%, ascent 90.2%, descent 22.48%) so the swap does not move the page.
- `text-wrap: balance` on headings, `pretty` on paragraphs.

## Colours

Cool, tinted toward navy (hue 262). Written in `oklch()` with an sRGB hex fallback line before each. Never `#000`.

| Name | Role | Light | Dark |
| --- | --- | --- | --- |
| frost | page | oklch(.984 .003 255) #f8fafc | oklch(.165 .014 262) #0b0e14 |
| paper | surface (app, tables) | #ffffff | oklch(.2 .016 262) #12161d |
| mist | surface 2 (bars, hover) | oklch(.966 .005 255) #f1f4f7 | oklch(.235 .017 262) #1a1e26 |
| navy | ink, text step 1 | oklch(.205 .025 262) #111723 | oklch(.965 .004 262) #f2f3f6 |
| slate | text step 2 (body) | oklch(.43 .022 262) #49505c | oklch(.8 .012 262) #b9bec6 |
| pebble | text step 3 (meta) | oklch(.535 .018 262) #686d78 | oklch(.69 .014 262) #979ca4 |
| rail | step 4, non-text only (switch track) | oklch(.62 .015 262) #81868f | oklch(.52 .016 262) #646972 |
| line | borders | rgba(0, 0, 0, .06), strong .1 | rgba(255, 255, 255, .07), strong .12 |
| cobalt | the one accent | oklch(.54 .19 263) #2f65db | same fill; focus ring oklch(.72 .14 263) #75a3fc |
| mint / pine | state colour for "removed" and "restored" | mint oklch(.955 .045 165) #d5fae9, pine oklch(.44 .09 163) #0e6244 | mint oklch(.32 .055 165) #113c2c, pine oklch(.86 .11 165) #87e8bf |

Accent rule: cobalt appears on the primary button ("Copy redacted text"), the focus ring and the text caret. That is one fixed use per screen plus focus.
Mint and pine mean "removed" or "restored" and nothing else: the status pill, switches that are on, restored details in step 3, the "Copied" note and the bar in the logo.

Kinds of detail (highlight colours, data not decoration), each a text, fill and line triple with text contrast over 5:1:
kowhai (identity numbers, amber 82), harbour (money, teal 215), lupin (contact details, violet 300), pohutukawa (names and addresses, red 20), basalt (added by you, neutral 262).

## Radius system

- 999 px pills: the status pill, the step switcher and its tabs, step numbers, switches, colour dots.
- 8 px: buttons, the worked examples in How it works, the outline drawn in the opening demonstration.
- 12 px: tables, the code block, the shortcut sheet.
- 5 px: placeholders, keys, the logo mark. Highlights are 3 px corners plus a 2 px spread, which reads as 5 px.
- 23 px, the odd one: the main editor panel only. The drop zone inside it is 15 px (23 minus its 8 px inset), so the corners stay concentric.

## Surfaces

- Borders 1 px at rgba(0, 0, 0, .06) on light, rgba(255, 255, 255, .07) on dark.
- Shadow recipe (light only, navy tinted): `0 0 0 1px rgba(0, 22, 62, .01), 0 1px 2px rgba(0, 22, 62, .04), 0 4px 12px -1px rgba(0, 22, 62, .04)` on the editor panel and the floating "Remove this too" button. Everything else has no shadow. Dark mode has no shadows.
- Primary button: inset top highlight rgba(255, 255, 255, .14) plus a 1.5 px drop at 4%.
- Glass (blur) only on the sticky header and the shortcut sheet's backdrop.

## Motion

- Signature curve: `cubic-bezier(.2, 0, 0, 1)` for every transition and keyframe on the page.
- Hover and press 160 ms. Panels and switches 300 ms. Entrances and the product animation 500 to 700 ms.
- One exception, pinned by the tests: the shortcut sheet opens in 150 ms with `cubic-bezier(.22, 1, .36, 1)`, opacity and scale only.
- Reduced motion: every duration 0, no product animation (the end state shows at once), smooth scrolling off.
- Only transform, opacity, clip-path, mask and colours are animated. Nothing changes layout.

## Layout

- Max width 80rem (1280 px) with a 24 px gutter (16 px on phones). Reading column 40rem.
- Hero is left aligned: headline and lede on the left (7 of 12 columns), the three trust facts as a ruled list on the right, aligned to the bottom of the headline block. Not centred.
- The editor panel follows straight away, full width, so the product is on the first screen at 1440 px.
- Sections are ruled: a hairline across the frame with the section name in small text on it, then the content. Neighbouring sections have different shapes:
  How it works is a split (heading left, a numbered list with a worked example on the right of each row);
  What it finds is a full-width table; Accuracy is one large figure beside a list of smaller figures (1 + 3, then 1 + 2), then a table;
  Use in code is a split again.
- No three equal cards anywhere. No uppercase eyebrows.

## Product animation

On load (once the editor scrolls into view and the fonts are ready) and each time Example is pressed:

1. Each detail the rules found gets an outline drawn round it in its kind's colour, one after another, 110 ms apart. The outline is a 1.5 px ring whose mask sweeps 0 to 360 degrees in 640 ms (`--sweep`, registered with `@property`). A possible name gets a dashed ring.
2. 420 ms into each ring, the highlight fill fades in (360 ms).
3. 520 ms into each ring, that detail's placeholder (for example `[IRD_1]`) writes itself into the list on the right, one character per step (`steps(n)` on a clip-path).
4. When the last one is done, the rings fade out over 500 ms and the page is left in its normal state. It plays once and stops. Typing, switching or Clear stops it at once.

Never: Inter at default settings, #000 text, Tailwind's default easing, one big shadow on all cards, purple to blue gradients, emoji icons, centred everything, stock photos, a headline any competitor could use.

## Pre-ship checklist results (10 Nov 2026)

Measured in headless Chrome (computed styles, `document.getAnimations()`, axe-core 4 with the WCAG 2.1 AA rules) at 1440 x 900 and 390 x 844, light and dark, plus reduced motion. `npm test`: 82 of 82 pass.

| Check | Result | Measured |
| --- | --- | --- |
| Font chosen on purpose and tuned | Pass | h1 Inter at 64 px (36 px on a phone), weight 590, letter-spacing -1.92 px (-0.03em), line-height 64 px (1.0), `font-optical-sizing: auto`, features `"cv01", "ss03"` computed on the h1. Body weight 510. Newsreader italic on one word. Geist Mono for placeholders and labels. |
| No pure black text; tinted neutrals; 3 to 4 step ramp | Pass | Body text oklch(.205 .025 262). Ramp navy, slate, pebble, plus rail for non-text. The only `#000` in the stylesheet is the opaque colour of a mask, not a colour anyone sees. |
| Accent in 3 places or fewer per screen | Pass | Elements painted cobalt in the first screen at 1440 px: 1 (Copy redacted text). The focus ring and caret add one more only while in use. |
| Borders low alpha; shadows tiny or absent | Pass | Borders rgba(0, 0, 0, .06) and .1. Shadows navy tinted at 1% and 4% on the panel, primary button and floating button; 12% on the 16 px switch knob only; none in dark mode. |
| Radius from the system, with a distinctive value | Pass | 23 px on the editor panel, otherwise pill, 12, 8, 5 (and the derived 3 and 15 above). |
| One signature easing curve | Pass, one exception | Every transition and keyframe uses `cubic-bezier(.2, 0, 0, 1)` through `--ease`. The shortcut sheet keeps `cubic-bezier(.22, 1, .36, 1)` at 150 ms because the tests pin it. |
| An animation that shows the real product working | Pass | 700 ms after load at 1440 px: 8 `ring-draw`, 9 `mark-fill` and 9 `tok-write` animations running on the real findings (one ring is skipped because its detail wraps onto two lines). After 4.9 s: 0 animations running and the intro classes are gone. On a phone it waits until the editor is scrolled into view (checked: not playing before the scroll, playing after it). Example plays it again. |
| Real data, no stock or abstract filler | Pass | The only pictures are the tool itself on its example text and the worked examples (an IRD number at each step). No images, blobs or gradients. |
| No row of three identical cards | Pass | The three trust facts are a ruled list with the first one larger; How it works is a numbered list with worked examples; the accuracy figures are one large figure beside a list (1 + 3 and 1 + 2). |
| Headline names something only this product does | Pass | "NZ Redact takes IRD, NHI and bank numbers out of text before it goes into AI." IRD and NHI numbers are New Zealand only, and the check digits are what the tool verifies. |
| Phone width, light and dark, contrast 4.5:1, reduced motion | Pass | Horizontal overflow 0 px at 390 and 1440 in both themes. axe colour-contrast: 0 violations on the first screen, step 2 while peeking, step 3, after Clear, and with the shortcut sheet open, in both themes at both widths. Lowest text contrast by calculation: 4.70:1 (pebble on mist, light). Focus outline 2 px solid cobalt (light) or oklch(.72 .14 263) (dark). Reduced motion: no intro animations, the highlights show at once, the sheet has no scale. |

Not checked: Safari and Firefox (the outline sweep needs `@property`, which both now support; without it the outline appears in one step), Windows high-contrast mode, and real phones.

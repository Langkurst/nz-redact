# Design notes

NZ Redact is a text tool, so the page is laid out like one. The tool is the first thing on the page and the explanations sit under it as plain document sections. There is no hero, no large figures and nothing that moves on its own.

## Layout

- Top bar: the name, one sentence saying what it does, and links to How it works, What it finds, Accuracy and GitHub.
- The tool: a toolbar (Open file, Example and Clear on the left, Copy redacted text as the one main button on the right), the three steps as ordinary tabs, then the text with the Found list beside it on a wide screen and under it on a phone. On a laptop the text area fills the first screen. On a phone the tabs read "2. Redacted" and "3. Put back" so they fit on one line; screen readers still hear the full names.
- The Found list is grouped by kind, with a real checkbox for each detail. Ticked means it is removed. Each row shows the value, its placeholder and the reason the rule matched. A guessed name says "possible" in grey. The count is a sentence: "9 details found."
- Under the tool: How it works, What it finds, Accuracy, Use in code and Privacy, with sentence-case headings, ordinary lists and tables. The accuracy figures are in tables, next to the paragraph that says what it misses.

## Type

One typeface, Atkinson Hyperlegible Next (SIL OFL 1.1, from the @fontsource package), in regular and bold. It was drawn so that characters that look alike can be told apart: 0 and O, and 1, l and I. People read IRD, bank and NHI numbers on this page, and NHI numbers mix letters and digits, so that matters here.

Geist Mono is kept only for placeholders such as `[IRD_1]` and for code, because those are copied exactly as written.

Sizes: body text and the text being checked 17 px, h1 30 px, h2 22 px, h3 18 px, small grey text 14 to 15 px. Normal letter-spacing, sentence case, no italics and no capitals-only labels.

## Colour

- White page and panels, near-black text (#1b1b1b), light grey (#f3f3f3) for the toolbar, tab bar and table headers, and grey (#595959) for secondary text.
- Highlighter yellow (#fff176) marks the details found in the text, the way you would mark a printout.
- In the redacted copy each placeholder is a black bar with white text, like a redacted document.
- One blue (#0b57d0, 6.3:1 on white) for links and the main button.
- Dark theme: a near-black page (#141414) with the same layout. The highlight is a darker yellow (#6e5d00) so the light text on it keeps 5.5:1. The redaction bar becomes a solid light grey block with black text, because a black bar would not show on a black page.

All text is at least 4.5:1 against its background in both themes.

## Motion

Only in response to the visitor. When a tab is chosen, the new step fades in over 120 ms. The copy button turns green and says Copied for 1.5 seconds. The shortcut list opens in 150 ms. The Remove this too button appears when text is selected. Nothing plays when the page loads, and with reduced motion turned on nothing animates.

## The check

`test/no-ai-tells.test.js` reads `index.html` and `app/app.css` and fails on the design habits that now make a page look machine-made: italic words in headings, capitals-only labels, wide letter-spacing on small text, middle dots between words, 01 / 02 / 03 markers, the overused font families, coloured left borders on cards, numbers over 40 px, animation without a user action, a cream page and bold lead-in sentences. To prove it works, the CSS and HTML were broken on purpose in 12 ways, and the test failed on each one.

Screenshots of the page in light and dark, on a laptop and a phone, are in `docs/redesign/`.

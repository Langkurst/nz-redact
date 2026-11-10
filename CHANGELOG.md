# Changelog

## Page update (November 2026)

No change to the rules or the accuracy figures.

- The page is laid out as a text tool: the tool is at the top, under a one-line description, and the explanations follow as plain sections with tables.
- Found details are marked in highlighter yellow, and placeholders in the redacted copy are shown as redaction bars.
- Each detail in the Found list has a checkbox. Ticked means it is removed. A guessed name says possible.
- The typeface is Atkinson Hyperlegible Next, which keeps 0 and O, and 1, l and I apart in IRD and NHI numbers.
- Nothing moves when the page loads.
- A Privacy section.

## 1.1.0 (November 2026)

- Possible names. Names that are not after a label are now found from the word itself, such as a common first name, an initial with a surname, or a name that appears elsewhere in the text. They are marked Possible, switched on by default, and can be switched off. Names found by the sure rules are unchanged.
- Remove this too. Select anything the rules missed and it is removed everywhere it appears, listed under Added by you, and put back in step 3.
- Paste answer in step 3, which reads the clipboard where the browser allows it. Step 3 restores as soon as text is pasted or typed.
- Peek at originals. On the Redacted copy step, hold Alt (or press and hold Show originals) to see the real details in place of the placeholders. The copied text is not changed.
- Clear can be undone for 8 seconds, with the Undo button or Ctrl+Z.
- The copy button says Copied, and screen readers are told.
- A shortcut list, opened with the ? key or the Shortcuts link.
- A value switched off stays off while you edit the text.
- A Ko-fi link in the footer.
- Accuracy is now measured on a second set of 30 documents about names, written after the 1.1 rules were finished. On the original 30 documents, names found went from 25% to 65% with possible names; on the new set, 66% of names were found and 91% of names removed were real names. The page and this file say plainly that the first set's results were known before this work started.

## 1.0.0 (November 2026)

First release.

- Finds IRD numbers, bank accounts, NHI numbers (both formats), card numbers, driver licence and passport numbers, dates of birth, email addresses, phone numbers, street addresses and labelled names.
- Numbered placeholders, and putting the details back into an AI's answer.
- Spreadsheet rows: a column heading such as DOB, Licence or Name says what a value is.
- Works offline and can be installed from the browser. Opens and accepts dropped .txt and .csv files.
- Rules checked against Inland Revenue's 2026 to 2027 specification, Health New Zealand's HISO 10046:2025 and the Payments NZ bank branch register.
- Accuracy measured on 80 development documents and 30 blind documents.

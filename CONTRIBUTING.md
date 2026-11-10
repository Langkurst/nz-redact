# Contributing

Thanks for helping. A few rules keep NZ Redact trustworthy.

## Never use real personal details

Use made-up names and numbers in issues, tests and examples. For numbers with a check digit, generate a valid one (the tests in `test/rules.test.js` show how) or use the published examples, such as IRD `49-098-576`, NHI `ZAA0067` and bank `01-0902-0068389-00`.

## Changing a rule

1. Write a test in `test/rules.test.js` that fails without your change.
2. Change `src/nz-redact.js`.
3. Run `npm test`.
4. Run `npm run eval`. This measures the rules on the test documents and updates `app/accuracy.js`. Commit that file too.
5. If the change follows an official document, name it in a comment next to the rule.

A rule may not make the main test set worse. The tests check that it still finds every number, date, email, phone and address there.

## Adding test documents

Documents live in `test/corpus/`. Each has the text, the details that should be found (`expected`), and look-alikes that should be left alone (`negatives`). Write them without looking at the rules, so they stay a fair test.

## Code style

Plain JavaScript that runs in browsers and Node.js 18 or later, with no dependencies and no build step. The page must keep working with its security policy: no inline scripts or styles.

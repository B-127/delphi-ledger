# Quarterly collection

Upload each bank's interim statement, have the figures checked against the bank's own
printed totals, and write them into the two workbooks without breaking a formula.

Everything runs in the browser. There is no server, which on GitHub Pages is not a
compromise: the PDFs and the workbooks never leave the machine, because there is
nowhere for them to go.

## Running it

Deployment is the repository. Push these files and enable Pages on the branch — the
`.nojekyll` file stops Jekyll from hiding the `src` directory. No build step, no
bundler, no `npm install`. Locally, any static server will do:

    python3 -m http.server 8080

Tests run under Node with no dependencies:

    node tests/quarter.test.mjs      # 22 assertions on the reporting calendar
    node tests/validate.test.mjs     # 21 assertions on the identity checks

## How a filing works

1. **The quarter is derived, never asked.** Reports are published 45 days after a
   quarter ends, so the filable quarter is the most recent one whose end date plus 45
   days has passed. In the 45 days after a quarter closes that is *two* quarters back,
   not one — on 10 July 2026 you are in Q3 and still filing Q1. `src/quarter.js`.
2. **The upload is read.** `pdf.js` returns text with coordinates, and table structure
   is rebuilt by clustering those positions rather than trusting reading order — the
   thing that breaks when a bank reorders columns mid-table.
3. **Rows are matched by template, then confirmed by anchor.** Where a label is
   ambiguous, the comparative column in the report is matched against what the model
   already holds for the prior quarter. A row that anchors has identified itself
   regardless of what its label says.
4. **The figures are checked.** Mostly identities: sums that must reproduce totals the
   bank printed itself. `src/validate.js`.
5. **Only then is anything written**, by editing the workbook XML directly.

## No LLM runs here

Nothing in this repository calls a model. "Held for review" is arithmetic, not
judgement — a sum that did not reproduce a printed total. That is also why OCR does
not weaken the result: a misread digit breaks the sum, so it lands in review rather
than in the workbook.

An LLM could later help suggest a mapping for a row no template matched. It would
still not be allowed to write a cell.

## Why the workbook is edited as XML

A `.xlsx` is a zip of XML. `src/workbook.js` opens it, edits the cells it was told to,
and rezips; every part it does not touch stays byte-identical.

This is not a preference. The master carries **150 charts and a VBA project**.
SheetJS's community build discards charts, and both it and ExcelJS discard macros —
either would hand back a file that opens fine and is missing half its work.

Two rules the writer enforces:

- **It refuses to overwrite a formula.** The model computes its own derived rows; a
  collection tool replacing one with a constant is how a model quietly stops working.
- **It never edits `sharedStrings.xml`.** A shared string is shared, so changing one
  changes every cell using it. Headers are written as inline strings instead.

`fullCalcOnLoad` is set on save, so Excel recomputes everything on open and no cached
value survives an edit.

## Fourth quarter

At Q4 the annual columns are updated as well, from the audited accounts rather than
the interim release. The page switches into a two-document mode and says so, because
this happens on one quarter in four and the model looks complete without it.

Order matters: the annual column is filled first, then the Q4 quarterly figure is
derived as the audited year less the nine months already in the model.

## What still needs doing before real use

**Templates.** `src/templates.js` carries a base template covering the rows every
bank reports under the same LKAS/SLFRS headings, plus notes for the three banks known
to differ — BOC for its column ordering, Amana for Islamic banking terminology, HSBC
for branch accounts. These need authoring against real filings, one bank at a time.
A template is right when a past quarter reproduces the figures already in the model.

**A golden corpus.** Pair past PDFs with the values known to be correct and re-run
them on every template change. Without it, a fix for HNB can quietly break DFCC.

**Vendor the dependencies.** `pdf.js`, `tesseract.js` and `fflate` load from CDNs so
the site runs with no build step. Download them into `src/vendor/` and drop the CDN
entries from the CSP in `index.html`. That removes a third party from the path of
every workbook edit.

**Storing the PDFs.** The tool renames each upload to `ABBR - XQYY.pdf` and hands it
back with a JSON manifest recording what was read, how it was read, which tabs it
went to, and every check result. Commit those alongside the workbooks. At roughly
100 MB a year, a decade fits comfortably in the repository. Keep the originals
uncompressed — the PDF is the evidence.

## Moving off GitHub Pages

Nothing in `src/quarter.js`, `src/validate.js`, `src/templates.js` or `src/banks.js`
touches a browser API; they are plain modules that already run under Node, which is
how the tests work. `extract.js` and `workbook.js` use `pdf.js` and `fflate`, both of
which run server-side unchanged.

So the move is a transport change: put an HTTP handler in front of the same modules.
Postgres, when it comes, belongs under the extracted figures rather than the PDFs —
files in object storage, facts about the files in the database — which turns twelve
quarters of history into something queryable instead of something trapped in a
spreadsheet.

## Files

    index.html            shell, CSP, layout
    assets/app.css        light and dark tokens, carried from the workbook theme
    src/quarter.js        reporting calendar (R9, R10)
    src/banks.js          bank registry and tab mapping
    src/extract.js        pdf.js reading, OCR fallback, table reconstruction
    src/templates.js      per-bank extraction templates
    src/validate.js       identity checks
    src/workbook.js       OOXML surgery write path
    src/app.js            UI wiring
    src/vendor/           third-party modules
    tests/                Node test suites

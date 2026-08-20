# Tests

Pure-logic regression tests for the `SaxeBrief` module (extracted from `app.html`).
No dependencies; run with Node:

```
node tests/brief.test.js   # brief data model, merge, consolidation, deterministic counting, incremental merge
node tests/split.test.js   # review paste splitting, against real Amazon fixtures
```

`fixtures/amazon2.txt` is a real markdown-converted Amazon paste (Shark WANDVAC, 20 reviews:
long multi-paragraph bodies, chrome lines, a Spanish review) that a naive splitter mis-counts.
It exists so that shape can never silently regress, because a wrong review count would freeze a
wrong "of M reviews" denominator into a derived brief.

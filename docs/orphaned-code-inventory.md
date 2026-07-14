# Orphaned code inventory

_Audit date: 2026-07-14. `app.html` on `main`._

Two distinct failure modes make code unreachable in Saxe:

- **Mode 1 — reachable-but-throws.** A function is called, but a line inside it throws,
  orphaning everything downstream. So far this is **unique** to the gold-hook path
  (see `hook-pipeline.md`). The obvious sibling, `generateScriptBank`, is clean.
- **Mode 2 — never invoked.** A whole function is defined but never referenced anywhere
  (no static caller, no HTML `onclick`, no string dispatch). 17 found; three make model
  calls.

## Method

Counted whole-word references (including strings and `onclick` handlers) for all 469
`function` declarations. Count == 1 means the definition is the only occurrence — no
caller of any kind. High confidence for the model-calling three (each verified by hand).

## Orphaned functions that make model calls

| Function | Model calls | Verdict |
|---|---|---|
| `generateScreenTextOptions` (L2737) | 1× `/api/claude` | **Fully superseded — safe to delete** |
| `generateScriptBankSilent` (L7177) | 2× `/api/claude` | **Superseded — safe to delete** |
| `generatePrecloseLines` (L2699) | 1× `/api/claude` | **Do NOT delete blind — a capability vanished** |

### `generateScreenTextOptions` — fully superseded

On-screen text = the text overlay that pairs with the spoken hook from a different
psychological angle. Live today via `generateBatchScreenTexts` (L6100), which carries
the **identical** pairing framework (same gold-standard pairs, verbatim) and whose
output is rendered to members (L7054–7055, `script.screenText`). The orphan is the old
category-map version. Nothing lost — safe to remove.

### `generateScriptBankSilent` — superseded, no member-facing loss

A silent, no-spinner variant of `generateScriptBank` that pre-generated the bank in the
background (`onComplete` callback, lighter understanding prompt). The bank is fully live
via `generateScriptBank` (called from ~9 sites). What vanished is a **background-preload
optimization**, not a member feature. Safe to remove; the only effect is the bank always
generates on-demand.

### `generatePrecloseLines` — the field survived, a capability did not

A pre-close is the subtle re-commit line between the body and the CTA. Members still see
a PRE-CLOSE line — baked into each script by CALL 2, and the step-builder uses
`generateBody2AndPreclose` (L10219). **But** this orphan uniquely produced:

- a **menu of 6 pre-close options** with strong/solid/test confidence ratings (a picker,
  not one baked-in line), and
- a **guarantee of ≥2 honest-uncertainty scarcity pre-closes** ("I'm not sure how many
  they have," "no idea when these sell out") — truthful scarcity that the current inline
  pre-close never generates.

The pre-close field is superseded; the **scarcity-line capability genuinely vanished.**
That is a product decision, not a cleanup. Hold until it's decided whether scarcity
pre-closes should come back.

## Other orphans (non-model dead code)

Worth a glance because a few sound load-bearing:

- **Startup loaders never called:** `loadFavorites`, `loadOnboarding`, `loadPostingData`,
  `checkOnboarding` — almost certainly superseded by `loadLocalData`, left behind.
- **Misc dead helpers:** `driverCategoryAxes`, `buildCalendarView`, `buildPreClosePanel`,
  `setPrice`, `isFavorite`, `toggleDeleteSelect`, `renderModeChoice`, `highlightField`,
  `clearText`, `winnersViewsToNumber`.

None verified line-by-line beyond the reference count; confirm before deleting.

## Known gap: conditionals that never evaluate true — NOT swept

This audit did **not** cover the third class of unreachable code: a branch guarded by a
flag or state that is always false (e.g. `if (someFlag) { … }` where `someFlag` is never
set true). Detecting these statically needs data-flow analysis.

**Plan:** once `model_usage` is live, use it as the detector. Any `call_name` we expect
to see but that never appears is an orphaned call — whichever mechanism caused it
(never-invoked, reachable-but-throws, or dead conditional). We will actually run this
check against the data rather than leave it as a standing gap. Starting signal: `hook`
(the gold-hook bug); then confirm every other expected label appears.

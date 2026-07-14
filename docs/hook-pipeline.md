# Hook pipeline — how a batch hook is actually generated

_Audit date: 2026-07-14. Describes `app.html` on `main` at the time of writing._

## Intended design

One batch generation (`generateBatchScriptsWithProfile`) is meant to run four model
calls in sequence:

1. **CALL 1 — understanding** (Haiku): returns
   `{who, already_have, differentiator, emotional_frame, cultural_moment, purchase_type}`.
2. **CALL 1.5 — gold hook** (`claude-sonnet-4-6`, max_tokens 400): returns
   `{mechanism_used, hook}` — a single benchmark hook, reasoned in **6 mechanisms**
   (REFRAME / REMOVE THE BLAME / DISRUPT THE HABIT / STATUS THREAT / VERDICT / PIVOT).
3. That hook becomes `goldHookNote` — _"GOLD STANDARD HOOK — THIS IS YOUR BENCHMARK…"_ —
   appended to the understanding note.
4. **CALL 2 — body** (Haiku, max_tokens 4000, the ~18k `system`): writes every
   member-facing script using the **11-type hook framework**, the understanding note,
   and the gold-hook benchmark.

**Even by design, the gold hook never reaches the member verbatim.** It is a reference
string injected into CALL 2's prompt. CALL 2 (Haiku) writes the hooks members see
(`scripts[].hook`). The member-facing hook is a Haiku hook; the Sonnet call is an
upstream benchmark.

## The bug: the gold-hook + rich-body path never runs

- **L~6522:** `understandingNote += goldHookNote;` runs inside the **CALL 1** handler.
- **L~6591:** `var goldHookNote = …` is declared inside the **nested CALL 1.5** handler.

`goldHookNote` is read at L6522 but declared only in a different (nested) callback
scope, so L6522 throws `ReferenceError: goldHookNote is not defined` on every run —
**before** the gold-hook fetch is issued and **before** the rich CALL 2 prompt is built.
The throw is caught by the outer `.catch` labelled _"Call 1 failed — fall back to
writing without product understanding,"_ which fires the **simplest** body prompt: no
understanding note, no gold-hook benchmark, no 11-type framework, just
_"HOOK (10 words maximum): Name the exact moment or feeling. Stop there."_

### What actually runs, every generation

| Call | Fires? |
|---|---|
| CALL 1 understanding (Haiku) | yes |
| CALL 1.5 gold hook (Sonnet) | **never** — unreachable |
| CALL 2 rich body / 11-type framework (Haiku) | **never** — unreachable |
| CALL 2 fallback body (bare hook instruction, Haiku) | this writes every member hook |
| CTA / screen_text / caption | yes (fallback path) |

The member-facing hook is written by the bare fallback prompt. The sophisticated
gold-hook + 11-type machinery is dead code. This is a plausible root cause of the
hook-quality complaint.

## Root cause

Both lines were introduced together in commit `86ffdba` ("Add per-product script
regeneration," 2026-06-23), which is the blame boundary for the region. The gold-hook
mechanism was **mis-scoped from birth** — the producer (`var goldHookNote`) landed in
the nested CALL 1.5 callback while the consumer (`understandingNote += goldHookNote`)
stayed one scope up in the CALL 1 callback. Not a rename, not a false conditional: a
refactor that split a variable's declaration and use across sibling callback scopes.

The sibling path `generateScriptBank` (L~7359) is **clean** — its `understandingNote`
is declared and consumed in the same scope. `goldHookNote` is the only variable split
this way.

## The fix (isolated, held)

Move the consumer into the scope where the producer exists: remove
`understandingNote += goldHookNote;` from the CALL 1 handler, and append it right after
`goldHookNote` is computed in the CALL 1.5 handler, before the CALL 2 prompt is built.
One-line move. With L6522 no longer throwing, the CALL 1.5 fetch is reached, the rich
CALL 2 prompt is built, and the intended pipeline runs.

## Confirmation via logging (`model_usage`)

This is why token logging ships and collects **before** the fix. The proof is in the
data:

- **Before the fix:** zero `call_name = "hook"` rows (the Sonnet call never executes).
- **After the fix:** `hook` rows appear.

Zero `hook` rows before, `hook` rows after, is our proof the pipeline was dead and is
now live. `understanding` rows present + `hook` rows absent + `body` rows present (all
fallback) is the exact signature of the bug.

# Merge notes — `examples-ownership-hooks` → `main`

Read this before merging. The branch is large (~3,300 lines across `app.html`,
two Netlify functions, and the test suites). The full test suite is green, but
**the tests run against stubs** — a fake DOM, a fake `fetch`, an SSE stub — not
the real model or real Netlify. Green means the wiring and logic hold; it does
not by itself prove live behavior. See the live-status notes on each item.

---

## ⚠️ HEADLINE: Current is no longer identical to `main`

**This changes what "flip back to Current" actually gives you.** The Current
engine's *prompt* is unchanged, but its **figure/provenance guard is not** — so
reverting the engine default to Current does **not** return you to `main`'s
behavior. It returns you to `main`'s prompt with a **changed guard**.

What changed: the compound word-number fix lives in the shared helpers
`numbersIn` / `numberUnits` (in `window.SaxeBrief`), which **every engine uses,
Current included**. As of this branch:

- A word compound composes to one value: `"twenty-four"` → 24, `"two hundred"`
  → 200 (previously it split into 20 and 4, or 2 and 100).
- So a script figure now clears the listing in cases it used to be blocked in —
  e.g. the listing says `24-hour timer` and the script says `twenty-four hours`,
  or vice-versa.

Net effect on Current: its figure guard is **slightly more permissive and more
correct** than `main`'s. This is a bug fix (it stops false blocks on legitimate
specs), not a regression — but it **is** a behavior change on the "safe
fallback" path, and the escape hatch does not restore byte-identical `main`
behavior. If you need true `main` behavior, revert to `main`, not to Current.

The separate **conversational-figures** loosening (bare time/quantity phrases
skip the provenance check) is gated to **lean/minimal only** — Current still
hard-checks every figure. So Current's only change from `main` is the compound
composition described above.

---

## The fixed member config (Minimal + Sonnet + liability-only)

Members run on a fixed configuration and have **no controls**:

- **Engine → Minimal**
- **Model → Sonnet**
- **Guards → Liability-only**

The engine / model / guards toggles are experiment controls a member has no way
to judge — every wrong pick makes the tool worse for them — so they are hidden
from everyone except the owner (`isOwner()`, keyed on the owner's user id).
`applyOwnerGating()` force-sets the fixed config for any confirmed non-owner on
every render and generate, so a member lands there even if a stale `localStorage`
value says otherwise; it never fires while the user is unknown (pre-auth), so the
owner's own stored choices are not clobbered.

The **owner** still sees all three toggles and their stored choices win. So the
escape hatch is owner-only now: only the owner can flip the engine back to Current
(or guards to Full), and doing so changes only what the owner sees — members stay
on the fixed config. **Caveat:** flipping the engine back to Current does not
restore `main` — see the headline above.

## What the new defaults expose

1. **Minimal is the newest, least-proven generation path — now the default.**
   It runs **no** post-generation rewriting (no hook read-back, no buyer/grounding
   review), sends **no** system prompt, and relies on the model choosing well from
   a short prompt. Its raw first output reaches the screen after guards. That is
   the experiment's whole point, but it means new members land on the path with
   the least mileage. Current remains fully intact as the fallback.

2. **Sonnet + the streaming backend (`claude-stream.mjs`).**
   Live status: **proven against the real Anthropic API on the deploy preview** —
   every Sonnet batch generated there used this endpoint and returned. It is
   **untested on `main` only**, not untested in the wild. Two things still travel
   with it: it costs **~$2/member/month more** than Haiku (now the default cost
   for everyone), and it depends on Netlify granting the streaming function's 60s
   budget (the reason it exists — the synchronous `/api/claude` caps at ~26s).

3. **Liability-only guards as default is a real loosening.**
   Taste guards — repeated setups/CTAs, invented market trends, invented social
   proof, citing the reviews, stating the current year, naming a doubt — now
   render as an **amber note instead of being dropped/regenerated**. Hard-liability
   guards (price, health/contamination, company service, ownership-time,
   unverifiable figures, em-dash, moderation) still drop. A new member can now see
   a flagged-but-on-screen script that Full guards would have removed.

## Other changes worth knowing

4. **Conversational figures (lean/minimal only).** Bare time/quantity phrases
   ("in two years", "two seconds", "a hundred times") are no longer
   provenance-checked in those engines. Percent and price stay hard; physical
   specs still checked. New this cycle; light real-world testing.

5. **Ownership guard was narrowed.** The first-person *block* guard is gone
   entirely — no state disallows "I/my/mine" now, since a TikTok Shop creator must
   own the product to film. Only the **time-of-use** guard remains, and it is
   regex-based and deliberately conservative (errs toward letting present tense
   through), so a borderline duration claim phrased outside its patterns can slip.
   Ownership is now two states: **in hand** (default) and **used over time**.

6. **Lean engine** is fully built and behind the toggle but no longer the
   default — lower risk, still prod-untested code that ships in the bundle. It
   carries its own review pass (buyer diversity + grounding).

7. **Rendering / UX:** script-card fields auto-size to their content (no more
   fixed-height gaps); the minimal two-step output de-duplicates a hook the model
   echoes as the setup's first line. **must-include** is display/pass-through only.

8. **`netlify.toml` cleanup:** removed the dead `[functions."claude"] timeout =
   60` line — Netlify does not honor a 60s timeout on the synchronous function
   (that ~26s cap is the reason the streaming endpoint exists).

---

## Suggested pre-merge checklist

- [x] `claude-stream.mjs` verified against the real API (deploy preview, this cycle).
- [x] Dead `netlify.toml` timeout line removed.
- [ ] Decide whether the compound-number guard change on Current is acceptable to
      ship on `main` (it is a bug fix, but it is a change — see the headline).
- [ ] Confirm the fixed member config (Minimal / Sonnet / liability-only, no
      controls) is intended, and that the ~$2/member/month Sonnet cost is accepted.
- [ ] Confirm the owner id in `isOwner()` is correct; the toggles are visible only
      to that account.
- [ ] Watch the first real generations after merge. The owner-only escape hatch
      (flip the engine/guards toggles) changes only what the owner sees and does not
      restore `main`; changing what MEMBERS get is a code change, not a toggle.

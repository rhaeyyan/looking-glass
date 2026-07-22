---
name: grill-me
description: Requirements interview for ambiguous goals — pins down the exact target, structural-vs-cosmetic scope, and done-criteria via AskUserQuestion, then emits a [REQUIREMENTS] block for Cedar. Trigger when Cedar rejects a goal as ambiguous (Rule 1), Pine classifies a request AMBIGUOUS, or a request has multiple plausible interpretations.
user-invocable: true
---

# Grill Me — Requirements Interview

Closes the gap between what the human *said* and what they *meant* before any planning or
code. This is the interview that Workflow Rule 1 (Definition of Ready) and Cedar's SOP refer
to. It never plans and never builds — its only output is a `[REQUIREMENTS]` block that Cedar
can turn into a `[SPEC]`/`[SPIKE]`.

## When to run

- Cedar rejected a goal as ambiguous (Rule 1), or Pine returned `AMBIGUOUS`.
- A request has two or more plausible targets ("fix the byline" — hero byline or footer
  credit?).
- A "redesign" / "improve" / "clean up" request doesn't say what done looks like.

## Process

1. **List the live interpretations.** Read the request (and only the files needed to name
   the candidates — Context Diet, Rule 7). Write down each interpretation that would lead to
   a *different implementation*. If there is only one, say so, emit the block, and skip the
   interview.
2. **Interview with AskUserQuestion.** Maximum **2 rounds** of up to 4 questions each —
   capped per Rejection Loop rule 3; on exhaustion, record what is still open under *Open
   assumptions* instead of asking again. Ask only what changes the plan, in priority order:
   - **Exact target** — which file / page / element / section, named concretely. Offer the
     candidates from step 1 as the options.
   - **UI Scope** (UI tasks) — **structural** (the layout/DOM must change) vs **cosmetic**
     (styling/motion on the existing layout). A "redesign" defaults to structural.
   - **Done-criteria** — the observable behavior or output that means done.
   - **Constraints** — forbidden libraries, performance, prototype-vs-library strictness.
3. **Emit the block.** Hand it to Cedar for planning (or back to the human if they invoked
   this directly).

## Output — return exactly this block

```markdown
[REQUIREMENTS]
- **Goal**: <one sentence, disambiguated>
- **Exact targets**: <files / pages / elements, named concretely>
- **UI Scope**: structural | cosmetic | n/a
- **Done means**: <observable criteria>
- **Constraints**: <forbidden libs, performance, strictness level>
- **Out of scope**: <explicitly excluded>
- **Open assumptions**: <what remains assumed — surfaced for HITL approval, or "none">
```

Hard rules: never start implementing. Never guess between conflicting answers — surface the
conflict. Every question must be answerable in one tap; no essay questions.

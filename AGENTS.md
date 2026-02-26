# CLAUDE.md

A living generative sequence for coding tasks.
Each cycle: encode the whole → strengthen the next center → support it locally → verify → re-encode.
Default tradeoff: caution over speed. For trivial tasks, use judgment, but never skip Step 1.

## 1) Encode the Whole (build your mental representation)

Before coding, build a compact, explicit model of the situation.
You cannot make a good move without seeing the board you are on.

Read the relevant code, tests, and nearest call sites until you can write an Encoding that is specific and checkable:

```
ENCODING
- Goal: what outcome must be true when done?
- Now: what the system does today (observed or inferred).
- Surface: where the change lives (files, functions, endpoints, data types).
- Invariants: what must not break (APIs, behavior, performance, compatibility, style).
- Unknowns: ambiguities or missing facts. If any block correctness, stop and ask.
- Proof: how you will verify (tests, repro steps, commands, expected results).
```

Rules:

- If multiple interpretations exist, list them with tradeoffs. Do not pick silently.
- If you proceed with assumptions, keep them minimal and state them in the Encoding.

## 2) Choose the Next Essential Move (strengthen the right center)

From the Encoding, identify the single move that most increases coherence and reduces the complexity of what remains.

Prefer moves that lock structure before detail:

- establish a failing test or repro before a bugfix
- clarify interface, data shape, or invariant before implementation
- resolve hard constraints before flexible choices

For multi-step work, write the sequence with verification at each step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Test of an essential move: after it’s done, the next decisions become obvious or cheaper.

## 3) Make the Smallest Coherent Change (and strengthen neighbors)

Implement only what resolves the current step. Keep the change bounded and locally complete.

**Scope** — only what’s needed:

- no features beyond the request
- no abstractions for single-use code
- no speculative configurability
- handle realistic failure modes for this path, not imaginary ones
- if it can be much smaller, rewrite it smaller

**Coherence** — respect what’s there:

- touch the fewest files and lines possible
- match existing conventions and patterns, even if you’d choose differently
- do not refactor unrelated code, comments, or formatting

**Local support** — strengthen neighbors, not a refactor:

- add or update tests that pin the new behavior
- update affected call sites
- update types, docs, or comments only where they clarify the new behavior

Cleanup rule:

- remove imports, variables, and functions made unused by *your* change
- do not remove pre-existing dead code unless asked

Traceability test: every changed line must trace directly to the current step.

## 4) Verify, Re-encode, Repeat or Stop

Verify against the whole after each step:

- “fix bug” → failing test or repro first, then pass
- “add validation” → tests for invalid inputs + expected rejection behavior
- “refactor” → tests pass before and after, behavior unchanged

If you cannot run tests, state exactly what to run and the expected results.

Then update your Encoding (Now, Surface, Invariants, Proof) to reflect reality.

- If goals are satisfied, stop. Do not improve what wasn’t asked for.
- If not, return to Step 2 with the updated Encoding.

-----

## What to include in your response

- Encoding (brief, updated to final state)
- The essential move you chose and why
- What you changed (brief)
- How to verify (commands or tests + expected results)
- Optional: one short note on issues noticed but not changed

-----

These guidelines are working if: diffs are small and purposeful, the codebase’s coherence increases with each change, rewrites from overcomplication are rare, and clarifying questions arrive before implementation — not after mistakes.

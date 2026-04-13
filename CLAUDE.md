# CLAUDE.md

Guidance for Claude / AI assistants working in this repository.

## Project Overview

**fuzzly** is a TypeScript library that performs "approximate, good-enough" fuzzy matching of Korean (Hangul) text, intended for command-palette style search where the user types a few remembered characters or initial consonants and expects to narrow results live as they type.

The library targets a very specific UX:

1. The user types a few characters (initial consonants only is fine, partially composed syllables are fine, out-of-order across whitespace is fine).
2. Results must monotonically narrow as additional keystrokes are added — adding a keystroke must never *expand* the result set.
3. Intermediate composition states of a Hangul syllable (e.g. `ㄱ` → `가` → `갑` → `값`) must all match the same final target text.

See `readme.md` (Korean) for the long-form design notes and rationale, and `test_analysis.md` for a worked example of tail spillover behavior.

## Tech Stack & Tooling

- **Language:** TypeScript (strict mode), ESM (`"type": "module"`)
- **Runtime target:** `esnext`, `lib: ["ES2024", "ESNext.Intl"]` — depends on `Intl.Segmenter`
- **Build:** [`tsup`](https://tsup.egoist.dev/) emitting both ESM and CJS with `.d.ts`
- **Tests:** [`vitest`](https://vitest.dev/) with `globals: true`, Node environment, `test/**/*.test.ts`
- **Package entry:** `./src/index.ts` (raw TS — consumers are expected to bundle, or use the `tsup` build output `dist/`)

There is **no linter, formatter, or pre-commit hook** configured. Don't add one without being asked.

### Common commands

```bash
npm test          # vitest run (one-shot)
npm run test:ui   # vitest watch / UI mode
npm run build     # tsup build into dist/ (esm + cjs + dts)
```

There is no separate `typecheck` script. `vitest` enables `typecheck` via `tsconfig.test.json`, and `tsup --dts` will also typecheck on build.

### TypeScript project layout

`tsconfig.json` is a solution file with two project references:

- `tsconfig.lib.json` — `rootDir: ./src`, includes `src` and `env.d.ts`
- `tsconfig.test.json` — adds `vitest/globals` types, includes both `test` and `src`

If you add a new top-level source folder, update the appropriate `tsconfig.*.json`.

## Repository Layout

```
src/
  index.ts                  Public API barrel (only export from here)
  types.ts                  All public types + DEFAULT_MATCH_OPTIONS
  buildQuery.ts             User input -> Query (with literal & atom decomposition)
  preprocessTarget.ts       Target string -> Target (grapheme-segmented, atom-decomposed)
  match.ts                  Core matching algorithm (Query + Target -> grapheme indices)
  buildMatchRanges.ts       Grapheme indices -> highlight ranges in original input
  internal/
    segmenter.ts            Singleton Intl.Segmenter (grapheme granularity, "und" locale)
    utils.ts                Hangul decomposition tables + decomposeToAtoms (atoms cache)

test/
  buildQuery.test.ts
  buildMatchRanges.test.ts
  match.test.ts             Largest test file — primary regression suite for the algorithm
  preprocessTarget.test.ts
  integration.test.ts       End-to-end pipeline tests
  comprehensive.test.ts     Currently a placeholder

readme.md                   Korean design notes — read these before changing match.ts
test_analysis.md            Worked example explaining a tail-spillover edge case
env.d.ts                    Declares optional FUZZLY_USE_SEGMENTER env var
```

## Public API

The only supported import surface is `src/index.ts`:

```ts
import {
  buildQuery,
  preprocessTarget,
  match,
  buildMatchRanges,
  // types
  Query, QueryGrapheme, Target, MatchRange, GraphemeIndices, Atoms,
  QueryOptions, TargetOptions, MatchOptions,
} from "fuzzly";
```

The intended pipeline is:

```
buildQuery(userInput, queryOpts)         -> Query
preprocessTarget(targetStr, targetOpts)  -> Target   (cache this per item)
match(query, target, matchOpts)          -> number[] | null  (grapheme indices)
buildMatchRanges([hits...], target)      -> MatchRange[]     (UTF-16 char ranges in target.input)
```

Targets are expected to be precomputed once and reused across many queries — that's the whole point of separating `preprocessTarget` from `match`.

## Domain Concepts (read before touching `match.ts`)

These terms appear throughout the code and are critical to understanding the algorithm.

### Hangul anatomy

A modern Hangul syllable like `값` decomposes into:

- **lead / 초성:** the leading consonant (`ㄱ`)
- **vowel / 중성:** the vowel, possibly a diphthong (`ㅏ`)
- **tail / 종성:** the trailing consonant, possibly a cluster (`ㅄ` → `ㅂㅅ`)

`internal/utils.ts` contains the Unicode tables (`LEAD_TABLE`, `VOWEL_TABLE`, `TAIL_TABLE`) plus split maps:

- `VOWEL_SPLIT_MAP` — `ㅘ → ㅗㅏ`, `ㅙ → ㅗㅐ`, etc. (compound vowels into atoms)
- `TAIL_SPLIT_MAP` — `ㄳ → ㄱㅅ`, `ㄻ → ㄹㅁ`, etc. (compound tails into atoms)

### Atoms

`Atoms` (currently `type Atoms = string`) is a fully-decomposed sequence of single jamo "keystroke atoms." Compound vowels and compound tails are split. So `값` becomes the string `"ㄱㅏㅂㅅ"` (4 atoms).

`decomposeToAtoms` is **memoized via `atomsCache: Map<string, Atoms>`** in `internal/utils.ts`. This memoization is what makes the equality check `qAtoms === tAtoms` in `match.ts` valid — the strings are interned. Don't break this invariant: always go through `decomposeToAtoms` to get an `Atoms` value.

### Graphemes

Both `Query` and `Target` segment input by *grapheme cluster* using the shared `Intl.Segmenter` instance from `internal/segmenter.ts`. This means emoji, ZWJ sequences, and so on are treated as a single unit and indexed accordingly.

- `Target.graphemes: Array<Atoms>` — one entry per grapheme. For single-codepoint clusters this is the decomposed atom string; for multi-codepoint clusters (emoji etc.) it's the cluster string itself.
- `Target.charIndexes[i]` — UTF-16 start offset of grapheme `i` in the original input.
- `Target.graphemeIndexes[utf16Offset]` — reverse map from UTF-16 offset back to grapheme index. Only populated at meaningful offsets; assume sparse and access via known indices only.
- `QueryGrapheme` carries the per-grapheme metadata `match` needs: `atoms`, `vowelIndex`, `tailIndex` (start of tail in `atoms`, `-1` if none), `allowTailSpillover` (currently always set to `false` by `buildQuery`).

### Spillover

If the user types `갑` while really meaning to start typing `가방`, the trailing `ㅂ` should be tried as the **initial** consonant of the *next* target grapheme. This is "tail spillover."

`MatchOptions.tailSpillover`:

- `"never"` — disable
- `"always"` — every query syllable's tail can spill into the next target grapheme
- `"lastOnly"` (default) — only the **last** query grapheme spills (assumed to be mid-composition)

Vowels never spill — no Korean syllable starts with a vowel.

`MatchOptions.remainder` controls what happens when query atoms are exhausted but the target grapheme still has leftover atoms (e.g. query `가` against target `갑`):

- `"strict"` — leftover atoms cause failure (with a `tailSpillover` exception in code)
- `"allow"` — always accept
- `"tailSpilloverOnly"` (default) — accept only if the current query grapheme is one for which spillover would be enabled

The defaults are in `DEFAULT_MATCH_OPTIONS`:
```ts
{ whitespace: "ignore", caseSensitive: true, tailSpillover: "lastOnly", remainder: "tailSpilloverOnly" }
```

Note: `MatchOptions.whitespace` is declared (`"ignore" | "literal" | "normalize"`) but `match.ts` does not currently branch on it explicitly — whitespace handling currently falls out of grapheme-by-grapheme iteration. Treat this as a known gap and ask before adding behavior here.

### Literal queries

`buildQuery` treats input that is fully wrapped in double quotes (`"…"`) as a **literal** query: no fuzzy decomposition, just `indexOf` on `target.normalizedInput`. The resulting `Query.literal` is non-null and `Query.graphemes` is empty. `match` has a dedicated literal branch at the top.

For non-literal input, `buildQuery` strips all `"` characters (this is flagged as a known design question in a code comment — leave it unless explicitly asked to change).

### Case sensitivity

Lower-casing happens at the *input* boundary in both `buildQuery` and `preprocessTarget` based on their respective `caseSensitive` options. `MatchOptions.caseSensitive` exists in the type but `match` does not re-normalize — make sure query and target were built with consistent case settings.

## Algorithm Notes (`src/match.ts`)

`match` walks query graphemes (`qi`, with intra-grapheme atom cursor `qai`) against target graphemes (`tgi`) with one big `TARGET_CHAR_LOOP`. Key invariants and tricks to preserve when editing:

1. **Reference equality on atoms** (`qAtoms === tAtoms`) is a fast path that depends on the `atomsCache` interning. If you stop routing atom strings through `decomposeToAtoms`, this branch silently breaks.
2. **`qai !== 0` means "we are mid-spillover"** — i.e., the previous target grapheme already consumed the lead atoms of the current query grapheme, and we're now trying to consume the rest from the next target grapheme(s). Spillover advances `tgi` on each step. Compound-tail clusters (e.g. `ㄳ` as a *lead* of a query grapheme) are explicitly allowed to spill across multiple target graphemes (see the `vowelIndex === -1` branch).
3. **Vowels never spill.** When mismatch occurs at a vowel position (`qai < tailIndex` and `qai >= vowelIndex`), the entire current target grapheme is rejected and we move on (`qai = 0; tgi++`).
4. **Tail mismatches are conditionally spilled** based on `tailSpillover === "always"` or (`"lastOnly"` and `qi === queryGraphemes.length - 1`).
5. The function returns `number[]` of *target grapheme indices* that participated in the match (one entry per matched query grapheme, plus extra entries when a single query grapheme spills across multiple target graphemes). It does **not** return UTF-16 ranges — that conversion is `buildMatchRanges`' job.
6. There is a comment at the top of `match.ts` literally saying "30분 후에 보면 잊어버릴 코드" ("code I'll forget in 30 minutes") — this file is intentionally dense. Before refactoring it, read `readme.md` and `test_analysis.md`, and run the full `test/match.test.ts` after every change.

## `buildMatchRanges`

Takes one or more hit arrays (sorted grapheme indices, one array per sub-query) plus a `Target`, dedupes, sorts, and converts contiguous runs of grapheme indices into `{ start, end }` UTF-16 ranges using `target.charIndexes`. The end of a range past the last grapheme falls back to `target.input.length`. The function assumes single-array input is already sorted and skips re-sorting it.

## Conventions

- **Imports inside `src/`** use relative paths and explicit extensions are not required (bundler resolution).
- **`internal/`** is private — do not re-export anything from `internal/` through `src/index.ts`.
- **All public types live in `src/types.ts`.** Don't define exported types ad hoc in feature files.
- **No comments in non-Korean text are required** — existing code mixes Korean inline comments with English identifiers. When adding comments to existing files, match the surrounding language. New top-level docs (like this file) can be in English.
- **Don't create new files unless the task requires it.** This codebase is small and intentionally flat under `src/`.
- **No emojis in source or commits** unless the user explicitly asks.

## Testing Conventions

- Tests live under `test/` and end in `.test.ts`. Vitest is configured to scan `test/**/*.test.ts` only — tests inside `src/` will not be picked up.
- `globals: true` is on, so `describe` / `it` / `expect` are ambient. No imports required, but existing tests still import them — match the surrounding style.
- The `match.test.ts` suite is the canonical regression bed for the matching algorithm. Any change to `match.ts`, `buildQuery.ts`, or `preprocessTarget.ts` should pass it without modification, and new behavior should add cases there.
- When debugging an unexpected match/non-match, write down the target grapheme atoms and query grapheme atoms first (the way `test_analysis.md` does) before changing code.

## Git & Branching

- Default branch: `main`.
- When working on behalf of Claude Code on the web, develop on the assigned feature branch and push there. Never push to `main` without explicit user approval.
- Commit messages in this repo are short, lowercase-ish, present-tense, English (e.g. `fix tail spillover matching logic`, `change Atoms to string from readonly string[]`). Match that style.
- There are no commit hooks. Don't add any.
- Do **not** open pull requests automatically — only when the user explicitly asks.

## Things That Are Intentionally Not Done Yet

These are noted in code comments / `readme.md` and should not be "fixed" silently:

- Whitespace handling is under-specified — the `MatchOptions.whitespace` enum exists but `match` doesn't fully branch on it. The README discusses four possible semantics; the current de facto behavior is "ignore" via grapheme iteration.
- `allowTailSpillover` on `QueryGrapheme` is always set to `false` by `buildQuery`; spillover decisions currently come from `MatchOptions.tailSpillover` instead. The per-grapheme flag is reserved for future use (knowing which grapheme is mid-composition).
- `buildQuery` strips all `"` from non-literal input, which means searching for a literal `"` is currently impossible. Flagged in a code comment.
- The matching algorithm's edge cases are not exhaustively analyzed — see the comment at the top of `match.ts`.

If a task seems to touch any of these, surface the trade-off to the user instead of guessing.

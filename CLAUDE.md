# CLAUDE.md

## Project Overview

Fuzzly is a Korean fuzzy matching library for command palette interfaces. It supports partial Korean character input matching, including initial consonant (초성) search and mid-composition IME input. Zero runtime dependencies.

## Commands

- `npm test` — run all tests (vitest)
- `npm run test:ui` — run tests in watch/UI mode
- `npm run build` — bundle to ESM + CJS with declarations (`tsup src/index.ts --dts --format esm,cjs`)

## Architecture

The matching pipeline has four stages:

```
buildQuery(input) → Query
preprocessTarget(text) → Target
match(query, target, options?) → GraphemeIndices | null
buildMatchRanges(hits, target) → MatchRange[]
```

### Source layout

```
src/
├── index.ts              # Public API exports
├── types.ts              # All type definitions + DEFAULT_MATCH_OPTIONS
├── buildQuery.ts         # Parse user input → Query (handles literal/"quoted" mode, grapheme decomposition)
├── preprocessTarget.ts   # Segment target text → Target (grapheme arrays + character index mappings)
├── match.ts              # Core fuzzy matching algorithm (state machine over atom sequences)
├── buildMatchRanges.ts   # Convert grapheme indices → character position ranges for UI highlighting
└── internal/
    ├── utils.ts          # Korean Jamo decomposition (decomposeToAtoms), vowel detection, atom caching
    └── segmenter.ts      # Intl.Segmenter wrapper (grapheme granularity)
```

### Key concepts

- **Atoms** (`string`): A character decomposed into its smallest Korean Jamo units. E.g., `"한"` → `"ㅎㅏㄴ"`. Non-Korean characters pass through as-is.
- **Tail spillover**: When a query character's final consonant (종성) doesn't match the current target character, it can "spill over" to match the next target character's initial consonant. Controlled by `tailSpillover` option: `"never"` | `"always"` | `"lastOnly"` (default).
- **Literal mode**: Wrapping a query in double quotes (`"exact"`) triggers exact substring matching instead of fuzzy.
- **Atom interning**: `decomposeToAtoms()` caches results in a `Map` and returns the same string reference, enabling `===` comparison in the match loop.

### Match options

```typescript
{
  whitespace: "ignore" | "literal" | "normalize",  // default: "ignore"
  caseSensitive: boolean,                           // default: true
  tailSpillover: "never" | "always" | "lastOnly",  // default: "lastOnly"
  remainder: "strict" | "allow" | "tailSpilloverOnly" // default: "tailSpilloverOnly"
}
```

## Code Conventions

- **Language**: TypeScript with strict mode. Target ESNext.
- **Types**: All types live in `src/types.ts`. Use existing types rather than creating ad-hoc ones.
- **Comments**: Inline comments are in Korean. Maintain this convention.
- **No external linters/formatters** configured — follow existing code style (4-space indentation, double quotes in imports, semicolons).
- **No runtime dependencies** — keep the library dependency-free.
- **Tests**: Colocated in `test/` directory, one test file per source module. Use vitest globals (`describe`, `it`, `expect` — no imports needed). Test file naming: `<module>.test.ts`.

## Testing

Tests are comprehensive (~1600 lines across 6 files). When modifying matching logic, run the full suite — edge cases around tail spillover, whitespace handling, and partial character input are extensively covered.

Key test files:
- `test/match.test.ts` — core matching algorithm (spillover, whitespace, literal mode)
- `test/integration.test.ts` — end-to-end pipeline tests
- `test/buildQuery.test.ts` — query parsing
- `test/preprocessTarget.test.ts` — target preprocessing
- `test/buildMatchRanges.test.ts` — range calculation

## Common Pitfalls

- The `match.ts` algorithm uses labeled loops (`TARGET_CHAR_LOOP`) and stateful index tracking (`qi`, `qai`, `tgi`). Changes here require careful reasoning about all state transitions.
- Atom strings are interned via cache — reference equality (`===`) is intentional, not a bug.
- `Atoms` type was recently changed from `readonly string[]` to `string` (single concatenated string). Atom comparison uses character indexing, not array indexing.
- Korean Jamo has multiple Unicode ranges (Hangul Jamo, Hangul Compatibility Jamo, Hangul Syllables). The decomposition in `utils.ts` handles all three.

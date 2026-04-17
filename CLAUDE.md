# CLAUDE.md

## Project Overview

**fuzzly** — 커맨드팔레트용 한글 퍼지 매칭 TypeScript 라이브러리. 초성, 부분 조합, 중간 IME 상태 모두 매칭. 타이핑할수록 결과가 단조감소(monotonic narrowing).

## Commands

```bash
npm test            # vitest run
npm run build       # tsup → dist/ (esm + cjs + iife + dts)
npm run check:fix   # biome check --write (format + lint + import sort)
```

소스/테스트 수정 후 커밋 전에 `npm run check:fix` + `npm test` 실행.

## Key Architecture

### Atom ID System (`internal/atomRegistry.ts`)

모든 자모/문자에 정수 ID 할당 (Uint8Array):
- **고정**: 자음 1-19, 모음 20-33, ASCII 34-128
- **동적**: CJK/emoji 등 129-254 (126개, 초과 시 RangeError)
- LUT: `isVowelLUT`, `isConsonantLUT`, `isHangulJamoLUT` — Uint8Array indexed

`decomposeToAtoms(ch)` → `Uint8Array` (interned via cache, `===` 참조동등 유효).

### Target Flat Layout

`preprocessTarget(input)` → `Target`. 이전 `TargetGrapheme[]` 대신 flat typed array:

```
atomsFlat: Uint8Array      — 전체 atom ID 연결
atomStarts: Uint32Array    — grapheme i의 시작 offset
atomLens: Uint8Array       — grapheme i의 atom 수
vowelIdxs / tailIdxs: Int8Array — -1 = 없음
boundaryFlags: Uint8Array  — 0/1
charIndexes / graphemeIndexes: Uint16Array — 입력 65535자 초과 시 RangeError
```

grapheme i의 atom j 접근: `atomsFlat[atomStarts[i] + j]`

### IDB 직렬화

Target의 모든 필드가 `string | number | TypedArray`이므로 structuredClone/IDB 직접 저장 가능.
동적 atom이 있으면 `snapshotDynamicAtoms()` / `restoreDynamicAtoms()` 로 registry 저장/복원 필요.
한글+ASCII 전용이면 추가 조치 불필요.

### match.ts

3개 함수: `match` (greedy), `matchBest` (DP + scoring), `matchLiteral` (indexOf).

핵심 규칙:
- **vowel-sticks-to-lead**: 쿼리 모음은 초성이 매치된 타겟 음절 안에서만 소비
- 종성은 이후 음절로 자유롭게 넘어감 (자음 자리만)
- 모음은 절대 spill하지 않음
- `matchBest` DP: candidate 수집 → Pareto frontier → gap/consecutive sweep → backtrack

## Public API (`src/index.ts`)

```
buildQuery(input) → Query
preprocessTarget(input) → Target
match(query, target) → MatchResult | null
matchBest(query, target, scoring?) → MatchResult | null (score 포함)
matchLiteral(literal, target) → MatchResult | null
buildMatchRanges(hitMaps[], target) → MatchRange[]
createSearcher(items, opts?) → Searcher (session 최적화 내장)
hasDynamicAtoms() / snapshotDynamicAtoms() / restoreDynamicAtoms()
```

## Conventions

- Biome enforced. 수동 포맷 금지, `check:fix` 사용
- `import type { … }` 필수 (Biome `useImportType`)
- `internal/`은 private — `index.ts`에서 re-export 금지 (atom registry 함수 제외)
- 모든 public type은 `types.ts`에 정의
- 테스트: `test/**/*.test.ts`, `globals: true`, `match.test.ts`가 canonical regression suite
- 커밋: 짧고 소문자, 현재형 영어. hook 없음
- `main` 직접 push는 사용자 승인 필요. PR 자동 생성 금지

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

### Query 레이아웃

`buildQuery(input)` → `Query`. 분해된 `graphemes: QueryGrapheme[]`와 함께 `charIndexes`/`graphemeIndexes`(Uint16Array)를 보유한다. 이 매핑은 caller가 넘긴 `composingIndex`(UTF-16 char index)를 grapheme 인덱스로 변환하는 데 사용된다. 65535자 초과 시 `RangeError`.

### IDB 직렬화

Target의 모든 필드가 `string | number | TypedArray`이므로 structuredClone/IDB 직접 저장 가능.
동적 atom이 있으면 `snapshotDynamicAtoms()` / `restoreDynamicAtoms()` 로 registry 저장/복원 필요.
한글+ASCII 전용이면 추가 조치 불필요.

### match.ts

3개 함수: `match` (greedy), `matchBest` (DP + scoring), `matchLiteral` (indexOf).

핵심 규칙:
- **vowel-sticks-to-lead**: 쿼리 모음은 초성이 매치된 타겟 음절 안에서만 소비
- 종성 spill은 **spillMode 정책**에 따름 (아래 섹션) — 조합중 grapheme에서만 허용, finalized grapheme은 anchor 내부로 제한
- 모음은 절대 spill하지 않음
- `matchBest` DP: candidate 수집 → Pareto frontier → gap/consecutive sweep → backtrack

### spillMode / composingIndex (IME composing 기반 finalized 엄격성)

**원리**: 사용자가 모음까지 친 finalized grapheme은 "이 음절을 완성하려는 의도"로 간주. 해당 grapheme은 타겟 anchor와 **구조 매치**(atom 시퀀스 정확히 일치)를 요구. 조합중(composing) grapheme만 기존 관대 매칭(tail spill + anchor 잉여 atom 허용).

결과적으로 쿼리 `"으"`(finalized) ≠ 타겟 `"은"`, `"일"`(finalized) ≠ `"읽"` 등 false positive가 감소한다.

**`SpillMode`** (`SearchOptions.spillMode`, `match`/`matchBest` 5번째 인자):
| 값 | 동작 |
|---|---|
| `"always"` | 모든 grapheme 조합중 취급 (기존 동작, 전부 spill 허용) |
| `"composing"` | `composingIndex`가 지정한 grapheme만 관대, 없으면 전부 엄격 |
| `"composingOrLast"` (**기본값**) | `composingIndex` 지정되면 그것만, `undefined`면 마지막 grapheme 자동 추정, `null`이면 모두 엄격 |

**`composingIndex`** (`Searcher.search` 3번째 인자, `match`/`matchBest` 4번째 인자):
- `number` — 조합중인 char의 UTF-16 인덱스 (예: `compositionupdate` 시점의 `selectionStart`)
- `null` — 명시적 "조합중 없음" (쿼리 뒤 공백 후 trim 케이스 등 caller가 확정 가능할 때)
- `undefined` — caller가 모름 → spillMode 기본 동작 적용

`tailSpillPenalty`는 `spillMode === "always"`일 때만 적용된다 (다른 모드에서는 spill 자체가 차단되어 무의미).

초성-only grapheme과 non-Hangul(ASCII, 이모지)은 spillMode 영향을 받지 않는다.

**Compound jongseong 예외**: composing 바로 앞(`resolvedComposing === gi + 1`) 위치의 finalized grapheme이 compound jongseong(ㄶ/ㄺ/ㄻ/ㄼ/ㄽ/ㄾ/ㄿ/ㅀ/ㄳ/ㄵ/ㅄ)을 포함하면 "확장 composing"으로 승격되어 tail spill + anchor-extras-prefix 룰이 적용된다. IME에서 compound jongseong이 finalized로 남는 건 이 위치에서만 자연 발생 (예: `연`+`ㅎ`→`엲` 뒤에 `ㄱ` 입력 → `막엲ㄱ` vs `막연하게` 매치). Single jongseong은 모든 위치에서 strict.

**세션 최적화**: `createSearcher`는 직전 호출 대비 `spillMode`/`composingIndex`/`whitespace`/`allowChoseongMatch`가 바뀌면 세션을 자동 리셋한다.

### allowChoseongMatch (초성매치 허용 토글)

**`SearchOptions.allowChoseongMatch`** (기본 `true`, `match`/`matchBest` 6번째 인자):

| 값 | 동작 |
|---|---|
| `true` (**기본값**) | 기존 동작 — 초성 자모 나열(`ㅁㅇㅎㄱ`)로 target 초성 매치 허용 |
| `false` | "journey 매칭만" — finalized 초성-only 쿼리 grapheme 차단 + compound jongseong 완화 비활성화 |

`false`일 때의 의도: caller가 IME 타이핑 journey의 유효 중간상태만 매치시키고 초성 나열식 검색은 거부하려는 용도.

- ✗ `ㅁㅇㅎㄱ` vs `막연하게` — 전부 finalized 초성-only
- ✗ `막엲ㄱ` vs `막연하게` — compound 완화 off → `엲` strict → 불일치
- ✓ `ㅁ`+`composingIndex=0` vs `막연하게` — composing grapheme은 예외
- ✓ `막엲` vs `막연하게` — `엲`이 composing (journey 중)
- ✓ `막연학` vs `막연하게` — composing `학`의 자연 tail spill은 journey의 일부

### whitespace 모드 (공백 처리)

**`WhitespaceMode`** (`SearchOptions.whitespace`, `buildQuery` 2번째 인자 `{ whitespace }`):
| 값 | 동작 |
|---|---|
| `"literal"` (**기본값**) | 공백을 일반 atom으로 취급. `"a b"`는 target에 literal 공백이 있어야 매치 (VSCode 커맨드 검색 스타일) |
| `"ignore"` | 쿼리에서 공백 grapheme을 제거 후 매칭. `"a b"` ≡ `"ab"` (VSCode 파일 검색 스타일) |

`ignore` 모드는 `buildQuery`에서 공백 grapheme을 drop하는 전처리만 수행. `match`/`matchBest` 알고리즘은 변경 없음. `matchLiteral` 및 `SearchOptions.literal: true` 경로는 whitespace 옵션을 **무시**한다 (raw substring 경로).

`ignore` 모드에서도 `Query.charIndexes`/`graphemeIndexes`는 **원본 input의 UTF-16 좌표를 유지**하므로, caller는 raw char offset 기준의 `composingIndex`를 그대로 전달하면 된다. 공백 char 위치의 `graphemeIndexes`는 "다음 non-space grapheme 인덱스"로 매핑된다 (후행 공백이면 `graphemes.length` → 조합중 없음으로 해석).

## Public API (`src/index.ts`)

```
buildQuery(input, opts?: { whitespace? }) → Query
preprocessTarget(input) → Target
match(query, target, composingIndex?, spillMode?, allowChoseongMatch?) → MatchResult | null
matchBest(query, target, scoring?, composingIndex?, spillMode?, allowChoseongMatch?) → MatchResult | null (score 포함)
matchLiteral(literal, target) → MatchResult | null
buildMatchRanges(hitMaps[], target) → MatchRange[]
createSearcher(items, opts?) → Searcher (session 최적화 내장)
  searcher.search(queryInput, options?, composingIndex?)
hasDynamicAtoms() / snapshotDynamicAtoms() / restoreDynamicAtoms()
```

주요 타입:
- `SpillMode` = `"always" | "composing" | "composingOrLast"` (기본 `"composingOrLast"`)
- `WhitespaceMode` = `"literal" | "ignore"` (기본 `"literal"`)
- `SearchOptions.allowChoseongMatch?: boolean` (기본 `true`)

## Conventions

- Biome enforced. 수동 포맷 금지, `check:fix` 사용
- `import type { … }` 필수 (Biome `useImportType`)
- `internal/`은 private — `index.ts`에서 re-export 금지 (atom registry 함수 제외)
- 모든 public type은 `types.ts`에 정의
- 테스트: `test/**/*.test.ts`, `globals: true`, `match.test.ts`가 canonical regression suite
- 커밋: 짧고 소문자, 현재형 영어. hook 없음
- `main` 직접 push는 사용자 승인 필요. PR 자동 생성 금지

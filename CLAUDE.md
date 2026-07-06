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

atom ID는 **순수함수**로 산출 (글로벌 가변 상태 없음). 결정적, 세션·인스턴스·앱 간 portable.

- 자음 (ㄱ-ㅎ): 고정 1-19
- 모음 (ㅏ-ㅣ basic 14개): 고정 20-33
- ASCII printable (0x20-0x7E): 고정 34-128
- 그 외: **UTF-16 code unit 값 그대로** (codepoint-as-ID)
  - BMP 단일 codepoint: 1 atom (예: 漢 → ID 0x6F22)
  - non-BMP·multi-codepoint cluster: code unit별 N atom (예: 😀 → 2 atoms, 👨‍👩‍👧 → 8 atoms)

LUT (`isVowelLUT`/`isConsonantLUT`/`isHangulJamoLUT`)는 Uint8Array(256). 동적 영역(>128) ID는 OOB read → undefined → `=== 1` false. 의도된 동작.

`decomposeToAtoms(ch)` → `Uint16Array` (interned via cache, `===` 참조동등 유효).

**충돌 (실 사용에선 미발생)**: 제어문자 U+0000-U+001F는 ID 0-31로 자모 영역과, U+007F/U+0080은 fixed ASCII와 충돌. command palette 텍스트엔 등장하지 않으므로 무시.

**필드 concat 금지**: 멀티필드를 흉내내려 여러 필드를 구분자로 이어 붙이지 말 것. 개행 `\n`(U+000A)은 code unit 10 → atom ID 10 = `ㅅ`과 충돌하므로 `"a\nb"`가 `ㅅ`을 매치하는 등 오염이 생긴다. 여러 필드는 `matchFields`/멀티필드 searcher로 처리한다.

### Target Flat Layout

`preprocessTarget(input)` → `Target`. flat typed array 레이아웃:

```
atomsFlat: Uint16Array     — 전체 atom ID 연결
atomStarts: Uint32Array    — grapheme i의 시작 offset
atomLens: Uint8Array       — grapheme i의 atom 수 (cluster는 1보다 큼)
vowelIdxs / tailIdxs: Int8Array — -1 = 없음
boundaryFlags: Uint8Array  — 0/1
charIndexes / graphemeIndexes: Uint16Array — 입력 65535자 초과 시 RangeError
```

grapheme i의 atom j 접근: `atomsFlat[atomStarts[i] + j]`

### Query 레이아웃

`buildQuery(input)` → `Query`. 분해된 `graphemes: QueryGrapheme[]`. 65535자 초과 시 `RangeError`.

### IDB 직렬화

Target의 모든 필드가 `string | number | TypedArray`이므로 structuredClone/IDB 직접 저장 가능.
atom ID가 순수함수 산출이라 세션·인스턴스 간 자동 일치 — 별도 매핑 저장/복원 불필요.

**무효화 계약**: `PREPROCESS_VERSION` (export 상수)은 Target 레이아웃/atom 인코딩 구조가
바뀔 때만 bump된다 (atom ID 값 자체는 순수함수라 안정 → 값 안정성엔 영향 없음).
fuzzly는 이 버전만 노출하고, 무효화 판단은 소비자 몫이다. 소비자는 이 값을 **캐시 행마다
적지 말고** 스토어 단위로 한 번만 기록(예: IDB meta 레코드 하나)해두고, 로드 시 불일치하면
저장된 Target 전체를 재전처리한다.

### match.ts

2개 함수: `matchBest` (DP + scoring), `matchLiteral` (indexOf).

핵심 규칙:

- **vowel-sticks-to-lead**: 쿼리 모음은 초성이 매치된 타겟 음절 안에서만 소비
- tail spill은 이후 target grapheme의 **초성 위치**에만 허용
- anchor extras는 쿼리 tail prefix와 정확히 일치해야 함
- `matchBest` DP: candidate 수집 → Pareto frontier → gap/consecutive sweep → backtrack

### strict 모드

**`SearchOptions.strict`** (`matchBest` 4번째 인자):

| 값                   | 동작                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `false` (**기본값**) | 모든 한글 grapheme을 관대하게 매칭 — IME journey 수용                                                     |
| `true`               | 모음 포함 쿼리 grapheme은 target anchor와 atom 시퀀스 정확 일치 요구 (tail spill 금지 + anchor 잉여 금지) |

초성-only grapheme과 non-Hangul은 `strict` 영향을 받지 않는다.

IME 축약 복원(예: `막엲ㄱ` → `막연하게`)은 별도 규칙 없이 `strict=false`의 일반 lenient 매치로 자연 수용된다. 초성-only 쿼리(`ㅁㅇㅎㄱ`)도 동일하게 매치되며, 순위는 scoring(anchorFill)으로 하단에 밀려난다.

**세션 최적화**: `createSearcher`는 `literal` 토글 시 세션을 리셋한다 (`strict`/`whitespace`는 인스턴스 단위로 고정이라 애초에 안 바뀜). 재사용 판정은 **토큰별 atom prefix**: 이전 쿼리의 모든 토큰이 각각 새 쿼리의 어떤 토큰의 atom-prefix이면 이전 매치만 재스캔한다. split 모드도 이 규칙으로 세션 재사용되며, 멀티필드도 동일 로직을 공유한다.

**chosung un-gating 가드** (issue #35): `chosung: false` 필드가 하나라도 있는 멀티필드 searcher에서는 atom-prefix만으로 단조성이 성립하지 않는다. 초성-only 토큰은 `chosung:false` 필드에서 gate-out되므로, 모음이 붙어 초성-only가 풀리는 순간(예: `ㅍ`→`파`) 그 필드가 un-gate되어 매치 집합이 **커진다**. `makeRuntime`는 이전 토큰이 초성-only인데 대응 현재 토큰이 초성-only가 아니면 재사용을 금지(full scan)하여 단조 narrowing을 보존한다. `chosung:false` 필드가 없으면 이 가드는 무효(single-field 포함).

### whitespace 모드 (공백 처리)

**`WhitespaceMode`** (`SearchOptions.whitespace`, `buildQuery` 2번째 인자 `{ whitespace }`):
| 값 | 동작 |
|---|---|
| `"preserve"` | 공백을 일반 atom으로 취급. `"a b"`는 target에 literal 공백이 있어야 매치 (VSCode 커맨드 검색 스타일) |
| `"ignore"` (**기본값**) | 쿼리에서 공백 grapheme을 제거 후 매칭. `"a b"` ≡ `"ab"` (VSCode 파일 검색 스타일) |
| `"split"` | 공백 boundary로 sub-query 분리 → 순서 무관 AND. 모든 sub가 hit이어야 매치. `"제목 멋진"` ≡ `"멋진 제목"` |

`ignore` 모드는 `buildQuery`에서 공백 grapheme을 drop하는 전처리만 수행. `matchBest` 알고리즘은 변경 없음.

`split` 모드는 `/\s+/` boundary로 토큰화 후 각 토큰을 `'ignore'` sub-Query로 빌드한다. **atom-prefix dedup**: AND 조건이라 다른 토큰의 atom-prefix인 토큰은 redundant — 짧은 쪽 제거 (`"a ab"` → `["ab"]`, `"안녕 안"` → `["안녕"]`). `matchBest`는 각 sub-query를 독립 매칭 후 합성: `indices`는 union sort dedup, `score`/`boundaryHits`/`runCount`는 Σ 단순합, `startsAtZero`는 OR. 하나라도 매치 실패면 전체 `null`.

`matchLiteral` 및 `SearchOptions.literal: true` 경로는 whitespace 옵션을 **무시**한다 (raw substring 경로).

### Scoring (5축 가산 합)

`matchBest` DP 스코어는 모든 축의 단순 가산 합. 배율·후보정·discrete jump 없음.

| 축                                   | 설명                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **anchorFill**                       | Σ (각 target anchor에 떨어진 atom 수)² × 가중치. 한 anchor에 atom이 몰릴수록 비선형 보상. 같은 다른 조건이면 완전 매치 쪽이 유리해지는 주축 |
| **positionZero**                     | 첫 매치가 target index 0에서 시작 시 고정 보너스                                                                                            |
| **boundary**                         | 단어 경계 매치당 고정 보너스                                                                                                                |
| **consecutive**                      | 각 maximal consecutive run 길이 L에 대해 Σ (L-1)² × 가중치 (제곱). 긴 run을 비선형 우대                                                     |
| **gapPenalty / targetLengthPenalty** | gap 거리 / target 길이 × 페널티 (선형, cap 없음)                                                                                            |
| **graphemeBonus**                    | 매치된 atom마다 해당 atom이 속한 grapheme의 bonus 가산 (per-atom). spill 포함                                                               |

핵심 포인트: anchorFill은 Σ(atoms²) 스케일이라 한 anchor에 atom이 몰린 완전 매치가 이 항 기준으로 유리하다. 다만 실제 총점은 다른 보너스/페널티 축과의 합으로 결정된다.

### 멀티필드 매칭 (`matchFields.ts`)

하나의 (split) 쿼리를 여러 필드(Target)에 대해 **토큰 단위 cross-field AND**로 매칭한다. split 위에 서므로
`whitespace: "split"`과 함께 쓴다. 토큰 = `query.subQueries ?? [query]` (non-split은 통째 1토큰).

| 규칙 | 동작 |
| --- | --- |
| **토큰 AND** | 각 토큰은 `max over fields(weighted score)`로 최적 필드 결정. 모든 토큰이 ≥1 필드에서 hit해야 통과, 하나라도 미커버면 `null` |
| **argmax 귀속** | 각 토큰은 argmax 필드에만 하이라이트 귀속(winner-takes-highlight). weighted 동점이면 **낮은 필드 인덱스** 승 (strict `>`) |
| **부호 보존 weight** | `score >= 0 ? score*w : score/w`. weight를 올리면 양·음수 전 구간에서 유리. `weight > 0` 필수 (아니면 `RangeError`) |
| **토큰 단위 chosung** | 토큰의 모든 grapheme이 자음-only일 때만 "초성 토큰". 초성 토큰은 `chosung: false` 필드에서 후보 수집 스킵(hard filter). 혼합 토큰(`홍ㄱ`)은 영향 없음 |
| **score 분리** | 아이템 최상위 `score` = Σ 토큰 best **weighted**. `perField[i].score` = 그 필드 귀속 토큰들의 **raw**(비가중) 합 (`mergeMatchResults`, split 합성과 동일 규칙) |
| **길이 정규화 없음** | 짧은 필드 우위는 의도된 동작 (정규화하지 않음) |
| **dedup 계약** | split의 atom-prefix dedup 그대로. `"홍길동 홍"` ≡ `"홍길동"` |

`createSearcher(items, { fields, … })` = **멀티필드 searcher**. `fields`는 `key`/`target`과 상호 배타(TypeError),
빈 배열·필드에 key/target 둘 다 없음도 TypeError, weight ≤ 0은 생성 시점 RangeError. 각 필드는
`key`(→`preprocessTarget`) 또는 `target`(prebuilt hydrate) 공급. 단일·멀티는 세션 재사용/heap/incremental 로직을
공유 런타임(`makeRuntime`)으로 통일하고 per-entry `evaluate` 클로저만 다르다. literal 멀티필드는 any-field
substring이며 score 0 (단일 필드 literal과 동일).

## Public API (`src/index.ts`)

```
buildQuery(input, opts?: { whitespace? }) → Query
preprocessTarget(input) → Target
matchBest(query, target, scoring?, strict?) → MatchResult | null (score 포함)
matchLiteral(literal, target) → MatchResult | null
matchFields(query, fields, opts?: { scoring?, strict? }) → FieldsMatchResult | null (토큰 단위 cross-field AND)
buildMatchRanges(hitMaps[], target) → MatchRange[]
createSearcher(items, opts?: SearcherOptions) → Searcher (session 최적화 내장)
  searcher.search(queryInput, options?: SearchResultOptions)
createSearcher(items, opts: MultiFieldSearcherOptions) → MultiFieldSearcher (멀티필드 모드)
  searcher.search(queryInput, options?) → MultiFieldSearchResult[] (필드별 result/ranges)
```

옵션 분리 (옵션 위치 = 의미):

- `SearcherOptions` (인스턴스 단위 정책): `key`, `strict`, `whitespace`, `scoring`, `score`. 한 번 만든 searcher는 동일 정책으로 모든 search 호출. 다른 정책 필요 시 새 인스턴스.
- `SearchResultOptions` (per-call): `limit`, `literal`. search 단위로만 의미 있는 옵션.
- `SearchOptions` 는 `SearchResultOptions` 의 alias (deprecated).

**Silent-ignore guard**: createSearcher 에 `limit`/`literal` 같은 per-call 키, 또는 search 에 `whitespace`/`strict`/`scoring`/`score` 같은 정책 키를 넘기면 dev 모드에서 `console.warn` (production 빌드는 스킵). 잘못된 위치 옵션의 silent ignore 차단.

주요 타입:

- `WhitespaceMode` = `"preserve" | "ignore" | "split"` (기본 `"ignore"`)
- `SearcherOptions.strict?: boolean` (기본 `false`)

## Conventions

- Biome enforced. 수동 포맷 금지, `check:fix` 사용
- `import type { … }` 필수 (Biome `useImportType`)
- `internal/`은 private — `index.ts`에서 re-export 금지
- 모든 public type은 `types.ts`에 정의
- 테스트: `test/**/*.test.ts`, `globals: true`, `match.test.ts`가 canonical regression suite
- 커밋: 짧고 소문자, 현재형 영어. hook 없음
- `main` 직접 push는 사용자 승인 필요. PR 자동 생성 금지

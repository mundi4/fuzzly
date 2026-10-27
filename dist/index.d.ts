import { G as GraphemeIndices, T as Target, M as MatchRange, W as WhitespaceMode, Q as Query, a as MultiFieldSearcherOptions, b as MultiFieldSearcher, S as SearcherOptions, c as Searcher, d as MatchBestOptions, e as MatchResult, f as ScoringConfig, g as MatchField, F as FieldsMatchResult, h as TargetWhitespaceMode, i as TextSegment } from './score-Bic3btt6.js';
export { A as Atoms, m as MultiFieldSearchResult, n as QueryGrapheme, l as SCORING, o as ScanCursor, p as ScoringWeights, r as SearchOptions, s as SearchResult, t as SearchResultOptions, q as SearcherFieldSpec, j as createGraphemeBonuses, k as defaultScore } from './score-Bic3btt6.js';

/**
 * 매칭된 grapheme 인덱스 배열들을 원문 문자열의 하이라이트 범위(UTF-16 offset)로 변환한다.
 * 연속된 grapheme 인덱스는 하나의 범위로 합쳐진다.
 *
 * @param hitMaps - `MatchResult.indices` 배열 하나 이상. 여러 sub-query 결과를 합칠 때 사용.
 * @param target - `preprocessTarget`으로 생성한 타겟 (charIndexes 사용)
 * @returns 정렬된 MatchRange 배열 (UI 하이라이팅에 사용)
 */
declare function buildMatchRanges(hitMaps: GraphemeIndices[], target: Target): MatchRange[];

/**
 * 사용자 입력 문자열을 grapheme 단위로 분해하여 Query 객체를 생성한다.
 * 대문자는 소문자로 정규화된다.
 *
 * `opts.whitespace` 동작 (기본값 `"ignore"`):
 * - `"preserve"`: 공백을 일반 atom으로 취급 (`"ab cd"`는 target에 literal 공백이 있어야 매치).
 * - `"ignore"`: 공백 grapheme을 제거 후 매칭 (`"ab cd"` ≡ `"abcd"`).
 * - `"split"`: 공백 boundary로 sub-query를 분리해 순서 무관 AND 매칭.
 *   동일 토큰 또는 다른 토큰의 atom-prefix인 토큰은 redundant로 제거된다.
 *   예: `"안녕 안"` → `["안녕"]`, `"a ab"` → `["ab"]`, `"ㅇㄴ 안녕"` → `["안녕"]`.
 *   결과 outer Query는 `graphemes: []`, `atoms: ""`이며 `subQueries`에 dedup된 sub Query들이 담긴다.
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 *
 * @param input - 사용자의 검색 입력 (한글 초성, 부분 조합, 영문 등 모두 허용)
 * @param opts - 빌드 옵션. `whitespace` 기본값은 `"ignore"`
 * @returns 분해된 Query 객체
 */
declare function buildQuery(input: string, opts?: {
    whitespace?: WhitespaceMode;
}): Query;

/**
 * 검색 인스턴스를 생성한다. 아이템 목록을 내부에 보관하고
 * `search()` 호출마다 최적 매칭+스코어링을 수행한다.
 *
 * **매칭 정책 옵션은 옵션 객체에서 고정**된다 — `strict`, `whitespace`, `scoring`, `score`.
 * 다른 정책이 필요하면 새 searcher 인스턴스를 만든다.
 * `searcher.search()` 단계에는 per-call 옵션 (`limit`, `literal`) 만 받는다.
 *
 * **멀티필드 모드**: `options.fields`를 주면 여러 필드(Target)에 대해 토큰 단위 cross-field AND로
 * 매칭한다 (`matchFields`). `fields`는 `key`/`target`과 상호 배타.
 *
 * **IME 입력 세션 최적화**: 이전 쿼리의 토큰별 atom prefix 확장이면
 * 이전에 매치된 아이템만 재검색하여 성능을 높인다. `literal` 모드 토글 시 세션이 자동 단절된다.
 *
 * @param items - 검색 대상 아이템 목록
 * @param options - 매칭 정책. T가 string이 아니면 `key`/`target` 또는 `fields` 필수.
 */
declare function createSearcher<T>(items: readonly T[], options: MultiFieldSearcherOptions<T>): MultiFieldSearcher<T>;
declare function createSearcher<T>(items: readonly T[], options: SearcherOptions<T> & ({
    key: (item: T) => string;
} | {
    target: (item: T) => Target;
})): Searcher<T>;
declare function createSearcher(items: readonly string[], options?: SearcherOptions<string>): Searcher<string>;

/**
 * 리터럴 substring 매칭 (대소문자 무시).
 *
 * 모든 occurrence를 순회해 간이 스코어가 가장 높은 위치를 채택하고 `score`를 세팅한다
 * (issue #26 — 첫 occurrence 고정 + score 부재로 literal 랭킹이 입력 순서였던 문제):
 * - `positionZero`: 매치가 target 선두에서 시작
 * - `boundary`: 매치 시작 grapheme이 단어 경계
 * - `targetLengthPenalty`: target 길이 페널티 (짧은 타겟 우대)
 *
 * 가중치는 `scoring.weights`를 따른다 (생략 시 기본 `SCORING` 상수) — fuzzy 경로와
 * 동일한 config 로 literal 랭킹도 튜닝된다.
 *
 * occurrence 수는 실제 텍스트에서 소수이므로 전 occurrence 순회 비용은 무시 가능.
 *
 * **알려진 edge (transparent 타겟)**: literal 경로는 whitespace 옵션을 무시하는 raw
 * substring 경로이므로, 공백을 포함한 literal이 `whitespace: "transparent"` 타겟에
 * 매치되면 공백 위치의 indices/하이라이트는 공백의 이웃 grapheme 기준이 된다
 * (공백은 grapheme을 소비하지 않아 다음 grapheme으로 매핑됨).
 */
declare function matchLiteral(literal: string, target: Target, scoring?: ScoringConfig): MatchResult | null;
/**
 * DP 기반 최적 정렬 매칭 + 스코어링.
 *
 * **매칭 규칙**:
 * - 기본(`strict=false`): 모든 한글 grapheme을 관대하게 매칭 (lead+vowel 매치 후 tail spill 가능,
 *   anchor extras는 쿼리 tail prefix와 일치 필요).
 * - `strict=true`: 모음 포함 쿼리 grapheme은 target anchor와 atom 시퀀스가 정확히 일치해야 함.
 *   초성-only grapheme과 non-Hangul은 영향 없음.
 *
 * 초성-only 쿼리, tail spill, IME 축약 입력 등은 별도 규칙 없이 scoring으로 품질 차이를 반영한다
 * (anchor에 atom이 얇게 분산된 매치는 `anchorFill`의 Σ(atoms²) 기여가 작고,
 * graphemeBonus도 per-atom 기준으로 덜 누적되어 자연스럽게 후순위).
 *
 * **split 모드**: `query.subQueries`가 채워져 있으면 각 sub-query를 독립적으로 매칭한 뒤
 * 모두 hit인 경우만 결과를 합성한다 (`indices`는 union sort dedup, score/메타는 Σ 단순합).
 * 하나라도 매치 실패면 `null`.
 *
 * @param query - `buildQuery`로 만든 쿼리
 * @param target - `preprocessTarget`으로 만든 타겟
 * @param options - `{ scoring?, strict? }` 옵션 객체 (권장).
 *   하위호환으로 `(query, target, scoring?, strict?)` positional 형태도 지원한다 (deprecated).
 * @returns 매치되면 `MatchResult` (with `score`), 아니면 `null`
 */
declare function matchBest(query: Query, target: Target, options?: MatchBestOptions): MatchResult | null;
/** @deprecated positional `scoring`/`strict` 대신 `matchBest(query, target, { scoring, strict })` 사용 */
declare function matchBest(query: Query, target: Target, scoring?: ScoringConfig, strict?: boolean): MatchResult | null;

/**
 * 하나의 (split) 쿼리를 여러 필드(Target)에 대해 토큰 단위 cross-field AND로 매칭한다.
 *
 * - 각 토큰은 모든 필드 중 weighted score가 최대인 필드(argmax)에 귀속된다 (winner-takes-highlight).
 * - 모든 토큰이 ≥1 필드에서 hit해야 통과(AND). 하나라도 미커버면 `null`.
 * - 최상위 `score`는 토큰별 best weighted score의 합, `perField[i].score`는 raw(비가중) 합.
 *
 * @param query - `buildQuery`의 출력. split 모드면 `subQueries`가 토큰이 된다.
 * @param fields - 필드 정의 배열. 각 필드는 `target`(필수)·`weight`를 가진다.
 * @param opts - `scoring`(config 또는 target별 함수), `strict`.
 */
declare function matchFields(query: Query, fields: MatchField[], opts?: {
    scoring?: ScoringConfig | ((target: Target) => ScoringConfig);
    strict?: boolean;
}): FieldsMatchResult | null;

/**
 * `Target` 영속화(직렬화) 포맷 버전.
 *
 * `Target`은 `structuredClone`/IndexedDB에 직접 저장하고 다른 세션에서 그대로
 * hydrate할 수 있다. atom ID는 순수함수 산출이라 값 자체는 안정적이지만,
 * fuzzly 업그레이드로 **Target 필드 구성이나 atom 인코딩 구조**가 바뀌면
 * 저장된 Target이 조용히 호환 불가가 된다. 이 상수는 그 무효화 계약을 명시한다:
 * 구조, 또는 전처리 산출 값(normalizedInput, boundaryFlags 등)이 바뀌면 bump한다.
 *
 * **소비 계약**: 이 값을 **캐시 행마다** 적을 필요는 없다. 소비자는 스토어 단위로
 * 한 번만 기록해두고(예: IndexedDB의 meta 레코드 하나), 로드 시 불일치하면
 * 저장된 Target 전체를 재전처리한다. 무효화 판단 주체는 소비자이며, fuzzly는
 * 이 버전 값만 노출한다. 같은 버전 안에서 두 공백 모드(`keep`/`transparent`)가
 * 공존하므로 **모드 식별은 버전이 아니라 `Target.whitespace` 필드**로 한다.
 *
 * 이력: v5 — NFD 한글(conjoining jamo cluster)의 모음·종성 atom 유실 수정 (#22).
 * v4 — 단어 경계 구분자에 `/` `\` `:` 추가 (`boundaryFlags` 산출 변경).
 * v3 — `Target.whitespace` 필드 추가 + `preprocessTarget`의 `transparent` 모드 도입.
 * v2 — normalizedInput 산출이 `toLowerCase()`에서 길이보존·문맥무관 `foldCase`로
 * 변경 (İ 원문 유지, Σ/ς 통일). v1 시절 직렬화된 Target 은 좌표계·atom 인코딩이 다르다.
 */
declare const PREPROCESS_VERSION = 5;
/**
 * 검색 대상 문자열을 grapheme 단위로 분해하고 flat typed array 레이아웃으로 저장한다.
 * 결과 Target 객체는 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 패턴.
 *
 * 반환된 `Target`은 모든 필드가 `string | number | TypedArray`이고
 * atom ID가 순수함수로 산출되므로(자모/ASCII 고정 + 그 외는 codepoint 그대로)
 * `structuredClone` / IndexedDB에 직접 저장하고 어떤 세션에서든 그대로 로드 가능하다.
 * 영속화 시 무효화 판단은 {@link PREPROCESS_VERSION} 상수로 한다 (스토어 단위 1회 기록).
 *
 * **`opts.whitespace`** (기본 `"keep"`):
 * - `"keep"`: 공백을 독립 grapheme으로 방출 (기존 동작).
 * - `"transparent"`: **U+0020 공백만** grapheme으로 방출하지 않는다 — 쿼리 축 기본값
 *   `whitespace: "ignore"`가 제거하는 것(단일 U+0020 grapheme)과 정확히 대칭.
 *   공백 낀 near-exact 매치가 연속 run으로 인정된다. 스킵된 공백 다음 grapheme은
 *   단어 경계로 표시되고, 공백의 UTF-16 위치는 `graphemeIndexes`에서 다음에 방출된
 *   grapheme으로 매핑된다 (꼬리 공백은 마지막 grapheme으로 클램프).
 *   **`graphemeCount`가 공백을 세지 않으므로** `targetLengthPenalty × T`에서 공백이
 *   빠진다 (의도된 시맨틱). 공백 포함 `whitespace: "preserve"` 쿼리와는 비호환 —
 *   타겟에 공백 grapheme이 없어 구조적으로 매치 불가 (dev 모드 경고).
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError` (공백 포함 원문 길이 기준).
 * 커맨드팔레트 용도에서는 도달할 수 없는 한계.
 *
 * @param input - 검색 대상 원문 문자열
 * @param opts - 전처리 옵션. `whitespace` 기본값은 `"keep"`
 * @returns 전처리된 Target 객체 (`match`, `matchBest`의 두 번째 인자로 사용)
 */
declare function preprocessTarget(input: string, opts?: {
    whitespace?: TargetWhitespaceMode;
}): Target;

/**
 * 원문 문자열을 `MatchRange[]` 기준으로 하이라이트 조각 배열로 분할한다 —
 * 프레임워크 중립 하이라이트 렌더링 헬퍼.
 *
 * `SearchResult.ranges()` / `buildMatchRanges` 결과를 그대로 받아
 * `[{ text, matched }]`를 반환하므로, 소비자는 escape/조립 boilerplate 없이
 * matched 조각만 `<mark>`/`<span>` 등으로 감싸면 된다.
 *
 * ranges는 정렬·비중첩(오름차순)을 가정한다 (`buildMatchRanges`가 보장).
 * 빈 range(start >= end)와 원문 범위를 벗어나는 부분은 무시된다.
 *
 * @example
 * ```ts
 * const [r] = searcher.search("ㅍㅇ"); // 타겟 "파일 열기" — ㅇ은 "일"의 초성에 매치 (연속 run 우대)
 * segmentByRanges(r.target.input, r.ranges());
 * // → [{ text: "파일", matched: true }, { text: " 열기", matched: false }]
 * ```
 */
declare function segmentByRanges(text: string, ranges: readonly MatchRange[]): TextSegment[];

export { FieldsMatchResult, GraphemeIndices, MatchBestOptions, MatchField, MatchRange, MatchResult, MultiFieldSearcher, MultiFieldSearcherOptions, PREPROCESS_VERSION, Query, ScoringConfig, Searcher, SearcherOptions, Target, TargetWhitespaceMode, TextSegment, WhitespaceMode, buildMatchRanges, buildQuery, createSearcher, matchBest, matchFields, matchLiteral, preprocessTarget, segmentByRanges };

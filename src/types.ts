/**
 * grapheme cluster를 atom ID 시퀀스로 분해한 결과.
 *
 * 모든 ID는 결정적(순수함수)으로 산출된다 — 글로벌 가변 상태 없음.
 * - 한글 자모 (ㄱ-ㅎ, ㅏ-ㅣ): 고정 ID 1-33
 * - ASCII printable (0x20-0x7E): 고정 ID 34-128
 * - 그 외: UTF-16 code unit 값 그대로 (codepoint-as-ID)
 *   · BMP 단일 codepoint는 1 atom (예: 漢 → ID 0x6F22)
 *   · non-BMP·multi-codepoint cluster는 code unit별로 N atom
 *     (예: 😀 → 2 atoms, 👨‍👩‍👧 → 8 atoms)
 *
 * `decomposeToAtoms`로 생성되며 내부 캐시에 의해 interning되므로
 * 동일 입력은 항상 동일 참조를 반환한다 (`===` 비교 가능).
 *
 * @see {@link Target} — Target 내부에서 atom ID는 flat 배열(`atomsFlat`)로 저장된다.
 */
export type Atoms = Uint16Array;

/**
 * 매치된 타겟 grapheme의 인덱스 배열.
 * 각 원소는 `Target` 내 grapheme 인덱스 (0-based).
 * `buildMatchRanges`에 전달하면 원문 문자 범위(MatchRange[])로 변환된다.
 */
export type GraphemeIndices = number[];

/**
 * 쿼리 문자열의 grapheme 하나에 대한 분해 정보.
 * `buildQuery`가 생성하며, `matchBest`의 매칭 단위가 된다.
 */
export interface QueryGrapheme {
    /** 원본 grapheme cluster 문자열 (예: "값", "a") */
    char: string;
    /** 자모 분해된 atom ID 시퀀스 */
    atoms: Atoms;
    /** atoms 내 중성(vowel) 시작 위치. 모음이 없으면 -1. */
    vowelIndex: number;
    /** atoms 내 종성(tail) 시작 위치. 종성이 없으면 -1. */
    tailIndex: number;
}

/**
 * 쿼리 공백 처리 정책.
 *
 * - `"preserve"`: 공백을 일반 atom으로 취급. `"ab cd"`는 target에 literal 공백이 있어야 매치 (VSCode 커맨드 검색 스타일)
 * - `"ignore"` (기본): 쿼리에서 공백 grapheme을 제거 후 매칭. `"ab cd"` ≡ `"abcd"` (VSCode 파일 검색 스타일)
 * - `"split"`: 공백 boundary로 sub-query를 분리한 뒤 순서 무관 AND. 모든 sub-query가 매치되어야 hit.
 *   동일 토큰 또는 다른 토큰의 atom-prefix인 토큰은 redundant로 제거된다 (`"안녕 안"` → `["안녕"]`).
 *   각 sub-query의 best match를 독립적으로 산출하고 indices는 union, score/메타는 Σ 단순합.
 */
export type WhitespaceMode = "preserve" | "ignore" | "split";

/**
 * `buildQuery`의 출력. 사용자 입력을 grapheme 단위로 분해한 결과.
 * `matchBest`의 첫 번째 인자로 사용한다.
 */
export interface Query {
    /** 원본 입력 문자열 */
    input: string;
    /**
     * grapheme별 분해 정보 배열. `whitespace: "ignore"`면 공백 grapheme은 제외됨.
     * `whitespace: "split"` 모드의 outer Query는 빈 배열이며 매칭은 `subQueries`로 위임된다.
     */
    graphemes: QueryGrapheme[];
    /**
     * 모든 grapheme의 atoms를 연결한 문자열.
     * IME 입력 중 이전 쿼리의 atom prefix인지 판별하는 데 사용된다
     * (createSearcher의 세션 최적화).
     *
     * `whitespace: "split"` 모드의 outer Query에서는 빈 문자열로 두어
     * 세션 prefix reuse가 자동으로 비활성화된다.
     */
    atoms: string;
    /** 이 Query가 빌드된 공백 처리 모드 */
    whitespace: WhitespaceMode;
    /**
     * `whitespace: "split"` 모드일 때만 채워진다. 공백 boundary로 분리된 각 토큰을
     * 독립 sub-Query로 빌드한 결과. 매칭은 `matchBest`가 모든 sub-query를 AND로 평가한다.
     * non-split 모드에서는 `undefined`.
     */
    subQueries?: Query[];
}

/**
 * `preprocessTarget`의 출력. 검색 대상 문자열을 grapheme 단위로 분해하고
 * flat typed array 레이아웃으로 저장한 결과.
 * 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 사용 패턴.
 *
 * **Flat 레이아웃**: 이전 버전의 `graphemes: TargetGrapheme[]` 객체 배열 대신
 * 모든 grapheme 데이터가 flat typed array로 저장된다.
 * - grapheme `i`의 atom 접근: `atomsFlat[atomStarts[i] + j]` (j < `atomLens[i]`)
 * - grapheme `i`의 vowel/tail 인덱스: `vowelIdxs[i]`, `tailIdxs[i]`
 *
 * **직렬화 (IndexedDB 등)**: 모든 필드가 `string | number | TypedArray`이므로
 * `structuredClone`으로 직접 저장/복원 가능하다.
 * atom ID는 순수함수로 산출되므로(자모/ASCII 고정 + 그 외는 codepoint 그대로)
 * 세션·인스턴스 간 무조건 동일. 별도 매핑 저장 불필요.
 *
 * **제약**: `charIndexes`와 `graphemeIndexes`가 `Uint16Array`이므로
 * 65535 UTF-16 코드유닛을 초과하는 입력은 지원하지 않는다.
 * 초과 시 `preprocessTarget`이 `RangeError`를 던진다.
 */
export interface Target {
    /** 원본 입력 문자열 (대소문자 원본 유지) */
    input: string;
    /** 소문자로 정규화된 입력 (literal 매칭에 사용) */
    normalizedInput: string;

    // --- flat grapheme 데이터 ---
    /** grapheme 수 */
    graphemeCount: number;
    /** 전체 atom ID 연결 배열 (동적 atom ID가 최대 65535까지 가능하므로 Uint16) */
    atomsFlat: Uint16Array;
    /** grapheme i의 atomsFlat 시작 오프셋 */
    atomStarts: Uint32Array;
    /** grapheme i의 atom 수 */
    atomLens: Uint8Array;
    /** grapheme i의 vowelIndex (-1 = 모음 없음) */
    vowelIdxs: Int8Array;
    /** grapheme i의 tailIndex (-1 = 종성 없음) */
    tailIdxs: Int8Array;
    /** 단어 경계 플래그 (0 또는 1) */
    boundaryFlags: Uint8Array;

    // --- 인덱스 매핑 ---
    /**
     * UTF-16 문자 위치 → grapheme 인덱스 매핑.
     * multi-codepoint cluster 내의 모든 문자가 같은 grapheme 인덱스를 가리킨다.
     */
    graphemeIndexes: Uint16Array;
    /**
     * grapheme 인덱스 → UTF-16 시작 문자 위치 매핑.
     * `buildMatchRanges`가 grapheme 인덱스를 문자 범위로 변환할 때 사용.
     */
    charIndexes: Uint16Array;
}

/**
 * `matchBest`의 반환값. 매칭 결과와 품질 메타데이터를 담는다.
 */
export type MatchResult = {
    /** 매치에 참여한 타겟 grapheme 인덱스 배열 (순서 유지) */
    indices: GraphemeIndices;
    /** 첫 매치가 타겟 위치 0에서 시작하는지 여부 */
    startsAtZero: boolean;
    /**
     * 연속 구간(run)의 수. 1이면 모든 매치가 연속, 2 이상이면 중간에 gap 존재.
     * 작을수록 매치 품질이 높다.
     */
    runCount: number;
    /** 단어 경계에서 매치된 grapheme 수 */
    boundaryHits: number;
    /** `matchBest`가 DP로 계산한 최적 정렬 스코어 */
    score?: number;
};

/**
 * 원문 문자열에서의 하이라이트 범위 (UTF-16 offset 기준).
 * `buildMatchRanges`가 반환하며 UI 하이라이팅에 사용한다.
 */
export type MatchRange = {
    /** 범위 시작 (inclusive, UTF-16 offset) */
    start: number;
    /** 범위 끝 (exclusive, UTF-16 offset) */
    end: number;
};

/**
 * 스코어링 가중치.
 *
 * 스코어는 가산형 축들의 합으로 계산된다:
 * - `anchorFill` × Σ (각 target anchor에 떨어진 atom 수)² — 완전 그래핌 매치 유도의 주축.
 *   제곱이라 한 anchor에 atom이 몰릴수록 비선형 보상.
 * - `positionZero` (첫 grapheme이 target index 0)
 * - `boundary` × (단어 경계 매치 수)
 * - `consecutive` × (indices 내 인접 tgi 쌍 수)
 * - `gapPenalty` × (gap 거리) + `targetLengthPenalty` × T
 * - per-atom `graphemeBonus`: 매치된 각 atom마다 해당 atom이 속한 grapheme의 bonus가 누적된다
 *
 * 초성-only 쿼리, tail spill, IME 축약 복원 등은 atom들이 여러 anchor에 1개씩 분산되어
 * **anchorFill 기준으로는 Σ(atoms²)가 작아지는 자연스러운 감점**을 받는다.
 * 실제 총점 순서는 다른 보너스/페널티 축 및 가중치 설정의 영향도 함께 받는다.
 */
export type ScoringWeights = {
    /**
     * 각 target anchor에 떨어진 atom 수의 **제곱**에 곱해지는 가중치.
     * candidate 전체에서 `Σ over anchors (atoms_in_anchor)² × anchorFill`로 기여.
     *
     * 예:
     * - 3 atoms이 한 anchor에 전부(완전 매치) = `anchorFill × 9`
     * - 2+1로 spill(분산) = `anchorFill × (4+1) = 5`
     * - 1+1+1로 완전 분산(초성-only) = `anchorFill × 3`
     *
     * 한 anchor에 몰릴수록 비선형으로 보상되어 anchorFill 항 기준으로 완전 매치가 유리해진다.
     */
    anchorFill?: number;
    /** 첫 매치가 target index 0에서 시작할 때의 보너스 */
    positionZero?: number;
    /** 단어 경계 매치 하나당 보너스 */
    boundary?: number;
    /** 각 maximal consecutive run 길이 L에 대해 (L-1)² 을 곱해 가산 (제곱) */
    consecutive?: number;
    /** gap 거리에 비례하는 페널티 (음수) */
    gapPenalty?: number;
    /** target 길이에 비례하는 페널티 (음수, cap 없음) */
    targetLengthPenalty?: number;
};

export type ScoringConfig = {
    weights?: ScoringWeights;
    /**
     * per-grapheme 추가 보너스. 배열 또는 `(graphemeIndex, target) => number` 함수.
     *
     * **per-atom 가산**: 매치된 각 atom마다 해당 atom이 속한 target grapheme의 bonus가 한 번씩 더해진다.
     * 즉 한 anchor에서 N개 atom이 매치되면 `N × bonus[anchorTgi]`가 가산된다.
     * spill 인덱스도 거기서 소비된 atom 수만큼 해당 grapheme의 bonus를 받는다.
     *
     * 완전 매치(atoms 많음)가 얇은 매치(atoms 적음)보다 더 많은 bonus를 받을 수 있게 하기 위함이며,
     * indices 수가 아닌 atom 수에 비례하므로 같은 bonus 설정에서는 atom을 더 적게 소비한 분산 매치가
     * graphemeBonus 항만으로 유리해지지는 않는다.
     */
    graphemeBonus?: number[] | ((graphemeIndex: number, target: Target) => number);
};

/**
 * `createSearcher`에 넘기는 옵션. **세션 의미가 있는 모든 옵션은 여기서 고정**된다 —
 * 한 번 만든 searcher는 동일한 매칭 정책으로 모든 `.search()` 호출을 처리한다.
 * 다른 정책이 필요하면 새 searcher 인스턴스를 만든다.
 */
export type SearcherOptions<T = string> = {
    /** 아이템에서 검색 키 문자열을 추출하는 함수. T가 string이 아니면 필수. */
    key?: (item: T) => string;
    /**
     * 엄격 매칭 모드. 기본 `false` (모든 한글 grapheme을 관대하게 매칭).
     *
     * `true`로 지정하면 모음이 포함된 쿼리 grapheme은 target anchor와 atom 시퀀스가
     * 정확히 일치해야 매치된다 (tail spill 금지 + anchor 잉여 atom 금지).
     * 초성-only grapheme과 non-Hangul은 영향을 받지 않는다.
     */
    strict?: boolean;
    /**
     * 쿼리 공백 처리 정책. 기본값: `"ignore"`.
     * `"preserve"`로 지정하면 공백을 일반 atom으로 취급, `"split"`은 공백 boundary로 분리해 순서 무관 AND.
     * @see {@link WhitespaceMode}
     */
    whitespace?: WhitespaceMode;
    /**
     * DP 가중치 / per-grapheme bonus. 객체이거나 target별로 다른 설정이 필요하면 함수 형태.
     * `matchBest` 호출 직전에 평가되어 적용된다.
     */
    scoring?: ScoringConfig | ((target: Target) => ScoringConfig);
    /**
     * 아이템 간 최종 정렬용 score 함수. 미지정 시 `MatchResult.score`(matchBest의 DP 결과)를 사용.
     * caller가 score 의미를 직접 정의하고 싶을 때 사용 (예: `defaultScore`).
     */
    score?: (result: MatchResult, target: Target) => number;
};

/**
 * `searcher.search()` 호출 단위로 결정되는 옵션 — per-call 의미만 남긴다.
 * 매칭 정책(`whitespace`/`strict`/`scoring`/`score`)은 `SearcherOptions`로 이동했다.
 */
export type SearchResultOptions = {
    /** 결과 상위 N개만 유지 (0 또는 미지정 = 전체). */
    limit?: number;
    /** `true`면 substring(literal) 매치 경로. `whitespace` 옵션은 무시되며 raw substring 비교. */
    literal?: boolean;
};

/** @deprecated `SearcherOptions` (정책) + `SearchResultOptions` (per-call) 로 분리됨. */
export type SearchOptions = SearchResultOptions;

export type SearchResult<T = string> = {
    item: T;
    target: Target;
    result: MatchResult;
    score?: number;
    ranges: () => MatchRange[];
};

export interface Searcher<T = string> {
    search(queryInput: string, options?: SearchResultOptions): SearchResult<T>[];
    add(...items: T[]): void;
    remove(predicate: (item: T) => boolean): void;
    replaceAll(items: readonly T[]): void;
}

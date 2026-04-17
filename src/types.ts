/**
 * 한글 음절(또는 비한글 grapheme)을 최소 단위 자모로 분해한 atom ID 시퀀스.
 *
 * 각 원소는 내부 atom registry가 할당한 정수 ID (0-254)이다.
 * - 한글 자모 (ㄱ-ㅎ, ㅏ-ㅣ): 고정 ID 1-33
 * - ASCII printable (0x20-0x7E): 고정 ID 34-128
 * - 기타 (CJK, emoji 등): 동적 ID 129-254 (등장 순서에 의존)
 *
 * `decomposeToAtoms`로 생성되며 내부 캐시에 의해 interning되므로
 * 동일 입력은 항상 동일 참조를 반환한다 (`===` 비교 가능).
 *
 * **Breaking change**: 이전 버전에서는 `string` 타입이었다.
 * 문자열 메서드(`.charAt()`, `.indexOf()` 등)는 사용할 수 없으며
 * `Uint8Array` 인터페이스(`[i]`, `.length`, `.subarray()` 등)를 사용해야 한다.
 *
 * @see {@link Target} — Target 내부에서 atom ID는 flat 배열(`atomsFlat`)로 저장된다.
 */
export type Atoms = Uint8Array;

/**
 * 매치된 타겟 grapheme의 인덱스 배열.
 * 각 원소는 `Target` 내 grapheme 인덱스 (0-based).
 * `buildMatchRanges`에 전달하면 원문 문자 범위(MatchRange[])로 변환된다.
 */
export type GraphemeIndices = number[];

/**
 * 쿼리 문자열의 grapheme 하나에 대한 분해 정보.
 * `buildQuery`가 생성하며, `match`/`matchBest`의 매칭 단위가 된다.
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
 * `buildQuery`의 출력. 사용자 입력을 grapheme 단위로 분해한 결과.
 * `match`, `matchBest`의 첫 번째 인자로 사용한다.
 */
export interface Query {
    /** 원본 입력 문자열 */
    input: string;
    /** grapheme별 분해 정보 배열 */
    graphemes: QueryGrapheme[];
    /**
     * 모든 grapheme의 atoms를 연결한 문자열.
     * IME 입력 중 이전 쿼리의 atom prefix인지 판별하는 데 사용된다
     * (createSearcher의 세션 최적화).
     */
    atoms: string;
    /**
     * grapheme i → 원본 입력의 UTF-16 시작 문자 위치.
     * `composingIndex`(char index)를 grapheme 인덱스로 변환할 때 사용한다.
     */
    charIndexes: Uint16Array;
    /**
     * UTF-16 문자 위치 → grapheme 인덱스 매핑.
     * multi-codepoint cluster 내의 모든 문자가 같은 grapheme 인덱스를 가리킨다.
     */
    graphemeIndexes: Uint16Array;
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
 * 단, 동적 atom ID (CJK/emoji 등 비한글·비ASCII 문자)가 포함된 경우
 * 세션 간 ID 안정성을 보장하려면 `snapshotDynamicAtoms()`로 atom 매핑을
 * 함께 저장하고, 복원 시 `restoreDynamicAtoms()`를 Target 사용 전에 호출해야 한다.
 * 한글 + ASCII 텍스트만 포함된 경우 atom ID는 고정이므로 추가 조치 불필요.
 *
 * **제약**: `charIndexes`와 `graphemeIndexes`가 `Uint16Array`이므로
 * 65535 UTF-16 코드유닛을 초과하는 입력은 지원하지 않는다.
 * 초과 시 `preprocessTarget`이 `RangeError`를 던진다.
 *
 * @see {@link snapshotDynamicAtoms} — 동적 atom 매핑 저장
 * @see {@link restoreDynamicAtoms} — 동적 atom 매핑 복원
 * @see {@link hasDynamicAtoms} — 동적 atom 사용 여부 확인
 */
export interface Target {
    /** 원본 입력 문자열 (대소문자 원본 유지) */
    input: string;
    /** 소문자로 정규화된 입력 (literal 매칭에 사용) */
    normalizedInput: string;

    // --- flat grapheme 데이터 ---
    /** grapheme 수 */
    graphemeCount: number;
    /** 전체 atom ID 연결 배열 */
    atomsFlat: Uint8Array;
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
 * `match`/`matchBest`의 반환값. 매칭 결과와 품질 메타데이터를 담는다.
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
    /** 쿼리가 초성(자음)만으로 구성되었는지 여부 */
    initialConsonantOnly: boolean;
    /** `matchBest`가 DP로 계산한 최적 정렬 스코어. `match`는 이 필드를 설정하지 않는다. */
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

export type ScoringWeights = {
    positionZero?: number;
    boundary?: number;
    consecutive?: number;
    gapPenalty?: number;
    prefixBonus?: number;
    exactBonus?: number;
    targetLengthPenalty?: number;
    lengthPenaltyCap?: number;
    choseongWeaken?: number;
    /**
     * 종성이 anchor grapheme 밖으로 spill된 candidate에 가산되는 페널티.
     * **`spillMode === "always"` 일 때만 적용된다.** 다른 spillMode에서는
     * tail spill 자체가 차단되어 이 값과 무관하게 동작한다.
     */
    tailSpillPenalty?: number;
};

/**
 * finalized(확정된) grapheme에 대한 구조 매치 엄격성 정책.
 *
 * - `"always"`: 모든 grapheme을 조합중처럼 취급 (기존 동작, 모든 tail spill 허용)
 * - `"composing"`: 호출 시 넘긴 `composingIndex`가 가리키는 grapheme만 관대하게 매칭. 없으면 전부 엄격
 * - `"composingOrLast"`: `composingIndex` 명시 시 그것만, `undefined`면 마지막 grapheme 추정,
 *   `null`이면 아무것도 조합중 아님 (명시적 none, 공백 뒤 trim 케이스)
 *
 * Finalized + 모음 포함 grapheme은 anchor target grapheme과 atom 시퀀스가
 * 정확히 일치해야 매치된다 (tail spill 금지 + anchor 잉여 atom 금지).
 *
 * `composingIndex`는 쿼리 문자열의 UTF-16 인덱스이며 호출 시점마다 변하는 상태이므로
 * `SearchOptions`에 포함되지 않고 `search()` 함수의 별도 인자로 전달한다.
 */
export type SpillMode = "always" | "composing" | "composingOrLast";

export type ScoringConfig = {
    weights?: ScoringWeights;
    graphemeBonus?: number[] | ((graphemeIndex: number, target: Target) => number);
};

export type SearcherOptions<T = string> = {
    key?: (item: T) => string;
};

export type SearchOptions = {
    limit?: number;
    literal?: boolean;
    score?: (result: MatchResult, target: Target) => number;
    scoring?: ScoringConfig | ((target: Target) => ScoringConfig);
    /** finalized 구조 엄격성 정책. 기본값: `"composingOrLast"` */
    spillMode?: SpillMode;
};

export type SearchResult<T = string> = {
    item: T;
    target: Target;
    result: MatchResult;
    score?: number;
    ranges: () => MatchRange[];
};

export interface Searcher<T = string> {
    /**
     * @param queryInput - 쿼리 문자열
     * @param options - 검색 옵션 (limit, spillMode 등)
     * @param composingIndex - 조합중인 char의 UTF-16 인덱스 (상태; 매 호출 변함).
     *   `number` = 해당 위치 grapheme 조합중 / `null` = 명시적 없음 / `undefined` = 모름
     */
    search(queryInput: string, options?: SearchOptions, composingIndex?: number | null): SearchResult<T>[];
    add(...items: T[]): void;
    remove(predicate: (item: T) => boolean): void;
    replaceAll(items: readonly T[]): void;
}

/**
 * 한글 음절(또는 비한글 grapheme)을 최소 단위 자모로 분해한 문자열.
 * 예: "값" → "ㄱㅏㅂㅅ" (4 atoms). 복합 모음/종성도 분리됨.
 * `decomposeToAtoms`로 생성되며 내부 캐시에 의해 interning되므로
 * 동일 입력은 항상 동일 참조를 반환한다 (=== 비교 가능).
 */
export type Atoms = string;

/**
 * 매치된 타겟 grapheme의 인덱스 배열.
 * 각 원소는 `Target.graphemes` 배열의 인덱스.
 * `buildMatchRanges`에 전달하면 원문 문자 범위(MatchRange[])로 변환된다.
 */
export type GraphemeIndices = number[];

/**
 * 쿼리 문자열의 grapheme 하나에 대한 분해 정보.
 * `buildQuery`가 생성하며, `match`/`matchBest`의 매칭 단위가 된다.
 */
export interface QueryGrapheme {
    /** 원본 grapheme cluster 문자열 (예: "값", "a", "😊") */
    char: string;
    /** 자모 분해된 atom 시퀀스 (예: "값" → "ㄱㅏㅂㅅ") */
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
}

/**
 * 타겟 문자열의 grapheme 하나에 대한 분해 정보.
 * `preprocessTarget`이 생성하며, 매칭 시 쿼리 atoms와 비교된다.
 */
export interface TargetGrapheme {
    /** 자모 분해된 atom 시퀀스 */
    atoms: Atoms;
    /** atoms 내 중성(vowel) 시작 위치. 한글 음절이 아니면 -1. */
    vowelIndex: number;
    /** atoms 내 종성(tail) 시작 위치. 종성이 없으면 -1. */
    tailIndex: number;
}

/**
 * `preprocessTarget`의 출력. 검색 대상 문자열을 grapheme 단위로 분해하고
 * 경계/인덱스 메타데이터를 미리 계산한 결과.
 * 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 사용 패턴.
 */
export interface Target {
    /** 원본 입력 문자열 (대소문자 원본 유지) */
    input: string;
    /** 소문자로 정규화된 입력 (literal 매칭에 사용) */
    normalizedInput: string;
    /** grapheme별 분해 정보 배열 */
    graphemes: TargetGrapheme[];
    /**
     * UTF-16 문자 위치 → grapheme 인덱스 매핑.
     * `graphemeIndexes[charOffset]`은 해당 문자가 속한 grapheme의 인덱스.
     * multi-codepoint cluster 내의 모든 문자가 같은 grapheme 인덱스를 가리킨다.
     */
    graphemeIndexes: number[];
    /**
     * grapheme 인덱스 → UTF-16 시작 문자 위치 매핑.
     * `charIndexes[graphemeIdx]`는 해당 grapheme의 `normalizedInput` 내 시작 offset.
     * `buildMatchRanges`가 grapheme 인덱스를 문자 범위로 변환할 때 사용.
     */
    charIndexes: number[];
    /**
     * 단어 경계 플래그. `boundaryFlags[i] === true`이면 grapheme i가
     * 문자열 시작이거나 공백/밑줄/대시/점 바로 뒤에 위치한다.
     */
    boundaryFlags: boolean[];
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

/**
 * `matchBest` DP의 기본 SCORING 상수를 오버라이드한다.
 * 생략된 필드는 `SCORING` 기본값을 사용.
 *
 * 주의: gapPenalty와 consecutive는 DP sweep 최적화의 전제조건인
 * "상수 값"이어야 한다 (위치에 따라 달라지면 안 됨).
 * 위치별 가중치 조절이 필요하면 `ScoringConfig.graphemeBonus`를 사용할 것.
 */
export type ScoringWeights = {
    /** 타겟 위치 0 매치 보너스 (default: 100) */
    positionZero?: number;
    /** 단어 경계 매치 보너스 (default: 50) */
    boundary?: number;
    /** 직전 매치와 연속일 때 보너스 (default: 20) */
    consecutive?: number;
    /** 매치 사이 스킵된 grapheme당 페널티, 음수 (default: -3) */
    gapPenalty?: number;
    /** 위치 0부터 연속 매치(prefix) 보너스 (default: 200) */
    prefixBonus?: number;
    /** 쿼리가 타겟 전체와 일치할 때 보너스 (default: 500) */
    exactBonus?: number;
    /** 초성 전용 쿼리 페널티, 음수 (default: -30) */
    initialConsonantPenalty?: number;
    /** 타겟 grapheme 수당 페널티, 음수 — 짧은 타겟 선호 (default: -1) */
    targetLengthPenalty?: number;
};

/**
 * `matchBest`의 DP 스코어링을 커스터마이징하는 설정.
 *
 * `weights`로 기본 SCORING 상수를 오버라이드하고,
 * `graphemeBonus`로 특정 타겟 위치에 추가 점수를 부여할 수 있다.
 * graphemeBonus는 DP의 `candidatePositionScore`에 가산되므로
 * gap sweep/consecutive 최적화와 충돌 없이 정렬 선호도를 변경한다.
 *
 * @example
 * ```ts
 * // 파일명 부분(마지막 / 이후)에 가중치 부여
 * const scoring: ScoringConfig = {
 *     graphemeBonus: createGraphemeBonuses(target, [
 *         { start: target.input.lastIndexOf("/") + 1, end: target.input.length, bonus: 80 },
 *     ]),
 * };
 * matchBest(query, target, scoring);
 * ```
 */
export type ScoringConfig = {
    /** 기본 SCORING 상수 오버라이드 */
    weights?: ScoringWeights;
    /**
     * 매치된 각 타겟 grapheme에 대한 추가 점수.
     * - `number[]`: `bonuses[graphemeIndex]`로 조회. 배열 길이 밖이면 0.
     * - `(graphemeIndex, target) => number`: 타겟마다 동적으로 계산.
     *
     * `createGraphemeBonuses` 헬퍼로 문자 범위 [start, end)를 배열로 변환할 수 있다.
     */
    graphemeBonus?: number[] | ((graphemeIndex: number, target: Target) => number);
};

/**
 * `createSearcher` 생성자 옵션.
 * @typeParam T - 검색 대상 아이템 타입. string이 아닌 경우 `key` 필수.
 */
export type SearcherOptions<T = string> = {
    /** 아이템에서 검색 대상 문자열을 추출하는 함수. T가 string이면 생략 가능. */
    key?: (item: T) => string;
};

/**
 * `Searcher.search()`에 전달하는 검색별 옵션.
 */
export type SearchOptions = {
    /** 반환할 최대 결과 수. 0이면 전체 반환. min-heap으로 효율적으로 상위 N개만 유지한다. */
    limit?: number;
    /** true이면 fuzzy 대신 literal substring 매칭 (대소문자 무시). */
    literal?: boolean;
    /**
     * 커스텀 점수 함수. 제공되면 `matchBest`의 DP 스코어 대신 이 함수의 반환값으로 정렬한다.
     * DP 스코어는 여전히 `result.score`에 들어있으므로 조합 가능.
     */
    score?: (result: MatchResult, target: Target) => number;
    /**
     * DP 스코어링 커스터마이징. `matchBest`에 전달되어 정렬 선호도와 스코어에 영향을 준다.
     * 함수 형태이면 타겟마다 호출되어 타겟별 서로 다른 가중치를 적용할 수 있다.
     */
    scoring?: ScoringConfig | ((target: Target) => ScoringConfig);
};

/**
 * `Searcher.search()`가 반환하는 개별 결과.
 * @typeParam T - 원본 아이템 타입.
 */
export type SearchResult<T = string> = {
    /** 원본 아이템 */
    item: T;
    /** 전처리된 타겟 (재사용 가능) */
    target: Target;
    /** 매칭 결과 메타데이터 */
    result: MatchResult;
    /** 정렬에 사용된 최종 점수 (`SearchOptions.score`가 있으면 그 반환값, 없으면 DP 스코어) */
    score?: number;
    /** 하이라이트용 문자 범위를 lazy하게 계산. 호출 시점에 `buildMatchRanges` 실행. */
    ranges: () => MatchRange[];
};

/**
 * `createSearcher`가 반환하는 검색 인스턴스.
 * 아이템 목록을 내부에 보관하고, IME 입력 과정의 세션 최적화를 수행한다
 * (이전 쿼리의 atom prefix 확장이면 이전에 매치된 아이템만 재검색).
 *
 * @typeParam T - 검색 대상 아이템 타입.
 */
export interface Searcher<T = string> {
    /** 쿼리로 검색하여 스코어 내림차순 결과를 반환한다. */
    search(queryInput: string, options?: SearchOptions): SearchResult<T>[];
    /** 아이템을 추가한다. 세션 캐시는 무효화된다. */
    add(...items: T[]): void;
    /** 조건에 맞는 아이템을 제거한다. 세션 캐시는 무효화된다. */
    remove(predicate: (item: T) => boolean): void;
    /** 전체 아이템을 교체한다. 세션 캐시는 무효화된다. */
    replaceAll(items: readonly T[]): void;
}

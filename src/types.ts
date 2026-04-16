export type Atoms = string;

export type GraphemeIndices = number[];

export interface QueryGrapheme {
    char: string;
    atoms: Atoms;
    vowelIndex: number; // 중성 시작 인덱스, 없으면 -1
    tailIndex: number; // 종성 시작 인덱스, 없으면 -1
}

export interface Query {
    input: string;
    graphemes: QueryGrapheme[];
    atoms: string; // 전체 atom 시퀀스 연결 (세션 prefix 체크용)
}

export interface TargetGrapheme {
    atoms: Atoms;
    vowelIndex: number; // 중성 시작 인덱스, 없으면 -1 (한글 외)
    tailIndex: number; // 종성 시작 인덱스, 없으면 -1
}

export interface Target {
    input: string;
    normalizedInput: string;
    graphemes: TargetGrapheme[];
    graphemeIndexes: number[];
    charIndexes: number[];
    boundaryFlags: boolean[];
}

export type MatchResult = {
    indices: GraphemeIndices;
    startsAtZero: boolean;
    runCount: number;
    boundaryHits: number;
    initialConsonantOnly: boolean;
    score?: number; // DP가 계산한 최적 스코어
};

export type MatchRange = {
    start: number;
    end: number;
};

/** DP 스코어링 가중치. 생략된 필드는 SCORING 기본값 사용. */
export type ScoringWeights = {
    positionZero?: number;
    boundary?: number;
    consecutive?: number;
    gapPenalty?: number;
    prefixBonus?: number;
    exactBonus?: number;
    initialConsonantPenalty?: number;
    targetLengthPenalty?: number;
};

/** matchBest DP에 전달되는 스코어링 설정 */
export type ScoringConfig = {
    /** 기본 SCORING 상수 오버라이드 */
    weights?: ScoringWeights;
    /**
     * Per-grapheme bonus. 매치된 각 타겟 그래핌에 대해 추가 점수.
     * - number[]: graphemeIndex로 인덱싱. 길이 부족 시 0 취급.
     * - function: (graphemeIndex, target) => bonus 점수.
     */
    graphemeBonus?: number[] | ((graphemeIndex: number, target: Target) => number);
};

export type SearcherOptions<T = string> = {
    key?: (item: T) => string;
};

export type SearchOptions = {
    limit?: number;
    literal?: boolean;
    score?: (result: MatchResult, target: Target) => number;
    /** DP 스코어링 설정. 함수 형태면 타겟마다 호출. */
    scoring?: ScoringConfig | ((target: Target) => ScoringConfig);
};

export type SearchResult<T = string> = {
    item: T;
    target: Target;
    result: MatchResult;
    score?: number;
    ranges: () => MatchRange[];
};

export interface Searcher<T = string> {
    search(queryInput: string, options?: SearchOptions): SearchResult<T>[];
    add(...items: T[]): void;
    remove(predicate: (item: T) => boolean): void;
    replaceAll(items: readonly T[]): void;
}

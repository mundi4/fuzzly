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
};

export type MatchRange = {
    start: number;
    end: number;
};

export type SearcherOptions<T = string> = {
    key?: (item: T) => string;
};

export type SearchOptions = {
    limit?: number;
    literal?: boolean;
    score?: (result: MatchResult) => number;
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

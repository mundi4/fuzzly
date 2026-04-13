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
    literal: string | null;
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
}

export type MatchRange = {
    start: number;
    end: number;
};

export type QueryOptions = {
    caseSensitive?: boolean;
};

export type TargetOptions = {
    caseSensitive?: boolean;
};

export type MatchOptions = {
    caseSensitive: boolean;
};

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
    caseSensitive: false,
};

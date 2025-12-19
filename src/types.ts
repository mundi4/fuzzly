
export type Atoms = string;

export type GraphemeIndices = number[];

export interface QueryGrapheme {
    char: string; // 원본 문자
    atoms: Atoms; // 실제 키 입력 단위로 분해된 자모 배열. 이중모음/이중자음까지도 모두 분해된 "원자" 상태의 배열임.
    vowelIndex: number;
    tailIndex: number; // 종성 시작 인덱스, 없으면 -1
    allowTailSpillover: boolean; // 종성이 있는 경우 종성을 이후 글자의 초성에 spillover 허용할 지. 보통은 마지막 글자를 입력 중일 때...?
}

export interface Query {
    input: string;
    literal: string | null;
    graphemes: QueryGrapheme[];
}

export interface Target {
    input: string;
    normalizedInput: string;
    graphemes: Array<Atoms>;
    graphemeIndexes: number[];
    charIndexes: number[];
}

export type MatchRange = {
    start: number;
    end: number;
}

export type QueryOptions = {
    caseSensitive?: boolean;
}

export type TargetOptions = {
    caseSensitive: boolean;
}

export type MatchOptions = {
    whitespace: "ignore" | "literal" | "normalize";
    caseSensitive: boolean;
    tailSpillover: "never" | "always" | "lastOnly";
    remainder: "strict" | "allow" | "tailSpilloverOnly";
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
    whitespace: "ignore",
    caseSensitive: true,
    tailSpillover: "lastOnly",
    remainder: "tailSpilloverOnly",
};
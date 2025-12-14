
export interface FuzzyChar {
    char: string; // 원본 문자
    strokes: readonly string[]; // 실제 키 입력 단위로 분해된 자모 배열. 이중모음/이중자음까지도 모두 분해된 "원자" 상태의 배열임.
    vowelIndex: number;
    tailIndex: number; // 종성 시작 인덱스, 없으면 -1
    allowTailSpillover: boolean; // 종성이 있는 경우 종성을 이후 글자의 초성에 spillover 허용할 지. 보통은 마지막 글자를 입력 중일 때...?
}

export interface FuzzyQuery {
    text: string;
    chars: FuzzyChar[];
    isLiteral: boolean;
}

export interface FuzzyStrokes {
    input: string;
    strokes: Array<readonly string[]>;
    clusterIndexes: number[];
    charIndexes: number[];
}

export type StrokeMatchMap = (number[] | undefined)[];

export type MatchRange = {
    start: number;
    end: number;
}

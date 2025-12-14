import type { FuzzyQuery, FuzzyStrokes, StrokeMatchMap } from "./types";

/**
 * text: literal query text (이미 buildFuzzQuery에서 따옴표 처리 끝난 상태라고 가정)
 * parts: 검색 대상 필드 문자열 배열
 *
 * 반환값:
 * - 매치된 필드가 없으면 null
 * - 있으면 StrokeMatchMap (희소 배열):
 *   - 인덱스 = part index
 *   - 값 = 해당 part 안에서의 grapheme 인덱스 배열
 *   - 한 번의 호출에서는 "가장 먼저 매치된 part" 하나만 세팅
 */
export function matchLiteral(query: FuzzyQuery, parts: FuzzyStrokes[]): StrokeMatchMap | null {
    const text = query.text;
    if (text === "") {
        return [];
    }

    for (let pi = 0; pi < parts.length; pi++) {
        const partText = parts[pi].input;
        const foundAt = partText.indexOf(text);
        if (foundAt >= 0) {
            const indexes: number[] = [];
            const clusterIndexes = parts[pi].clusterIndexes;
            for (let i = 0; i < text.length; i++) {
                const clusterIndex = clusterIndexes[foundAt + i];
                if (indexes[indexes.length - 1] !== clusterIndex) {
                    indexes.push(clusterIndex);
                }
            }
            const result: StrokeMatchMap = [];
            result[pi] = indexes;
            return result;
        }
    }

    return null;
}

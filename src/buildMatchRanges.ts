import type { Target, MatchRange, GraphemeIndices } from "./types";

/**
 * hitMaps과 Target을 받아서 MatchRange[]로 변환
 * 
 * 과정:
 * 1. 모든 indices 수집 + 정렬
 * 2. dedup과 range 변환을 한 번의 loop에서 처리
 */
export function buildMatchRanges(
    hitMaps: GraphemeIndices[],
    target: Target
): MatchRange[] {
    // 모든 indices 수집
    let indices: number[];

    if (hitMaps.length === 1) {
        // 정렬이 되어있다고 가정함
        indices = hitMaps[0];
    } else if (hitMaps.length === 0) {
        return [];
    } else {
        indices = [];
        for (const hitMap of hitMaps) {
            if (hitMap) indices.push(...hitMap);
        }
        // 정렬
        indices.sort((a, b) => a - b);
    }

    if (indices.length === 0) return [];

    // dedup + range 변환 동시에
    const ranges: MatchRange[] = [];
    const charIndexes = target.charIndexes;
    const inputLength = target.input.length;

    let rangeStart = indices[0];
    let prev = indices[0];

    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === prev) continue; // dedup 스킵

        if (indices[i] !== prev + 1) {
            // 불연속 → range 저장
            ranges.push({
                start: charIndexes[rangeStart],
                end: charIndexes[prev + 1] ?? inputLength,
            });
            rangeStart = indices[i];
        }
        prev = indices[i];
    }

    // 마지막 range
    ranges.push({
        start: charIndexes[rangeStart],
        end: charIndexes[prev + 1] ?? inputLength,
    });

    return ranges;
}

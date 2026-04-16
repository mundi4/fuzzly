import type { GraphemeIndices, MatchRange, Target } from "./types";

/**
 * 매칭된 grapheme 인덱스 배열들을 원문 문자열의 하이라이트 범위(UTF-16 offset)로 변환한다.
 * 연속된 grapheme 인덱스는 하나의 범위로 합쳐진다.
 *
 * @param hitMaps - `MatchResult.indices` 배열 하나 이상. 여러 sub-query 결과를 합칠 때 사용.
 * @param target - `preprocessTarget`으로 생성한 타겟 (charIndexes 사용)
 * @returns 정렬된 MatchRange 배열 (UI 하이라이팅에 사용)
 */
export function buildMatchRanges(hitMaps: GraphemeIndices[], target: Target): MatchRange[] {
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

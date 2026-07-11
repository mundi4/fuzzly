import { SPACE_CHAR_CODE } from "./internal/atomRegistry";
import type { GraphemeIndices, MatchRange, Target } from "./types";

// transparent 타겟에서 range 끝 grapheme `g`의 exclusive 끝 UTF-16 offset.
// keep 공식(다음 grapheme 시작 ?? 원문 끝)에서 출발해 뒤따르는 스킵 공백을 뒤에서 잘라낸다 —
// 공백이 grapheme을 소비하지 않으므로 keep 공식 그대로면 뒤 공백을 삼킨다
// (`"A B"`에서 A만 매치 → "A "). 방출된 grapheme 사이·꼬리의 틈은 전부 스킵된 단독
// U+0020이고, cluster가 U+0020으로 끝나는 일은 없으므로(공백은 앞 cluster에 붙지 않아
// cluster 내 U+0020은 base뿐이고, base가 공백인 cluster는 결합문자로 끝난다) 이 트림이
// 방출된 cluster를 자르는 일은 없다. cluster/공백 run은 짧아 비용 무시 가능.
function transparentRangeEnd(target: Target, g: number): number {
    const start = target.charIndexes[g];
    let end = target.charIndexes[g + 1] ?? target.input.length;
    const normalized = target.normalizedInput;
    while (end > start && normalized.charCodeAt(end - 1) === SPACE_CHAR_CODE) end--;
    return end;
}

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
    // keep 모드는 grapheme들이 원문을 빈틈없이 타일링하므로 다음 grapheme의 시작이 곧
    // range 끝 (기존 fast path 그대로, 할당 없음). transparent 는 transparentRangeEnd 참조.
    const transparent = target.whitespace === "transparent";

    let rangeStart = indices[0];
    let prev = indices[0];

    for (let i = 1; i < indices.length; i++) {
        if (indices[i] === prev) continue; // dedup 스킵

        if (indices[i] !== prev + 1) {
            // 불연속 → range 저장
            ranges.push({
                start: charIndexes[rangeStart],
                end: transparent ? transparentRangeEnd(target, prev) : (charIndexes[prev + 1] ?? inputLength),
            });
            rangeStart = indices[i];
        }
        prev = indices[i];
    }

    // 마지막 range
    ranges.push({
        start: charIndexes[rangeStart],
        end: transparent ? transparentRangeEnd(target, prev) : (charIndexes[prev + 1] ?? inputLength),
    });

    return ranges;
}

import type { MatchRange, TextSegment } from "./types";

/**
 * 원문 문자열을 `MatchRange[]` 기준으로 하이라이트 조각 배열로 분할한다 —
 * 프레임워크 중립 하이라이트 렌더링 헬퍼.
 *
 * `SearchResult.ranges()` / `buildMatchRanges` 결과를 그대로 받아
 * `[{ text, matched }]`를 반환하므로, 소비자는 escape/조립 boilerplate 없이
 * matched 조각만 `<mark>`/`<span>` 등으로 감싸면 된다.
 *
 * ranges는 정렬·비중첩(오름차순)을 가정한다 (`buildMatchRanges`가 보장).
 * 빈 range(start >= end)와 원문 범위를 벗어나는 부분은 무시된다.
 *
 * @example
 * ```ts
 * const [r] = searcher.search("ㅍㅇ"); // 타겟 "파일 열기" — ㅇ은 "일"의 초성에 매치 (연속 run 우대)
 * segmentByRanges(r.target.input, r.ranges());
 * // → [{ text: "파일", matched: true }, { text: " 열기", matched: false }]
 * ```
 */
export function segmentByRanges(text: string, ranges: readonly MatchRange[]): TextSegment[] {
    const segments: TextSegment[] = [];
    let pos = 0;
    for (const range of ranges) {
        const start = Math.max(range.start, pos);
        const end = Math.min(range.end, text.length);
        if (end <= start) continue;
        if (start > pos) {
            segments.push({ text: text.slice(pos, start), matched: false });
        }
        segments.push({ text: text.slice(start, end), matched: true });
        pos = end;
    }
    if (pos < text.length) {
        segments.push({ text: text.slice(pos), matched: false });
    }
    return segments;
}

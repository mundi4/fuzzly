import { describe, expect, it } from "vitest";
import { createSearcher, segmentByRanges } from "../src";

describe("segmentByRanges — 하이라이트 조각 분할", () => {
    it("기본 분할", () => {
        expect(segmentByRanges("파일 열기", [{ start: 0, end: 2 }])).toEqual([
            { text: "파일", matched: true },
            { text: " 열기", matched: false },
        ]);
    });

    it("여러 range + 사이/양끝 비매치 조각", () => {
        expect(
            segmentByRanges("abcdef", [
                { start: 1, end: 2 },
                { start: 4, end: 5 },
            ]),
        ).toEqual([
            { text: "a", matched: false },
            { text: "b", matched: true },
            { text: "cd", matched: false },
            { text: "e", matched: true },
            { text: "f", matched: false },
        ]);
    });

    it("전체 매치 / 매치 없음 / 빈 문자열", () => {
        expect(segmentByRanges("abc", [{ start: 0, end: 3 }])).toEqual([{ text: "abc", matched: true }]);
        expect(segmentByRanges("abc", [])).toEqual([{ text: "abc", matched: false }]);
        expect(segmentByRanges("", [])).toEqual([]);
    });

    it("빈 range 와 범위 초과는 무시", () => {
        expect(
            segmentByRanges("abc", [
                { start: 1, end: 1 },
                { start: 2, end: 99 },
            ]),
        ).toEqual([
            { text: "ab", matched: false },
            { text: "c", matched: true },
        ]);
    });

    it("SearchResult.ranges() 와 함께 사용 — 조각 합치면 원문 복원", () => {
        const s = createSearcher(["파일 열기", "폴더 열기"]);
        for (const r of s.search("ㅍㅇ")) {
            const segs = segmentByRanges(r.target.input, r.ranges());
            expect(segs.map((x) => x.text).join("")).toBe(r.target.input);
            expect(segs.some((x) => x.matched)).toBe(true);
        }
    });
});

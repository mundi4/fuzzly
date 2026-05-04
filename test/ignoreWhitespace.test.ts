import { describe, expect, it } from "vitest";
import { buildQuery, createSearcher, matchBest, preprocessTarget } from "../src/index";

describe("ignore 모드 - buildQuery", () => {
    it("공백 grapheme이 제거된다", () => {
        const q = buildQuery("ab cd", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(4);
        expect(q.graphemes.map((g) => g.char).join("")).toBe("abcd");
    });

    it("atoms 문자열에 공백 atom이 포함되지 않는다", () => {
        const preserve = buildQuery("a b", { whitespace: "preserve" });
        const ignore = buildQuery("a b", { whitespace: "ignore" });
        const ab = buildQuery("ab", { whitespace: "ignore" });
        expect(preserve.atoms).not.toBe(ab.atoms);
        expect(ignore.atoms).toBe(ab.atoms);
    });

    it("연속 공백은 모두 drop된다", () => {
        const a = buildQuery("a  b", { whitespace: "ignore" });
        const b = buildQuery("ab", { whitespace: "ignore" });
        expect(a.graphemes.length).toBe(2);
        expect(a.atoms).toBe(b.atoms);
    });

    it("선행 공백 drop", () => {
        const q = buildQuery(" ab", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(2);
        expect(q.graphemes[0].char).toBe("a");
    });

    it("input 필드는 원본 보존", () => {
        const q = buildQuery("a b", { whitespace: "ignore" });
        expect(q.input).toBe("a b");
    });

    it("whitespace 필드 기본값은 ignore", () => {
        const def = buildQuery("ab");
        expect(def.whitespace).toBe("ignore");
        const pre = buildQuery("ab", { whitespace: "preserve" });
        expect(pre.whitespace).toBe("preserve");
        const ig = buildQuery("ab", { whitespace: "ignore" });
        expect(ig.whitespace).toBe("ignore");
    });

    it("ignore 모드에서도 탭/개행은 literal grapheme으로 유지", () => {
        const q = buildQuery("a\tb", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(3);
    });
});

describe("ignore 모드 - 매칭 동작", () => {
    it("target에 공백 없어도 매치 (ab cd → abcdef)", () => {
        const t = preprocessTarget("abcdef");
        const q = buildQuery("ab cd", { whitespace: "ignore" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1, 2, 3]);
    });

    it("target에 공백 있어도 매치", () => {
        const t = preprocessTarget("abc def");
        const q = buildQuery("abc def", { whitespace: "ignore" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1, 2, 4, 5, 6]);
    });

    it("preserve와 ignore 비교: target에 공백 없는 케이스", () => {
        const t = preprocessTarget("ab");
        const pre = buildQuery("a b", { whitespace: "preserve" });
        const ig = buildQuery("a b", { whitespace: "ignore" });
        expect(matchBest(pre, t)).toBeNull();
        expect(matchBest(ig, t)).not.toBeNull();
    });

    it("한글+공백: '한국 문' → '한국어 문자열' 매치", () => {
        const t = preprocessTarget("한국어 문자열");
        const q = buildQuery("한국 문", { whitespace: "ignore" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1, 4]);
    });

    it("초성+공백: 'ㅍ ㄱ' → '파일 검색' 매치", () => {
        const t = preprocessTarget("파일 검색");
        const q = buildQuery("ㅍ ㄱ", { whitespace: "ignore" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 3]);
    });
});

describe("ignore 모드 - createSearcher 세션", () => {
    it("동일 모드 연속 호출에서 atoms prefix narrowing 유지", () => {
        const searcher = createSearcher(["abcdef", "xyz", "abczdef"]);
        const r1 = searcher.search("a", { whitespace: "ignore" });
        expect(r1.map((x) => x.item).sort()).toEqual(["abcdef", "abczdef"]);

        const r2 = searcher.search("a ", { whitespace: "ignore" });
        expect(r2.map((x) => x.item).sort()).toEqual(["abcdef", "abczdef"]);

        const r3 = searcher.search("a b", { whitespace: "ignore" });
        expect(r3.map((x) => x.item).sort()).toEqual(["abcdef", "abczdef"]);
    });

    it("모드 전환 시 세션 reset (preserve → ignore)", () => {
        const searcher = createSearcher(["ab", "a b"]);

        const r1 = searcher.search("a b", { whitespace: "preserve" });
        expect(r1.map((x) => x.item)).toEqual(["a b"]);

        const r2 = searcher.search("a b", { whitespace: "ignore" });
        expect(r2.map((x) => x.item).sort()).toEqual(["a b", "ab"]);
    });

    it("모드 전환 ignore → preserve", () => {
        const searcher = createSearcher(["ab", "a b"]);

        const r1 = searcher.search("a b", { whitespace: "ignore" });
        expect(r1.map((x) => x.item).sort()).toEqual(["a b", "ab"]);

        const r2 = searcher.search("a b", { whitespace: "preserve" });
        expect(r2.map((x) => x.item)).toEqual(["a b"]);
    });
});

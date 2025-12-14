import { extractStrokes, matchFuzzyStrokes } from "../src";
import { buildFuzzyQuery } from "../src/buildFuzzyQuery";

function run(query: string, parts: string[]) {
    const q = buildFuzzyQuery(query);
    if (!q) return null;
    const p = parts.map(extractStrokes);
    return matchFuzzyStrokes(q, p);
}

describe("matchFuzzyStrokes (actual behavior)", () => {
    it("literal query always returns null", () => {
        const q = buildFuzzyQuery("\"값\"")!;
        const p = [extractStrokes("값")];
        expect(matchFuzzyStrokes(q, p)).toBeNull();
    });

    it("single syllable exact match in single part", () => {
        const r = run("값", ["값"]);
        expect(r).toEqual([[0]]);
    });

    it("query can span across multiple parts", () => {
        // 감 | 사
        const r = run("감사", ["감", "사합니다"]);
        expect(r).toEqual([[0], [0]]);
    });

    it("query must be fully consumed, otherwise null", () => {
        const r = run("감사", ["감"]);
        expect(r).toBeNull();
    });

    it("초성 검색 consumes target grapheme", () => {
        const r = run("ㄱ", ["값"]);
        expect(r).toEqual([[0]]);
    });

    it("겹받침 spillover across syllables", () => {
        // ㄳ → 감(ㄱ) + 사(ㅅ)
        const r = run("ㄳ", ["감사"]);
        expect(r).toEqual([[0, 1]]);
    });

    it("겹받침 spillover across parts", () => {
        const r = run("ㄳ", ["감", "사"]);
        expect(r).toEqual([[0], [0]]);
    });

    it("vowel mismatch fails immediately", () => {
        // 가 != 거
        const r = run("가", ["거"]);
        expect(r).toBeNull();
    });

    it("tail mismatch allowed when allowTailSpillover is true", () => {
        // 도 → 돋 (ㄷㅗㄷ)
        const r = run("도", ["돋음"]);
        expect(r).toEqual([[0]]);
    });

    it("tail mismatch rejected when allowTailSpillover is false", () => {
        const q = buildFuzzyQuery("도")!;
        q.chars[0].allowTailSpillover = false;

        const p = [extractStrokes("돋음")];
        const r = matchFuzzyStrokes(q, p);
        expect(r).toBeNull();
    });

    it("query fails if additional stroke has no remaining target syllable", () => {
        const r = run("ㄳㅏ", ["감사"]);
        expect(r).toBeNull();
    });

    it("emoji treated as atomic grapheme", () => {
        const r = run("😀", ["😀abc"]);
        expect(r).toEqual([[0]]);
    });

    it("mixed ascii + hangul sequence", () => {
        const r = run("a값", ["a", "값어치"]);
        expect(r).toEqual([[0], [0]]);
    });
});

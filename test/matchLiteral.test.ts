import { describe, it, expect } from "vitest";
import { extractStrokes, matchLiteral } from "../src";

function run(text: string, parts: string[]) {
    const query = { text };
    const strokes = parts.map(extractStrokes);
    return matchLiteral(query as any, strokes);
}

describe("matchLiteral", () => {
    it("empty literal matches everything → empty result", () => {
        const r = run("", ["abc", "def"]);
        expect(r).toEqual([]);
    });

    it("no match → null", () => {
        const r = run("값", ["노답", "감사"]);
        expect(r).toBeNull();
    });

    it("single part exact match", () => {
        const r = run("값", ["값"]);
        expect(r).toEqual([[0]]);
    });

    it("first matching part only", () => {
        const r = run("값", ["값어치", "값"]);
        expect(r).toEqual([[0]]);
    });

    it("match inside part (offset)", () => {
        const r = run("값", ["이건값어치다"]);
        // "이(0) 건(1) 값(2) 어(3) 치(4)"
        expect(r).toEqual([[2]]);
    });

    it("multi-character literal maps to multiple clusters", () => {
        const r = run("값어", ["값어치"]);
        // 값(0) 어(1)
        expect(r).toEqual([[0, 1]]);
    });

    it("deduplicates cluster indexes for multi-char utf16 match", () => {
        const r = run("😀", ["😀😀"]);
        // 😀는 utf16 2칸이지만 cluster는 하나
        expect(r).toEqual([[0]]);
    });

    it("emoji literal spanning multiple utf16 units", () => {
        const r = run("😀a", ["😀abc"]);
        // 😀(0) a(1)
        expect(r).toEqual([[0, 1]]);
    });

    it("ZWJ emoji treated as single cluster", () => {
        const family = "👨‍👩‍👧‍👦";
        const r = run(family, [family + "a"]);
        expect(r).toEqual([[0]]);
    });

    it("literal match does not cross parts", () => {
        const r = run("감사", ["감", "사"]);
        expect(r).toBeNull();
    });

    it("ascii literal", () => {
        const r = run("bc", ["abcde"]);
        // a(0) b(1) c(2)
        expect(r).toEqual([[1, 2]]);
    });
});

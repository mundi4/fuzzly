import { describe, it, expect } from "vitest";
import { StrokeMatchMap, extractStrokes } from "../src";
import { buildMatchRanges } from "../src/buildMatchRanges";

function run(perToken: StrokeMatchMap[], partsText: string[]) {
    const parts = partsText.map(extractStrokes);
    return buildMatchRanges(perToken, parts);
}

describe("buildMatchRanges", () => {
    it("empty input", () => {
        const out = run([], ["abc"]);
        expect(out).toEqual([]);
    });

    it("single token, single part", () => {
        const t: StrokeMatchMap = [];
        t[0] = [0, 1, 2];

        const out = run([t], ["값어치"]);
        // 값(0) 어(1) 치(2) → char 0..3
        expect(out).toEqual([
            [{ start: 0, end: 3 }],
        ]);
    });

    it("multiple tokens merge clusters per part", () => {
        const t1: StrokeMatchMap = [];
        t1[0] = [0];

        const t2: StrokeMatchMap = [];
        t2[0] = [2];

        const out = run([t1, t2], ["값어치"]);
        expect(out).toEqual([
            [
                { start: 0, end: 1 },
                { start: 2, end: 3 },
            ],
        ]);
    });

    it("clusters are sorted and deduped per part", () => {
        const t: StrokeMatchMap = [];
        t[0] = [2, 1, 1, 0];

        const out = run([t], ["값어치"]);
        expect(out).toEqual([
            [{ start: 0, end: 3 }],
        ]);
    });

    it("adjacent clusters become a single range", () => {
        const t: StrokeMatchMap = [];
        t[0] = [0, 1];

        const out = run([t], ["값어치"]);
        expect(out).toEqual([
            [{ start: 0, end: 2 }],
        ]);
    });

    it("non-adjacent clusters produce multiple ranges", () => {
        const t: StrokeMatchMap = [];
        t[0] = [0, 2];

        const out = run([t], ["값어치"]);
        expect(out).toEqual([
            [
                { start: 0, end: 1 },
                { start: 2, end: 3 },
            ],
        ]);
    });

    it("multiple parts stay completely independent", () => {
        const t: StrokeMatchMap = [];
        t[0] = [0]; // part0: a
        t[1] = [0]; // part1: 값

        const out = run([t], ["a", "값"]);
        expect(out).toEqual([
            [{ start: 0, end: 1 }],
            [{ start: 0, end: 1 }],
        ]);
    });

    it("tokens affecting different parts do not interfere", () => {
        const t1: StrokeMatchMap = [];
        t1[0] = [1];

        const t2: StrokeMatchMap = [];
        t2[1] = [0];

        const out = run([t1, t2], ["abc", "값"]);
        expect(out).toEqual([
            [{ start: 1, end: 2 }],
            [{ start: 0, end: 1 }],
        ]);
    });

    it("emoji cluster expands to correct utf16 range", () => {
        const t: StrokeMatchMap = [];
        t[0] = [0];

        const out = run([t], ["😀a"]);
        // 😀 is one cluster, two utf16 units
        expect(out).toEqual([
            [{ start: 0, end: 2 }],
        ]);
    });

    it("ZWJ emoji treated as single cluster", () => {
        const family = "👨‍👩‍👧‍👦";
        const t: StrokeMatchMap = [];
        t[0] = [0];

        const out = run([t], [family + "x"]);
        expect(out).toEqual([
            [{ start: 0, end: family.length }],
        ]);
    });

    it("out-of-range cluster index produces no ranges", () => {
        const t: StrokeMatchMap = [];
        t[0] = [999];

        const out = run([t], ["값"]);
        expect(out).toEqual([undefined]);
    });

    it("empty cluster list is ignored", () => {
        const t: StrokeMatchMap = [];
        t[0] = [];

        const out = run([t], ["값"]);
        expect(out[0]).toBeUndefined();
    });
});

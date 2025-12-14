import { describe, it, expect } from "vitest";
import { extractStrokes } from "../src";

function assertIndexContracts(input: string) {
    const r = extractStrokes(input);

    // 1) 기본 길이 계약
    expect(r.clusterIndexes.length).toBe(input.length);
    expect(r.charIndexes.length).toBe(r.strokes.length);

    // 2) clusterIndexes: 구멍 없음 + 범위 유효
    for (let i = 0; i < input.length; i++) {
        expect(r.clusterIndexes[i]).not.toBeUndefined();
        const g = r.clusterIndexes[i]!;
        expect(Number.isInteger(g)).toBe(true);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThan(r.strokes.length);
    }

    // 3) clusterIndexes: 단조 비감소 (utf16 인덱스가 증가하면 cluster index는 감소하면 안 됨)
    for (let i = 1; i < input.length; i++) {
        expect(r.clusterIndexes[i]).toBeGreaterThanOrEqual(r.clusterIndexes[i - 1]);
    }

    // 4) charIndexes: 구멍 없음 + 범위 유효 + 단조 증가
    for (let g = 0; g < r.charIndexes.length; g++) {
        const start = r.charIndexes[g];
        expect(start).not.toBeUndefined();
        expect(Number.isInteger(start)).toBe(true);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(start).toBeLessThan(input.length);

        if (g > 0) {
            expect(r.charIndexes[g]).toBeGreaterThan(r.charIndexes[g - 1]);
        }
    }

    // 5) 라운드트립: charIndexes[g]는 반드시 clusterIndexes에서 g를 가리켜야 함
    for (let g = 0; g < r.strokes.length; g++) {
        const start = r.charIndexes[g];
        expect(r.clusterIndexes[start]).toBe(g);
    }

    // 6) 세그먼트 구간 계약:
    // [charIndexes[g], charIndexes[g+1]) (마지막은 input.length까지) 구간의 clusterIndexes는 전부 g여야 함
    for (let g = 0; g < r.strokes.length; g++) {
        const start = r.charIndexes[g];
        const end = g + 1 < r.strokes.length ? r.charIndexes[g + 1] : input.length;

        expect(end).toBeGreaterThan(start);

        for (let i = start; i < end; i++) {
            expect(r.clusterIndexes[i]).toBe(g);
        }
    }

    // 7) 대표점 계약:
    // clusterIndexes의 값이 바뀌는 지점은 항상 어떤 charIndexes[g]여야 함
    // 즉, 경계 i에서 clusterIndexes[i] != clusterIndexes[i-1]이면 i는 charIndexes[newG]와 같아야 함
    const startSet = new Set<number>(r.charIndexes);
    for (let i = 1; i < input.length; i++) {
        if (r.clusterIndexes[i] !== r.clusterIndexes[i - 1]) {
            expect(startSet.has(i)).toBe(true);
            expect(r.charIndexes[r.clusterIndexes[i]]).toBe(i);
        }
    }

    return r;
}

describe("extractStrokes - cluster/char index contracts (hard)", () => {
    it("ASCII", () => {
        assertIndexContracts("abcXYZ012");
    });

    it("Hangul + compat jamo + ASCII", () => {
        // 값(완성형) + ㄳ(호환자모) + a
        assertIndexContracts("값ㄳa");
    });

    it("surrogate pair emoji + ASCII", () => {
        assertIndexContracts("😀a😀b");
    });

    it("ZWJ cluster + mixed", () => {
        const family = "👨‍👩‍👧‍👦";
        assertIndexContracts(`${family}값a${family}`);
    });

    it("combining mark cluster (e + ◌́) + mixed", () => {
        // "e\u0301"는 보통 하나의 grapheme으로 취급됨 (환경에 따라 Segmenter 결과가 다를 수는 있음)
        const composed = "e\u0301"; // e + combining acute accent
        assertIndexContracts(`${composed}a값${composed}😀`);
    });

    it("repeated boundaries", () => {
        // 경계가 자주 바뀌는 입력
        assertIndexContracts("a😀b값cㄳd👨‍👩‍👧‍👦e");
    });
});

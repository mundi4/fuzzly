import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, matchBest, matchLiteral, preprocessTarget } from "../src/index";
import { atomCharToId, atomIdToChar } from "../src/internal/atomRegistry";
import { decomposeToAtoms } from "../src/internal/utils";

describe("atom encoding: pure-function ID assignment", () => {
    describe("atomCharToId", () => {
        it("자모는 고정 ID 1-33", () => {
            expect(atomCharToId("ㄱ")).toBe(1);
            expect(atomCharToId("ㅎ")).toBe(19);
            expect(atomCharToId("ㅏ")).toBe(20);
            expect(atomCharToId("ㅣ")).toBe(33);
        });

        it("ASCII printable은 고정 ID 34-128", () => {
            expect(atomCharToId(" ")).toBe(34); // 0x20
            expect(atomCharToId("a")).toBe(34 + (0x61 - 0x20));
            expect(atomCharToId("~")).toBe(128); // 0x7E
        });

        it("BMP non-fixed char는 codepoint 그대로 ID", () => {
            expect(atomCharToId("漢")).toBe(0x6f22);
            expect(atomCharToId("字")).toBe(0x5b57);
            expect(atomCharToId("あ")).toBe(0x3042);
            expect(atomCharToId("é")).toBe(0xe9);
        });

        it("순수함수 — 호출 순서·반복 무관 동일 결과", () => {
            const a = atomCharToId("漢");
            atomCharToId("字"); // 다른 char 호출이 영향 안 줌
            atomCharToId("符");
            const b = atomCharToId("漢");
            expect(a).toBe(b);
            expect(a).toBe(0x6f22); // 항상 codepoint
        });
    });

    describe("atomIdToChar", () => {
        it("fixed 영역은 룩업 테이블", () => {
            expect(atomIdToChar(1)).toBe("ㄱ");
            expect(atomIdToChar(20)).toBe("ㅏ");
            expect(atomIdToChar(34 + (0x61 - 0x20))).toBe("a");
        });

        it("non-fixed ID는 String.fromCodePoint 폴백", () => {
            expect(atomIdToChar(0x6f22)).toBe("漢");
            expect(atomIdToChar(0xe9)).toBe("é");
        });

        it("round-trip: fixed/BMP non-fixed 모두 char→id→char 일치", () => {
            for (const ch of ["ㄱ", "ㅏ", "a", "Z", "0", "漢", "字", "あ", "é", "我"]) {
                expect(atomIdToChar(atomCharToId(ch))).toBe(ch);
            }
        });

        it("lone surrogate ID는 surrogate 1자 string 반환 (concat 시 valid emoji 복원)", () => {
            const high = atomIdToChar(0xd83d);
            const low = atomIdToChar(0xde00);
            expect(high.length).toBe(1);
            expect(low.length).toBe(1);
            expect(high + low).toBe("😀");
        });
    });
});

describe("decomposeToAtoms: 분해 결과", () => {
    it("한글 음절 → 자모 시퀀스 (interned, ===)", () => {
        const a1 = decomposeToAtoms("간");
        const a2 = decomposeToAtoms("간");
        expect(a1).toBe(a2); // 참조 동등 (intern)
        expect(Array.from(a1)).toEqual([1, 20, 3]); // ㄱ ㅏ ㄴ
    });

    it("ASCII 한 자 → 고정 ID 1 atom", () => {
        const atoms = decomposeToAtoms("a");
        expect(atoms.length).toBe(1);
        expect(atoms[0]).toBe(34 + (0x61 - 0x20));
    });

    it("BMP CJK 한 자 → codepoint 1 atom", () => {
        const atoms = decomposeToAtoms("漢");
        expect(atoms.length).toBe(1);
        expect(atoms[0]).toBe(0x6f22);
    });

    it("non-BMP 한 자 → surrogate pair 2 atoms", () => {
        const atoms = decomposeToAtoms("😀");
        expect(Array.from(atoms)).toEqual([0xd83d, 0xde00]);
    });

    it("ZWJ family cluster → code unit별 8 atoms", () => {
        const family = "👨\u200d👩\u200d👧";
        const atoms = decomposeToAtoms(family);
        expect(atoms.length).toBe(family.length); // 8
        expect(atoms[2]).toBe(0x200d); // ZWJ는 BMP라 1 unit
    });

    it("regional indicator pair (국가 깃발) → 4 atoms", () => {
        const flag = "🇰🇷";
        const atoms = decomposeToAtoms(flag);
        expect(atoms.length).toBe(4); // 두 surrogate pair
    });

    it("cluster size > buildBuf(8) — 직접 alloc 경로", () => {
        // family-of-4 = 11 code units
        const big = "👨\u200d👩\u200d👧\u200d👦";
        const atoms = decomposeToAtoms(big);
        expect(atoms.length).toBe(big.length);
    });
});

describe("end-to-end matching with non-BMP / cluster", () => {
    it("이모지 단일 codepoint 매치", () => {
        const target = preprocessTarget("hello 😀 world");
        const query = buildQuery("😀")!;
        const result = matchBest(query, target);
        expect(result).not.toBeNull();
    });

    it("ZWJ family 매치 (8 atoms 전부 일치)", () => {
        const family = "👨\u200d👩\u200d👧";
        const target = preprocessTarget(`a${family}b`);
        const query = buildQuery(family)!;
        const result = matchBest(query, target);
        expect(result).not.toBeNull();
        expect(result!.indices.length).toBe(1);
    });

    it("쿼리 cluster의 부분(예: 👨)으로는 다른 cluster grapheme 매치 안 됨", () => {
        // target은 ZWJ family 1 grapheme만. 쿼리 단일 👨는 atoms 다름.
        const family = "👨\u200d👩\u200d👧";
        const target = preprocessTarget(family);
        const query = buildQuery("👨")!;
        const result = matchBest(query, target);
        expect(result).toBeNull();
    });

    it("CJK + 한글 혼합 target에서 한글 부분만 매치", () => {
        const target = preprocessTarget("漢字안녕字漢");
        const query = buildQuery("안녕")!;
        const result = matchBest(query, target);
        expect(result).not.toBeNull();
    });

    it("BMP CJK 부분 검색 — '字'가 '漢字漢'에서 매치", () => {
        const target = preprocessTarget("漢字漢");
        const query = buildQuery("字")!;
        const result = matchBest(query, target);
        expect(result).not.toBeNull();
        expect(result!.indices).toEqual([1]); // 가운데 字
    });

    it("이모지 위치별 매치 — start / middle / end", () => {
        const query = buildQuery("😀")!;
        for (const tgt of ["😀foo", "foo😀bar", "foo😀"]) {
            const result = matchBest(query, preprocessTarget(tgt));
            expect(result, `target=${tgt}`).not.toBeNull();
        }
    });

    it("한글 + CJK + 이모지 모두 섞인 target에서 각 부분 검색 가능", () => {
        const target = preprocessTarget("안녕漢字😀hello");
        for (const q of ["안녕", "漢字", "😀", "hello", "녕漢"]) {
            const result = matchBest(buildQuery(q)!, target);
            expect(result, `query=${q}`).not.toBeNull();
        }
    });

    it("이모지 여러 개 — 정확한 위치 식별", () => {
        const target = preprocessTarget("a😀b🎉c");
        const r1 = matchBest(buildQuery("🎉")!, target);
        expect(r1).not.toBeNull();
        expect(r1!.indices).toEqual([3]); // a, 😀, b, 🎉, c
    });

    it("matchLiteral로 cluster substring 찾기", () => {
        const family = "👨\u200d👩\u200d👧";
        const target = preprocessTarget(`pre${family}post`);
        const result = matchLiteral(family, target);
        expect(result).not.toBeNull();
        expect(result!.indices.length).toBe(1);
    });

    it("matchBest로 이모지 포함 target 스코어링", () => {
        const target = preprocessTarget("hello 😀 world");
        const query = buildQuery("😀")!;
        const result = matchBest(query, target);
        expect(result).not.toBeNull();
        expect(result!.score).toBeGreaterThan(0);
    });

    it("buildMatchRanges가 surrogate pair 경계 정확히 처리 (UTF-16 단위)", () => {
        const target = preprocessTarget("a😀b");
        const result = matchBest(buildQuery("😀")!, target);
        expect(result).not.toBeNull();
        const ranges = buildMatchRanges([result!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(1); // 'a' 다음
        expect(ranges[0].end).toBe(3); // surrogate pair 2 units 후
    });

    it("buildMatchRanges가 ZWJ cluster 전체 범위 반환", () => {
        const family = "👨\u200d👩\u200d👧"; // 8 code units
        const target = preprocessTarget(`x${family}y`);
        const result = matchBest(buildQuery(family)!, target);
        expect(result).not.toBeNull();
        const ranges = buildMatchRanges([result!.indices], target);
        expect(ranges[0].start).toBe(1);
        expect(ranges[0].end).toBe(1 + family.length);
    });
});

describe("Target self-contained portability", () => {
    it("structuredClone된 Target도 동일하게 매치 — 글로벌 상태 의존 없음", () => {
        const original = preprocessTarget("漢字 안녕 😀");
        const cloned = structuredClone(original);

        const query = buildQuery("漢字")!;
        const r1 = matchBest(query, original);
        const r2 = matchBest(query, cloned);

        expect(r1).not.toBeNull();
        expect(r2).not.toBeNull();
        expect(r1!.indices).toEqual(r2!.indices);
    });

    it("structuredClone된 Target의 atomsFlat이 ID값까지 동일", () => {
        const t = preprocessTarget("漢a😀");
        const c = structuredClone(t);
        expect(Array.from(c.atomsFlat)).toEqual(Array.from(t.atomsFlat));
    });
});

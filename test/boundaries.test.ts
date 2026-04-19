import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, match, matchLiteral, preprocessTarget } from "../src/index";
import { atomCharToId } from "../src/internal/atomRegistry";
import { decomposeToAtoms } from "../src/internal/utils";

// ---------------------------------------------------------------------------
// Typed array boundary tests
//
// fuzzly uses Uint16Array for atom IDs (max 65535), Uint16Array for char/grapheme
// indexes (max 65535), and Int8Array for vowel/tail indexes. These tests verify
// correct behavior at and beyond those boundaries.
//
// 동적 atom ID 슬롯은 65407개(129-65535)로 실사용에서 소진 불가. 과거 Uint8Array
// 한도(126) 시절의 overflow 시나리오는 구조적 안전장치로만 남아있고 테스트는
// 생략한다. 대량 CJK 할당이 정상 동작하는지만 마지막 블록에서 확인한다.
// ---------------------------------------------------------------------------

// ====================================================================
// 1. Int8Array for vowelIdxs/tailIdxs — Korean/ASCII only, no dynamic IDs
// ====================================================================

describe("Int8Array for vowelIdxs/tailIdxs (range -128 to 127)", () => {
    it("-1 sentinel is correctly stored and retrieved from Int8Array", () => {
        // ASCII 'a' has no vowel and no tail
        const target = preprocessTarget("a");
        expect(target.vowelIdxs[0]).toBe(-1);
        expect(target.tailIdxs[0]).toBe(-1);
    });

    it("consonant-only jamo has vowelIndex -1, tailIndex -1", () => {
        const target = preprocessTarget("ㄱ");
        expect(target.vowelIdxs[0]).toBe(-1);
        expect(target.tailIdxs[0]).toBe(-1);
    });

    it("syllable without tail has valid vowelIndex and tailIndex -1", () => {
        // "가" = ㄱ + ㅏ -> vowelIndex = 1, tailIndex = -1
        const target = preprocessTarget("가");
        expect(target.vowelIdxs[0]).toBe(1);
        expect(target.tailIdxs[0]).toBe(-1);
    });

    it("syllable with simple tail has correct vowelIndex and tailIndex", () => {
        // "간" = ㄱ + ㅏ + ㄴ -> vowelIndex = 1, tailIndex = 2
        const target = preprocessTarget("간");
        expect(target.vowelIdxs[0]).toBe(1);
        expect(target.tailIdxs[0]).toBe(2);
    });

    it("syllable with compound vowel has correct indexes", () => {
        // "궈" = ㄱ + ㅝ(->ㅜㅓ) -> atoms: ㄱㅜㅓ -> vowelIndex = 1, tailIndex = -1
        const target = preprocessTarget("궈");
        expect(target.vowelIdxs[0]).toBe(1);
        expect(target.tailIdxs[0]).toBe(-1);
    });

    it("syllable with compound vowel and compound tail has correct indexes", () => {
        // "뷁" = ㅂ + ㅞ(->ㅜㅔ) + ㄺ(->ㄹㄱ) -> atoms: ㅂㅜㅔㄹㄱ
        // vowelIndex = 1, tailIndex = 3
        const target = preprocessTarget("뷁");
        expect(target.vowelIdxs[0]).toBe(1);
        expect(target.tailIdxs[0]).toBe(3);
    });

    it("match correctly uses -1 sentinel from Int8Array for consonant-only query", () => {
        const query = buildQuery("ㄱ")!;
        expect(query.graphemes[0].vowelIndex).toBe(-1);

        const target = preprocessTarget("가나다");
        const result = match(query, target);
        expect(result).not.toBeNull();
        expect(result!.indices).toContain(0);
    });

    it("Int8Array correctly represents small positive values used as indexes", () => {
        const testCases = [
            { char: "가", vowel: 1, tail: -1 }, // ㄱㅏ
            { char: "간", vowel: 1, tail: 2 }, // ㄱㅏㄴ
            { char: "귄", vowel: 1, tail: 3 }, // ㄱㅟ(ㅜㅣ)ㄴ -> ㄱㅜㅣㄴ, vowel=1, tail=3
        ];
        for (const tc of testCases) {
            const target = preprocessTarget(tc.char);
            expect(target.vowelIdxs[0]).toBe(tc.vowel);
            expect(target.tailIdxs[0]).toBe(tc.tail);
        }
    });
});

// ====================================================================
// 2. atomLens Uint8Array — Korean/ASCII only (no dynamic IDs needed)
// ====================================================================

describe("atomLens Uint8Array (max 255)", () => {
    it("Korean syllable with compound vowel and compound tail stays well within limit", () => {
        // "뷁" = ㅂ + ㅞ(->ㅜㅔ) + ㄺ(->ㄹㄱ) = 5 atoms
        const target = preprocessTarget("뷁");
        expect(target.atomLens[0]).toBe(5);
    });

    it("single ASCII character has atomLens of 1", () => {
        const target = preprocessTarget("a");
        expect(target.atomLens[0]).toBe(1);
    });

    it("maximum Korean decomposition length is bounded", () => {
        // Maximum: lead (1) + compound vowel (2) + compound tail (2) = 5 atoms
        const maxCases = ["뷁", "쉥", "쐥"];
        for (const ch of maxCases) {
            const target = preprocessTarget(ch);
            expect(target.atomLens[0]).toBeLessThanOrEqual(5);
            expect(target.atomLens[0]).toBeGreaterThanOrEqual(1);
        }
    });

    it("single jamo consonant has atomLens of 1", () => {
        const target = preprocessTarget("ㄱ");
        expect(target.atomLens[0]).toBe(1);
    });

    it("simple syllable (lead + vowel) has atomLens of 2", () => {
        // "가" = ㄱ + ㅏ = 2 atoms
        const target = preprocessTarget("가");
        expect(target.atomLens[0]).toBe(2);
    });

    it("syllable with simple tail has atomLens of 3", () => {
        // "간" = ㄱ + ㅏ + ㄴ = 3 atoms
        const target = preprocessTarget("간");
        expect(target.atomLens[0]).toBe(3);
    });
});

// ====================================================================
// 3. charIndexes / graphemeIndexes Uint16Array — Korean/ASCII only
// ====================================================================

describe("charIndexes Uint16Array (max 65535)", () => {
    it("target near 65535 UTF-16 length works correctly", () => {
        const padLen = 65530;
        const padding = "a".repeat(padLen);
        const str = `${padding}xyz`;
        expect(str.length).toBeLessThanOrEqual(65535);

        const target = preprocessTarget(str);

        const xGraphemeIdx = padLen;
        expect(target.charIndexes[xGraphemeIdx]).toBe(padLen);

        const litResult = matchLiteral("xyz", target);
        expect(litResult).not.toBeNull();
        expect(litResult!.indices).toContain(xGraphemeIdx);

        const ranges = buildMatchRanges([litResult!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(padLen);
        expect(ranges[0].end).toBe(padLen + 3);
    });

    it("target at exactly 65535 UTF-16 length works correctly", () => {
        const str = "a".repeat(65535);
        const target = preprocessTarget(str);

        expect(target.graphemeCount).toBe(65535);
        expect(target.charIndexes[65534]).toBe(65534);

        const query = buildQuery("a")!;
        const result = match(query, target);
        expect(result).not.toBeNull();
    });

    it("target exceeding 65535 UTF-16 length throws RangeError", () => {
        const str = "a".repeat(65540);
        expect(() => preprocessTarget(str)).toThrow(RangeError);
    });

    it("target at exactly 65535 UTF-16 length is accepted", () => {
        const str = "a".repeat(65535);
        const target = preprocessTarget(str);
        expect(target.graphemeCount).toBe(65535);
    });

    it("Korean text near the boundary (multi-byte graphemes)", () => {
        const koreanPad = "가".repeat(65530);
        const str = `${koreanPad}나다라`;
        expect(str.length).toBeLessThanOrEqual(65535);

        const target = preprocessTarget(str);
        const query = buildQuery("나다")!;
        const result = match(query, target);
        expect(result).not.toBeNull();

        const ranges = buildMatchRanges([result!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(65530);
        expect(ranges[0].end).toBe(65532);
    });
});

// ====================================================================
// 4. graphemeIndexes density/sparsity — Korean/ASCII only first
// ====================================================================

describe("graphemeIndexes Uint16Array density/sparsity", () => {
    it("graphemeIndexes maps all positions for Korean syllables", () => {
        // Each Korean syllable is 1 UTF-16 code unit, 1 grapheme
        const target = preprocessTarget("가나다");
        expect(target.graphemeIndexes[0]).toBe(0);
        expect(target.graphemeIndexes[1]).toBe(1);
        expect(target.graphemeIndexes[2]).toBe(2);
    });

    it("matchLiteral does not produce false positives from 0-default", () => {
        const target = preprocessTarget("abc");
        const result = matchLiteral("b", target);
        expect(result).not.toBeNull();
        expect(result!.indices).toEqual([1]); // grapheme index 1, not 0
    });

    it("buildMatchRanges uses charIndexes correctly for grapheme 0", () => {
        // 0 is both a valid index AND the Uint16Array default — verify it works
        const target = preprocessTarget("abc");
        const ranges = buildMatchRanges([[0]], target);
        expect(ranges).toEqual([{ start: 0, end: 1 }]);
    });

    it("buildMatchRanges handles single grapheme at various positions", () => {
        const target = preprocessTarget("abcde");
        const ranges = buildMatchRanges([[2]], target);
        expect(ranges).toEqual([{ start: 2, end: 3 }]);

        const rangesLast = buildMatchRanges([[4]], target);
        expect(rangesLast).toEqual([{ start: 4, end: 5 }]);
    });

    it("matchLiteral at position 0 correctly returns grapheme 0 (not confused with default)", () => {
        const target = preprocessTarget("hello world");
        const result = matchLiteral("hello", target);
        expect(result).not.toBeNull();
        expect(result!.indices[0]).toBe(0);
        expect(result!.indices.length).toBe(5);
    });

    it("matchLiteral in the middle returns correct grapheme indices (not 0)", () => {
        const target = preprocessTarget("abcdefghij");
        const result = matchLiteral("efg", target);
        expect(result).not.toBeNull();
        expect(result!.indices).toEqual([4, 5, 6]);
    });
});

// ====================================================================
// 5. end-to-end near typed array boundaries — Korean/ASCII only
// ====================================================================

describe("end-to-end: match + buildMatchRanges near typed array boundaries", () => {
    it("fuzzy match works correctly near charIndex boundary (65530+)", () => {
        const padding = "x".repeat(65520);
        const str = `${padding}감사합니다`;
        expect(str.length).toBeLessThanOrEqual(65535);

        const target = preprocessTarget(str);
        const query = buildQuery("감사")!;
        const result = match(query, target);
        expect(result).not.toBeNull();

        const ranges = buildMatchRanges([result!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(65520);
        expect(ranges[0].end).toBe(65522);
    });

    it("initial consonant match works near charIndex boundary", () => {
        const padding = "x".repeat(65520);
        const str = `${padding}감사합니다`;

        const target = preprocessTarget(str);
        const query = buildQuery("ㄱㅅ")!;
        const result = match(query, target);
        expect(result).not.toBeNull();

        const ranges = buildMatchRanges([result!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(65520);
        expect(ranges[0].end).toBe(65522);
    });

    it("literal match works near charIndex boundary", () => {
        const padding = "x".repeat(65520);
        const str = `${padding}hello`;

        const target = preprocessTarget(str);
        const result = matchLiteral("hello", target);
        expect(result).not.toBeNull();

        const ranges = buildMatchRanges([result!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(65520);
        expect(ranges[0].end).toBe(65525);
    });

    it("target exceeding 65535 throws before reaching match", () => {
        const str = "x".repeat(65536) + "abc";
        expect(() => preprocessTarget(str)).toThrow(RangeError);
    });
});

// ====================================================================
// 6. graphemeCount boundary for typed arrays
// ====================================================================

describe("graphemeCount boundary for typed arrays", () => {
    it("empty string produces zero-length arrays", () => {
        const target = preprocessTarget("");
        expect(target.graphemeCount).toBe(0);
        expect(target.atomsFlat.length).toBe(0);
        expect(target.atomStarts.length).toBe(0);
        expect(target.atomLens.length).toBe(0);
        expect(target.vowelIdxs.length).toBe(0);
        expect(target.tailIdxs.length).toBe(0);
        expect(target.boundaryFlags.length).toBe(0);
        expect(target.charIndexes.length).toBe(0);
        expect(target.graphemeIndexes.length).toBe(0);
    });

    it("single character string produces correct typed array sizes", () => {
        const target = preprocessTarget("a");
        expect(target.graphemeCount).toBe(1);
        expect(target.atomStarts.length).toBe(1);
        expect(target.atomLens.length).toBe(1);
        expect(target.vowelIdxs.length).toBe(1);
        expect(target.tailIdxs.length).toBe(1);
        expect(target.boundaryFlags.length).toBe(1);
        expect(target.charIndexes.length).toBe(1);
        expect(target.graphemeIndexes.length).toBe(1);
    });

    it("atomStarts uses Uint32Array (can handle large flat atom arrays)", () => {
        const str = "감".repeat(1000); // each = 3 atoms (ㄱㅏㅁ)
        const target = preprocessTarget(str);

        expect(target.graphemeCount).toBe(1000);
        expect(target.atomsFlat.length).toBe(3000);

        for (let i = 0; i < 1000; i++) {
            expect(target.atomStarts[i]).toBe(i * 3);
        }
    });

    it("boundaryFlags correctly identifies first grapheme", () => {
        const target = preprocessTarget("abc");
        expect(target.boundaryFlags[0]).toBe(1);
        expect(target.boundaryFlags[1]).toBe(0);
        expect(target.boundaryFlags[2]).toBe(0);
    });

    it("boundaryFlags correctly identifies word boundaries with separators", () => {
        const target = preprocessTarget("a b_c-d.e");
        expect(target.boundaryFlags[0]).toBe(1); // first char
        expect(target.boundaryFlags[1]).toBe(0); // space (separator itself)
        expect(target.boundaryFlags[2]).toBe(1); // 'b' after space
        expect(target.boundaryFlags[3]).toBe(0); // underscore
        expect(target.boundaryFlags[4]).toBe(1); // 'c' after underscore
        expect(target.boundaryFlags[5]).toBe(0); // dash
        expect(target.boundaryFlags[6]).toBe(1); // 'd' after dash
        expect(target.boundaryFlags[7]).toBe(0); // dot
        expect(target.boundaryFlags[8]).toBe(1); // 'e' after dot
    });
});

// ====================================================================
// 7. Emoji / multi-codepoint grapheme tests — consume a few dynamic IDs
//    (must run BEFORE atom overflow tests)
// ====================================================================

describe("emoji and multi-codepoint grapheme boundaries", () => {
    it("surrogate pairs near the charIndex boundary", () => {
        // Each U+1F600 emoji is 2 UTF-16 code units but 1 grapheme.
        const emojiCount = 100;
        const emojis = "\u{1F600}".repeat(emojiCount);
        const str = `${emojis}z`;

        const target = preprocessTarget(str);
        expect(target.graphemeCount).toBe(emojiCount + 1);

        // 'z' is at grapheme index emojiCount, UTF-16 position = emojiCount * 2
        expect(target.charIndexes[emojiCount]).toBe(emojiCount * 2);

        const litResult = matchLiteral("z", target);
        expect(litResult).not.toBeNull();

        const ranges = buildMatchRanges([litResult!.indices], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(emojiCount * 2);
        expect(ranges[0].end).toBe(emojiCount * 2 + 1);
    });

    it("graphemeIndexes maps both code units of a surrogate pair to the same grapheme", () => {
        const target = preprocessTarget("a\u{1F600}b");
        // 'a' at offset 0, emoji at offset 1-2 (surrogate pair), 'b' at offset 3
        expect(target.graphemeIndexes[0]).toBe(0);
        expect(target.graphemeIndexes[1]).toBe(1);
        expect(target.graphemeIndexes[2]).toBe(1); // second code unit of surrogate pair
        expect(target.graphemeIndexes[3]).toBe(2);
    });

    it("ZWJ emoji cluster atomLens equals UTF-16 code unit count", () => {
        const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"; // 8 code units
        const target = preprocessTarget(family);
        expect(target.graphemeCount).toBe(1);
        expect(target.atomLens[0]).toBe(family.length);
    });

    it("matchLiteral with ZWJ emoji correctly deduplicates grapheme indices", () => {
        const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
        const target = preprocessTarget(`x${family}y`);

        const result = matchLiteral(family, target);
        expect(result).not.toBeNull();
        // Single grapheme, single index
        expect(result!.indices.length).toBe(1);
        expect(result!.indices[0]).toBe(1); // 'x' is grapheme 0, family is grapheme 1
    });

    it("buildMatchRanges produces correct range for ZWJ emoji", () => {
        const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
        const target = preprocessTarget(`x${family}y`);

        const ranges = buildMatchRanges([[1]], target);
        expect(ranges.length).toBe(1);
        expect(ranges[0].start).toBe(1); // 'x' is 1 UTF-16 unit
        expect(ranges[0].end).toBe(1 + family.length); // family.length in UTF-16 units
    });

    it("emoji with skin tone modifier is a single grapheme (multi-atom)", () => {
        const emoji = "\u{1F44B}\u{1F3FB}"; // waving hand + light skin tone (4 code units)
        const target = preprocessTarget(`a${emoji}b`);
        expect(target.graphemeCount).toBe(3);
        expect(target.atomLens[1]).toBe(emoji.length);
    });
});

// ====================================================================
// 8. Atom ID encoding (codepoint-as-ID + multi-atom clusters)
// ====================================================================

describe("Atom ID encoding", () => {
    // 자모(1-33) / ASCII(34-128)는 고정 ID. 그 외 BMP는 codepoint 그대로.
    // non-BMP / multi-codepoint cluster는 UTF-16 code unit 시퀀스로 분해.

    it("BMP CJK char → codepoint-as-ID (1 atom)", () => {
        const ch = "漢"; // U+6F22
        const atoms = decomposeToAtoms(ch);
        expect(atoms.length).toBe(1);
        expect(atoms[0]).toBe(0x6f22);
        expect(atomCharToId(ch)).toBe(0x6f22);
    });

    it("non-BMP char → 2 atoms (surrogate pair)", () => {
        const emoji = "😀"; // U+1F600 → 0xD83D 0xDE00
        const atoms = decomposeToAtoms(emoji);
        expect(atoms.length).toBe(2);
        expect(atoms[0]).toBe(0xd83d);
        expect(atoms[1]).toBe(0xde00);
    });

    it("ZWJ cluster → multi-atom (one per UTF-16 unit)", () => {
        const cluster = "👨\u200d👩\u200d👧"; // 8 code units
        const atoms = decomposeToAtoms(cluster);
        expect(atoms.length).toBe(8);
        expect(atoms[0]).toBe(0xd83d); // 👨 high
        expect(atoms[1]).toBe(0xdc68); // 👨 low
        expect(atoms[2]).toBe(0x200d); // ZWJ
    });

    it("identical chars get identical IDs across calls (deterministic, no registry)", () => {
        const id1 = atomCharToId("漢");
        const id2 = atomCharToId("漢");
        expect(id1).toBe(id2);

        const atoms1 = decomposeToAtoms("漢");
        const atoms2 = decomposeToAtoms("漢");
        expect(atoms1).toBe(atoms2); // interned
    });

    it("preprocessTarget handles many unique CJK without overflow", () => {
        const cjkChars = Array.from({ length: 2000 }, (_, i) => String.fromCodePoint(0x4e00 + i));
        const mixedStr = `안녕하세요${cjkChars.join("")}감사합니다`;
        const target = preprocessTarget(mixedStr);
        expect(target.graphemeCount).toBeGreaterThan(0);

        const query = buildQuery("안녕")!;
        const result = match(query, target);
        expect(result).not.toBeNull();
    });
});

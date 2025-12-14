import { describe, it, expect } from "vitest";
import { buildFuzzyQuery } from "../src/buildFuzzyQuery";

describe("buildFuzzyQuery", () => {
    it("empty input → null", () => {
        expect(buildFuzzyQuery("")).toBeNull();
        expect(buildFuzzyQuery("\"\"")).not.toBeNull(); // literal은 예외
    });

    it("literal: exact double quotes only", () => {
        const q = buildFuzzyQuery("\"abc\"");
        expect(q).not.toBeNull();
        expect(q!.isLiteral).toBe(true);
        expect(q!.text).toBe("abc");
        expect(q!.chars).toEqual([]);
    });

    it("input starts and ends with quote → literal", () => {
        const q = buildFuzzyQuery("\"\"\"");
        expect(q).not.toBeNull();
        expect(q!.isLiteral).toBe(true);
        expect(q!.text).toBe("\"");
    });

    it("literal with inner quotes preserved", () => {
        const q = buildFuzzyQuery("\"a\"b\"\"");
        expect(q!.isLiteral).toBe(true);
        expect(q!.text).toBe("a\"b\"");
    });

    it("non-literal: strip all quotes", () => {
        const q = buildFuzzyQuery("a\"b\"c");
        expect(q!.isLiteral).toBe(false);
        expect(q!.text).toBe("abc");
    });

    it("single quote only → null", () => {
        expect(buildFuzzyQuery("\"")).toBeNull();
    });

    it("ASCII chars", () => {
        const q = buildFuzzyQuery("abc")!;
        expect(q.isLiteral).toBe(false);
        expect(q.text).toBe("abc");
        expect(q.chars.length).toBe(3);

        q.chars.forEach((c, i) => {
            expect(c.char).toBe("abc"[i]);
            expect(c.strokes).toEqual([c.char]);
            expect(c.vowelIndex).toBe(-1);
            expect(c.tailIndex).toBe(-1);
            expect(c.allowTailSpillover).toBe(true);
        });
    });

    it("완성형 한글 분해 + vowel/tail index", () => {
        const q = buildFuzzyQuery("값")!;
        const c = q.chars[0];

        // ㄱ ㅏ ㅂ ㅅ
        expect(c.strokes).toEqual(["ㄱ", "ㅏ", "ㅂ", "ㅅ"]);
        expect(c.vowelIndex).toBe(1);
        expect(c.tailIndex).toBe(2);
    });

    it("호환 자모 분해 (ㄳ)", () => {
        const q = buildFuzzyQuery("ㄳ")!;
        const c = q.chars[0];

        expect(c.strokes).toEqual(["ㄱ", "ㅅ"]);
        expect(c.vowelIndex).toBe(-1);
        expect(c.tailIndex).toBe(-1);
    });

    it("중성만 있는 경우", () => {
        const q = buildFuzzyQuery("ㅏ")!;
        const c = q.chars[0];

        expect(c.strokes).toEqual(["ㅏ"]);
        expect(c.vowelIndex).toBe(0);
        expect(c.tailIndex).toBe(-1);
    });

    it("이모지 grapheme", () => {
        const q = buildFuzzyQuery("😀")!;
        const c = q.chars[0];

        expect(c.char).toBe("😀");
        expect(c.strokes).toEqual(["😀"]);
        expect(c.vowelIndex).toBe(-1);
        expect(c.tailIndex).toBe(-1);
    });

    it("ZWJ cluster treated as single char", () => {
        const family = "👨‍👩‍👧‍👦";
        const q = buildFuzzyQuery(family)!;

        expect(q.chars.length).toBe(1);
        expect(q.chars[0].char).toBe(family);
        expect(q.chars[0].strokes).toEqual([family]);
    });

    it("mixed string preserves grapheme boundaries", () => {
        const q = buildFuzzyQuery("값a😀ㄳ")!;
        expect(q.chars.map(c => c.char)).toEqual(["값", "a", "😀", "ㄳ"]);

        // sanity check vowel/tail on each
        expect(q.chars[0].vowelIndex).toBe(1); // 값
        expect(q.chars[1].vowelIndex).toBe(-1); // a
        expect(q.chars[2].vowelIndex).toBe(-1); // 😀
        expect(q.chars[3].vowelIndex).toBe(-1); // ㄳ
    });

    it("allowTailSpillover always true (for now)", () => {
        const q = buildFuzzyQuery("abc값")!;
        q.chars.forEach(c => {
            expect(c.allowTailSpillover).toBe(true);
        });
    });
});

import { describe, expect, it } from "vitest";
import { buildQuery, createSearcher, match, matchBest, preprocessTarget } from "../src/index";

describe("ignore 모드 - buildQuery", () => {
    it("공백 grapheme이 제거된다", () => {
        const q = buildQuery("ab cd", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(4);
        expect(q.graphemes.map((g) => g.char).join("")).toBe("abcd");
    });

    it("atoms 문자열에 공백 atom이 포함되지 않는다", () => {
        const literal = buildQuery("a b");
        const ignore = buildQuery("a b", { whitespace: "ignore" });
        const ab = buildQuery("ab");
        expect(literal.atoms).not.toBe(ab.atoms);
        expect(ignore.atoms).toBe(ab.atoms);
    });

    it("charIndexes는 원본 input의 UTF-16 offset을 유지한다", () => {
        // "a b c" — grapheme a@0, b@2, c@4 (공백 @1, @3 은 drop)
        const q = buildQuery("a b c", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(3);
        expect(Array.from(q.charIndexes)).toEqual([0, 2, 4]);
    });

    it("graphemeIndexes: 공백 위치는 다음 non-space grapheme 인덱스를 가리킨다", () => {
        // "a b c" — char 0=a(0), 1=space→b(1), 2=b(1), 3=space→c(2), 4=c(2)
        const q = buildQuery("a b c", { whitespace: "ignore" });
        expect(Array.from(q.graphemeIndexes)).toEqual([0, 1, 1, 2, 2]);
    });

    it("후행 공백: graphemeIndexes는 graphemes.length를 가리킨다", () => {
        // "ab " — 공백 @2 → graphemes.length=2
        const q = buildQuery("ab ", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(2);
        expect(Array.from(q.graphemeIndexes)).toEqual([0, 1, 2]);
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
        // 선행 공백 @0은 다음 grapheme 'a' (index 0)
        expect(q.graphemeIndexes[0]).toBe(0);
    });

    it("input 필드는 원본 보존", () => {
        const q = buildQuery("a b", { whitespace: "ignore" });
        expect(q.input).toBe("a b");
    });

    it("whitespace 필드 기본값은 literal", () => {
        const def = buildQuery("ab");
        expect(def.whitespace).toBe("literal");
        const lit = buildQuery("ab", { whitespace: "literal" });
        expect(lit.whitespace).toBe("literal");
        const ig = buildQuery("ab", { whitespace: "ignore" });
        expect(ig.whitespace).toBe("ignore");
    });

    it("ignore 모드에서도 탭/개행은 literal grapheme으로 유지", () => {
        // atomCharToId("\t")는 ASCII 0x09이지만 printable 범위(0x20-0x7E) 밖이라 동적 atom.
        // 여기선 drop되지 않음을 확인만 한다.
        const q = buildQuery("a\tb", { whitespace: "ignore" });
        expect(q.graphemes.length).toBe(3);
    });
});

describe("ignore 모드 - 매칭 동작", () => {
    it("target에 공백 없어도 매치 (ab cd → abcdef)", () => {
        const t = preprocessTarget("abcdef");
        const q = buildQuery("ab cd", { whitespace: "ignore" });
        const r = match(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1, 2, 3]);
    });

    it("target에 공백 있어도 매치", () => {
        const t = preprocessTarget("abc def");
        const q = buildQuery("abc def", { whitespace: "ignore" });
        const r = match(q, t);
        expect(r).not.toBeNull();
        // 공백 무시한 "abcdef"로 매칭됨. target의 공백도 매치에 포함되진 않음
        expect(r?.indices).toEqual([0, 1, 2, 4, 5, 6]);
    });

    it("literal과 ignore 비교: target에 공백 없는 케이스", () => {
        const t = preprocessTarget("ab");
        const lit = buildQuery("a b");
        const ig = buildQuery("a b", { whitespace: "ignore" });
        expect(match(lit, t)).toBeNull();
        expect(match(ig, t)).not.toBeNull();
    });

    it("한글+공백: '한국 문' → '한국어 문자열' 매치", () => {
        const t = preprocessTarget("한국어 문자열");
        const q = buildQuery("한국 문", { whitespace: "ignore" });
        const r = match(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1, 4]);
    });

    it("초성+공백: 'ㅍ ㄱ' → '파일 검색' 매치", () => {
        const t = preprocessTarget("파일 검색");
        const q = buildQuery("ㅍ ㄱ", { whitespace: "ignore" });
        const r = match(q, t);
        expect(r).not.toBeNull();
        // 'ㅍ' → '파' (0), 'ㄱ' → '검' (3)
        expect(r?.indices).toEqual([0, 3]);
    });

    it("matchBest도 ignore 모드에서 동작", () => {
        const t = preprocessTarget("abcdef");
        const q = buildQuery("ab cd", { whitespace: "ignore" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1, 2, 3]);
        expect(r?.score).toBeDefined();
    });
});

describe("ignore 모드 - composingIndex", () => {
    it("공백 직후 grapheme을 가리키는 composingIndex", () => {
        // 쿼리 "a b", composingIndex=2 (= 'b' 위치)
        // ignore 모드에서 graphemes = [a, b], 'b'는 새 인덱스 1
        // resolveComposingGrapheme이 graphemeIndexes[2]=1을 반환해야 함
        const t = preprocessTarget("ab");
        const q = buildQuery("a b", { whitespace: "ignore" });
        // composingIndex=2 (b char position in raw input)
        const r = match(q, t, 2, "composing");
        // 'b'가 조합중(composing), 'a'는 finalized strict
        // target "ab" 에 literal match → 성공
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0, 1]);
    });

    it("composingIndex가 공백 위치 자체 (`a |`)", () => {
        // 쿼리 "a ", composingIndex=1 (공백 위치)
        // ignore 모드에서 graphemes = [a], graphemeIndexes[1] = graphemes.length (=1, out-of-range)
        // resolveComposingGrapheme은 range 밖이면 "없음"으로 처리
        const t = preprocessTarget("a");
        const q = buildQuery("a ", { whitespace: "ignore" });
        const r = match(q, t, 1, "composing");
        // 'a' finalized strict, 조합중 없음. target "a"와 literal match
        expect(r).not.toBeNull();
        expect(r?.indices).toEqual([0]);
    });
});

describe("ignore 모드 - createSearcher 세션", () => {
    it("동일 모드 연속 호출에서 atoms prefix narrowing 유지", () => {
        const searcher = createSearcher(["abcdef", "xyz", "abczdef"]);
        const r1 = searcher.search("a", { whitespace: "ignore" });
        expect(r1.map((x) => x.item).sort()).toEqual(["abcdef", "abczdef"]);

        // 공백 추가해도 atoms 변화 없음 → narrowing 여전히 유지 가능
        const r2 = searcher.search("a ", { whitespace: "ignore" });
        expect(r2.map((x) => x.item).sort()).toEqual(["abcdef", "abczdef"]);

        // 'b' 추가 → atoms 증가, prev matched만 스캔
        const r3 = searcher.search("a b", { whitespace: "ignore" });
        expect(r3.map((x) => x.item).sort()).toEqual(["abcdef", "abczdef"]);
    });

    it("모드 전환 시 세션 reset (literal → ignore)", () => {
        const searcher = createSearcher(["ab", "a b"]);

        // literal: "a b" → "a b"만 매치
        const r1 = searcher.search("a b");
        expect(r1.map((x) => x.item)).toEqual(["a b"]);

        // ignore로 전환: 두 엔트리 모두 매치되어야 함 (세션 reset)
        const r2 = searcher.search("a b", { whitespace: "ignore" });
        expect(r2.map((x) => x.item).sort()).toEqual(["a b", "ab"]);
    });

    it("모드 전환 ignore → literal", () => {
        const searcher = createSearcher(["ab", "a b"]);

        const r1 = searcher.search("a b", { whitespace: "ignore" });
        expect(r1.map((x) => x.item).sort()).toEqual(["a b", "ab"]);

        const r2 = searcher.search("a b");
        expect(r2.map((x) => x.item)).toEqual(["a b"]);
    });
});

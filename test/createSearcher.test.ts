import { describe, expect, it } from "vitest";
import { createSearcher } from "../src/index";

describe("createSearcher", () => {
    it("기본 사용 - 한글 검색", () => {
        const searcher = createSearcher(["안녕하세요", "반갑습니다", "안녕히가세요"]);
        const results = searcher.search("안");

        expect(results).toHaveLength(2);
        expect(results[0].item).toBe("안녕하세요");
        expect(results[0].index).toBe(0);
        expect(results[1].item).toBe("안녕히가세요");
        expect(results[1].index).toBe(2);
    });

    it("매치가 없으면 빈 배열", () => {
        const searcher = createSearcher(["안녕하세요", "반갑습니다"]);
        const results = searcher.search("zzz");
        expect(results).toEqual([]);
    });

    it("빈 쿼리는 모든 항목을 반환", () => {
        const searcher = createSearcher(["안녕", "반가움"]);
        const results = searcher.search("");
        expect(results).toHaveLength(2);
    });

    it("MatchRange가 입력 순서대로 포함됨", () => {
        const searcher = createSearcher(["안녕하세요"]);
        const results = searcher.search("안녕");

        expect(results).toHaveLength(1);
        expect(results[0].ranges.length).toBeGreaterThan(0);
        for (const range of results[0].ranges) {
            expect(range.start).toBeLessThan(range.end);
        }
    });

    it("caseSensitive 기본값은 false", () => {
        const searcher = createSearcher(["Hello World", "HELLO there"]);
        const results = searcher.search("hello");
        expect(results).toHaveLength(2);
    });

    it("caseSensitive: true 지정", () => {
        const searcher = createSearcher(["Hello", "hello", "HELLO"], { caseSensitive: true });
        const results = searcher.search("Hello");
        expect(results.map((r) => r.item)).toEqual(["Hello"]);
    });

    it("초성만으로 검색", () => {
        const searcher = createSearcher(["안녕하세요", "반갑습니다"]);
        const results = searcher.search("ㅇㄴ");
        expect(results).toHaveLength(1);
        expect(results[0].item).toBe("안녕하세요");
    });

    it("같은 searcher로 여러 번 search 호출 가능", () => {
        const searcher = createSearcher(["안녕", "반가움", "안부"]);

        const r1 = searcher.search("안");
        const r2 = searcher.search("반");
        const r3 = searcher.search("안");

        expect(r1).toHaveLength(2);
        expect(r2).toHaveLength(1);
        expect(r3).toHaveLength(2);
    });

    it("tailSpillover 옵션 전파", () => {
        const searcher = createSearcher(["감사합니다"], { tailSpillover: "always" });
        const results = searcher.search("감사");
        expect(results).toHaveLength(1);
    });

    it("리터럴 쿼리 (따옴표) 전파", () => {
        const searcher = createSearcher(["안녕하세요", "안녕히가세요"]);
        const results = searcher.search('"하세"');
        expect(results.map((r) => r.item)).toEqual(["안녕하세요"]);
    });

    it("readonly 배열도 받을 수 있음", () => {
        const items: readonly string[] = Object.freeze(["foo", "bar"]);
        const searcher = createSearcher(items);
        const results = searcher.search("foo");
        expect(results).toHaveLength(1);
    });

    it("index 필드가 원본 배열의 인덱스와 일치", () => {
        const items = ["apple", "banana", "cherry", "date", "elderberry"];
        const searcher = createSearcher(items);
        const results = searcher.search("e");

        for (const r of results) {
            expect(items[r.index]).toBe(r.item);
        }
    });
});

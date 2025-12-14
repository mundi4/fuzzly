import { describe, it, expect } from "vitest";
import { search, matches, getMatchRanges, type SearchOptions } from "../src/search";

describe("search API", () => {
    describe("basic string search", () => {
        it("should find exact match", () => {
            const items = ["값어치", "가치", "나다"];
            const results = search("값", items);
            
            // "값" matches "값어치" (exact start match)
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.some(r => r.item === "값어치")).toBe(true);
        });

        it("should find fuzzy matches", () => {
            const items = ["안녕하세요", "안녕", "하세요"];
            const results = search("ㅇㅎㅇ", items);
            
            expect(results.length).toBe(1);
            expect(results[0].item).toBe("안녕하세요");
        });

        it("should return empty array for no matches", () => {
            const items = ["가나다", "라마바"];
            const results = search("xyz", items);
            
            expect(results).toEqual([]);
        });

        it("should return empty array for empty query", () => {
            const items = ["가", "나"];
            const results = search("", items);
            
            expect(results).toEqual([]);
        });

        it("should return empty array for empty items", () => {
            const results = search("가", []);
            
            expect(results).toEqual([]);
        });

        it("should handle whitespace-only query", () => {
            const items = ["가", "나"];
            const results = search("   ", items);
            
            expect(results).toEqual([]);
        });
    });

    describe("object search with keys", () => {
        it("should search object properties", () => {
            const items = [
                { name: "파일 열기", cmd: "open" },
                { name: "파일 닫기", cmd: "close" },
                { name: "새 파일", cmd: "new" }
            ];
            
            const results = search("파열", items, { keys: ["name"] });
            
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("파일 열기");
        });

        it("should search multiple keys", () => {
            const items = [
                { name: "열기", cmd: "open" },
                { name: "닫기", cmd: "close" }
            ];
            
            const results = search("open", items, { keys: ["name", "cmd"] });
            
            expect(results.length).toBe(1);
            expect(results[0].item.cmd).toBe("open");
        });

        it("should handle function keys", () => {
            const items = [
                { title: "항목1", tags: ["tag1", "tag2"] },
                { title: "항목2", tags: ["tag3"] }
            ];
            
            const results = search("tag1", items, {
                keys: [
                    "title",
                    (item) => item.tags.join(" ")
                ]
            });
            
            expect(results.length).toBe(1);
            expect(results[0].item.title).toBe("항목1");
        });

        it("should handle missing properties gracefully", () => {
            const items = [
                { name: "있음" },
                { other: "다른거" }
            ];
            
            const results = search("있", items, { keys: ["name"] });
            
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("있음");
        });
    });

    describe("allowTailSpillover option", () => {
        it("should allow tail spillover by default", () => {
            const items = ["값어치"];
            const results = search("값", items);
            
            expect(results.length).toBe(1);
        });

        it("should respect allowTailSpillover: false", () => {
            const items = ["돋음"];
            const results = search("도", items, { allowTailSpillover: false });
            
            // With allowTailSpillover: false, "도" should not match "돋음"
            expect(results.length).toBe(0);
        });

        it("should allow partial match with spillover enabled", () => {
            const items = ["값진"];
            const results = search("값", items, { allowTailSpillover: true });
            
            expect(results.length).toBe(1);
        });
    });

    describe("whitespaceMode option", () => {
        it("should split query by default", () => {
            const items = ["안녕하세요 여러분"];
            const results = search("안녕 여러", items);
            
            expect(results.length).toBe(1);
        });

        it("should handle split mode with unordered tokens", () => {
            const items = ["파일 열기 명령"];
            const results = search("명령 파일", items, { whitespaceMode: 'split' });
            
            // Both tokens must match
            expect(results.length).toBe(1);
        });

        it("should treat literal whitespace with literal mode", () => {
            const items = ["파일 열기", "파일열기"];
            const results = search("\"파일 열기\"", items, { whitespaceMode: 'literal' });
            
            expect(results.length).toBe(1);
            expect(results[0].item).toBe("파일 열기");
        });
    });

    describe("sort option", () => {
        it("should sort by relevance by default", () => {
            const items = ["가나다", "가", "가나"];
            const results = search("가", items);
            
            // Shorter/better matches should score higher
            expect(results[0].item).toBe("가");
        });

        it("should not sort when sort: false", () => {
            const items = ["가나다", "가", "가나"];
            const results = search("가", items, { sort: false });
            
            expect(results.length).toBe(3);
            // Results should be in original order
            expect(results.map(r => r.item)).toEqual(["가나다", "가", "가나"]);
        });
    });

    describe("limit option", () => {
        it("should return all results by default", () => {
            const items = ["가", "가나", "가나다", "가나다라"];
            const results = search("가", items);
            
            expect(results.length).toBe(4);
        });

        it("should limit results when specified", () => {
            const items = ["가", "가나", "가나다", "가나다라"];
            const results = search("가", items, { limit: 2 });
            
            expect(results.length).toBe(2);
        });

        it("should handle limit larger than results", () => {
            const items = ["가", "가나"];
            const results = search("가", items, { limit: 10 });
            
            expect(results.length).toBe(2);
        });
    });

    describe("score calculation", () => {
        it("should include score in results", () => {
            const items = ["값어치"];
            const results = search("값", items);
            
            expect(results[0].score).toBeGreaterThan(0);
            expect(results[0].score).toBeLessThanOrEqual(1);
        });

        it("should score exact matches higher", () => {
            const items = ["가", "가나다"];
            const results = search("가", items);
            
            const exactMatch = results.find(r => r.item === "가");
            const partialMatch = results.find(r => r.item === "가나다");
            
            expect(exactMatch!.score).toBeGreaterThan(partialMatch!.score);
        });

        it("should score earlier matches higher", () => {
            const items = ["나가", "가나"];
            const results = search("가", items);
            
            const firstMatch = results.find(r => r.item === "가나");
            const secondMatch = results.find(r => r.item === "나가");
            
            expect(firstMatch!.score).toBeGreaterThan(secondMatch!.score);
        });
    });

    describe("matches result structure", () => {
        it("should include match ranges", () => {
            const items = ["안녕하세요"];
            const results = search("안녕", items);
            
            expect(results[0].matches).toBeDefined();
            expect(Array.isArray(results[0].matches)).toBe(true);
        });

        it("should include original index", () => {
            const items = ["가", "나", "다"];
            const results = search("나", items);
            
            expect(results[0].index).toBe(1);
        });
    });

    describe("literal query with quotes", () => {
        it("should handle literal search", () => {
            const items = ["값어치", "가치"];
            const results = search("\"값\"", items);
            
            expect(results.length).toBe(1);
            expect(results[0].item).toBe("값어치");
        });

        it("should not match fuzzy with literal query", () => {
            const items = ["가나다"];
            const results = search("\"ㄱㄴㄷ\"", items);
            
            // Literal ㄱㄴㄷ won't match 가나다
            expect(results.length).toBe(0);
        });
    });

    describe("complex scenarios", () => {
        it("should handle mixed Korean and English", () => {
            const items = [
                { name: "파일 Open", cmd: "file.open" },
                { name: "파일 Close", cmd: "file.close" }
            ];
            
            const results = search("파 op", items, { keys: ["name"] });
            
            expect(results.length).toBe(1);
            expect(results[0].item.name).toBe("파일 Open");
        });

        it("should handle emoji", () => {
            const items = ["😀 웃음", "😢 슬픔"];
            const results = search("웃", items);
            
            expect(results.length).toBe(1);
            expect(results[0].item).toBe("😀 웃음");
        });

        it("should handle empty strings in array", () => {
            const items = ["", "가", "나"];
            const results = search("가", items);
            
            expect(results.length).toBe(1);
            expect(results[0].item).toBe("가");
        });
    });
});

describe("matches helper", () => {
    it("should return true for matching item", () => {
        expect(matches("값", "값어치")).toBe(true);
    });

    it("should return false for non-matching item", () => {
        expect(matches("xyz", "가나다")).toBe(false);
    });

    it("should work with objects", () => {
        const item = { name: "파일 열기" };
        expect(matches("파열", item, { keys: ["name"] })).toBe(true);
    });

    it("should return false for empty query", () => {
        expect(matches("", "가나다")).toBe(false);
    });
});

describe("getMatchRanges helper", () => {
    it("should return match ranges for matching item", () => {
        const ranges = getMatchRanges("안녕", "안녕하세요");
        
        expect(ranges).not.toBeNull();
        expect(Array.isArray(ranges)).toBe(true);
    });

    it("should return null for non-matching item", () => {
        const ranges = getMatchRanges("xyz", "가나다");
        
        expect(ranges).toBeNull();
    });

    it("should work with objects", () => {
        const item = { name: "파일 열기" };
        const ranges = getMatchRanges("파열", item, { keys: ["name"] });
        
        expect(ranges).not.toBeNull();
    });

    it("should return null for empty query", () => {
        const ranges = getMatchRanges("", "가나다");
        
        expect(ranges).toBeNull();
    });
});

describe("edge cases", () => {
    it("should handle undefined/null items gracefully", () => {
        const items = [null, undefined, "가나다"];
        const results = search("가", items as any);
        
        // Should find "가나다" and convert null/undefined to strings
        expect(results.length).toBeGreaterThan(0);
    });

    it("should handle numeric items", () => {
        const items = [123, 456, 789];
        const results = search("123", items as any);
        
        expect(results.length).toBe(1);
        expect(results[0].item).toBe(123);
    });

    it("should handle very long strings", () => {
        const longString = "가".repeat(1000);
        const items = [longString];
        const results = search("가", items);
        
        expect(results.length).toBe(1);
    });

    it("should handle special characters", () => {
        const items = ["!@#$%", "가!@#"];
        const results = search("!@", items);
        
        expect(results.length).toBeGreaterThanOrEqual(1);
    });
});

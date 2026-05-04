import { describe, expect, it } from "vitest";
import { createSearcher } from "../src/index";

describe("createSearcher", () => {
    describe("기본 사용", () => {
        it("한글 검색", () => {
            const searcher = createSearcher(["안녕하세요", "반갑습니다", "안녕히가세요"]);
            const results = searcher.search("안");

            expect(results).toHaveLength(2);
            expect(results[0].item).toBe("안녕하세요");
            expect(results[1].item).toBe("안녕히가세요");
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

        it("ranges()가 올바른 MatchRange[] 반환", () => {
            const searcher = createSearcher(["안녕하세요"]);
            const results = searcher.search("안녕");

            expect(results).toHaveLength(1);
            const ranges = results[0].ranges();
            expect(ranges.length).toBeGreaterThan(0);
            for (const range of ranges) {
                expect(range.start).toBeLessThan(range.end);
            }
        });

        it("대소문자 무시 (항상 case-insensitive)", () => {
            const searcher = createSearcher(["Hello World", "HELLO there"]);
            const results = searcher.search("hello");
            expect(results).toHaveLength(2);
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

        it("readonly 배열도 받을 수 있음", () => {
            const items: readonly string[] = Object.freeze(["foo", "bar"]);
            const searcher = createSearcher(items);
            const results = searcher.search("foo");
            expect(results).toHaveLength(1);
        });
    });

    describe("SearchResult 구조", () => {
        it("result 필드에 MatchResult 포함", () => {
            const searcher = createSearcher(["안녕하세요"]);
            const results = searcher.search("안녕");

            expect(results).toHaveLength(1);
            const r = results[0];
            expect(r.result).toBeDefined();
            expect(Array.isArray(r.result.indices)).toBe(true);
            expect(typeof r.result.startsAtZero).toBe("boolean");
            expect(typeof r.result.runCount).toBe("number");
            expect(typeof r.result.boundaryHits).toBe("number");
        });

        it("target 필드에 Target 포함", () => {
            const searcher = createSearcher(["안녕하세요"]);
            const results = searcher.search("안");

            expect(results[0].target).toBeDefined();
            expect(results[0].target.input).toBe("안녕하세요");
        });

        it("ranges()는 lazy (함수 호출)", () => {
            const searcher = createSearcher(["안녕하세요"]);
            const results = searcher.search("안녕");

            expect(typeof results[0].ranges).toBe("function");
            const ranges = results[0].ranges();
            expect(Array.isArray(ranges)).toBe(true);
        });
    });

    describe("리터럴 검색", () => {
        it("literal 옵션으로 리터럴 매칭", () => {
            const searcher = createSearcher(["안녕하세요", "안녕히가세요"]);
            const results = searcher.search("하세", { literal: true });
            expect(results.map((r) => r.item)).toEqual(["안녕하세요"]);
        });

        it("literal: false는 퍼지 매칭 (기본값)", () => {
            const searcher = createSearcher(["안녕하세요"]);
            const results = searcher.search("ㅇㄴ", { literal: false });
            expect(results).toHaveLength(1);
        });
    });

    describe("스코어링", () => {
        it("score 콜백으로 정렬", () => {
            const searcher = createSearcher(["안녕하세요", "안부 전합니다", "안심하세요"], {
                score: (result) => (result.startsAtZero ? 100 : 0) - result.runCount,
            });
            const results = searcher.search("안");

            expect(results.length).toBeGreaterThan(0);
            // 모든 결과에 score가 있어야 함
            for (const r of results) {
                expect(typeof r.score).toBe("number");
            }
            // 내림차순 정렬
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score!).toBeGreaterThanOrEqual(results[i].score!);
            }
        });

        it("DP score가 항상 계산됨", () => {
            const searcher = createSearcher(["aaa", "aab", "aac"]);
            const results = searcher.search("a");
            expect(results).toHaveLength(3);
            for (const r of results) {
                expect(typeof r.score).toBe("number");
            }
        });

        it("score 기반 정렬: 짧은 타겟이 더 높은 점수", () => {
            const searcher = createSearcher(["안녕하세요", "안녕"]);
            const results = searcher.search("안");
            expect(results).toHaveLength(2);
            expect(results[0].item).toBe("안녕");
            expect(results[0].score!).toBeGreaterThan(results[1].score!);
        });
    });

    describe("limit 옵션", () => {
        it("limit으로 결과 수 제한", () => {
            const searcher = createSearcher(["a1", "a2", "a3", "a4", "a5"]);
            const results = searcher.search("a", { limit: 2 });
            expect(results).toHaveLength(2);
        });

        it("limit 없으면 모든 결과 반환", () => {
            const searcher = createSearcher(["a1", "a2", "a3"]);
            const results = searcher.search("a");
            expect(results).toHaveLength(3);
        });

        it("score + limit: 정렬 후 자르기", () => {
            const items = ["z_a", "a_z", "m_a"];
            const searcher = createSearcher(items, {
                score: (r) => (r.startsAtZero ? 100 : 0),
            });
            const results = searcher.search("a", { limit: 2 });
            expect(results).toHaveLength(2);
            // score 내림차순이므로 startsAtZero인 것이 먼저
            expect(results[0].item).toBe("a_z");
        });
    });

    describe("keyed 제네릭 검색", () => {
        it("객체 배열 + key 함수", () => {
            const items = [
                { id: 1, label: "안녕하세요" },
                { id: 2, label: "반갑습니다" },
                { id: 3, label: "안녕히가세요" },
            ];
            const searcher = createSearcher(items, { key: (item) => item.label });
            const results = searcher.search("안");

            expect(results).toHaveLength(2);
            expect(results[0].item.id).toBe(1);
            expect(results[1].item.id).toBe(3);
        });

        it("keyed 검색에서 ranges() 동작", () => {
            const items = [{ name: "hello world" }];
            const searcher = createSearcher(items, { key: (item) => item.name });
            const results = searcher.search("hello");

            expect(results).toHaveLength(1);
            const ranges = results[0].ranges();
            expect(ranges.length).toBeGreaterThan(0);
        });
    });

    describe("증분 API", () => {
        it("add - 항목 추가", () => {
            const searcher = createSearcher(["안녕"]);
            expect(searcher.search("반")).toHaveLength(0);

            searcher.add("반갑");
            expect(searcher.search("반")).toHaveLength(1);
        });

        it("add - 여러 항목 추가", () => {
            const searcher = createSearcher<string>([], { key: (x) => x });
            searcher.add("안녕", "반갑", "안부");
            expect(searcher.search("안")).toHaveLength(2);
        });

        it("remove - 항목 제거", () => {
            const searcher = createSearcher(["안녕", "반갑", "안부"]);
            expect(searcher.search("안")).toHaveLength(2);

            searcher.remove((item) => item === "안녕");
            expect(searcher.search("안")).toHaveLength(1);
            expect(searcher.search("안")[0].item).toBe("안부");
        });

        it("replaceAll - 전체 교체", () => {
            const searcher = createSearcher(["안녕", "반갑"]);
            expect(searcher.search("안")).toHaveLength(1);

            searcher.replaceAll(["새로운", "안녕히"]);
            expect(searcher.search("안")).toHaveLength(1);
            expect(searcher.search("안")[0].item).toBe("안녕히");
        });

        it("keyed 제네릭에서 add/remove", () => {
            const items = [{ id: 1, label: "안녕" }];
            const searcher = createSearcher(items, { key: (x) => x.label });

            searcher.add({ id: 2, label: "반갑" });
            expect(searcher.search("반")).toHaveLength(1);

            searcher.remove((item) => item.id === 1);
            expect(searcher.search("안")).toHaveLength(0);
        });
    });

    describe("strict 옵션 (SearcherOptions)", () => {
        it("strict=false 기본: '으' → '은행나무' 매치됨 (관대)", () => {
            const searcher = createSearcher(["은행나무"]);
            const r = searcher.search("으");
            expect(r.map((x) => x.item)).toContain("은행나무");
        });

        it("strict=true: '으' → '은행나무' 매치 안 됨 (엄격)", () => {
            const searcher = createSearcher(["은행나무"], { strict: true });
            const r = searcher.search("으");
            expect(r.map((x) => x.item)).not.toContain("은행나무");
        });

        it("strict 정책은 인스턴스 단위 — 별 searcher 로 비교", () => {
            const lenient = createSearcher(["은행나무"], { strict: false });
            const strict = createSearcher(["은행나무"], { strict: true });
            expect(lenient.search("으").map((r) => r.item)).toContain("은행나무");
            expect(strict.search("으").map((r) => r.item)).not.toContain("은행나무");
        });

        it("'막엲ㄱ' → '막연하게' 매치 (기본 관대 모드)", () => {
            const searcher = createSearcher(["막연하게", "foo", "bar"]);
            const results = searcher.search("막엲ㄱ");
            expect(results.map((r) => r.item)).toContain("막연하게");
        });
    });

    describe("literal 모드 세션 키 (per-call)", () => {
        it("literal 모드 연속에서 atoms prefix narrowing 유지", () => {
            const searcher = createSearcher(["abcdef", "xyz"]);
            const r1 = searcher.search("ab", { literal: true });
            expect(r1.map((x) => x.item)).toEqual(["abcdef"]);

            const r2 = searcher.search("abc", { literal: true });
            expect(r2.map((x) => x.item)).toEqual(["abcdef"]);
        });

        it("literal ↔ fuzzy 전환은 세션 단절", () => {
            const searcher = createSearcher(["ab", "a b"], { whitespace: "ignore" });
            const r1 = searcher.search("a b", { literal: true });
            expect(r1.map((x) => x.item)).toEqual(["a b"]);

            // literal → fuzzy(whitespace=ignore): 둘 다 매치되어야 함 (전체 재스캔 확인)
            const r2 = searcher.search("a b", { literal: false });
            expect(r2.map((x) => x.item).sort()).toEqual(["a b", "ab"]);
        });
    });

    describe("dev-mode silent ignore guard", () => {
        const captureWarnings = (fn: () => void): string[] => {
            const original = console.warn;
            const warnings: string[] = [];
            console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
            try {
                fn();
            } finally {
                console.warn = original;
            }
            return warnings;
        };

        it("createSearcher 에 SearchResultOptions 키를 넘기면 경고", () => {
            const warnings = captureWarnings(() => {
                createSearcher(["a"], { limit: 5 } as never);
            });
            expect(warnings.some((w) => w.includes("'limit'"))).toBe(true);
            expect(warnings.some((w) => w.includes("searcher.search"))).toBe(true);
        });

        it("searcher.search 에 SearcherOptions 키를 넘기면 경고", () => {
            const searcher = createSearcher(["abc"]);
            const warnings = captureWarnings(() => {
                searcher.search("a", { whitespace: "split" } as never);
            });
            expect(warnings.some((w) => w.includes("'whitespace'"))).toBe(true);
            expect(warnings.some((w) => w.includes("createSearcher"))).toBe(true);
        });

        it("올바른 위치에 옵션을 넘기면 경고 없음", () => {
            const warnings = captureWarnings(() => {
                const s = createSearcher(["abc"], { whitespace: "ignore", strict: false });
                s.search("a", { limit: 2, literal: false });
            });
            expect(warnings).toEqual([]);
        });
    });
});

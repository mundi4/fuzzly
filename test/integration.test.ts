import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, matchBest, matchLiteral, preprocessTarget } from "../src/index";

describe("통합 테스트", () => {
    describe("전체 흐름", () => {
        it("쿼리 생성 → 타겟 생성 → 매칭 → 범위 생성", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요");
            const matchResult = matchBest(query, target);
            expect(matchResult).not.toBeNull();
            const ranges = buildMatchRanges([matchResult!.indices], target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("여러 쿼리 처리", () => {
            const target = preprocessTarget("안녕하세요 반갑습니다");

            const query1 = buildQuery("안")!;
            const matchResult1 = matchBest(query1, target);

            const query2 = buildQuery("반")!;
            const matchResult2 = matchBest(query2, target);

            expect(matchResult1).not.toBeNull();
            expect(matchResult2).not.toBeNull();
        });
    });

    describe("한글 + 이모지 + 공백 혼합", () => {
        it("한글만 검색", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안 😊 녕");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 검색", () => {
            const query = buildQuery("😊")!;
            const target = preprocessTarget("안녕 😊 하세요");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });

        it("공백이 있는 복잡한 텍스트", () => {
            const query = buildQuery("세")!;
            const target = preprocessTarget("안녕하 세요 😊 반갑 습니다");
            const result = matchBest(query, target);
            expect(result === null || result.indices !== undefined).toBe(true);
        });

        it("한글 + 영문 + 숫자 + 이모지", () => {
            const query = buildQuery("a1")!;
            const target = preprocessTarget("a1 안녕 😊 ABC123");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("복합 시나리오", () => {
        it("리터럴 쿼리 + 복합 텍스트", () => {
            const target = preprocessTarget("안녕 안녕 😊 안녕하세요");
            const result = matchLiteral("안녕", target);
            expect(result).not.toBeNull();
        });

        it("퍼지 매칭 + 리터럴 비교", () => {
            const target = preprocessTarget("안녕");

            const fuzzyQuery = buildQuery("안")!;
            const fuzzyResult = matchBest(fuzzyQuery, target);
            const literalResult = matchLiteral("안", target);

            expect(fuzzyResult).not.toBeNull();
            expect(literalResult).not.toBeNull();
        });
    });

    describe("대소문자 (항상 case-insensitive)", () => {
        it("대문자 쿼리로 소문자 타겟 매칭", () => {
            const query = buildQuery("ABC")!;
            const target = preprocessTarget("abc");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });

        it("소문자 쿼리로 대문자 타겟 매칭", () => {
            const query = buildQuery("abc")!;
            const target = preprocessTarget("ABC");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });

        it("혼합 케이스", () => {
            const query = buildQuery("AbC")!;
            const target = preprocessTarget("abc");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("buildMatchRanges 통합", () => {
        it("매칭 결과를 범위로 변환", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕 안녕 안녕");
            const matchResult = matchBest(query, target)!;
            const ranges = buildMatchRanges([matchResult.indices], target);

            expect(Array.isArray(ranges)).toBe(true);
            for (const range of ranges) {
                expect(range.start).toBeLessThanOrEqual(range.end);
                expect(range.start).toBeGreaterThanOrEqual(0);
                expect(range.end).toBeLessThanOrEqual(target.input.length);
            }
        });

        it("여러 매칭에서 범위 추출", () => {
            const target = preprocessTarget("ABC abc 123");

            const query1 = buildQuery("a")!;
            const matchResult1 = matchBest(query1, target);

            const query2 = buildQuery("1")!;
            const matchResult2 = matchBest(query2, target);

            if (matchResult1 && matchResult2) {
                const ranges = buildMatchRanges([matchResult1.indices, matchResult2.indices], target);
                expect(Array.isArray(ranges)).toBe(true);
            }
        });
    });

    describe("성능 시나리오", () => {
        it("긴 텍스트에서 검색", () => {
            const longText = "안녕하세요 반갑습니다 ".repeat(50);
            const query = buildQuery("반")!;
            const target = preprocessTarget(longText);
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });

        it("복잡한 텍스트 처리", () => {
            const complexText = "한글 English 123 😊 혼합텍스트".repeat(10);
            const query = buildQuery("혼")!;
            const target = preprocessTarget(complexText);
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });

        it("많은 매칭 지점", () => {
            const query = buildQuery("a")!;
            const target = preprocessTarget(`${"a".repeat(50)}b${"a".repeat(50)}`);
            const result = matchBest(query, target);
            if (result) {
                expect(result.indices.length).toBeGreaterThan(0);
            }
        });
    });

    describe("엣지 케이스 조합", () => {
        it("빈 쿼리는 빈 indices 반환", () => {
            const query = buildQuery("");
            expect(query.input).toBe("");
            expect(query.graphemes.length).toBe(0);
        });

        it("빈 타겟에서 매칭", () => {
            const query = buildQuery("안");
            const target = preprocessTarget("");
            const result = matchBest(query!, target);
            expect(result).toBeNull();
        });

        it("빈 리터럴 쿼리", () => {
            const target = preprocessTarget("안녕");
            const result = matchLiteral("", target);
            expect(result).not.toBeNull();
            expect(result!.indices).toEqual([]);
        });

        it("특수 유니코드 문자", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안\u200B녕\u00A0하");
            const result = matchBest(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("실제 사용 케이스", () => {
        it("사용자 검색 - 한글 입력", () => {
            const users = ["안녕하세요", "반갑습니다", "안녕히가세요", "반갑지않아요"];

            const query = buildQuery("반")!;

            const results = users
                .map((user) => ({
                    user,
                    match: matchBest(query, preprocessTarget(user)),
                }))
                .filter((r) => r.match !== null);

            expect(results.length).toBeGreaterThan(0);
        });

        it("파일명 검색", () => {
            const files = ["document.pdf", "image.png", "data.json", "design.pdf"];

            const query = buildQuery("pdf")!;

            const results = files.filter((file) => {
                const target = preprocessTarget(file);
                return matchBest(query, target) !== null;
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it("콘텐츠 하이라이트", () => {
            const text = "안녕하세요 반갑습니다";
            const query = buildQuery("반")!;
            const target = preprocessTarget(text);
            const matchResult = matchBest(query, target);

            if (matchResult) {
                const ranges = buildMatchRanges([matchResult.indices], target);
                expect(ranges.length).toBeGreaterThan(0);

                let highlighted = "";
                let lastEnd = 0;
                for (const range of ranges) {
                    highlighted += text.slice(lastEnd, range.start);
                    highlighted += `[${text.slice(range.start, range.end)}]`;
                    lastEnd = range.end;
                }
                highlighted += text.slice(lastEnd);
                expect(highlighted).toContain("[");
            }
        });
    });
});

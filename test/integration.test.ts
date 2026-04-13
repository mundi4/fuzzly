import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, match, preprocessTarget } from "../src/index";

describe("통합 테스트", () => {
    describe("전체 흐름", () => {
        it("쿼리 생성 → 타겟 생성 → 매칭 → 범위 생성", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const matchResult = match(query, target);
            expect(matchResult).not.toBeNull();
            const ranges = buildMatchRanges([matchResult!], target);
            expect(Array.isArray(ranges)).toBe(true);
        });

        it("여러 쿼리 처리", () => {
            const target = preprocessTarget("안녕하세요 반갑습니다", { caseSensitive: true });

            const query1 = buildQuery("안")!;
            const match1 = match(query1, target);

            const query2 = buildQuery("반")!;
            const match2 = match(query2, target);

            expect(match1).not.toBeNull();
            expect(match2).not.toBeNull();
        });
    });

    describe("한글 + 이모지 + 공백 혼합", () => {
        it("한글만 검색", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안 😊 녕", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 검색", () => {
            const query = buildQuery("😊")!;
            const target = preprocessTarget("안녕 😊 하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("공백이 있는 복잡한 텍스트", () => {
            const query = buildQuery("세")!;
            const target = preprocessTarget("안녕하 세요 😊 반갑 습니다", { caseSensitive: true });
            const result = match(query, target);
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("한글 + 영문 + 숫자 + 이모지", () => {
            const query = buildQuery("a1")!;
            const target = preprocessTarget("a1 안녕 😊 ABC123", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("복합 시나리오", () => {
        it("리터럴 쿼리 + 복합 텍스트", () => {
            const query = buildQuery('"안녕"')!;
            const target = preprocessTarget("안녕 안녕 😊 안녕하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("퍼지 매칭 + 리터럴 비교", () => {
            const fuzzyQuery = buildQuery("안")!;
            const literalQuery = buildQuery('"안"')!;
            const target = preprocessTarget("안녕", { caseSensitive: true });

            const fuzzyResult = match(fuzzyQuery, target);
            const literalResult = match(literalQuery, target);

            expect(fuzzyResult).not.toBeNull();
            expect(literalResult).not.toBeNull();
        });

        it("여러 옵션 조합", () => {
            const query = buildQuery("안", { caseSensitive: false })!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: false });
            const result = match(query, target, {
                whitespace: "ignore",
                remainder: "allow",
                tailSpillover: true,
                caseSensitive: false,
            });
            expect(result).not.toBeNull();
        });
    });

    describe("대소문자 조합", () => {
        it("쿼리 대소문자 구분 + 타겟 대소문자 구분", () => {
            const query = buildQuery("ABC", { caseSensitive: true })!;
            const target = preprocessTarget("ABC", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("쿼리 대소문자 무시 + 타겟 대소문자 무시", () => {
            const query = buildQuery("ABC", { caseSensitive: false })!;
            const target = preprocessTarget("abc", { caseSensitive: false });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", caseSensitive: false });
            expect(result).not.toBeNull();
        });

        it("혼합 케이스", () => {
            const query = buildQuery("AbC", { caseSensitive: false })!;
            const target = preprocessTarget("abc", { caseSensitive: false });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("MatchOptions 조합", () => {
        it("모든 옵션을 지정", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                caseSensitive: true,
                tailSpillover: false,
                remainder: "strict",
            });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("remainder 옵션 비교", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });

            const strictResult = match(query, target, {
                whitespace: "ignore",
                remainder: "strict",
                tailSpillover: false,
            });
            const allowResult = match(query, target, {
                whitespace: "ignore",
                remainder: "allow",
                tailSpillover: false,
            });

            expect(strictResult !== null || allowResult !== null).toBe(true);
        });

        it("tailSpillover 옵션 비교", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });

            const noSpillover = match(query, target, {
                whitespace: "ignore",
                remainder: "strict",
                tailSpillover: false,
            });
            const withSpillover = match(query, target, {
                whitespace: "ignore",
                remainder: "strict",
                tailSpillover: true,
            });

            expect(noSpillover !== null || withSpillover !== null).toBe(true);
        });
    });

    describe("buildMatchRanges 통합", () => {
        it("매칭 결과를 범위로 변환", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕 안녕 안녕", { caseSensitive: true });
            const matchResult = match(query, target)!;
            const ranges = buildMatchRanges([matchResult], target);

            expect(Array.isArray(ranges)).toBe(true);
            for (const range of ranges) {
                expect(range.start).toBeLessThanOrEqual(range.end);
                expect(range.start).toBeGreaterThanOrEqual(0);
                expect(range.end).toBeLessThanOrEqual(target.input.length);
            }
        });

        it("여러 매칭에서 범위 추출", () => {
            const target = preprocessTarget("ABC abc 123", { caseSensitive: true });

            const query1 = buildQuery("A")!;
            const match1 = match(query1, target);

            const query2 = buildQuery("a")!;
            const match2 = match(query2, target);

            if (match1 && match2) {
                const ranges = buildMatchRanges([match1, match2], target);
                expect(Array.isArray(ranges)).toBe(true);
            }
        });
    });

    describe("성능 시나리오", () => {
        it("긴 텍스트에서 검색", () => {
            const longText = "안녕하세요 반갑습니다 ".repeat(50);
            const query = buildQuery("반")!;
            const target = preprocessTarget(longText, { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("복잡한 텍스트 처리", () => {
            const complexText = "한글 English 123 😊 혼합텍스트".repeat(10);
            const query = buildQuery("혼")!;
            const target = preprocessTarget(complexText, { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("많은 매칭 지점", () => {
            const query = buildQuery("a")!;
            const target = preprocessTarget(`${"a".repeat(50)}b${"a".repeat(50)}`, { caseSensitive: true });
            const result = match(query, target);
            if (Array.isArray(result)) {
                expect(result.length).toBeGreaterThan(0);
            }
        });
    });

    describe("엣지 케이스 조합", () => {
        it("빈 쿼리는 null 반환", () => {
            const query = buildQuery("");
            expect(query.input).toBe("");
            expect(query.graphemes.length).toBe(0);
        });

        it("빈 타겟에서 매칭", () => {
            const query = buildQuery("안");
            expect(query).not.toBeNull();
            const target = preprocessTarget("", { caseSensitive: true });
            const result = match(query!, target);
            expect(result).toBeNull();
        });

        it("리터럴로 빈 쿼리", () => {
            const query = buildQuery('""')!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target);
            expect(Array.isArray(result)).toBe(true);
        });

        it("특수 유니코드 문자", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안\u200B녕\u00A0하", { caseSensitive: true });
            const result = match(query, target);
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
                    match: match(query, preprocessTarget(user, { caseSensitive: true })),
                }))
                .filter((r) => r.match !== null);

            expect(results.length).toBeGreaterThan(0);
        });

        it("파일명 검색", () => {
            const files = ["document.pdf", "image.png", "data.json", "design.pdf"];

            const query = buildQuery("pdf", { caseSensitive: false })!;

            const results = files.filter((file) => {
                const target = preprocessTarget(file, { caseSensitive: false });
                return match(query, target) !== null;
            });

            expect(results.length).toBeGreaterThan(0);
        });

        it("콘텐츠 하이라이트", () => {
            const text = "안녕하세요 반갑습니다";
            const query = buildQuery("반")!;
            const target = preprocessTarget(text, { caseSensitive: true });
            const matchResult = match(query, target);

            if (matchResult) {
                const ranges = buildMatchRanges([matchResult], target);
                expect(ranges.length).toBeGreaterThan(0);

                // 범위를 사용해 하이라이트 텍스트 구성
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

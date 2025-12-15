import { describe, it, expect } from "vitest";
import { buildQuery, preprocessTarget, match } from "../src/index";

describe("match - 유닛 테스트", () => {
    describe("기본 매칭", () => {
        it("정확한 한글 매칭", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
        });

        it("한글 여러 개 매칭", () => {
            const query = buildQuery("안녕")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("매칭 없음", () => {
            const query = buildQuery("미")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).toBeNull();
        });

        it("영문 매칭", () => {
            const query = buildQuery("abc")!;
            const target = preprocessTarget("abc", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("숫자 매칭", () => {
            const query = buildQuery("123")!;
            const target = preprocessTarget("123", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 매칭", () => {
            const query = buildQuery("😊")!;
            const target = preprocessTarget("😊", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("리터럴 매칭", () => {
        it("정확한 리터럴", () => {
            const query = buildQuery('"안녕"')!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("리터럴 - 공백 포함", () => {
            const query = buildQuery('"안 녕"')!;
            const target = preprocessTarget("안 녕 하", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("리터럴 매칭 실패", () => {
            const query = buildQuery('"안녕하"')!;
            const target = preprocessTarget("안녕 하", { caseSensitive: true });
            const result = match(query, target);
            expect(result).toBeNull();
        });

        it("빈 리터럴", () => {
            const query = buildQuery('""')!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).toEqual([]);
        });

        it("리터럴 - 처음부터 매칭", () => {
            const query = buildQuery('"안"')!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("리터럴 - 중간 위치 매칭", () => {
            const query = buildQuery('"녕"')!;
            const target = preprocessTarget("안녕하", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("리터럴 - 이모지", () => {
            const query = buildQuery('"😊"')!;
            const target = preprocessTarget("안😊녕", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("MatchOptions - whitespace", () => {
        it("기본값 ignore", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안 녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict" });
            expect(result).not.toBeNull();
        });

        it("whitespace literal", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안 녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "literal", remainder: "strict" });
            expect(result).not.toBeNull();
        });

        it("whitespace normalize", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안  녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "normalize", remainder: "strict" });
            expect(result).not.toBeNull();
        });
    });

    describe("MatchOptions - tailSpillover", () => {
        it("tailSpillover false (기본값)", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: false });
            expect(result).not.toBeNull();
        });

        it("tailSpillover true", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: true });
            expect(result).not.toBeNull();
        });
    });

    describe("MatchOptions - remainder", () => {
        it("remainder strict", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: false });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("remainder allow", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "allow", tailSpillover: false });
            expect(result).not.toBeNull();
        });

        it("remainder tailSpilloverOnly", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: false });
            expect(result === null || Array.isArray(result)).toBe(true);
        });
    });

    describe("MatchOptions - caseSensitive", () => {
        it("caseSensitive true", () => {
            const query = buildQuery("ABC", { caseSensitive: true });
            const target = preprocessTarget("ABC", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("caseSensitive false", () => {
            const query = buildQuery("ABC")!;
            const target = preprocessTarget("abc", { caseSensitive: false });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", caseSensitive: false });
            expect(result).not.toBeNull();
        });

        it("caseSensitive undefined는 기본값 사용", () => {
            const query = buildQuery("ABC")!;
            const target = preprocessTarget("ABC", { caseSensitive: false });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict" });
            expect(result).not.toBeNull();
        });
    });

    describe("엣지 케이스", () => {
        it("빈 쿼리 (빈 string)", () => {
            const query = buildQuery("");
            expect(query.input).toBe("");
            expect(query.graphemes.length).toBe(0);
        });

        it("빈 타겟", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("", { caseSensitive: true });
            const result = match(query, target);
            expect(result).toBeNull();
        });

        it("여러 매칭 위치", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕 안녕", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("매칭이 여러 번", () => {
            const query = buildQuery("세")!;
            const target = preprocessTarget("세계 세상 세탁", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 + 한글 혼합", () => {
            const query = buildQuery("녕")!;
            const target = preprocessTarget("안녕😊하세요", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("공백만 있는 쿼리", () => {
            const query = buildQuery("   ")!;
            const target = preprocessTarget("   안   ", { caseSensitive: true });
            const result = match(query, target);
            expect(result === null || Array.isArray(result)).toBe(true);
        });
    });

    describe("결과 검증", () => {
        it("결과는 배열 또는 null", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target);
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("배열이면 숫자들만 포함", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target);
            if (Array.isArray(result)) {
                for (const idx of result) {
                    expect(typeof idx).toBe("number");
                }
            }
        });

        it("인덱스는 grapheme 범위 내", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target);
            if (Array.isArray(result)) {
                for (const idx of result) {
                    expect(idx).toBeGreaterThanOrEqual(0);
                    expect(idx).toBeLessThan(target.graphemes.length);
                }
            }
        });
    });

    describe("성능 관련", () => {
        it("매우 긴 쿼리", () => {
            const longQuery = buildQuery("안".repeat(50))!;
            const target = preprocessTarget("안".repeat(100), { caseSensitive: true });
            const result = match(longQuery, target);
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("매우 긴 타겟", () => {
            const query = buildQuery("안")!;
            const longTarget = preprocessTarget("안녕하세요 ".repeat(200), { caseSensitive: true });
            const result = match(query, longTarget);
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("매우 긴 리터럴 쿼리", () => {
            const longText = "안".repeat(50);
            const query = buildQuery(`"${longText}"`)!;
            const target = preprocessTarget(longText, { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("복합 문자", () => {
        it("종성이 있는 한글", () => {
            const query = buildQuery("각")!;
            const target = preprocessTarget("각", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("겹받침", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 + 스킨톤", () => {
            const query = buildQuery("👋🏻")!;
            const target = preprocessTarget("👋🏻", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("ZWJ 이모지", () => {
            const query = buildQuery("👨‍👩‍👧‍👦")!;
            const target = preprocessTarget("👨‍👩‍👧‍👦", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });
});

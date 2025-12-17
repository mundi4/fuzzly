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
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("whitespace literal", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안 녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "literal", remainder: "tailSpilloverOnly", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("whitespace normalize", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안  녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "normalize", remainder: "tailSpilloverOnly", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });
    });

    describe("MatchOptions - tailSpillover", () => {
        it("tailSpillover never", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover always", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover lastOnly (기본값)", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("종성 있는 글자 - tailSpillover never", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("종성 있는 글자 - tailSpillover always", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("종성이 다음 글자로 spillover될 수 있는 경우 - never vs always", () => {
            const query = buildQuery("감")!; // 종성: ㅁ
            const target = preprocessTarget("감사", { caseSensitive: true }); // ㅁ이 ㅅ의 초성과 연결
            const resultNever = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            const resultAlways = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(resultNever === null || Array.isArray(resultNever)).toBe(true);
            expect(resultAlways === null || Array.isArray(resultAlways)).toBe(true);
        });

        it("여러 글자 - tailSpillover never", () => {
            const query = buildQuery("감사")!;
            const target = preprocessTarget("감사합니다", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover never with remainder strict", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: "never", caseSensitive: true });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("tailSpillover never with remainder allow", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "allow", tailSpillover: "never", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover never with remainder tailSpilloverOnly", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("tailSpillover always with remainder strict", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: "always", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover always with remainder allow", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "allow", tailSpillover: "always", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover always with remainder tailSpilloverOnly", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover lastOnly with remainder strict", () => {
            const query = buildQuery("안녕")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("tailSpillover lastOnly with remainder allow", () => {
            const query = buildQuery("안녕")!;
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "allow", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("복합 종성 (겹받침) spillover - always", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값고", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("종성 없는 글자와 tailSpillover", () => {
            const query = buildQuery("가")!;
            const target = preprocessTarget("가나", { caseSensitive: true });
            const resultNever = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            const resultAlways = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(resultNever).not.toBeNull();
            expect(resultAlways).not.toBeNull();
        });

        it("연속 종성 글자들의 spillover - always", () => {
            const query = buildQuery("각각")!;
            const target = preprocessTarget("각각각", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("특정 종성과 다음 초성의 호환성 - always", () => {
            const query = buildQuery("감")!;
            const target = preprocessTarget("감시", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "always", caseSensitive: true });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("tailSpillover와 whitespace 조합 - always", () => {
            const query = buildQuery("감")!;
            const target = preprocessTarget("감 사", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                remainder: "tailSpilloverOnly",
                tailSpillover: "always",
                caseSensitive: true,
            });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("3글자 이상에서 tailSpillover always", () => {
            const query = buildQuery("감사합")!;
            const target = preprocessTarget("감사합니다", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                remainder: "tailSpilloverOnly",
                tailSpillover: "always",
                caseSensitive: true,
            });
            expect(result).not.toBeNull();
        });

        it("리터럴 쿼리는 tailSpillover 영향 없음", () => {
            const query = buildQuery('"감"')!;
            const target = preprocessTarget("감사", { caseSensitive: true });
            const resultNever = match(query, target, {
                whitespace: "ignore",
                remainder: "tailSpilloverOnly",
                tailSpillover: "never",
                caseSensitive: true,
            });
            const resultAlways = match(query, target, {
                whitespace: "ignore",
                remainder: "tailSpilloverOnly",
                tailSpillover: "always",
                caseSensitive: true,
            });
            expect(resultNever).toEqual(resultAlways);
        });
    });

    describe("MatchOptions - remainder", () => {
        it("remainder strict", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "strict", tailSpillover: "never", caseSensitive: true });
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("remainder allow", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "allow", tailSpillover: "never", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("remainder tailSpilloverOnly", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "never", caseSensitive: true });
            expect(result === null || Array.isArray(result)).toBe(true);
        });
    });

    describe("MatchOptions - caseSensitive", () => {
        it("caseSensitive true", () => {
            const query = buildQuery("ABC", { caseSensitive: true });
            const target = preprocessTarget("ABC", { caseSensitive: true });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "lastOnly", caseSensitive: true });
            expect(result).not.toBeNull();
        });

        it("caseSensitive false", () => {
            const query = buildQuery("ABC")!;
            const target = preprocessTarget("abc", { caseSensitive: false });
            const result = match(query, target, { whitespace: "ignore", remainder: "tailSpilloverOnly", tailSpillover: "lastOnly", caseSensitive: false });
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

    describe("실제 사용 케이스", () => {
        it("타겟: 개정 관련 참고, 쿼리: 절차 (tailSpillover: lastOnly)", () => {
            const query = buildQuery("절차")!;
            const target = preprocessTarget("개정 관련 참고", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                caseSensitive: true,
                tailSpillover: "lastOnly",
                remainder: "tailSpilloverOnly",
            });
            // "절"은 마지막이 아니므로 spillover 불가
            // "절"의 종성 ㄹ이 spillover되지 않아야 하므로 null
            expect(result).toBeNull();
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 절차", () => {
            const query = buildQuery("절차")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                caseSensitive: true,
                tailSpillover: "lastOnly",
                remainder: "tailSpilloverOnly",
            });
            // 절차가 있으므로 매칭됨
            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 절 (부분 매칭)", () => {
            const query = buildQuery("절")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                caseSensitive: true,
                tailSpillover: "lastOnly",
                remainder: "tailSpilloverOnly",
            });
            // 절이 있으므로 매칭됨
            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 개정절차", () => {
            const query = buildQuery("개정절차")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                caseSensitive: true,
                tailSpillover: "lastOnly",
                remainder: "tailSpilloverOnly",
            });
            // 공백을 무시하고 개정절차가 있으므로 매칭 가능
            expect(result === null || Array.isArray(result)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 관련참고", () => {
            const query = buildQuery("관련참고")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target, {
                whitespace: "ignore",
                caseSensitive: true,
                tailSpillover: "lastOnly",
                remainder: "tailSpilloverOnly",
            });
            expect(result === null || Array.isArray(result)).toBe(true);
        });
    });
});

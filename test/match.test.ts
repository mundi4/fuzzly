import { describe, expect, it } from "vitest";
import { buildQuery, match, matchLiteral, preprocessTarget } from "../src/index";
import { journeyFrom } from "./ime";

describe("match - 유닛 테스트", () => {
    describe("기본 매칭", () => {
        it("정확한 한글 매칭", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안");
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result!.indices)).toBe(true);
        });

        it("매칭 없음", () => {
            const query = buildQuery("미")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target);
            expect(result).toBeNull();
        });

        it("영문 매칭", () => {
            const query = buildQuery("abc")!;
            const target = preprocessTarget("abc");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("숫자 매칭", () => {
            const query = buildQuery("123")!;
            const target = preprocessTarget("123");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 매칭", () => {
            const query = buildQuery("😊")!;
            const target = preprocessTarget("😊");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("matchLiteral", () => {
        it("정확한 리터럴", () => {
            const target = preprocessTarget("안녕하세요");
            const result = matchLiteral("안녕", target);
            expect(result).not.toBeNull();
        });

        it("리터럴 - 공백 포함", () => {
            const target = preprocessTarget("안 녕 하");
            const result = matchLiteral("안 녕", target);
            expect(result).not.toBeNull();
        });

        it("리터럴 매칭 실패", () => {
            const target = preprocessTarget("안녕 하");
            const result = matchLiteral("안녕하", target);
            expect(result).toBeNull();
        });

        it("빈 리터럴", () => {
            const target = preprocessTarget("안녕하세요");
            const result = matchLiteral("", target);
            expect(result).not.toBeNull();
            expect(result!.indices).toEqual([]);
        });

        it("리터럴 - 처음부터 매칭", () => {
            const target = preprocessTarget("안녕");
            const result = matchLiteral("안", target);
            expect(result).not.toBeNull();
        });

        it("리터럴 - 중간 위치 매칭", () => {
            const target = preprocessTarget("안녕하");
            const result = matchLiteral("녕", target);
            expect(result).not.toBeNull();
        });

        it("리터럴 - 이모지", () => {
            const target = preprocessTarget("안😊녕");
            const result = matchLiteral("😊", target);
            expect(result).not.toBeNull();
        });
    });

    describe("종성 / 겹받침 / 음절 경계", () => {
        it("종성 있는 글자는 혼자서도 매치", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕");
            expect(match(query, target)).not.toBeNull();
        });

        it("겹받침 글자 exact match", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값");
            expect(match(query, target)).not.toBeNull();
        });

        it("종성이 다음 글자 초성으로 넘어가는 케이스 (감 → 감사)", () => {
            const query = buildQuery("감")!;
            const target = preprocessTarget("감사");
            expect(match(query, target)).not.toBeNull();
        });

        it("겹받침 → 이후 음절로 자연스럽게 소비 (값 → 값고)", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값고");
            expect(match(query, target)).not.toBeNull();
        });

        it("종성 없는 글자도 그대로 매치 (가 → 가나)", () => {
            const query = buildQuery("가")!;
            const target = preprocessTarget("가나");
            expect(match(query, target)).not.toBeNull();
        });

        it("연속 종성 글자 (각각 → 각각각)", () => {
            const query = buildQuery("각각")!;
            const target = preprocessTarget("각각각");
            expect(match(query, target)).not.toBeNull();
        });

        it("3글자 이상 (감사합 → 감사합니다)", () => {
            const query = buildQuery("감사합")!;
            const target = preprocessTarget("감사합니다");
            expect(match(query, target)).not.toBeNull();
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
            const target = preprocessTarget("");
            const result = match(query, target);
            expect(result).toBeNull();
        });

        it("여러 매칭 위치", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕 안녕");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("이모지 + 한글 혼합", () => {
            const query = buildQuery("녕")!;
            const target = preprocessTarget("안녕😊하세요");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("공백만 있는 쿼리", () => {
            const query = buildQuery("   ")!;
            const target = preprocessTarget("   안   ");
            const result = match(query, target);
            expect(result === null || result.indices !== undefined).toBe(true);
        });
    });

    describe("결과 검증", () => {
        it("인덱스는 grapheme 범위 내", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target);
            if (result) {
                for (const idx of result.indices) {
                    expect(idx).toBeGreaterThanOrEqual(0);
                    expect(idx).toBeLessThan(target.graphemeCount);
                }
            }
        });
    });

    describe("성능 관련", () => {
        it("매우 긴 쿼리", () => {
            const longQuery = buildQuery("안".repeat(50))!;
            const target = preprocessTarget("안".repeat(100));
            const result = match(longQuery, target);
            expect(result === null || result.indices !== undefined).toBe(true);
        });

        it("매우 긴 타겟", () => {
            const query = buildQuery("안")!;
            const longTarget = preprocessTarget("안녕하세요 ".repeat(200));
            const result = match(query, longTarget);
            expect(result === null || result.indices !== undefined).toBe(true);
        });

        it("매우 긴 리터럴 쿼리", () => {
            const longText = "안".repeat(50);
            const target = preprocessTarget(longText);
            const result = matchLiteral(longText, target);
            expect(result).not.toBeNull();
        });
    });

    describe("복합 문자", () => {
        it("이모지 + 스킨톤", () => {
            const query = buildQuery("👋🏻")!;
            const target = preprocessTarget("👋🏻");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });

        it("ZWJ 이모지", () => {
            const query = buildQuery("👨‍👩‍👧‍👦")!;
            const target = preprocessTarget("👨‍👩‍👧‍👦");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("실제 사용 케이스", () => {
        it("타겟: 개정 절차 관련 참고, 쿼리: 절차", () => {
            const query = buildQuery("절차")!;
            const target = preprocessTarget("개정 절차 관련 참고");
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result!.indices)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 절 (부분 매칭)", () => {
            const query = buildQuery("절")!;
            const target = preprocessTarget("개정 절차 관련 참고");
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result!.indices)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 관련참고", () => {
            const query = buildQuery("관련참고")!;
            const target = preprocessTarget("개정 절차 관련 참고");
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    describe("monotonic narrowing — 타이핑 journey 전체 검증", () => {
        function assertJourneyMatches(targetStr: string, finalQueries: string[]) {
            const target = preprocessTarget(targetStr);
            for (const finalQuery of finalQueries) {
                const journey = journeyFrom(finalQuery);
                for (const state of journey) {
                    const q = buildQuery(state)!;
                    const result = match(q, target);
                    expect(
                        result,
                        `target "${targetStr}" / final "${finalQuery}" / mid-state "${state}"`,
                    ).not.toBeNull();
                }
            }
        }

        it("감사합니다 — 기본 journey", () => {
            assertJourneyMatches("감사합니다", ["감사합니다"]);
        });

        it("전략기획부 — 초성 약식/겹받침 compound jamo/혼합", () => {
            assertJourneyMatches("전략기획부", [
                "ㅈㄺㅎㅂ",
                "ㅈㄼ",
                "ㄺㅂ",
                "ㄺㅎㅂ",
                "ㅈㄺㅎ",
                "ㄺㅎ",
                "전략ㄱㅎㅂ",
                "저략",
                "ㅈ랴깋ㅂ",
            ]);
        });

        it("전략기획부 — 실패해야 하는 쿼리", () => {
            const target = preprocessTarget("전략기획부");
            expect(match(buildQuery("쟈기획부")!, target)).toBeNull();
            expect(match(buildQuery("ㄴㄺㅎ")!, target)).toBeNull();
        });

        it("자산관리전략협의회 — 앞 4글자 완전 합성 + 초성 약식 (issue #6)", () => {
            assertJourneyMatches("자산관리전략협의회", ["자산관리ㅈㄹㅎㅇㅎ"]);
            assertJourneyMatches("자산관리전략협의회", ["자산관리전략협의회"]);
        });
    });

    describe("MatchResult 메타데이터", () => {
        it("startsAtZero - 첫 위치에서 매칭", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target)!;
            expect(result.startsAtZero).toBe(true);
        });

        it("startsAtZero - 중간에서 매칭", () => {
            const query = buildQuery("녕")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target)!;
            expect(result.startsAtZero).toBe(false);
        });

        it("runCount - 연속 매칭 (1 run)", () => {
            const query = buildQuery("안녕")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target)!;
            expect(result.runCount).toBe(1);
        });

        it("runCount - 떨어진 매칭 (2 runs)", () => {
            const query = buildQuery("안하")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target)!;
            expect(result.runCount).toBe(2);
        });

        it("boundaryHits - 구분자 직후 매칭", () => {
            const query = buildQuery("hw")!;
            const target = preprocessTarget("hello_world");
            const result = match(query, target)!;
            expect(result.boundaryHits).toBe(2);
        });

        it("boundaryHits - 구분자 없는 매칭", () => {
            const query = buildQuery("ll")!;
            const target = preprocessTarget("hello");
            const result = match(query, target)!;
            expect(result.boundaryHits).toBe(0);
        });

        it("initialConsonantOnly - 초성만 쿼리", () => {
            const query = buildQuery("ㅇㄴ")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target)!;
            expect(result.initialConsonantOnly).toBe(true);
        });

        it("initialConsonantOnly - 완성글자 쿼리", () => {
            const query = buildQuery("안녕")!;
            const target = preprocessTarget("안녕하세요");
            const result = match(query, target)!;
            expect(result.initialConsonantOnly).toBe(false);
        });

        it("빈 쿼리 메타데이터", () => {
            const query = buildQuery("")!;
            const target = preprocessTarget("안녕");
            const result = match(query, target)!;
            expect(result.indices).toEqual([]);
            expect(result.startsAtZero).toBe(false);
            expect(result.runCount).toBe(0);
            expect(result.boundaryHits).toBe(0);
            expect(result.initialConsonantOnly).toBe(false);
        });
    });
});

import { describe, expect, it } from "vitest";
import { buildQuery, match, preprocessTarget } from "../src/index";
import { journeyFrom } from "./ime";

describe("match - 유닛 테스트", () => {
    describe("기본 매칭", () => {
        it("정확한 한글 매칭", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
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

    describe("종성 / 겹받침 / 음절 경계", () => {
        it("종성 있는 글자는 혼자서도 매치", () => {
            const query = buildQuery("안")!;
            const target = preprocessTarget("안녕", { caseSensitive: true });
            expect(match(query, target)).not.toBeNull();
        });

        it("겹받침 글자 exact match", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값", { caseSensitive: true });
            expect(match(query, target)).not.toBeNull();
        });

        it("종성이 다음 글자 초성으로 넘어가는 케이스 (감 → 감사)", () => {
            const query = buildQuery("감")!;
            const target = preprocessTarget("감사", { caseSensitive: true });
            // 감이 온전히 감사의 첫 음절에 매치
            expect(match(query, target)).not.toBeNull();
        });

        it("겹받침 → 이후 음절로 자연스럽게 소비 (값 → 값고)", () => {
            const query = buildQuery("값")!;
            const target = preprocessTarget("값고", { caseSensitive: true });
            expect(match(query, target)).not.toBeNull();
        });

        it("종성 없는 글자도 그대로 매치 (가 → 가나)", () => {
            const query = buildQuery("가")!;
            const target = preprocessTarget("가나", { caseSensitive: true });
            expect(match(query, target)).not.toBeNull();
        });

        it("연속 종성 글자 (각각 → 각각각)", () => {
            const query = buildQuery("각각")!;
            const target = preprocessTarget("각각각", { caseSensitive: true });
            expect(match(query, target)).not.toBeNull();
        });

        it("3글자 이상 (감사합 → 감사합니다)", () => {
            const query = buildQuery("감사합")!;
            const target = preprocessTarget("감사합니다", { caseSensitive: true });
            expect(match(query, target)).not.toBeNull();
        });
    });

    describe("MatchOptions - caseSensitive", () => {
        it("caseSensitive true", () => {
            const query = buildQuery("ABC", { caseSensitive: true });
            const target = preprocessTarget("ABC", { caseSensitive: true });
            expect(match(query, target, { caseSensitive: true })).not.toBeNull();
        });

        it("caseSensitive false", () => {
            const query = buildQuery("ABC")!;
            const target = preprocessTarget("abc", { caseSensitive: false });
            expect(match(query, target, { caseSensitive: false })).not.toBeNull();
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
        it("타겟: 개정 절차 관련 참고, 쿼리: 절차", () => {
            const query = buildQuery("절차")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 절 (부분 매칭)", () => {
            const query = buildQuery("절")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
        });

        it("타겟: 개정 절차 관련 참고, 쿼리: 관련참고", () => {
            const query = buildQuery("관련참고")!;
            const target = preprocessTarget("개정 절차 관련 참고", { caseSensitive: true });
            const result = match(query, target);
            expect(result).not.toBeNull();
        });
    });

    // "매치 테스트는 최종 쿼리만 볼 게 아니라 그 쿼리를 치는 과정의 모든 상태에서
    // match 성공해야 한다" — monotonic narrowing 원칙의 직접 검증.
    //
    // 각 케이스는 최종 쿼리 문자열을 주면 IME 시뮬레이터(test/ime.ts)가 그 문자열을
    // 만들어내기까지의 모든 중간 타이핑 상태를 풀어주고, 전부 같은 타겟에 매치되는지
    // 확인한다.
    describe("monotonic narrowing — 타이핑 journey 전체 검증", () => {
        function assertJourneyMatches(targetStr: string, finalQueries: string[]) {
            const target = preprocessTarget(targetStr, { caseSensitive: true });
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
                "ㅈㄺㅎㅂ", // 전 + 략기(ㄺ) + 획 + 부
                "ㅈㄼ", // 전 + 략(ㄹ) + skip + 부(ㅂ)
                "ㄺㅂ", // skip + 략기(ㄺ) + skip + 부
                "ㄺㅎㅂ", // skip + 략기(ㄺ) + 획 + 부
                "ㅈㄺㅎ", // 전 + 략기(ㄺ) + 획
                "ㄺㅎ", // skip + 략기(ㄺ) + 획
                "전략ㄱㅎㅂ", // 전략 완전 합성 + 기획부 초성 약식
                "저략", // 저(ㅈㅓ)로 전의 앞 두 atom 소비 + 략 완전
                "ㅈ랴깋ㅂ", // 전(ㅈ) + 략(랴) + 기획(깋; ㅎ이 획 초성으로 넘김) + 부
            ]);
        });

        it("전략기획부 — 실패해야 하는 쿼리", () => {
            const target = preprocessTarget("전략기획부", { caseSensitive: true });

            // 쟈(ㅈㅑ)는 전(ㅈㅓ)의 prefix가 아니다. 초성만 맞지 vowel이 달라서
            // anchor가 성립하지 않는다. 이후 음절에도 ㅈ-초성이 없으므로 전체 실패.
            expect(match(buildQuery("쟈기획부")!, target)).toBeNull();

            // ㄴ은 standalone 초성으로 해석. 타겟에 ㄴ-초성 음절 없음 (전의 종성 ㄴ은
            // LEAD 자리가 아님).
            expect(match(buildQuery("ㄴㄺㅎ")!, target)).toBeNull();
        });

        // issue #6 — 사용자는 앞 4글자를 완전 합성한 뒤 나머지는 초성만 약식으로
        // 입력했다. "맂"은 리 + ㅈ(다음 초성)이 IME에서 ㅈ을 종성으로 붙여 만들어진
        // 상태이며, 그 뒤에 추가로 찍히는 ㄹ/ㅎ/ㅇ/ㅎ는 더 이상 합성되지 않는다.
        // 이 journey의 모든 중간 상태가 자산관리전략협의회에 매치돼야 한다.
        // https://github.com/mundi4/fuzzly/issues/6
        it("자산관리전략협의회 — 앞 4글자 완전 합성 + 초성 약식 (issue #6)", () => {
            // 앞 4글자 풀 합성 + 나머지 5글자 초성만. IME가 ㅈ을 리의 종성으로 흡수해
            // 맂을 만들고, 그 뒤 ㄹㅎ은 compound 겹자음 ㅀ로 합쳐진다 (test/ime.ts
            // 시뮬레이터 기준).
            assertJourneyMatches("자산관리전략협의회", ["자산관리ㅈㄹㅎㅇㅎ"]);

            // 전체 타겟을 완전히 합성하는 경우도 당연히 모든 상태가 매치돼야 한다.
            assertJourneyMatches("자산관리전략협의회", ["자산관리전략협의회"]);
        });
    });
});

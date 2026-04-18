import { describe, expect, it } from "vitest";
import type { ScoringConfig } from "../src/index";
import { buildQuery, createGraphemeBonuses, createSearcher, matchBest, preprocessTarget, SCORING } from "../src/index";

describe("ScoringConfig - weights override", () => {
    it("기본값과 동일한 결과 (scoring 없이)", () => {
        const query = buildQuery("안녕");
        const target = preprocessTarget("안녕하세요");
        const r1 = matchBest(query, target);
        const r2 = matchBest(query, target, {});
        expect(r1!.score).toBe(r2!.score);
        expect(r1!.indices).toEqual(r2!.indices);
    });

    it("positionZero 오버라이드", () => {
        const query = buildQuery("안");
        const target = preprocessTarget("안녕하세요");
        const rDefault = matchBest(query, target)!;
        const rBoosted = matchBest(query, target, { weights: { positionZero: 500 } })!;
        expect(rBoosted.score!).toBeGreaterThan(rDefault.score!);
        expect(rBoosted.score! - rDefault.score!).toBe(500 - SCORING.POSITION_ZERO);
    });

    it("gapPenalty 오버라이드로 정렬 변경", () => {
        const query = buildQuery("ac");
        // "a_b_c"에서 a(0), c(4): gap이 크다
        // "axc"에서 a(0), c(2): gap이 작다
        const t1 = preprocessTarget("a_b_c");
        const t2 = preprocessTarget("axc");

        // 극단적 gap penalty로 gap이 큰 타겟을 더 많이 불이익
        const scoring: ScoringConfig = { weights: { gapPenalty: -100 } };
        const r1 = matchBest(query, t1, scoring)!;
        const r2 = matchBest(query, t2, scoring)!;
        expect(r2.score!).toBeGreaterThan(r1.score!);
    });

    it("모든 weights 동시 오버라이드", () => {
        const query = buildQuery("안녕");
        const target = preprocessTarget("안녕");
        const scoring: ScoringConfig = {
            weights: {
                positionZero: 0,
                boundary: 0,
                consecutive: 0,
                gapPenalty: 0,
                prefixBonus: 0,
                exactBonus: 0,
                targetLengthPenalty: 0,
                lengthPenaltyCap: 16,
                choseongWeaken: 0.5,
            },
        };
        const result = matchBest(query, target, scoring)!;
        // 모든 스코어 관련 가중치가 0이면 스코어도 0
        expect(result.score).toBe(0);
    });
});

describe("ScoringConfig - 신규 가중치 clamp", () => {
    it("lengthPenaltyCap 음수 입력은 0으로 clamp (페널티 비활성)", () => {
        const query = buildQuery("a");
        const t = preprocessTarget("abcdefghij"); // L=10
        const rBaseline = matchBest(query, t, { weights: { lengthPenaltyCap: 0 } })!;
        const rNegative = matchBest(query, t, { weights: { lengthPenaltyCap: -5 } })!;
        // 음수 → 0으로 clamp. cap=0 과 동일 결과.
        expect(rNegative.score).toBe(rBaseline.score);
    });

    it("lengthPenaltyCap 소수 입력은 floor 처리", () => {
        const query = buildQuery("a");
        const t = preprocessTarget("abcdefghij"); // L=10
        const rInt = matchBest(query, t, { weights: { lengthPenaltyCap: 5 } })!;
        const rFloat = matchBest(query, t, { weights: { lengthPenaltyCap: 5.9 } })!;
        // 5.9 → 5 로 floor. cap=5 와 동일.
        expect(rFloat.score).toBe(rInt.score);
    });

    it("lengthPenaltyCap NaN/Infinity는 기본값 fallback", () => {
        const query = buildQuery("a");
        const t = preprocessTarget("abcdefghij");
        const rDefault = matchBest(query, t)!;
        const rNaN = matchBest(query, t, { weights: { lengthPenaltyCap: Number.NaN } })!;
        const rInf = matchBest(query, t, { weights: { lengthPenaltyCap: Number.POSITIVE_INFINITY } })!;
        expect(rNaN.score).toBe(rDefault.score);
        expect(rInf.score).toBe(rDefault.score);
    });

    it("choseongWeaken 0 이하는 기본값 fallback", () => {
        const q = buildQuery("ㅈ");
        const t = preprocessTarget("정의");
        const rDefault = matchBest(q, t)!;
        const rZero = matchBest(q, t, { weights: { choseongWeaken: 0 } })!;
        const rNeg = matchBest(q, t, { weights: { choseongWeaken: -0.5 } })!;
        // 0, 음수 모두 기본값(0.5)으로 fallback
        expect(rZero.score).toBe(rDefault.score);
        expect(rNeg.score).toBe(rDefault.score);
    });

    it("choseongWeaken 1 초과는 1 로 clamp", () => {
        const q = buildQuery("ㅈ");
        const t = preprocessTarget("정의");
        const rOne = matchBest(q, t, { weights: { choseongWeaken: 1 } })!;
        const rBig = matchBest(q, t, { weights: { choseongWeaken: 10 } })!;
        expect(rBig.score).toBe(rOne.score);
    });

    it("choseongWeaken NaN/Infinity는 기본값 fallback", () => {
        const q = buildQuery("ㅈ");
        const t = preprocessTarget("정의");
        const rDefault = matchBest(q, t)!;
        const rNaN = matchBest(q, t, { weights: { choseongWeaken: Number.NaN } })!;
        const rInf = matchBest(q, t, { weights: { choseongWeaken: Number.POSITIVE_INFINITY } })!;
        expect(rNaN.score).toBe(rDefault.score);
        expect(rInf.score).toBe(rDefault.score);
    });
});

describe("ScoringConfig - graphemeBonus (배열)", () => {
    it("특정 위치에 bonus 부여", () => {
        const query = buildQuery("하");
        const target = preprocessTarget("안녕하세요");
        // "하"는 grapheme index 2에 위치
        const bonuses = [0, 0, 200, 0, 0];
        const rDefault = matchBest(query, target)!;
        const rBoosted = matchBest(query, target, { graphemeBonus: bonuses })!;
        expect(rBoosted.score!).toBe(rDefault.score! + 200);
    });

    it("bonus 배열이 짧으면 부족한 인덱스는 0 취급", () => {
        const query = buildQuery("요");
        const target = preprocessTarget("안녕하세요");
        // "요"는 grapheme index 4 — bonus 배열 길이가 2이므로 0 취급
        const rDefault = matchBest(query, target)!;
        const rShort = matchBest(query, target, { graphemeBonus: [100, 100] })!;
        expect(rShort.score).toBe(rDefault.score);
    });

    it("graphemeBonus로 DP 정렬 경로 변경", () => {
        // "ㅎ"을 "기획 홍보 협력"에서 검색.
        // grapheme 분해: 기(0) 획(1) (2=공백) 홍(3) 보(4) (5=공백) 협(6) 력(7)
        // 기본: 기획의 '획'(index 1, lead=ㅎ)은 위치 0에 가까움
        //       홍(3)은 경계, 협(6)도 경계
        // graphemeBonus로 index 6(협)에 큰 보너스를 주면 DP가 협을 선택하도록 유도
        const query = buildQuery("ㅎ");
        const target = preprocessTarget("기획 홍보 협력");

        const rDefault = matchBest(query, target)!;
        // 기본 DP는 획(1) 또는 홍(3)을 선택할 가능성이 높음
        expect(rDefault.indices).not.toContain(6);

        // index 6에 큰 bonus
        const bonuses = [0, 0, 0, 0, 0, 0, 500, 0];
        const rBoosted = matchBest(query, target, { graphemeBonus: bonuses })!;

        // bonus가 충분히 크면 index 6(협)을 선택해야 함
        expect(rBoosted.indices).toContain(6);
    });
});

describe("ScoringConfig - graphemeBonus (함수)", () => {
    it("함수 형태로 per-grapheme bonus", () => {
        const query = buildQuery("하");
        const target = preprocessTarget("안녕하세요");
        const rDefault = matchBest(query, target)!;
        const rBoosted = matchBest(query, target, {
            graphemeBonus: (gi, _t) => (gi === 2 ? 150 : 0),
        })!;
        expect(rBoosted.score!).toBe(rDefault.score! + 150);
    });

    it("함수가 target을 받아 활용 가능", () => {
        const query = buildQuery("a");
        const target = preprocessTarget("abc");
        const rBoosted = matchBest(query, target, {
            graphemeBonus: (gi, t) => {
                // target의 normalizedInput 길이에 비례하는 bonus
                return gi === 0 ? t.normalizedInput.length * 10 : 0;
            },
        })!;
        expect(rBoosted).not.toBeNull();
        // "abc" 길이 3, bonus = 30
        const rDefault = matchBest(query, target)!;
        expect(rBoosted.score!).toBe(rDefault.score! + 30);
    });
});

describe("createGraphemeBonuses", () => {
    it("문자 범위를 grapheme bonus 배열로 변환", () => {
        const target = preprocessTarget("안녕하세요");
        // 각 한글은 1 grapheme = charIndexes: 안(0), 녕(1), 하(2), 세(3), 요(4)
        // char range [2, 4) → grapheme 2,3 ("하세")
        const bonuses = createGraphemeBonuses(target, [{ start: 2, end: 4, bonus: 50 }]);
        expect(bonuses.length).toBe(5);
        expect(bonuses[0]).toBe(0);
        expect(bonuses[1]).toBe(0);
        expect(bonuses[2]).toBe(50);
        expect(bonuses[3]).toBe(50);
        expect(bonuses[4]).toBe(0);
    });

    it("여러 범위의 bonus 누적", () => {
        const target = preprocessTarget("abcde");
        const bonuses = createGraphemeBonuses(target, [
            { start: 0, end: 3, bonus: 10 }, // a,b,c
            { start: 2, end: 5, bonus: 20 }, // c,d,e
        ]);
        expect(bonuses[0]).toBe(10); // a: 10
        expect(bonuses[1]).toBe(10); // b: 10
        expect(bonuses[2]).toBe(30); // c: 10+20
        expect(bonuses[3]).toBe(20); // d: 20
        expect(bonuses[4]).toBe(20); // e: 20
    });

    it("빈 범위 무시", () => {
        const target = preprocessTarget("abc");
        const bonuses = createGraphemeBonuses(target, [{ start: 2, end: 2, bonus: 100 }]);
        expect(bonuses).toEqual([0, 0, 0]);
    });

    it("matchBest와 연동", () => {
        const query = buildQuery("설");
        const target = preprocessTarget("프로젝트 설정 파일");
        // "설"에 해당하는 문자 범위에 가중치
        const bonuses = createGraphemeBonuses(target, [{ start: 5, end: 7, bonus: 100 }]);
        const rDefault = matchBest(query, target)!;
        const rBoosted = matchBest(query, target, { graphemeBonus: bonuses })!;
        expect(rBoosted.score!).toBeGreaterThan(rDefault.score!);
    });
});

describe("ScoringConfig - tailSpillPenalty", () => {
    // spill 예시는 '읽'=[ㅇㅣㄹㄱ] 기반: anchor '일' 잉여 [ㄹ]이 쿼리 tail prefix [ㄹ]와 일치해
    // anchor가 승인되고, 남은 ㄱ이 다음 grapheme 초성으로 spill된다.
    it("완전 그래핌 매치를 spill 매치보다 선호 (엣지 케이스)", () => {
        const query = buildQuery("제2읽");
        const exact = preprocessTarget("제2읽");
        const spilled = preprocessTarget("제2일기");
        const rExact = matchBest(query, exact)!;
        const rSpilled = matchBest(query, spilled)!;
        expect(rExact.score!).toBeGreaterThan(rSpilled.score!);
    });

    it("tailSpillPenalty=0이면 엣지 케이스 동률/역전 허용", () => {
        const query = buildQuery("제2읽");
        const exact = preprocessTarget("제2읽");
        const spilled = preprocessTarget("제2일기");
        const scoring: ScoringConfig = { weights: { tailSpillPenalty: 0 } };
        const rExact = matchBest(query, exact, scoring)!;
        const rSpilled = matchBest(query, spilled, scoring)!;
        expect(Math.abs(rExact.score! - rSpilled.score!)).toBeLessThanOrEqual(2);
    });

    it("주요 시나리오: 제2읽 vs 제2일 기타", () => {
        const query = buildQuery("제2읽");
        const rExact = matchBest(query, preprocessTarget("제2읽"))!;
        const rSpilled = matchBest(query, preprocessTarget("제2일 기타"))!;
        expect(rExact.score!).toBeGreaterThan(rSpilled.score!);
    });

    it("tail 없는 쿼리는 페널티 영향 없음", () => {
        const query = buildQuery("제");
        const target = preprocessTarget("제안");
        const rDefault = matchBest(query, target)!;
        const rZero = matchBest(query, target, { weights: { tailSpillPenalty: 0 } })!;
        expect(rDefault.score).toBe(rZero.score);
    });

    it("오버라이드 값만큼 정확히 차이 (spillMode=always)", () => {
        const query = buildQuery("읽");
        const target = preprocessTarget("일기");
        const r0 = matchBest(query, target, { weights: { tailSpillPenalty: 0 } }, undefined, "always")!;
        const rNeg = matchBest(query, target, { weights: { tailSpillPenalty: -100 } }, undefined, "always")!;
        expect(r0.score! - rNeg.score!).toBe(100);
    });
});

describe("createSearcher - scoring option", () => {
    it("static ScoringConfig 전달", () => {
        const searcher = createSearcher(["안녕하세요", "안부", "안심"]);
        const scoring: ScoringConfig = { weights: { positionZero: 500 } };
        const results = searcher.search("안", { scoring });
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
            expect(typeof r.score).toBe("number");
        }
    });

    it("함수 형태 scoring: 타겟마다 다른 config", () => {
        const searcher = createSearcher(["가나다라", "마바사아", "가마바사"]);
        const results = searcher.search("가", {
            scoring: (target) => ({
                // 짧은 타겟에 grapheme bonus
                graphemeBonus: (gi) => (target.graphemeCount <= 4 && gi === 0 ? 200 : 0),
            }),
        });
        expect(results.length).toBeGreaterThan(0);
        // 모든 결과에 score가 있어야 함
        for (const r of results) {
            expect(typeof r.score).toBe("number");
        }
    });

    it("scoring + score 함수 동시 사용", () => {
        const searcher = createSearcher(["안녕", "안부"]);
        const results = searcher.search("안", {
            scoring: { weights: { positionZero: 0 } },
            score: (result, _target) => result.score ?? 0,
        });
        expect(results.length).toBe(2);
    });

    it("scoring이 limit과 함께 동작", () => {
        const searcher = createSearcher(["가나", "가다", "가라", "가마", "나다"]);
        const results = searcher.search("가", {
            limit: 2,
            scoring: { weights: { positionZero: 300 } },
        });
        expect(results.length).toBe(2);
    });
});

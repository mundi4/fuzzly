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
        const t1 = preprocessTarget("a_b_c");
        const t2 = preprocessTarget("axc");
        const scoring: ScoringConfig = { weights: { gapPenalty: -100 } };
        const r1 = matchBest(query, t1, scoring)!;
        const r2 = matchBest(query, t2, scoring)!;
        expect(r2.score!).toBeGreaterThan(r1.score!);
    });

    it("anchorFill 오버라이드", () => {
        const query = buildQuery("ㅈ");
        const target = preprocessTarget("정의");
        const rDefault = matchBest(query, target)!;
        const rHigher = matchBest(query, target, { weights: { anchorFill: 1000 } })!;
        expect(rHigher.score!).toBeGreaterThan(rDefault.score!);
    });

    it("모든 weights 동시 오버라이드 0으로", () => {
        const query = buildQuery("안녕");
        const target = preprocessTarget("안녕");
        const scoring: ScoringConfig = {
            weights: {
                anchorFill: 0,
                positionZero: 0,
                boundary: 0,
                consecutive: 0,
                gapPenalty: 0,
                targetLengthPenalty: 0,
            },
        };
        const result = matchBest(query, target, scoring)!;
        expect(result.score).toBe(0);
    });
});

describe("ScoringConfig - graphemeBonus (배열)", () => {
    it("특정 위치에 bonus 부여", () => {
        const query = buildQuery("하");
        const target = preprocessTarget("안녕하세요");
        const bonuses = [0, 0, 200, 0, 0];
        const rDefault = matchBest(query, target)!;
        const rBoosted = matchBest(query, target, { graphemeBonus: bonuses })!;
        expect(rBoosted.score!).toBe(rDefault.score! + 200);
    });

    it("bonus 배열이 짧으면 부족한 인덱스는 0 취급", () => {
        const query = buildQuery("요");
        const target = preprocessTarget("안녕하세요");
        const rDefault = matchBest(query, target)!;
        const rShort = matchBest(query, target, { graphemeBonus: [100, 100] })!;
        expect(rShort.score).toBe(rDefault.score);
    });

    it("graphemeBonus로 DP 정렬 경로 변경", () => {
        const query = buildQuery("ㅎ");
        const target = preprocessTarget("기획 홍보 협력");
        const rDefault = matchBest(query, target)!;
        expect(rDefault.indices).not.toContain(6);

        const bonuses = [0, 0, 0, 0, 0, 0, 500, 0];
        const rBoosted = matchBest(query, target, { graphemeBonus: bonuses })!;
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
                return gi === 0 ? t.normalizedInput.length * 10 : 0;
            },
        })!;
        expect(rBoosted).not.toBeNull();
        const rDefault = matchBest(query, target)!;
        expect(rBoosted.score!).toBe(rDefault.score! + 30);
    });
});

describe("createGraphemeBonuses", () => {
    it("문자 범위를 grapheme bonus 배열로 변환", () => {
        const target = preprocessTarget("안녕하세요");
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
            { start: 0, end: 3, bonus: 10 },
            { start: 2, end: 5, bonus: 20 },
        ]);
        expect(bonuses[0]).toBe(10);
        expect(bonuses[1]).toBe(10);
        expect(bonuses[2]).toBe(30);
        expect(bonuses[3]).toBe(20);
        expect(bonuses[4]).toBe(20);
    });

    it("빈 범위 무시", () => {
        const target = preprocessTarget("abc");
        const bonuses = createGraphemeBonuses(target, [{ start: 2, end: 2, bonus: 100 }]);
        expect(bonuses).toEqual([0, 0, 0]);
    });

    it("matchBest와 연동", () => {
        const query = buildQuery("설");
        const target = preprocessTarget("프로젝트 설정 파일");
        const bonuses = createGraphemeBonuses(target, [{ start: 5, end: 7, bonus: 100 }]);
        const rDefault = matchBest(query, target)!;
        const rBoosted = matchBest(query, target, { graphemeBonus: bonuses })!;
        expect(rBoosted.score!).toBeGreaterThan(rDefault.score!);
    });
});

describe("anchorFill invariant - 완전 매치 > 얇은 매치", () => {
    it("'막연하게' 완전 매치가 'ㅁㅇㅎㄱ' 초성 매치보다 높은 점수", () => {
        const target = preprocessTarget("막연하게");
        const rChoseong = matchBest(buildQuery("ㅁㅇㅎㄱ"), target)!;
        const rFull = matchBest(buildQuery("막연하게"), target)!;
        expect(rFull.score!).toBeGreaterThan(rChoseong.score!);
    });

    it("부분 음절 매치가 초성보다 높고 완전 매치보다 낮음", () => {
        const target = preprocessTarget("막연하게");
        const rChoseong = matchBest(buildQuery("ㅁㅇㅎㄱ"), target)!;
        const rPartial = matchBest(buildQuery("막엲ㄱ"), target)!;
        const rFull = matchBest(buildQuery("막연하게"), target)!;
        // 막연하게 완전 매치가 가장 높아야 함
        expect(rFull.score!).toBeGreaterThan(rPartial.score!);
        expect(rPartial.score!).toBeGreaterThan(rChoseong.score!);
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
                graphemeBonus: (gi) => (target.graphemeCount <= 4 && gi === 0 ? 200 : 0),
            }),
        });
        expect(results.length).toBeGreaterThan(0);
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

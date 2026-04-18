import { describe, expect, it } from "vitest";
import { buildQuery, createSearcher, match, matchBest, preprocessTarget } from "../src";
import { journeyWithComposingFrom } from "./ime";

describe("spillMode + composingIndex", () => {
    describe("규칙 B — finalized 모음 포함 grapheme은 anchor 잉여 atom 불가", () => {
        it("'으' finalized → '은' 매치 X", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("은");
            // composingIndex=null → 명시적으로 조합중 없음 → "으" finalized
            expect(match(q, t, null)).toBeNull();
            expect(matchBest(q, t, undefined, null)).toBeNull();
        });

        it("'으' finalized → '으' 매치 O (구조 일치)", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("으");
            expect(match(q, t, null)).not.toBeNull();
            expect(matchBest(q, t, undefined, null)).not.toBeNull();
        });

        it("'으' composing → '은' 매치 O (현재 동작 유지)", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("은");
            // composingIndex=0 → 첫 char 조합중 → "으" composing → anchor 잉여 허용
            expect(match(q, t, 0)).not.toBeNull();
            expect(matchBest(q, t, undefined, 0)).not.toBeNull();
        });

        it("'일' finalized → '읽' 매치 X (겹받침 ㄺ = ㄹ+ㄱ의 ㄱ이 잉여)", () => {
            const q = buildQuery("일");
            const t = preprocessTarget("읽");
            expect(match(q, t, null)).toBeNull();
            expect(matchBest(q, t, undefined, null)).toBeNull();
        });

        it("'일' finalized → '일' 매치 O", () => {
            const q = buildQuery("일");
            const t = preprocessTarget("일");
            expect(match(q, t, null)).not.toBeNull();
        });
    });

    describe("규칙 A — finalized grapheme의 tail은 anchor 내부에서만 매치", () => {
        it("'은' finalized → '으나' 매치 X (ㄴ spill 금지)", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(match(q, t, null)).toBeNull();
            expect(matchBest(q, t, undefined, null)).toBeNull();
        });

        it("'은' composing → '으나' 매치 O (ㄴ spill 허용)", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(match(q, t, 0)).not.toBeNull();
            expect(matchBest(q, t, undefined, 0)).not.toBeNull();
        });
    });

    describe("규칙 C — spill된 자음은 이후 grapheme의 초성에만 매치", () => {
        it("'염' → '연범' 매치 X (범의 종성 ㅁ에 spill 금지)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("연범");
            expect(match(q, t, undefined, "always")).toBeNull();
            expect(matchBest(q, t, undefined, undefined, "always")).toBeNull();
        });

        it("'염' → '막연하게 평범한 머그컵' 매치는 연+머 (범 종성 아님)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("막연하게 평범한 머그컵");
            const r = match(q, t, undefined, "always");
            expect(r?.indices).toEqual([1, 9]);
            const rb = matchBest(q, t, undefined, undefined, "always");
            expect(rb?.indices).toEqual([1, 9]);
        });

        it("'염' → '연머' 매치 O (머 초성 ㅁ에 spill)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("연머");
            const r = match(q, t, undefined, "always");
            expect(r?.indices).toEqual([0, 1]);
        });

        it("anchor 잉여는 여전히 허용: '읽' composing → '일기' 매치 O", () => {
            // 일의 종성 ㄹ은 anchor 내부 → 잉여 atom 매치 허용. ㄱ은 기의 초성으로 spill.
            const q = buildQuery("읽");
            const t = preprocessTarget("일기");
            const r = match(q, t, 0);
            expect(r?.indices).toEqual([0, 1]);
        });
    });

    describe("spillMode 분기", () => {
        it("'always' + composingIndex=null → 모든 grapheme 관대", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            // always 모드에서는 composingIndex 무시됨
            expect(match(q, t, null, "always")).not.toBeNull();
            expect(matchBest(q, t, undefined, null, "always")).not.toBeNull();
        });

        it("'composing' + composingIndex=null → 모두 엄격", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(match(q, t, null, "composing")).toBeNull();
        });

        it("'composing' + composingIndex=undefined → 폴백 없음 (모두 엄격)", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(match(q, t, undefined, "composing")).toBeNull();
        });

        it("'composing' + composingIndex=0 → 지정 grapheme만 관대", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(match(q, t, 0, "composing")).not.toBeNull();
        });

        it("'composingOrLast' + composingIndex=undefined → 마지막만 관대", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            // 쿼리 "은"은 1 grapheme, last = 인덱스 0 = 관대 → match
            expect(match(q, t, undefined, "composingOrLast")).not.toBeNull();
        });

        it("'composingOrLast' + composingIndex=null → 명시적 none (trim 시나리오)", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(match(q, t, null, "composingOrLast")).toBeNull();
        });
    });

    describe("멀티 grapheme 쿼리", () => {
        it("'으해' composingIndex=null (전체 finalized) → '은행' 매치 X", () => {
            const q = buildQuery("으해");
            const t = preprocessTarget("은행");
            expect(match(q, t, null)).toBeNull();
            expect(matchBest(q, t, undefined, null)).toBeNull();
        });

        it("'으해' 마지막만 composing → '은행' 매치 X (첫 글자가 finalized로 막힘)", () => {
            const q = buildQuery("으해");
            const t = preprocessTarget("은행");
            // composingIndex=1 → "해"만 composing, "으" finalized → "으" vs "은" 구조 불일치
            expect(match(q, t, 1)).toBeNull();
            // composingOrLast 기본값도 동일 (undefined → 마지막 "해" composing)
            expect(match(q, t)).toBeNull();
        });

        it("'으해' 첫 글자만 composing → '은행' 매치 X (둘째 글자 '해' vs '행' 구조 불일치)", () => {
            const q = buildQuery("으해");
            const t = preprocessTarget("은행");
            expect(match(q, t, 0)).toBeNull();
        });

        it("'은행' 마지막만 composing → '은행' 매치 O (구조 일치)", () => {
            const q = buildQuery("은행");
            const t = preprocessTarget("은행");
            expect(match(q, t)).not.toBeNull();
            expect(match(q, t, null)).not.toBeNull();
        });

        it("'은해' finalized 전체 → '은행' 매치 X ('해' vs '행' 구조 불일치)", () => {
            const q = buildQuery("은해");
            const t = preprocessTarget("은행");
            expect(match(q, t, null)).toBeNull();
        });
    });

    describe("char → grapheme 변환", () => {
        it("ASCII + 한글 혼합: composingIndex가 정확한 grapheme 가리킴", () => {
            const q = buildQuery("a으");
            const t = preprocessTarget("a은");
            // composingIndex=1 → '으' 조합중 → 매치 O
            expect(match(q, t, 1)).not.toBeNull();
            // composingIndex=0 → 'a' 조합중 → '으' finalized → 매치 X
            expect(match(q, t, 0)).toBeNull();
        });

        it("composingIndex 범위 밖은 none으로 취급", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("은");
            // 쿼리 길이 1, composingIndex=5는 범위 밖
            expect(match(q, t, 5)).toBeNull();
            // 음수
            expect(match(q, t, -1)).toBeNull();
        });
    });

    describe("초성-only / non-Hangul은 spillMode 영향 없음", () => {
        it("초성 쿼리 'ㅇㅎ'는 composingIndex 무관하게 '은행' 매치", () => {
            const q = buildQuery("ㅇㅎ");
            const t = preprocessTarget("은행");
            expect(match(q, t, null)).not.toBeNull();
            expect(match(q, t, null, "composing")).not.toBeNull();
        });

        it("ASCII 쿼리는 구조 매치 영향 없음 (이미 exact)", () => {
            const q = buildQuery("abc");
            const t = preprocessTarget("abc");
            expect(match(q, t, null)).not.toBeNull();
            expect(match(q, t, null, "composing")).not.toBeNull();
        });
    });

    describe("searcher.search 통합", () => {
        it("SearchOptions.spillMode와 composingIndex 파라미터가 match 동작 제어", () => {
            const searcher = createSearcher(["은행", "으", "은", "으나"]);
            // 기본(composingOrLast) + composingIndex=null → "으"는 finalized, "은"은 구조 불일치
            const strict = searcher.search("으", {}, null);
            const hits = strict.map((r) => r.item);
            expect(hits).toContain("으");
            expect(hits).not.toContain("은");
            expect(hits).not.toContain("은행");
        });

        it("spillMode=always는 모든 타겟이 관대하게 매칭", () => {
            const searcher = createSearcher(["은행", "으", "은", "으나"]);
            const loose = searcher.search("으", { spillMode: "always" }, null);
            const hits = loose.map((r) => r.item);
            expect(hits).toContain("으");
            expect(hits).toContain("은");
            expect(hits).toContain("은행");
            expect(hits).toContain("으나");
        });

        it("composingIndex 변경 시 세션 리셋 (올바른 재매칭)", () => {
            const searcher = createSearcher(["은행", "으해"]);
            // 첫 호출: composingOrLast + undefined → 마지막 관대
            const r1 = searcher.search("으", {}, undefined);
            expect(r1.map((r) => r.item)).toContain("은행");

            // 두 번째 호출: composingIndex=null → 모두 엄격 → "은행" 제외
            const r2 = searcher.search("으", {}, null);
            expect(r2.map((r) => r.item)).not.toContain("은행");
        });
    });

    describe("IME 타이핑 journey — composingIndex 정확히 넘기면 모든 단계 매치", () => {
        // ime.ts의 journeyWithComposingFrom은 실제 IME 합성 시뮬레이터로
        // 각 키스트로크 직후의 (state, composingIndex) 시퀀스를 생성한다.
        const journey = journeyWithComposingFrom("텍스트");

        it("journey 마지막 원소는 입력 쿼리 자체", () => {
            expect(journey[journey.length - 1].state).toBe("텍스트");
        });

        it("match 경로: 정확한 composingIndex로 모든 단계 매치", () => {
            const target = preprocessTarget("텍스트");
            for (const { state, composingIndex } of journey) {
                const q = buildQuery(state);
                const result = match(q, target, composingIndex);
                expect(result, `state="${state}" composingIndex=${composingIndex}`).not.toBeNull();
            }
        });

        it("matchBest 경로: 정확한 composingIndex로 모든 단계 매치", () => {
            const target = preprocessTarget("텍스트");
            for (const { state, composingIndex } of journey) {
                const q = buildQuery(state);
                const result = matchBest(q, target, undefined, composingIndex);
                expect(result, `state="${state}" composingIndex=${composingIndex}`).not.toBeNull();
            }
        });

        it("searcher.search: composingIndex 전달 시 journey 유지", () => {
            const searcher = createSearcher(["텍스트"]);
            for (const { state, composingIndex } of journey) {
                const results = searcher.search(state, {}, composingIndex);
                expect(results.length, `state="${state}" composingIndex=${composingIndex}`).toBe(1);
                expect(results[0].item).toBe("텍스트");
            }
        });

        it("composingIndex=null (전 구간 finalized)이면 중간 단계에서 끊김", () => {
            const target = preprocessTarget("텍스트");
            // journey 중 하나라도 null 취급 시 실패하는 단계가 있어야 한다
            // (그렇지 않으면 composingIndex 기능 자체의 가치가 없음).
            const failures = journey.filter(({ state }) => match(buildQuery(state), target, null) === null);
            expect(failures.length).toBeGreaterThan(0);
        });
    });

    describe("삭제(backspace) journey", () => {
        describe("통상적인 whole-char 삭제 (composition 없음)", () => {
            // 브라우저 기본: 커서가 finalized 영역에 있을 때 backspace는 한 grapheme을 통째로 제거.
            // composition 이벤트 없이 입력값만 짧아짐. caller는 composingIndex=null로 호출.
            const deletionStates = ["텍스트", "텍스", "텍"];

            it("모든 단계가 매치 (완전 grapheme은 strict 모드에서도 구조 일치)", () => {
                const target = preprocessTarget("텍스트");
                for (const state of deletionStates) {
                    const q = buildQuery(state);
                    expect(match(q, target, null), `state="${state}"`).not.toBeNull();
                }
            });

            it("searcher 경로에서도 동일", () => {
                const searcher = createSearcher(["텍스트"]);
                for (const state of deletionStates) {
                    const results = searcher.search(state, {}, null);
                    expect(results.length, `state="${state}"`).toBe(1);
                }
            });
        });

        describe("composition 기반 삭제 (jamo 하나씩)", () => {
            // 드문 케이스지만 IME/플랫폼에 따라 backspace가 composition을 유지하며 jamo를 하나씩 제거.
            // 결과적으로 입력 journey를 역순으로 되짚는 상태를 거치게 됨.
            const reversed = [...journeyWithComposingFrom("텍스트")].reverse();

            it("역순 journey도 모든 단계 매치", () => {
                const target = preprocessTarget("텍스트");
                for (const { state, composingIndex } of reversed) {
                    const q = buildQuery(state);
                    expect(
                        match(q, target, composingIndex),
                        `state="${state}" composingIndex=${composingIndex}`,
                    ).not.toBeNull();
                }
            });

            it("searcher 경로에서도 동일", () => {
                const searcher = createSearcher(["텍스트"]);
                for (const { state, composingIndex } of reversed) {
                    const results = searcher.search(state, {}, composingIndex);
                    expect(results.length, `state="${state}" composingIndex=${composingIndex}`).toBe(1);
                }
            });
        });
    });

    describe("tailSpillPenalty는 spillMode=always에서만 적용", () => {
        it("기본 모드에서는 tailSpillPenalty 설정해도 점수 차이 없음", () => {
            const query = buildQuery("절");
            const target = preprocessTarget("전라");
            // 기본(composingOrLast) + composingIndex=undefined → "절" composing → tail spill 허용
            const r0 = matchBest(query, target, { weights: { tailSpillPenalty: 0 } })!;
            const rNeg = matchBest(query, target, { weights: { tailSpillPenalty: -100 } })!;
            expect(r0.score).toBe(rNeg.score);
        });

        it("spillMode=always에서만 tailSpillPenalty가 실제 적용", () => {
            const query = buildQuery("절");
            const target = preprocessTarget("전라");
            const r0 = matchBest(query, target, { weights: { tailSpillPenalty: 0 } }, undefined, "always")!;
            const rNeg = matchBest(query, target, { weights: { tailSpillPenalty: -100 } }, undefined, "always")!;
            expect(r0.score! - rNeg.score!).toBe(100);
        });
    });
});

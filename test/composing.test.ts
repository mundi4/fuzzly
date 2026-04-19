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

        it("'앍' → '알고' 매치 O (ㄱ이 고 초성으로 spill)", () => {
            // '알' 잉여 ㄹ이 쿼리 tail prefix ㄹ과 일치 → anchor 승인, 남은 ㄱ은 spill.
            const q = buildQuery("앍");
            const t = preprocessTarget("알고");
            const r = match(q, t, undefined, "always");
            expect(r?.indices).toEqual([0, 1]);
            const rb = matchBest(q, t, undefined, undefined, "always");
            expect(rb?.indices).toEqual([0, 1]);
        });

        it("'앍' → '알먹' 매치 X (먹 종성 ㄱ에 spill 금지)", () => {
            // ㄱ이 '먹' 초성(ㅁ)과 불일치, 종성 ㄱ은 spill 대상 아님.
            const q = buildQuery("앍");
            const t = preprocessTarget("알먹");
            expect(match(q, t, undefined, "always")).toBeNull();
            expect(matchBest(q, t, undefined, undefined, "always")).toBeNull();
        });

        it("anchor 잉여는 여전히 허용: '읽' composing → '일기' 매치 O", () => {
            // 일의 종성 ㄹ은 anchor 내부 → 잉여 atom 매치 허용. ㄱ은 기의 초성으로 spill.
            const q = buildQuery("읽");
            const t = preprocessTarget("일기");
            const r = match(q, t, 0);
            expect(r?.indices).toEqual([0, 1]);
        });
    });

    describe("규칙 D — tail spill 시 anchor 잉여는 tail prefix와 일치해야 함", () => {
        // tail이 있는 composing grapheme에서 anchor의 qLeadVowelEnd 이후 잉여 atoms는
        // 쿼리 tail atoms의 prefix와 정확히 일치해야 한다. 일치하지 않으면 anchor 잉여가
        // 어떤 쿼리 atom에도 대응되지 않는 false positive가 된다.

        it("'염' → '연' 매치 X (잉여 ㄴ이 tail ㅁ과 불일치)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("연");
            expect(match(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
            expect(match(q, t, undefined, "always")).toBeNull();
            expect(matchBest(q, t, undefined, undefined, "always")).toBeNull();
        });

        it("'염' → '막연하게 평범한 머그컵' 매치 X ('연'이 anchor가 될 수 없음)", () => {
            // ㅁ이 '머'로 spill되더라도 '연'의 잉여 ㄴ이 쿼리에 없는 atom이라 anchor 불가.
            const q = buildQuery("염");
            const t = preprocessTarget("막연하게 평범한 머그컵");
            expect(match(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
            expect(match(q, t, undefined, "always")).toBeNull();
            expect(matchBest(q, t, undefined, undefined, "always")).toBeNull();
        });

        it("'염' → '염' 매치 O (anchorExtras==qTailLen, 정확 일치)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("염");
            expect(match(q, t)).not.toBeNull();
            expect(matchBest(q, t)).not.toBeNull();
        });

        it("'읽' → '일기' 매치 O (prefix 일치, ㄱ spill) — 회귀 가드", () => {
            const q = buildQuery("읽");
            const t = preprocessTarget("일기");
            expect(match(q, t)?.indices).toEqual([0, 1]);
            expect(matchBest(q, t)?.indices).toEqual([0, 1]);
        });

        it("'알' → '앏' 매치 X (anchorExtras > qTailLen)", () => {
            // anchor '앏' 잉여 [ㄹ,ㅂ]는 쿼리 tail [ㄹ]보다 길다 → reject.
            const q = buildQuery("알");
            const t = preprocessTarget("앏");
            expect(match(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
            expect(match(q, t, undefined, "always")).toBeNull();
            expect(matchBest(q, t, undefined, undefined, "always")).toBeNull();
        });

        it("'앍' → '알고' 매치 O (compound tail, prefix 일치 후 ㄱ spill)", () => {
            const q = buildQuery("앍");
            const t = preprocessTarget("알고");
            expect(match(q, t)?.indices).toEqual([0, 1]);
            expect(matchBest(q, t)?.indices).toEqual([0, 1]);
        });

        it("'가' → '값' 매치 O (qTailStart=-1, 규칙 미적용)", () => {
            const q = buildQuery("가");
            const t = preprocessTarget("값");
            expect(match(q, t)).not.toBeNull();
            expect(matchBest(q, t)).not.toBeNull();
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
            // 쿼리 '읽'=[ㅇㅣㄹㄱ] vs '일기': anchor '일' 잉여 [ㄹ] == tail prefix [ㄹ], ㄱ은 '기' 초성으로 spill.
            const query = buildQuery("읽");
            const target = preprocessTarget("일기");
            const r0 = matchBest(query, target, { weights: { tailSpillPenalty: 0 } })!;
            const rNeg = matchBest(query, target, { weights: { tailSpillPenalty: -100 } })!;
            expect(r0.score).toBe(rNeg.score);
        });

        it("spillMode=always에서만 tailSpillPenalty가 실제 적용", () => {
            const query = buildQuery("읽");
            const target = preprocessTarget("일기");
            const r0 = matchBest(query, target, { weights: { tailSpillPenalty: 0 } }, undefined, "always")!;
            const rNeg = matchBest(query, target, { weights: { tailSpillPenalty: -100 } }, undefined, "always")!;
            expect(r0.score! - rNeg.score!).toBe(100);
        });
    });

    describe("규칙 E — composing 바로 앞 finalized compound jongseong은 확장 composing 승격", () => {
        // IME 결합 시나리오: 사용자가 "막연하게"를 치는 도중
        // "막"(확정) + "연"(확정) + "ㅎ"(연에 흡수되어 엲) + "ㄱ"(새 composing)
        // → 쿼리 문자열은 "막엲ㄱ". "엲"은 finalized이지만 compound jongseong(ㄶ)이므로
        // composing 바로 앞에서만 관대 처리 (tail의 ㅎ을 다음 syllable로 spill).
        it("'막엲ㄱ' → '막연하게' 매치 (default composingOrLast)", () => {
            const q = buildQuery("막엲ㄱ");
            const t = preprocessTarget("막연하게");
            const r = match(q, t);
            expect(r).not.toBeNull();
            expect(r!.indices).toEqual([0, 1, 2, 3]);
            const rBest = matchBest(q, t);
            expect(rBest).not.toBeNull();
            expect(rBest!.indices).toEqual([0, 1, 2, 3]);
        });

        it("'앓ㄱ' → '알하고' 매치 (compound ㄹㅎ의 ㄹ anchor 소진, ㅎ spill, ㄱ initial)", () => {
            const q = buildQuery("앓ㄱ");
            const t = preprocessTarget("알하고");
            const r = match(q, t);
            expect(r).not.toBeNull();
            expect(r!.indices).toEqual([0, 1, 2]);
            const rBest = matchBest(q, t);
            expect(rBest).not.toBeNull();
            expect(rBest!.indices).toEqual([0, 1, 2]);
        });

        it("'막엲고' → '막연하고' 매치 (default last='고', 바로 앞 '엲' 완화)", () => {
            const q = buildQuery("막엲고");
            const t = preprocessTarget("막연하고");
            const r = match(q, t);
            expect(r).not.toBeNull();
            expect(r!.indices).toEqual([0, 1, 2, 3]);
            const rBest = matchBest(q, t);
            expect(rBest).not.toBeNull();
            expect(rBest!.indices).toEqual([0, 1, 2, 3]);
        });

        it("'막엲ㄱ' + composingIndex=3 (ㄱ의 char index) → '막연하게' 매치", () => {
            const q = buildQuery("막엲ㄱ");
            const t = preprocessTarget("막연하게");
            // "ㄱ"의 char index는 2 (막=0, 엲=1, ㄱ=2)
            expect(match(q, t, 2, "composing")).not.toBeNull();
            expect(matchBest(q, t, undefined, 2, "composing")).not.toBeNull();
        });

        it("'막엲ㄱ' + composingIndex=null → '막연하게' 매치 (IME 축약 복원, composingIndex 무관)", () => {
            const q = buildQuery("막엲ㄱ");
            const t = preprocessTarget("막연하게");
            // compound jongseong은 사용자의 초성매치 의도가 IME에 의해 축약된 결과이므로
            // composingIndex/spillMode와 무관하게 anchor+spill 복원 매치 (allowChoseongMatch=default true)
            expect(match(q, t, null)).not.toBeNull();
            expect(matchBest(q, t, undefined, null)).not.toBeNull();
        });

        it("'엲' 단독 + composingIndex=null → '연하' 매치 (compound 완화 항상 ON)", () => {
            const q = buildQuery("엲");
            const t = preprocessTarget("연하");
            expect(match(q, t, null)).not.toBeNull();
            expect(matchBest(q, t, undefined, null)).not.toBeNull();
        });

        it("'갉각' → '각각' 매치 X (compound 완화되지만 anchor-extras-prefix ㄱ≠ㄹ 차단)", () => {
            const q = buildQuery("갉각");
            const t = preprocessTarget("각각");
            expect(match(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
        });

        it("'엲ㄱ' → '염가' 매치 X (anchor-extras-prefix ㅁ≠ㄴ 차단)", () => {
            const q = buildQuery("엲ㄱ");
            const t = preprocessTarget("염가");
            expect(match(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
        });

        it("'엲고ㄱ' vs '연고기' 매치 X (compound 완화되지만 spill ㅎ이 다음 '고' 초성 ㄱ과 불일치)", () => {
            // compound 완화는 발동: "엲" anchor='연'(ㅇㅕㄴ) + tail ㅎ spill.
            // 하지만 ㅎ이 spill 대상인 다음 target grapheme "고"의 초성 ㄱ과 불일치 → 실패.
            const q = buildQuery("엲고ㄱ");
            const t = preprocessTarget("연고기");
            expect(match(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
        });
    });

    describe("allowChoseongMatch=false — journey 매칭만 허용", () => {
        // target "막연하게"에 대한 journey 시나리오:
        //   composing 위치의 초성-only/완전음절은 허용 (IME 중간상태)
        //   finalized 초성-only, finalized compound jongseong(엲) → 차단
        const target = () => preprocessTarget("막연하게");

        // --- 매치 O: journey의 유효한 중간상태 ---
        it("'ㅁ' + composingIndex=0 → OK (composing 초성-only 예외)", () => {
            const q = buildQuery("ㅁ");
            const t = target();
            expect(match(q, t, 0, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, 0, undefined, false)).not.toBeNull();
        });

        it("'마' + composingIndex=0 → OK (composing 부분 조합)", () => {
            const q = buildQuery("마");
            const t = target();
            expect(match(q, t, 0, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, 0, undefined, false)).not.toBeNull();
        });

        it("'막' → OK (완전 음절, default last=composing)", () => {
            const q = buildQuery("막");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).not.toBeNull();
        });

        it("'막ㅇ' + composingIndex=1 → OK (composing ㅇ)", () => {
            const q = buildQuery("막ㅇ");
            const t = target();
            expect(match(q, t, 1, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, 1, undefined, false)).not.toBeNull();
        });

        it("'막여' + composingIndex=1 → OK", () => {
            const q = buildQuery("막여");
            const t = target();
            expect(match(q, t, 1, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, 1, undefined, false)).not.toBeNull();
        });

        it("'막연' → OK (완전 음절 2개, default last composing)", () => {
            const q = buildQuery("막연");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).not.toBeNull();
        });

        it("'막엲' → OK (엲이 composing, journey 중간상태)", () => {
            const q = buildQuery("막엲");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).not.toBeNull();
        });

        it("'막연하' → OK", () => {
            const q = buildQuery("막연하");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).not.toBeNull();
        });

        it("'막연학' → OK (composing '학'의 tail ㄱ이 '게' 초성 spill 허용)", () => {
            const q = buildQuery("막연학");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).not.toBeNull();
        });

        it("'막연하게' → OK (완전 매치)", () => {
            const q = buildQuery("막연하게");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).not.toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).not.toBeNull();
        });

        // --- 매치 X: 초성매치 시나리오 ---
        it("'ㅁㅇㅎㄱ' → 실패 (전부 finalized 초성-only — default last=ㄱ만 composing)", () => {
            const q = buildQuery("ㅁㅇㅎㄱ");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).toBeNull();
        });

        it("'ㅁㅇㅎㄱ' + composingIndex=3 → 실패 (앞 3개 finalized 초성-only)", () => {
            const q = buildQuery("ㅁㅇㅎㄱ");
            const t = target();
            expect(match(q, t, 3, undefined, false)).toBeNull();
            expect(matchBest(q, t, undefined, 3, undefined, false)).toBeNull();
        });

        it("'막엲ㄱ' → 실패 (compound 완화 off → 엲 strict → 연과 atom 불일치)", () => {
            const q = buildQuery("막엲ㄱ");
            const t = target();
            expect(match(q, t, undefined, undefined, false)).toBeNull();
            expect(matchBest(q, t, undefined, undefined, undefined, false)).toBeNull();
        });

        // --- Non-regression: 기본값 true에서 기존 동작 유지 ---
        it("'ㅁㅇㅎㄱ' default(true) → OK (기존 동작 유지)", () => {
            const q = buildQuery("ㅁㅇㅎㄱ");
            const t = target();
            expect(match(q, t)).not.toBeNull();
            expect(matchBest(q, t)).not.toBeNull();
        });

        it("'막엲ㄱ' default(true) → OK (compound 완화 유지)", () => {
            const q = buildQuery("막엲ㄱ");
            const t = target();
            expect(match(q, t)).not.toBeNull();
            expect(matchBest(q, t)).not.toBeNull();
        });
    });
});

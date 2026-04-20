import { describe, expect, it } from "vitest";
import { buildQuery, matchBest, preprocessTarget } from "../src";

/**
 * `strict` 옵션 전용 테스트.
 *
 * - `strict=false` (기본): 모든 한글 grapheme을 관대하게 매칭 — IME journey 전반 수용.
 * - `strict=true`: 모음 포함 쿼리 grapheme은 target anchor와 atom 시퀀스 정확 일치 요구.
 *   초성-only grapheme / non-Hangul은 영향 없음.
 */
describe("strict 모드", () => {
    describe("기본(strict=false) — 관대 매칭", () => {
        it("'으' → '은' 매치 (anchor 잉여 허용)", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("은");
            expect(matchBest(q, t)).not.toBeNull();
        });

        it("'은' → '으나' 매치 (tail spill)", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(matchBest(q, t)).not.toBeNull();
        });

        it("'으해' → '은행' 매치", () => {
            const q = buildQuery("으해");
            const t = preprocessTarget("은행");
            expect(matchBest(q, t)).not.toBeNull();
        });

        it("'막엲ㄱ' → '막연하게' 매치 (compound jongseong 자연 수용)", () => {
            const q = buildQuery("막엲ㄱ");
            const t = preprocessTarget("막연하게");
            const r = matchBest(q, t);
            expect(r).not.toBeNull();
            expect(r!.indices).toEqual([0, 1, 2, 3]);
        });
    });

    describe("strict=true — 구조 매치 요구", () => {
        it("'으' strict → '은' 매치 X", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("은");
            expect(matchBest(q, t, undefined, true)).toBeNull();
        });

        it("'으' strict → '으' 매치 O", () => {
            const q = buildQuery("으");
            const t = preprocessTarget("으");
            expect(matchBest(q, t, undefined, true)).not.toBeNull();
        });

        it("'은' strict → '으나' 매치 X (tail spill 금지)", () => {
            const q = buildQuery("은");
            const t = preprocessTarget("으나");
            expect(matchBest(q, t, undefined, true)).toBeNull();
        });

        it("'일' strict → '읽' 매치 X (anchor 잉여 금지)", () => {
            const q = buildQuery("일");
            const t = preprocessTarget("읽");
            expect(matchBest(q, t, undefined, true)).toBeNull();
        });

        it("'일' strict → '일' 매치 O", () => {
            const q = buildQuery("일");
            const t = preprocessTarget("일");
            expect(matchBest(q, t, undefined, true)).not.toBeNull();
        });

        it("'은행' strict → '은행' 매치 O (구조 일치)", () => {
            const q = buildQuery("은행");
            const t = preprocessTarget("은행");
            expect(matchBest(q, t, undefined, true)).not.toBeNull();
        });

        it("'으해' strict → '은행' 매치 X", () => {
            const q = buildQuery("으해");
            const t = preprocessTarget("은행");
            expect(matchBest(q, t, undefined, true)).toBeNull();
        });

        it("'막엲ㄱ' strict → '막연하게' 매치 X (엲 strict 불일치)", () => {
            const q = buildQuery("막엲ㄱ");
            const t = preprocessTarget("막연하게");
            expect(matchBest(q, t, undefined, true)).toBeNull();
        });
    });

    describe("anchor extras prefix는 strict=false에서도 유지", () => {
        it("'염' → '연' 매치 X (anchor 잉여 ㄴ이 tail ㅁ과 불일치)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("연");
            expect(matchBest(q, t)).toBeNull();
        });

        it("'염' → '막연하게 평범한 머그컵' 매치 X", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("막연하게 평범한 머그컵");
            expect(matchBest(q, t)).toBeNull();
        });

        it("'읽' → '일기' 매치 O (anchor extras ㄹ = tail prefix ㄹ, ㄱ spill)", () => {
            const q = buildQuery("읽");
            const t = preprocessTarget("일기");
            expect(matchBest(q, t)?.indices).toEqual([0, 1]);
        });

        it("'알' → '앏' 매치 X (anchorExtras > qTailLen)", () => {
            const q = buildQuery("알");
            const t = preprocessTarget("앏");
            expect(matchBest(q, t)).toBeNull();
        });

        it("'가' → '값' 매치 O (qTailStart=-1, 규칙 미적용)", () => {
            const q = buildQuery("가");
            const t = preprocessTarget("값");
            expect(matchBest(q, t)).not.toBeNull();
        });
    });

    describe("spill된 자음은 이후 grapheme 초성에만 매치", () => {
        it("'앍' → '알고' 매치 O (ㄱ이 고 초성으로 spill)", () => {
            const q = buildQuery("앍");
            const t = preprocessTarget("알고");
            expect(matchBest(q, t)?.indices).toEqual([0, 1]);
        });

        it("'앍' → '알먹' 매치 X (먹 종성 ㄱ에 spill 금지)", () => {
            const q = buildQuery("앍");
            const t = preprocessTarget("알먹");
            expect(matchBest(q, t)).toBeNull();
        });

        it("'염' → '연범' 매치 X (범의 종성 ㅁ에 spill 금지)", () => {
            const q = buildQuery("염");
            const t = preprocessTarget("연범");
            expect(matchBest(q, t)).toBeNull();
        });
    });

    describe("초성-only / non-Hangul은 strict 영향 없음", () => {
        it("'ㅇㅎ' → '은행' 매치 (strict 무관)", () => {
            const q = buildQuery("ㅇㅎ");
            const t = preprocessTarget("은행");
            expect(matchBest(q, t)).not.toBeNull();
            expect(matchBest(q, t, undefined, true)).not.toBeNull();
        });

        it("'abc' → 'abc' 매치 (strict 무관, 이미 exact)", () => {
            const q = buildQuery("abc");
            const t = preprocessTarget("abc");
            expect(matchBest(q, t)).not.toBeNull();
            expect(matchBest(q, t, undefined, true)).not.toBeNull();
        });
    });
});

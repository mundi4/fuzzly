import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, createSearcher, matchBest, matchLiteral, preprocessTarget } from "../src";

/**
 * issue #26 — literal 모드 스코어링 + best occurrence.
 * issue #30-1 — matchBest options-bag 시그니처.
 */
describe("matchLiteral 스코어링 (issue #26)", () => {
    it("score 를 세팅한다 (positionZero + boundary + targetLengthPenalty)", () => {
        const r = matchLiteral("파일", preprocessTarget("파일 열기"));
        expect(r).not.toBeNull();
        expect(typeof r?.score).toBe("number");
    });

    it("target 선두 매치가 word-internal 매치보다 높은 스코어", () => {
        const head = matchLiteral("파일", preprocessTarget("파일 목록"));
        const internal = matchLiteral("파일", preprocessTarget("내파일 목록"));
        expect(head!.score!).toBeGreaterThan(internal!.score!);
    });

    it("best occurrence: 뒤쪽의 boundary occurrence 를 채택한다", () => {
        // 첫 occurrence(내파일 = word-internal)보다 boundary 에서 시작하는
        // 두 번째 occurrence(공백 뒤 파일)가 하이라이트로 선택되어야 한다.
        const t = preprocessTarget("내파일 파일 열기");
        const r = matchLiteral("파일", t);
        expect(r).not.toBeNull();
        const ranges = buildMatchRanges([r!.indices], t);
        expect(t.input.slice(ranges[0].start, ranges[0].end)).toBe("파일");
        expect(ranges[0].start).toBe(4); // 공백 뒤 boundary occurrence
    });

    it("createSearcher literal 검색이 score 순으로 랭킹된다", () => {
        const s = createSearcher(["긴 텍스트 안의 파일 어쩌고 저쩌고", "파일 열기"]);
        const r = s.search("파일", { literal: true });
        expect(r.map((x) => x.item)[0]).toBe("파일 열기"); // 선두 + 짧은 타겟 우선
    });
});

describe("matchBest options-bag 시그니처 (issue #30-1)", () => {
    it("{ strict: true } 옵션 객체가 positional strict 와 동일 동작", () => {
        const q = buildQuery("으");
        const t = preprocessTarget("은행");
        expect(matchBest(q, t, { strict: true })).toBeNull();
        expect(matchBest(q, t, undefined, true)).toBeNull();
        expect(matchBest(q, t, { strict: false })).not.toBeNull();
        expect(matchBest(q, t)).not.toBeNull();
    });

    it("{ scoring } 옵션 객체가 positional scoring 과 동일 스코어", () => {
        const q = buildQuery("안녕");
        const t = preprocessTarget("안녕하세요");
        const cfg = { weights: { anchorFill: 100 } };
        const viaOpts = matchBest(q, t, { scoring: cfg });
        const viaPositional = matchBest(q, t, cfg);
        expect(viaOpts?.score).toBe(viaPositional?.score);
    });

    it("ScoringConfig 를 3번째 인자로 직접 넘기는 기존 호출 유지", () => {
        const q = buildQuery("안녕");
        const t = preprocessTarget("안녕하세요");
        const base = matchBest(q, t);
        const boosted = matchBest(q, t, { weights: { anchorFill: 500 } });
        expect(boosted!.score!).toBeGreaterThan(base!.score!);
    });

    it("혼합 객체(weights + strict)는 ScoringConfig 로 해석 — weights 가 조용히 drop 되지 않는다", () => {
        const q = buildQuery("안녕");
        const t = preprocessTarget("안녕하세요");
        const viaConfig = matchBest(q, t, { weights: { anchorFill: 500 } });
        // strict 키가 섞여 있어도 config 키(weights)가 우선 — weights 적용 유지 (dev 경고 대상)
        const original = console.warn;
        console.warn = () => {};
        try {
            const mixed = matchBest(q, t, { weights: { anchorFill: 500 }, strict: false } as never);
            expect(mixed?.score).toBe(viaConfig?.score);
        } finally {
            console.warn = original;
        }
    });

    it("options-bag + positional strict 병용 시 positional strict 존중", () => {
        const q = buildQuery("으");
        const t = preprocessTarget("은행");
        // bag 에 strict 가 없으면 4번째 positional 인자를 따른다 (반쪽 마이그레이션 보호)
        expect(matchBest(q, t, { scoring: undefined }, true)).toBeNull();
    });

    it("matchLiteral 이 ScoringConfig weights 를 따른다", () => {
        const t = preprocessTarget("긴 타겟 문자열 파일 어쩌고");
        const base = matchLiteral("파일", t);
        const noLenPenalty = matchLiteral("파일", t, { weights: { targetLengthPenalty: 0 } });
        expect(noLenPenalty!.score!).toBeGreaterThan(base!.score!);
    });

    it("searcher literal 검색이 인스턴스 scoring 가중치를 따른다", () => {
        // targetLengthPenalty 를 끄면 긴 타겟이 boundary 우위로 짧은 word-internal 타겟을 앞선다
        const items = ["내파일함", "아주 길고 긴 텍스트 안의 파일 항목"];
        const noPenalty = createSearcher(items, { scoring: { weights: { targetLengthPenalty: 0, positionZero: 0 } } });
        const r = noPenalty.search("파일", { literal: true });
        expect(r[0].item).toBe("아주 길고 긴 텍스트 안의 파일 항목"); // boundary 매치 우위
    });
});

import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, matchBest, matchLiteral, preprocessTarget } from "../src";

/**
 * issue #23 — 쿼리/타겟 case folding 통일 + 길이 보존.
 * issue #24 — grapheme당 atom 수 255 초과 시 명시적 RangeError.
 *
 * 쿼리(buildQuery)와 타겟(preprocessTarget)이 같은 folding 함수를 쓰지 않으면
 * 비ASCII 대문자 쿼리가 fuzzy 경로에서 매치 불가가 되고 (É: 0xC9 vs 0xE9),
 * toLowerCase 가 길이를 바꾸는 문자(İ)는 하이라이트 offset 을 밀리게 한다.
 */
describe("case folding 통일 (issue #23)", () => {
    it("비ASCII 대문자 쿼리가 fuzzy 경로에서 매치된다 (É)", () => {
        const t = preprocessTarget("Café Été");
        expect(matchBest(buildQuery("É"), t)).not.toBeNull();
        expect(matchBest(buildQuery("é"), t)).not.toBeNull();
    });

    it("키릴 대문자 쿼리 → 자기 자신 매치 (Привет)", () => {
        const t = preprocessTarget("Привет");
        expect(matchBest(buildQuery("Привет"), t)).not.toBeNull();
        expect(matchBest(buildQuery("привет"), t)).not.toBeNull();
    });

    it("fuzzy 와 literal 경로의 결과 일치 (É)", () => {
        const t = preprocessTarget("Éclair");
        expect(matchBest(buildQuery("É"), t)).not.toBeNull();
        expect(matchLiteral("É", t)).not.toBeNull();
    });

    it("ASCII 대소문자 동작 불변", () => {
        const t = preprocessTarget("Open File");
        expect(matchBest(buildQuery("OPEN"), t)).not.toBeNull();
        expect(matchBest(buildQuery("open"), t)).not.toBeNull();
    });

    it("길이 변화 문자(İ)에서 하이라이트 offset 이 밀리지 않는다", () => {
        const t = preprocessTarget("İstanbul");
        // normalizedInput 이 원문과 같은 길이여야 charIndexes 좌표계가 유지된다
        expect(t.normalizedInput.length).toBe(t.input.length);

        const r = matchBest(buildQuery("stan"), t);
        expect(r).not.toBeNull();
        const ranges = buildMatchRanges([r!.indices], t);
        expect(ranges).toHaveLength(1);
        expect(t.input.slice(ranges[0].start, ranges[0].end)).toBe("stan");
    });

    it("İ 자체는 folding 되지 않은 원문으로 유지 (좌표계 우선)", () => {
        const t = preprocessTarget("İstanbul");
        // 길이 보존을 위해 İ 는 소문자화하지 않는다 — 'İ' 쿼리로는 매치, 'i' 로는 비매치가 일관 동작
        expect(matchBest(buildQuery("İ"), t)).not.toBeNull();
    });

    it("그리스어 Final Sigma 문맥 무관 folding — ΠΑΣ 타이핑 journey 단조성", () => {
        // toLowerCase 는 단어 끝 Σ 를 ς 로, 중간 Σ 를 σ 로 폴딩한다 (문맥 의존).
        // foldCase 가 ς→σ 로 통일하지 않으면 쿼리 "ΠΑΣ"(끝 Σ→ς)가 타겟 "παστα"(중간 σ)와
        // 어긋나 journey 중간에 결과가 사라진다.
        const t = preprocessTarget("ΠΑΣΤΑ");
        for (const q of ["Π", "ΠΑ", "ΠΑΣ", "ΠΑΣΤ", "ΠΑΣΤΑ"]) {
            expect(matchBest(buildQuery(q), t), `query "${q}"`).not.toBeNull();
        }
        expect(matchLiteral("ΠΑΣ", t)).not.toBeNull();
        expect(matchLiteral("λογος".toUpperCase(), preprocessTarget("λογος"))).not.toBeNull();
    });

    it("literal 세션 토큰과 matchLiteral 이 같은 folding 을 사용 (İ journey)", async () => {
        const { createSearcher } = await import("../src");
        const items = ["İstanbul", "istanbul-plain"];
        const s = createSearcher(items);
        s.search("I", { literal: true });
        const got = s.search("İ", { literal: true }).map((r) => r.item);
        const fresh = createSearcher(items)
            .search("İ", { literal: true })
            .map((r) => r.item);
        expect(got).toEqual(fresh);
        expect(got).toContain("İstanbul");
    });
});

describe("atomLens 오버플로 가드 (issue #24)", () => {
    it("grapheme 하나가 255 atoms 를 넘으면 RangeError", () => {
        const zalgo = `a${"́".repeat(300)}`; // combining acute 300개 → 단일 grapheme
        expect(() => preprocessTarget(zalgo)).toThrow(RangeError);
    });

    it("255 이하 결합문자는 정상 처리", () => {
        const ok = `a${"́".repeat(10)}`;
        const t = preprocessTarget(ok);
        expect(t.graphemeCount).toBe(1);
        expect(t.atomLens[0]).toBe(11);
    });
});

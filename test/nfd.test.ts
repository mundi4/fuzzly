import { describe, expect, it } from "vitest";
import { buildMatchRanges, buildQuery, createSearcher, matchBest, preprocessTarget } from "../src/index";
import { decomposeToAtoms } from "../src/internal/utils";

// issue #22: NFD(분해형) 한글 — macOS 파일명 등. grapheme 하나가 conjoining jamo code unit 여럿.
const nfd = (s: string) => s.normalize("NFD");

const WORDS = ["가나다", "각", "확장", "값", "딸기", "닭", "의자", "뷁", "읽기 전용"];

describe("NFD 한글 (issue #22)", () => {
    it("NFD 음절은 NFC 음절과 같은 atom 시퀀스를 낸다", () => {
        for (const word of WORDS) {
            for (const ch of word) {
                expect(Array.from(decomposeToAtoms(nfd(ch))), ch).toEqual(Array.from(decomposeToAtoms(ch)));
            }
        }
    });

    it("NFD 타겟의 atom/역할 배열이 NFC 타겟과 같다", () => {
        for (const word of WORDS) {
            const a = preprocessTarget(word);
            const b = preprocessTarget(nfd(word));
            expect(b.graphemeCount, word).toBe(a.graphemeCount);
            expect(Array.from(b.atomsFlat), word).toEqual(Array.from(a.atomsFlat));
            expect(Array.from(b.vowelIdxs), word).toEqual(Array.from(a.vowelIdxs));
            expect(Array.from(b.tailIdxs), word).toEqual(Array.from(a.tailIdxs));
            expect(Array.from(b.boundaryFlags), word).toEqual(Array.from(a.boundaryFlags));
        }
    });

    it("NFC 쿼리가 NFD 타겟에 NFC 타겟과 같은 결과로 매치된다", () => {
        const cases: [string, string][] = [
            ["가나", "가나다"],
            ["ㄱㄴ", "가나다"],
            ["확", "확장"],
            ["화", "확장"],
            ["갑", "값"],
            ["달", "닭"],
            ["읽ㄱ", "읽기 전용"],
        ];
        for (const [q, t] of cases) {
            const ref = matchBest(buildQuery(q), preprocessTarget(t));
            const got = matchBest(buildQuery(q), preprocessTarget(nfd(t)));
            expect(ref, `${q} → ${t}`).not.toBeNull();
            expect(got?.indices, `${q} → ${t}`).toEqual(ref?.indices);
            expect(got?.score, `${q} → ${t}`).toBe(ref?.score);
        }
    });

    it("NFD 쿼리도 NFC 타겟에 매치된다", () => {
        const ref = matchBest(buildQuery("확장"), preprocessTarget("확장 프로그램"));
        const got = matchBest(buildQuery(nfd("확장")), preprocessTarget("확장 프로그램"));
        expect(got?.indices).toEqual(ref?.indices);
        expect(got?.score).toBe(ref?.score);
        // 초성만 남는 버그였다면 "ㅎㅈ"로 매치됐을 타겟 — NFC 쿼리처럼 miss 여야 한다
        expect(matchBest(buildQuery("확장"), preprocessTarget("후진"))).toBeNull();
        expect(matchBest(buildQuery(nfd("확장")), preprocessTarget("후진"))).toBeNull();
    });

    it("하이라이트 range가 NFD cluster 전체(code unit 여럿)를 덮는다", () => {
        const input = nfd("확장 프로그램");
        const t = preprocessTarget(input);
        const r = matchBest(buildQuery("확장"), t);
        const ranges = buildMatchRanges([r?.indices ?? []], t);
        expect(ranges).toHaveLength(1);
        expect(input.slice(ranges[0].start, ranges[0].end)).toBe(nfd("확장"));
    });

    it("searcher: NFD 아이템을 순방향 타이핑으로 좁혀도 유지된다", () => {
        const items = ["보고서 초안.txt", "회의록.md", "읽기 전용 메모"].map(nfd);
        const s = createSearcher(items);
        for (const q of ["ㅇ", "이", "읽", "읽ㄱ", "읽기"]) {
            expect(
                s.search(q).map((r) => r.item),
                q,
            ).toContain(nfd("읽기 전용 메모"));
        }
    });

    it("완성형 + 분리 종성(LV+T) cluster도 종성을 잃지 않는다", () => {
        const lvt = "각"; // 가 + ᆨ
        expect(Array.from(decomposeToAtoms(lvt))).toEqual(Array.from(decomposeToAtoms("각")));
        expect(matchBest(buildQuery("각"), preprocessTarget(lvt))).not.toBeNull();
    });

    it("방점 같은 비자모 code unit이 종성으로 오인되지 않는다", () => {
        const toned = nfd("가") + "〮";
        const t = preprocessTarget(toned);
        expect(t.tailIdxs[0]).toBe(-1);
        expect(matchBest(buildQuery("가"), t, { strict: true })).not.toBeNull();
    });

    it("결합 악센트(NFD Latin)도 NFC 쿼리에 매치된다", () => {
        const t = preprocessTarget(nfd("café menu"));
        const r = matchBest(buildQuery("café"), t);
        expect(r).not.toBeNull();
        const ranges = buildMatchRanges([r?.indices ?? []], t);
        expect(t.input.slice(ranges[0].start, ranges[0].end)).toBe(nfd("café"));
    });

    it("단독 호환자모/conjoining 초성은 기존과 같다", () => {
        expect(Array.from(decomposeToAtoms("ㄱ"))).toEqual(Array.from(decomposeToAtoms("ᄀ")));
        expect(Array.from(decomposeToAtoms("ㄳ"))).toHaveLength(2);
    });
});

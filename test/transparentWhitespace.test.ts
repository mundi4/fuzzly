import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildMatchRanges,
    buildQuery,
    createGraphemeBonuses,
    createSearcher,
    matchBest,
    matchLiteral,
    PREPROCESS_VERSION,
    preprocessTarget,
    SCORING,
} from "../src/index";

const transparent = (input: string) => preprocessTarget(input, { whitespace: "transparent" });

describe("preprocessTarget whitespace: 'transparent'", () => {
    describe("기본값/하위호환 (keep)", () => {
        it("옵션 미지정 ≡ { whitespace: 'keep' } — 전 필드 deep-equal", () => {
            for (const input of ["a b", "수당 지급 규정", "  a  b  ", "", "a-b.c_d", "a\tb"]) {
                expect(preprocessTarget(input)).toEqual(preprocessTarget(input, { whitespace: "keep" }));
            }
        });

        it("keep 출력은 whitespace: 'keep' 으로 자기서술한다", () => {
            expect(preprocessTarget("a b").whitespace).toBe("keep");
            expect(preprocessTarget("a b", { whitespace: "keep" }).whitespace).toBe("keep");
        });

        it("keep 모드는 공백을 grapheme으로 방출한다 (기존 동작)", () => {
            const t = preprocessTarget("a b");
            expect(t.graphemeCount).toBe(3);
            expect(Array.from(t.charIndexes)).toEqual([0, 1, 2]);
        });

        it("transparent 출력은 whitespace: 'transparent' 로 자기서술한다", () => {
            expect(transparent("a b").whitespace).toBe("transparent");
        });
    });

    describe("파리티 항등식", () => {
        it("score(transparent('a b')) === score(keep('ab')) + BOUNDARY, runCount 동일", () => {
            const q = buildQuery("ab");
            const spaced = matchBest(q, transparent("a b"));
            const plain = matchBest(q, preprocessTarget("ab"));
            expect(spaced).not.toBeNull();
            expect(plain).not.toBeNull();
            // b가 boundary로 승격되는 것 외에 모든 축 동일 (graphemeCount도 2로 동일)
            expect(spaced?.score).toBe((plain?.score ?? 0) + SCORING.BOUNDARY);
            expect(spaced?.runCount).toBe(1);
            expect(plain?.runCount).toBe(1);
            expect(spaced?.indices).toEqual([0, 1]);
        });

        it("한글: score(transparent('수당 지급 규정')) === score(keep('수당지급규정')) + 2×BOUNDARY", () => {
            const q = buildQuery("수당지급규정");
            const spaced = matchBest(q, transparent("수당 지급 규정"));
            const plain = matchBest(q, preprocessTarget("수당지급규정"));
            expect(spaced).not.toBeNull();
            expect(plain).not.toBeNull();
            expect(spaced?.score).toBe((plain?.score ?? 0) + 2 * SCORING.BOUNDARY);
            expect(spaced?.runCount).toBe(1);
            expect(spaced?.indices).toEqual([0, 1, 2, 3, 4, 5]);
        });
    });

    describe("boundary 보존", () => {
        it("transparent 'a b'에서 b는 boundary", () => {
            const t = transparent("a b");
            expect(t.boundaryFlags[1]).toBe(1);
        });

        it("대조: 공백을 단순 제거한 'ab'에서는 b가 boundary 아님", () => {
            const t = preprocessTarget("ab");
            expect(t.boundaryFlags[1]).toBe(0);
        });
    });

    describe("좌표 매핑", () => {
        it("transparent 'a b' → graphemeCount 2, charIndexes [0,2], graphemeIndexes [0,1,1]", () => {
            const t = transparent("a b");
            expect(t.graphemeCount).toBe(2);
            expect(Array.from(t.charIndexes)).toEqual([0, 2]);
            expect(Array.from(t.graphemeIndexes)).toEqual([0, 1, 1]);
        });

        it("다중/선두/꼬리 공백: '  a  b  ' → 선두 → 0, 꼬리 → 마지막으로 클램프", () => {
            const t = transparent("  a  b  ");
            expect(t.graphemeCount).toBe(2);
            expect(Array.from(t.charIndexes)).toEqual([2, 5]);
            //                                          공백 공백 a  공백 공백 b  꼬리 꼬리
            expect(Array.from(t.graphemeIndexes)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
            expect(t.boundaryFlags[0]).toBe(1);
            expect(t.boundaryFlags[1]).toBe(1);
        });
    });

    describe("전량 공백/빈 입력", () => {
        it("'   ' → graphemeCount 0, graphemeIndexes 전부 0", () => {
            const t = transparent("   ");
            expect(t.graphemeCount).toBe(0);
            expect(Array.from(t.graphemeIndexes)).toEqual([0, 0, 0]);
        });

        it("비어있지 않은 쿼리의 matchBest → null", () => {
            expect(matchBest(buildQuery("a"), transparent("   "))).toBeNull();
        });

        it("literal ' ' → null (좌표 깨짐 가드)", () => {
            expect(matchLiteral(" ", transparent("   "))).toBeNull();
        });

        it("빈 입력 '' → graphemeCount 0", () => {
            expect(transparent("").graphemeCount).toBe(0);
        });
    });

    describe("투명화 범위는 U+0020 하나뿐", () => {
        it("탭/NBSP는 grapheme으로 방출된다", () => {
            expect(transparent("a\tb").graphemeCount).toBe(3);
            expect(transparent("a b").graphemeCount).toBe(3);
        });

        it("'_'/'-'/'.' 구분자도 방출된다", () => {
            expect(transparent("a-b").graphemeCount).toBe(3);
            expect(transparent("a_b").graphemeCount).toBe(3);
            expect(transparent("a.b").graphemeCount).toBe(3);
        });

        it("구분자 혼합: 'a - b' → [a, -, b] 3 graphemes, '-'와 b 모두 boundary", () => {
            const t = transparent("a - b");
            expect(t.graphemeCount).toBe(3);
            expect(Array.from(t.charIndexes)).toEqual([0, 2, 4]);
            expect(Array.from(t.boundaryFlags)).toEqual([1, 1, 1]);
        });
    });

    describe("하이라이트 정확성 (buildMatchRanges)", () => {
        it("transparent 'A B'에서 A만 매치 → 공백 미포함 [{0,1}]", () => {
            const t = transparent("A B");
            const r = matchBest(buildQuery("a"), t);
            expect(r).not.toBeNull();
            expect(buildMatchRanges([r?.indices ?? []], t)).toEqual([{ start: 0, end: 1 }]);
        });

        it("transparent 'A B'에서 AB 전체 매치 → 내부 공백 포함 단일 range [{0,3}]", () => {
            const t = transparent("A B");
            const r = matchBest(buildQuery("ab"), t);
            expect(r).not.toBeNull();
            expect(buildMatchRanges([r?.indices ?? []], t)).toEqual([{ start: 0, end: 3 }]);
        });

        it("꼬리 공백은 하이라이트에 포함되지 않는다", () => {
            const t = transparent("ab  ");
            const r = matchBest(buildQuery("ab"), t);
            expect(r).not.toBeNull();
            expect(buildMatchRanges([r?.indices ?? []], t)).toEqual([{ start: 0, end: 2 }]);
        });

        it("U+0020이 base인 방출 cluster(공백+결합문자)는 하이라이트에서 잘리지 않는다", () => {
            // " ̈" (U+0020 U+0308)는 단일 grapheme cluster — atoms가 2개라 투명화되지 않고 방출된다.
            const t = transparent("a ̈b");
            expect(t.graphemeCount).toBe(3);
            const r = matchBest(buildQuery("a ̈"), t);
            expect(r).not.toBeNull();
            expect(r?.indices).toEqual([0, 1]);
            // cluster 끝(offset 3)까지 포함 — base가 0x20이라는 이유로 잘리면 안 된다
            expect(buildMatchRanges([r?.indices ?? []], t)).toEqual([{ start: 0, end: 3 }]);
        });

        it("keep 모드 끝좌표는 기존 동작 그대로", () => {
            const t = preprocessTarget("a b");
            const r = matchBest(buildQuery("a"), t);
            expect(r).not.toBeNull();
            expect(buildMatchRanges([r?.indices ?? []], t)).toEqual([{ start: 0, end: 1 }]);
        });
    });

    describe("matchLiteral", () => {
        it("transparent 'a b'에 literal 'a b' → indices [0,1], 가짜 0 없음, ranges 정확", () => {
            const t = transparent("a b");
            const r = matchLiteral("a b", t);
            expect(r).not.toBeNull();
            expect(r?.indices).toEqual([0, 1]);
            expect(buildMatchRanges([r?.indices ?? []], t)).toEqual([{ start: 0, end: 3 }]);
        });
    });

    describe("createGraphemeBonuses 경계 번짐 방지", () => {
        it("공백에 걸친 range가 다음 단어로 bonus를 번지지 않는다", () => {
            const t = transparent("ab cd");
            // "ab " (끝이 공백) — 수축 없이는 공백 위치가 c(gi 2)로 매핑되어 번진다
            expect(createGraphemeBonuses(t, [{ start: 0, end: 3, bonus: 5 }])).toEqual([5, 5, 0, 0]);
            // " cd" (시작이 공백)
            expect(createGraphemeBonuses(t, [{ start: 2, end: 5, bonus: 5 }])).toEqual([0, 0, 5, 5]);
        });

        it("수축 결과가 빈 range면 skip", () => {
            const t = transparent("ab cd");
            expect(createGraphemeBonuses(t, [{ start: 2, end: 3, bonus: 5 }])).toEqual([0, 0, 0, 0]);
        });

        it("keep 모드 동작 불변", () => {
            const t = preprocessTarget("ab cd");
            expect(createGraphemeBonuses(t, [{ start: 0, end: 3, bonus: 5 }])).toEqual([5, 5, 5, 0, 0]);
        });

        it("U+0020이 base인 방출 cluster는 수축되지 않고 bonus를 받는다", () => {
            const t = transparent("a ̈b");
            // cluster " ̈"(grapheme 1)의 base 위치(1)를 정확히 가리키는 range
            expect(createGraphemeBonuses(t, [{ start: 1, end: 2, bonus: 5 }])).toEqual([0, 5, 0]);
        });
    });

    describe("createSearcher 통합 (targetWhitespace)", () => {
        const items = ["수당 지급 규정", "수당지급규정집"];

        it("keep(기본): 공백 있는 near-exact가 순위를 내준다", () => {
            const results = createSearcher(items).search("수당지급규정");
            expect(results.map((r) => r.item)).toEqual(["수당지급규정집", "수당 지급 규정"]);
        });

        it("transparent: 순위가 뒤집혀 공백 있는 near-exact가 이긴다", () => {
            const results = createSearcher(items, { targetWhitespace: "transparent" }).search("수당지급규정");
            expect(results.map((r) => r.item)).toEqual(["수당 지급 규정", "수당지급규정집"]);
        });

        it("키스트로크 시퀀스(prefix 성장 + 백스페이스)에서 세션 재사용 == fresh searcher", () => {
            const seqItems = ["수당 지급 규정", "수당지급규정집", "무관한 것"];
            const opts = { targetWhitespace: "transparent" as const };
            const searcher = createSearcher(seqItems, opts);
            const seq = ["ㅅ", "수", "수ㄷ", "수당", "수당ㅈ", "수당지", "수당지급", "수당지", "수당", "수"];
            for (const q of seq) {
                const got = searcher.search(q).map((r) => r.item);
                const fresh = createSearcher(seqItems, opts)
                    .search(q)
                    .map((r) => r.item);
                expect(got, `step "${q}"`).toEqual(fresh);
            }
        });

        it("멀티필드 searcher에도 targetWhitespace가 적용된다", () => {
            const fieldItems = [{ title: "수당 지급 규정" }, { title: "수당지급규정집" }];
            const results = createSearcher(fieldItems, {
                fields: [{ key: (i) => i.title }],
                targetWhitespace: "transparent",
            }).search("수당지급규정");
            expect(results.map((r) => r.item.title)).toEqual(["수당 지급 규정", "수당지급규정집"]);
        });
    });

    describe("dev 경고", () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("preserve 쿼리(공백 포함) × transparent 타겟 → warn 1회 (warn-once)", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const q = buildQuery("a b", { whitespace: "preserve" });
            const t = transparent("a b");
            expect(matchBest(q, t)).toBeNull();
            expect(matchBest(q, t)).toBeNull();
            const calls = warn.mock.calls.filter((c) => String(c[0]).includes("transparent"));
            expect(calls.length).toBe(1);
        });

        it("search()에 targetWhitespace를 넘기면 위치 오용 경고", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const searcher = createSearcher(["a"]);
            searcher.search("a", { targetWhitespace: "transparent" } as never);
            const calls = warn.mock.calls.filter((c) => String(c[0]).includes("targetWhitespace"));
            expect(calls.length).toBe(1);
            expect(String(calls[0][0])).toContain("createSearcher");
        });
    });

    describe("버전", () => {
        it("PREPROCESS_VERSION === 3", () => {
            expect(PREPROCESS_VERSION).toBe(3);
        });
    });
});

import { describe, expect, it } from "vitest";
import { buildQuery, createSearcher, matchBest, preprocessTarget } from "../src/index";

describe("split 모드 - buildQuery", () => {
    it("공백 boundary로 sub-query 분리", () => {
        const q = buildQuery("제목 멋진", { whitespace: "split" });
        expect(q.whitespace).toBe("split");
        expect(q.subQueries).toBeDefined();
        expect(q.subQueries?.length).toBe(2);
        expect(q.graphemes).toEqual([]);
        expect(q.atoms).toBe("");
    });

    it("탭/개행도 boundary로 인식", () => {
        const q = buildQuery("a\tb\nc", { whitespace: "split" });
        expect(q.subQueries?.length).toBe(3);
    });

    it("양 끝 공백 trim + 빈 토큰 제거", () => {
        const q = buildQuery("   제목   멋진   ", { whitespace: "split" });
        expect(q.subQueries?.length).toBe(2);
    });

    it("입력 전체가 공백이면 빈 Query", () => {
        const q = buildQuery("   ", { whitespace: "split" });
        expect(q.subQueries).toBeUndefined();
        expect(q.graphemes).toEqual([]);
    });

    it("dedup — 동일 토큰", () => {
        const q = buildQuery("안녕 안녕", { whitespace: "split" });
        expect(q.subQueries?.length).toBe(1);
    });

    it("dedup — atom-prefix (짧은 쪽 제거, 긴 쪽 유지)", () => {
        const q = buildQuery("안녕 안", { whitespace: "split" });
        expect(q.subQueries?.length).toBe(1);
        // 긴 쪽 (안녕) 유지
        const reference = buildQuery("안녕", { whitespace: "ignore" });
        expect(q.subQueries?.[0].atoms).toBe(reference.atoms);
    });

    it("dedup — 'a ab' → 'ab'", () => {
        const q = buildQuery("a ab", { whitespace: "split" });
        expect(q.subQueries?.length).toBe(1);
        expect(q.subQueries?.[0].input).toBe("ab");
    });

    it("dedup — 초성 토큰이 완성형의 atom-prefix", () => {
        const q = buildQuery("ㅇㄴ 안녕", { whitespace: "split" });
        // '안녕' atoms = ㅇㅏㄴㅇㅕㅇ, 'ㅇㄴ' atoms = ㅇㄴ
        // 'ㅇㄴ' 가 '안녕' 의 prefix 아님 → dedup 안 됨, 둘 다 유지
        expect(q.subQueries?.length).toBe(2);
    });

    it("dedup — '안 안녕'", () => {
        // '안' atoms = ㅇㅏㄴ, '안녕' atoms = ㅇㅏㄴㅇㅕㅇ → 안 은 안녕 의 prefix → 안 제거
        const q = buildQuery("안 안녕", { whitespace: "split" });
        expect(q.subQueries?.length).toBe(1);
        const reference = buildQuery("안녕", { whitespace: "ignore" });
        expect(q.subQueries?.[0].atoms).toBe(reference.atoms);
    });

    it("non-split 모드 zero overhead — subQueries 미정의", () => {
        const ig = buildQuery("ab cd", { whitespace: "ignore" });
        const pre = buildQuery("ab cd", { whitespace: "preserve" });
        expect(ig.subQueries).toBeUndefined();
        expect(pre.subQueries).toBeUndefined();
    });

    it("split 모드 outer는 prefix reuse 자동 비활성 (atoms === '')", () => {
        const q = buildQuery("제목 멋진", { whitespace: "split" });
        expect(q.atoms).toBe("");
    });
});

describe("split 모드 - 매칭 동작", () => {
    it("순서 뒤집힘 — query 순서가 target 과 달라도 hit", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const q = buildQuery("제목 멋진", { whitespace: "split" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
        // indices union 에 '멋진' 과 '제목' 위치 모두 포함
        expect(r!.indices.length).toBeGreaterThanOrEqual(4);
    });

    it("순서 무관 — 두 토큰 순서 바뀌어도 동일 결과", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const a = matchBest(buildQuery("제목 멋진", { whitespace: "split" }), t);
        const b = matchBest(buildQuery("멋진 제목", { whitespace: "split" }), t);
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(a!.indices).toEqual(b!.indices);
        expect(a!.score).toBe(b!.score);
    });

    it("하나라도 매치 실패 → null", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const q = buildQuery("제목 없는단어", { whitespace: "split" });
        const r = matchBest(q, t);
        expect(r).toBeNull();
    });

    it("IME 중간 단계 토큰", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const q = buildQuery("제 멋", { whitespace: "split" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
    });

    it("초성 토큰 혼용", () => {
        const t = preprocessTarget("멋진 제목");
        const q = buildQuery("ㅈㅁ ㅁㅈ", { whitespace: "split" });
        const r = matchBest(q, t);
        expect(r).not.toBeNull();
    });

    it("빈 토큰 robustness — 양 끝 공백·연속 공백 무시", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const a = matchBest(buildQuery(" 제목 멋진 ", { whitespace: "split" }), t);
        const b = matchBest(buildQuery("제목 멋진", { whitespace: "split" }), t);
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(a!.indices).toEqual(b!.indices);
        expect(a!.score).toBe(b!.score);
    });

    it("단일 토큰 fallback — 공백 0개는 'ignore' 와 동등", () => {
        const t = preprocessTarget("멋진 제목입니다");
        const split = matchBest(buildQuery("제목", { whitespace: "split" }), t);
        const ignore = matchBest(buildQuery("제목", { whitespace: "ignore" }), t);
        expect(split).not.toBeNull();
        expect(ignore).not.toBeNull();
        expect(split!.indices).toEqual(ignore!.indices);
        expect(split!.score).toBe(ignore!.score);
    });

    it("dedup 후 단일 토큰 — '안녕 안녕' 이 '안녕' (ignore) 과 동등", () => {
        const t = preprocessTarget("안녕하세요");
        const split = matchBest(buildQuery("안녕 안녕", { whitespace: "split" }), t);
        const ignore = matchBest(buildQuery("안녕", { whitespace: "ignore" }), t);
        expect(split).not.toBeNull();
        expect(ignore).not.toBeNull();
        expect(split!.indices).toEqual(ignore!.indices);
        expect(split!.score).toBe(ignore!.score);
        expect(split!.boundaryHits).toBe(ignore!.boundaryHits);
        expect(split!.runCount).toBe(ignore!.runCount);
        expect(split!.startsAtZero).toBe(ignore!.startsAtZero);
    });

    it("dedup atom-prefix — '안녕 안' 이 '안녕' 과 동등", () => {
        const t = preprocessTarget("안녕하세요");
        const split = matchBest(buildQuery("안녕 안", { whitespace: "split" }), t);
        const ignore = matchBest(buildQuery("안녕", { whitespace: "ignore" }), t);
        expect(split).not.toBeNull();
        expect(split!.indices).toEqual(ignore!.indices);
        expect(split!.score).toBe(ignore!.score);
    });

    it("dedup 'a ab' 이 'ab' 와 동등", () => {
        const t = preprocessTarget("xabcd");
        const split = matchBest(buildQuery("a ab", { whitespace: "split" }), t);
        const ignore = matchBest(buildQuery("ab", { whitespace: "ignore" }), t);
        expect(split).not.toBeNull();
        expect(split!.indices).toEqual(ignore!.indices);
        expect(split!.score).toBe(ignore!.score);
    });

    it("indices 는 union sort dedup", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const r = matchBest(buildQuery("제목 멋진", { whitespace: "split" }), t);
        expect(r).not.toBeNull();
        // 정렬 검증
        const sorted = [...r!.indices].sort((a, b) => a - b);
        expect(r!.indices).toEqual(sorted);
        // dedup 검증
        const dedup = [...new Set(r!.indices)];
        expect(r!.indices).toEqual(dedup);
    });
});

describe("split 모드 - 모드 격리", () => {
    it("같은 query 가 preserve / ignore / split 별로 다른 결과", () => {
        const t = preprocessTarget("이것은 멋진 제목입니다");
        const preserve = matchBest(buildQuery("제목 멋진", { whitespace: "preserve" }), t);
        const ignore = matchBest(buildQuery("제목 멋진", { whitespace: "ignore" }), t);
        const split = matchBest(buildQuery("제목 멋진", { whitespace: "split" }), t);

        // preserve: target 에 '제목 멋진' literal 시퀀스 없음 → null
        expect(preserve).toBeNull();
        // ignore: '제목멋진' 으로 합쳐서 order-preserving 매치 시도. target 은 '멋진 제목' 순서라 fail.
        expect(ignore).toBeNull();
        // split: 순서 무관 AND → hit
        expect(split).not.toBeNull();
    });
});

describe("split 모드 - createSearcher 통합", () => {
    it("searcher.search 경유 split 매치", () => {
        const searcher = createSearcher(["이것은 멋진 제목입니다", "다른 노트", "또 다른 멋진 글"]);
        const r = searcher.search("제목 멋진", { whitespace: "split" });
        expect(r.length).toBe(1);
        expect(r[0].item).toBe("이것은 멋진 제목입니다");
    });

    it("ranges() 가 union sort dedup 으로 산출", () => {
        const searcher = createSearcher(["이것은 멋진 제목입니다"]);
        const r = searcher.search("제목 멋진", { whitespace: "split" });
        expect(r.length).toBe(1);
        const ranges = r[0].ranges();
        // 두 토큰 매치 위치가 모두 포함, 정렬됨
        expect(ranges.length).toBeGreaterThanOrEqual(1);
        for (let i = 1; i < ranges.length; i++) {
            expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
        }
    });

    it("세션 캐시 — split → ignore 전환 시 reset", () => {
        const searcher = createSearcher(["멋진 제목", "다른 노트"]);
        const r1 = searcher.search("제목 멋진", { whitespace: "split" });
        expect(r1.map((x) => x.item)).toEqual(["멋진 제목"]);

        // ignore 모드로 전환 — '제목멋진' 합쳐 order-preserving → '멋진 제목' 에선 fail
        const r2 = searcher.search("제목 멋진", { whitespace: "ignore" });
        expect(r2.length).toBe(0);
    });
});

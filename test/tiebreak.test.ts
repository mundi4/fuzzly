import { describe, expect, it } from "vitest";
import { createSearcher } from "../src/index";
import type { MultiFieldSearcherOptions } from "../src/types";

interface Row {
    label: string;
    order: number;
}

describe("tiebreakKey (issue #38)", () => {
    it("no-limit: score 동점이면 tiebreakKey asc 로 결정적 정렬", () => {
        // 동일 문자열 → score 동점. 삽입 순서는 order 와 무관하게 섞여 있다.
        const rows: Row[] = [
            { label: "same", order: 3 },
            { label: "same", order: 1 },
            { label: "same", order: 2 },
        ];
        const s = createSearcher(rows, { key: (r) => r.label, tiebreakKey: (r) => r.order });
        const r = s.search("same");
        expect(r.map((x) => x.item.order)).toEqual([1, 2, 3]);
    });

    it("limit=k<N: eviction 판정에 tie 포함 (order 역순 삽입 → 최소 k개 asc)", () => {
        // order 를 역순(5,4,3,2,1)으로 삽입한다. score-only eviction shortcut 이 남아 있으면
        // heap 이 먼저 들어온 order 5,4 를 붙잡아 결과가 [4,5] 가 되어 실패한다.
        // tie-aware eviction 은 더 작은 tie(order) 후보가 root 를 밀어내 order 최소 k개를 남긴다.
        const N = 5;
        const rows: Row[] = [];
        for (let o = N; o >= 1; o--) rows.push({ label: "same", order: o });

        const s = createSearcher(rows, { key: (r) => r.label, tiebreakKey: (r) => r.order });
        const k = 2;
        const r = s.search("same", { limit: k });
        expect(r.map((x) => x.item.order)).toEqual([1, 2]);
    });

    it("score 가 다르면 tiebreakKey 는 무시 (score desc 우선)", () => {
        // "안녕" 완전 매치가 "안녕하세요" 부분 매치보다 score 상위.
        // 큰 tie(100)를 가진 "안녕" 이 작은 tie(1)를 이겨야 한다 (score 우선).
        const rows: Row[] = [
            { label: "안녕", order: 100 },
            { label: "안녕하세요", order: 1 },
        ];
        const s = createSearcher(rows, { key: (r) => r.label, tiebreakKey: (r) => r.order });
        const r = s.search("안녕");
        expect(r).toHaveLength(2);
        expect((r[0].score ?? 0) > (r[1].score ?? 0)).toBe(true);
        expect(r[0].item.label).toBe("안녕");
    });

    it("미지정 시 기존 동작: score 동점은 삽입 순서 유지 (no-limit stable sort)", () => {
        const rows: Row[] = [
            { label: "same", order: 3 },
            { label: "same", order: 1 },
            { label: "same", order: 2 },
        ];
        const s = createSearcher(rows, { key: (r) => r.label });
        const r = s.search("same");
        expect(r.map((x) => x.item.order)).toEqual([3, 1, 2]);
    });

    it("멀티필드 smoke: tiebreakKey 로 score 동점 결정적 정렬", () => {
        interface Doc {
            title: string;
            creator: string;
            order: number;
        }
        const docs: Doc[] = [
            { title: "same", creator: "x", order: 2 },
            { title: "same", creator: "y", order: 1 },
        ];
        const opts: MultiFieldSearcherOptions<Doc> = {
            fields: [{ key: (d) => d.title }],
            whitespace: "split",
            tiebreakKey: (d) => d.order,
        };
        const s = createSearcher(docs, opts);
        const r = s.search("same");
        expect(r.map((x) => x.item.order)).toEqual([1, 2]);
    });
});

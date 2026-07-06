import { describe, expect, it } from "vitest";
import { createSearcher, preprocessTarget } from "../src/index";
import type { MultiFieldSearcherOptions } from "../src/types";

interface Doc {
    title: string;
    creator: string;
}

const DOCS: Doc[] = [
    { title: "부동산 임대차 계약서 검토", creator: "홍길동" },
    { title: "멋진 제목", creator: "김철수" },
    { title: "홍보 자료", creator: "이영희" },
];

const multiOpts: MultiFieldSearcherOptions<Doc> = {
    fields: [{ key: (d) => d.title }, { key: (d) => d.creator, weight: 1.2 }],
    whitespace: "split",
};

describe("createSearcher 멀티필드", () => {
    it("1. 크로스필드 검색: 토큰이 서로 다른 필드로 귀속", () => {
        const s = createSearcher(DOCS, multiOpts);
        const r = s.search("홍길동 계약서");
        expect(r).toHaveLength(1);
        expect(r[0].item.creator).toBe("홍길동");
        // creator(필드 1) 에 "홍길동" 토큰 귀속 → 전체 grapheme 커버
        expect(r[0].fields[1].result?.indices).toEqual([0, 1, 2]);
        expect(r[0].fields[1].ranges()).toEqual([{ start: 0, end: 3 }]);
        // title(필드 0) 에는 "계약서" 토큰 귀속
        expect(r[0].fields[0].result).not.toBeNull();
        expect(r[0].fields[0].ranges().length).toBeGreaterThan(0);
    });

    it("2. weight: creator 완전 매치가 title 부분 매치보다 상위", () => {
        const items: Doc[] = [
            { title: "무관한제목", creator: "계약왕" }, // creator 로 매치
            { title: "계약서 작성", creator: "무관" }, // title 로 매치
        ];
        const s = createSearcher(items, {
            fields: [{ key: (d) => d.title }, { key: (d) => d.creator, weight: 10 }],
            whitespace: "split",
        });
        const r = s.search("계약");
        expect(r).toHaveLength(2);
        expect(r[0].item.creator).toBe("계약왕"); // weight 10 필드로 매치된 쪽이 상위
    });

    it("3. 세션 narrowing: 재사용 경로가 fresh 와 동일 + scoring 캐시 (issue #37)", () => {
        let calls = 0;
        const scoring = () => {
            calls++;
            return {};
        };
        const s = createSearcher(DOCS, { ...multiOpts, scoring });
        const F = 2; // 필드 수 — 멀티필드는 entry당 필드 target마다 1회 resolve
        expect(calls).toBe(DOCS.length * F); // 생성 시 캐시 (매 검색 아님)

        s.search("홍");
        const r2 = s.search("홍길동"); // "홍" atom-prefix → 세션 재사용
        expect(calls).toBe(DOCS.length * F); // 검색은 scoring 을 재호출하지 않는다

        // 재사용 경로가 fresh searcher 와 동일 결과 (reuse-corruption 회귀 방어)
        const fresh = createSearcher(DOCS, multiOpts).search("홍길동");
        expect(r2.map((r) => r.item)).toEqual(fresh.map((r) => r.item));
    });

    it("4. per-field prebuilt target hydrate 경로", () => {
        const s = createSearcher(DOCS, {
            fields: [{ target: (d) => preprocessTarget(d.title) }, { target: (d) => preprocessTarget(d.creator) }],
            whitespace: "split",
        });
        const r = s.search("홍길동 계약서");
        expect(r).toHaveLength(1);
        expect(r[0].item.creator).toBe("홍길동");
    });

    it("5. 검증 에러 (fail fast)", () => {
        expect(() => createSearcher(DOCS, { fields: [{ key: (d) => d.title }], key: (d) => d.title } as never)).toThrow(
            TypeError,
        );
        expect(() => createSearcher(DOCS, { fields: [] })).toThrow(TypeError);
        expect(() => createSearcher(DOCS, { fields: [{}] })).toThrow(TypeError);
        expect(() => createSearcher(DOCS, { fields: [{ key: (d) => d.title, weight: 0 }] })).toThrow(RangeError);
        expect(() => createSearcher(DOCS, { fields: [{ key: (d) => d.title, weight: -1 }] })).toThrow(RangeError);
    });

    it("6. search() 에 fields 전달 시 dev 경고", () => {
        const original = console.warn;
        const warnings: string[] = [];
        console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
        try {
            const s = createSearcher(DOCS, multiOpts);
            s.search("홍", { fields: [] } as never);
        } finally {
            console.warn = original;
        }
        expect(warnings.some((w) => w.includes("'fields'"))).toBe(true);
        expect(warnings.some((w) => w.includes("createSearcher"))).toBe(true);
    });

    it("7. literal 멀티필드: any-field substring, 해당 필드만 non-null", () => {
        const s = createSearcher(DOCS, multiOpts);
        const r = s.search("계약", { literal: true });
        expect(r).toHaveLength(1);
        expect(r[0].item.title).toContain("계약");
        expect(r[0].fields[0].result).not.toBeNull(); // title 에 substring
        expect(r[0].fields[1].result).toBeNull(); // creator 에는 없음
        expect(r[0].score).toBe(0); // literal 은 스코어 없음
    });

    it("8. limit: 멀티필드 score 상위 N", () => {
        const s = createSearcher(DOCS, multiOpts);
        const all = s.search("홍");
        const limited = s.search("홍", { limit: 1 });
        expect(limited).toHaveLength(1);
        expect(limited[0].item).toEqual(all[0].item); // 최상위 동일
    });

    it("9. add/replaceAll 후 세션 리셋 + 재검색 정확성", () => {
        const s = createSearcher<Doc>([], multiOpts);
        expect(s.search("홍길동 계약서")).toHaveLength(0);

        s.add(DOCS[0]);
        expect(s.search("홍길동 계약서")).toHaveLength(1);

        s.replaceAll([DOCS[1], DOCS[2]]);
        expect(s.search("홍길동 계약서")).toHaveLength(0);
        expect(s.search("제목")).toHaveLength(1);
        expect(s.search("제목")[0].item.title).toBe("멋진 제목");
    });

    it("10. 순방향 타이핑 단조 narrowing: 각 단계가 직전의 부분집합 (issue #36)", () => {
        // id1 은 title 로만 "판결"에 관련, id2 는 name 이 ㅍ 으로 시작.
        // 예전 chosung:false gate 는 "ㅍ"→"파" 전이에서 title 을 un-gate 해 매치 집합을 키웠다.
        // 옵션 제거로 gate 자체가 사라져 순방향 타이핑은 단조 축소만 한다.
        const docs = [
            { id: 1, title: "판결이 동일한", name: "아무개" },
            { id: 2, title: "무관한 제목", name: "표범수" },
        ];
        const opts: MultiFieldSearcherOptions<(typeof docs)[number]> = {
            fields: [{ key: (d) => d.title }, { key: (d) => d.name }],
            whitespace: "split",
        };

        const s = createSearcher(docs, opts);
        const idSets = ["ㅍ", "파", "판", "판결"].map((q) =>
            s
                .search(q)
                .map((r) => r.item.id)
                .sort(),
        );

        // 모든 단계에서 결과 id 집합이 직전 단계의 부분집합 (단조 축소)
        for (let i = 1; i < idSets.length; i++) {
            const prev = new Set(idSets[i - 1]);
            expect(idSets[i].every((id) => prev.has(id))).toBe(true);
        }

        // 최종 결과가 fresh searcher 의 search("판결") 과 동일 (세션 재사용 경로 정확성)
        const fresh = createSearcher(docs, opts)
            .search("판결")
            .map((r) => r.item.id)
            .sort();
        expect(idSets.at(-1)).toEqual(fresh);
        expect(fresh).toEqual([1]);
    });

    it("11. scoring config 캐시: entry당 필드마다 1회, 검색은 재호출 안 함 (issue #37)", () => {
        let calls = 0;
        const scoring = () => {
            calls++;
            return {};
        };
        const F = 2; // multiOpts 는 2필드
        const s = createSearcher(DOCS, { ...multiOpts, scoring });
        expect(calls).toBe(DOCS.length * F); // N items × F fields → N×F회

        s.search("홍");
        s.search("계약");
        expect(calls).toBe(DOCS.length * F); // search 후 증가 없음

        s.add({ title: "추가 문서", creator: "저자" });
        expect(calls).toBe((DOCS.length + 1) * F); // add → +F

        s.replaceAll([DOCS[0]]);
        expect(calls).toBe((DOCS.length + 1) * F + 1 * F); // replaceAll(M) → +M×F
    });
});

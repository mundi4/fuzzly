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
    fields: [{ key: (d) => d.title }, { key: (d) => d.creator, weight: 1.2, chosung: true }],
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

    it("3. 세션 narrowing: 두 번째 스캔이 첫 매치로 좁혀짐", () => {
        let calls = 0;
        const scoring = () => {
            calls++;
            return {};
        };
        const s = createSearcher(DOCS, { ...multiOpts, scoring });
        const F = 2; // 필드 수 — matchFields 는 필드당 1회 scoring resolve

        const r1 = s.search("홍");
        const afterFirst = calls;
        expect(afterFirst).toBe(DOCS.length * F);

        s.search("홍길동"); // "홍" atom-prefix → 재사용
        const secondScans = (calls - afterFirst) / F;
        expect(secondScans).toBe(r1.length);
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
});

import { describe, expect, it } from "vitest";
import { createSearcher } from "../src/index";

// scan 커서: incremental/cancellable 스캔, 정확한 total, per-call filter.

describe("scan cursor", () => {
    describe("등가성 (scan ≡ search)", () => {
        it("동일 쿼리에서 scan().next() + results() ≡ search()", () => {
            const items = ["안녕하세요", "반갑습니다", "안녕히가세요", "안부"];
            const searcher = createSearcher(items);

            const cursor = searcher.scan("안");
            expect(cursor.next()).toBe(true);
            const viaScan = cursor.results().map((r) => r.item);

            const fresh = createSearcher(items);
            const viaSearch = fresh.search("안").map((r) => r.item);

            expect(viaScan).toEqual(viaSearch);
        });

        it("limit 적용 시에도 등가", () => {
            const items = ["가가", "가나", "가다", "가라", "가마"];
            const a = createSearcher(items).scan("가", { limit: 3 });
            a.next();
            const b = createSearcher(items).search("가", { limit: 3 });
            expect(a.results().map((r) => r.item)).toEqual(b.map((r) => r.item));
        });
    });

    describe("budget 진행", () => {
        it("next(2) 반복 시 processed 단조 증가, 완료 전 done=false", () => {
            const items = ["가", "나", "다", "라", "마", "바", "사"];
            const searcher = createSearcher(items);
            const cursor = searcher.scan("");

            expect(cursor.scanSize).toBe(7);
            expect(cursor.done).toBe(false);
            expect(cursor.processed).toBe(0);

            expect(cursor.next(2)).toBe(false);
            expect(cursor.processed).toBe(2);
            expect(cursor.done).toBe(false);

            expect(cursor.next(2)).toBe(false);
            expect(cursor.processed).toBe(4);

            expect(cursor.next(2)).toBe(false);
            expect(cursor.processed).toBe(6);

            // 마지막 청크가 scanSize 를 넘겨도 clamp.
            expect(cursor.next(2)).toBe(true);
            expect(cursor.processed).toBe(7);
            expect(cursor.done).toBe(true);
            expect(cursor.processed).toBe(cursor.scanSize);
        });

        it("done 이후 next() 는 계속 true, processed 불변", () => {
            const searcher = createSearcher(["가", "나"]);
            const cursor = searcher.scan("");
            expect(cursor.next()).toBe(true);
            const p = cursor.processed;
            expect(cursor.next()).toBe(true);
            expect(cursor.next(100)).toBe(true);
            expect(cursor.processed).toBe(p);
        });

        it("budget 생략 시 끝까지 평가", () => {
            const searcher = createSearcher(["가", "나", "다"]);
            const cursor = searcher.scan("");
            expect(cursor.next()).toBe(true);
            expect(cursor.processed).toBe(3);
        });

        it("음수 budget 은 no-op(0)으로 클램프 — position 이 뒤로 가지 않음", () => {
            const searcher = createSearcher(["가", "나", "다"]);
            const cursor = searcher.scan("");
            cursor.next(2);
            expect(cursor.processed).toBe(2);
            // 음수 budget: 진행 없이 false, position 불변 (end < position 로 인한 회귀 없음).
            expect(cursor.next(-5)).toBe(false);
            expect(cursor.processed).toBe(2);
            expect(cursor.next()).toBe(true);
            expect(cursor.processed).toBe(3);
        });
    });

    describe("total (정확한 전체 매치 수)", () => {
        it("limit 로 잘려도 total 은 전체 매치 수", () => {
            const items = ["가1", "가2", "가3", "가4", "가5", "나1"];
            const searcher = createSearcher(items);
            const cursor = searcher.scan("가", { limit: 2 });
            cursor.next();

            expect(cursor.results()).toHaveLength(2);
            expect(cursor.total).toBe(5);
        });

        it("prefix 확장으로 세션 재사용된 후에도 total 이 fresh 와 동일", () => {
            const items = ["가나다", "가나라", "가마", "나가"];
            const searcher = createSearcher(items);

            // 먼저 "가" 로 세션 형성 (가나다·가나라·가마·나가 = 4건).
            const c1 = searcher.scan("가", { limit: 1 });
            c1.next();
            expect(c1.total).toBe(4);

            // "가나" 로 확장 → 세션 재사용, 매치 2건.
            const c2 = searcher.scan("가나", { limit: 1 });
            c2.next();
            expect(c2.total).toBe(2);

            const fresh = createSearcher(items).scan("가나", { limit: 1 });
            fresh.next();
            expect(c2.total).toBe(fresh.total);
        });

        it("done 전 total 은 지금까지 발견한 매치 수 (단조 증가)", () => {
            const items = ["가1", "가2", "가3", "가4"];
            const searcher = createSearcher(items);
            const cursor = searcher.scan("가");

            cursor.next(1);
            const t1 = cursor.total;
            cursor.next(1);
            expect(cursor.total).toBeGreaterThanOrEqual(t1);
            cursor.next();
            expect(cursor.total).toBe(4);
        });
    });

    describe("results() 부분 snapshot", () => {
        it("done 전 results() 는 현재까지의 top-N snapshot, 완료 후 확정", () => {
            const items = ["가1", "가2", "가3"];
            const searcher = createSearcher(items);
            const cursor = searcher.scan("가");

            cursor.next(1);
            expect(cursor.results().length).toBeGreaterThanOrEqual(1);
            expect(cursor.results().length).toBeLessThanOrEqual(1);

            cursor.next();
            expect(cursor.results()).toHaveLength(3);
        });

        it("results() 호출이 진행 중 heap 불변식을 훼손하지 않음 (in-place sort 회귀 감지)", () => {
            // 서로 다른 score 를 갖도록 "가" 의 매치 위치를 벌린다: 낮은 점수 둘이 먼저 heap 을 채우고,
            // mid-scan results() 후에 높은 점수가 들어와 heap-worst 를 evict 해야 한다.
            // results() 가 live heap 을 in-place sort 하면 root 가 top-N 최악이 아니게 되어 eviction 이 틀어진다.
            const lowLow = "다다다가"; // 가 at idx3 — 최저 점수
            const low = "나가"; // 가 at idx1 — 중간 점수
            const high = "가"; // 가 at idx0 — 최고 점수 (positionZero)
            const items = [lowLow, low, high];
            const searcher = createSearcher(items);

            // fresh 기준: top-2 는 {high, low}, lowLow 는 탈락.
            const fresh = createSearcher(items)
                .search("가", { limit: 2 })
                .map((r) => r.item);
            expect(fresh).toEqual([high, low]);

            const cursor = searcher.scan("가", { limit: 2 });
            cursor.next(2); // heap = {lowLow, low} (가득 참)
            cursor.results(); // 미완료 스냅샷 — heap 을 in-place sort 하면 이후 evict 가 깨진다.
            cursor.next(); // high 진입 → heap-worst(lowLow) evict

            const got = cursor.results().map((r) => r.item);
            expect(got).toEqual(fresh); // in-place sort 회귀면 lowLow 대신 low 가 잘못 탈락해 불일치
            expect(got).not.toContain(lowLow);
        });
    });

    describe("abort 무해성", () => {
        it("절반만 진행하고 버린 커서는 세션을 오염시키지 않음", () => {
            // "가나" 매처(가나다·가나라)를 aborted prefix(첫 2개) **바깥**에 배치한다.
            // 만약 중단된 scan("가") 가 부분 매치 {가마,가바}=인덱스{0,1}를 잘못 커밋하면,
            // 이어지는 search("가나") 가 그 집합만 재스캔해 실제 매처를 DROP → fresh 와 불일치.
            const items = ["가마", "가바", "가나다", "가나라", "나다"];
            const searcher = createSearcher(items);

            // scan("가") 를 절반만(가마·가바) 진행하고 버림 — 이 둘은 "가나" 를 매치하지 않는다.
            const aborted = searcher.scan("가");
            aborted.next(2);
            expect(aborted.done).toBe(false);

            // 이어지는 search("가나") 는 fresh 와 동일해야 한다 (부분 스캔 미커밋 → full scan).
            const viaAborted = searcher.search("가나").map((r) => r.item);
            const fresh = createSearcher(items)
                .search("가나")
                .map((r) => r.item);
            expect(viaAborted).toEqual(fresh);
            expect(viaAborted.sort()).toEqual(["가나다", "가나라"]);
        });

        it("완료된 커서만 세션에 커밋된다", () => {
            const items = ["가1", "가2", "나가"];
            const searcher = createSearcher(items);

            // 완료된 스캔은 커밋 → 후속 prefix 재사용.
            const done = searcher.scan("가");
            done.next();
            expect(done.done).toBe(true);

            const after = searcher.search("가1").map((r) => r.item);
            const fresh = createSearcher(items)
                .search("가1")
                .map((r) => r.item);
            expect(after).toEqual(fresh);
        });
    });

    describe("filter", () => {
        type Item = { name: string; group: string };
        const items: Item[] = [
            { name: "가나다", group: "a" },
            { name: "가나라", group: "b" },
            { name: "가마바", group: "a" },
            { name: "가사아", group: "b" },
        ];

        it("filter 적용 시 결과·total 정확", () => {
            const searcher = createSearcher(items, { key: (i) => i.name });
            const onlyA = (i: Item) => i.group === "a";

            const cursor = searcher.scan("가", { filter: onlyA });
            cursor.next();

            expect(cursor.total).toBe(2);
            expect(
                cursor
                    .results()
                    .map((r) => r.item.name)
                    .sort(),
            ).toEqual(["가나다", "가마바"]);
        });

        it("동일 참조 유지한 prefix 시퀀스 = fresh 와 동일 (재사용 경로 정확성)", () => {
            const onlyA = (i: Item) => i.group === "a";
            const searcher = createSearcher(items, { key: (i) => i.name });

            searcher.search("가", { filter: onlyA });
            const reused = searcher.search("가나", { filter: onlyA }).map((r) => r.item.name);

            const fresh = createSearcher(items, { key: (i) => i.name })
                .search("가나", { filter: onlyA })
                .map((r) => r.item.name);

            expect(reused).toEqual(fresh);
            expect(reused).toEqual(["가나다"]);
        });

        it("참조 교체 시에도 정확 (넓은 필터로 교체 → full scan 강제)", () => {
            const searcher = createSearcher(items, { key: (i) => i.name });

            // 먼저 좁은 필터 (group a) 로 세션 형성.
            const narrow = (i: Item) => i.group === "a";
            searcher.search("가", { filter: narrow });

            // 더 넓은 필터 (전부 통과) 로 교체 — 참조가 다르므로 full scan 해야 group b 도 포함.
            const wide = (_i: Item) => true;
            const widened = searcher.search("가", { filter: wide }).map((r) => r.item.name);
            const fresh = createSearcher(items, { key: (i) => i.name })
                .search("가", { filter: wide })
                .map((r) => r.item.name);

            expect(widened.sort()).toEqual(fresh.sort());
            expect(widened).toHaveLength(4);
        });

        it("무필터 세션 뒤 필터 추가도 정확 (superset narrowing)", () => {
            const searcher = createSearcher(items, { key: (i) => i.name });

            searcher.search("가"); // 무필터, 매치 4건
            const onlyB = (i: Item) => i.group === "b";
            const filtered = searcher.search("가나", { filter: onlyB }).map((r) => r.item.name);

            const fresh = createSearcher(items, { key: (i) => i.name })
                .search("가나", { filter: onlyB })
                .map((r) => r.item.name);

            expect(filtered).toEqual(fresh);
            expect(filtered).toEqual(["가나라"]);
        });

        it("필터 제거 시 full scan (이전 필터가 좁혔던 항목 복원)", () => {
            const searcher = createSearcher(items, { key: (i) => i.name });

            const onlyA = (i: Item) => i.group === "a";
            searcher.search("가", { filter: onlyA }); // group a 만

            // 필터 제거 → 무필터. group b 도 다시 나와야 한다.
            const unfiltered = searcher.search("가").map((r) => r.item.name);
            const fresh = createSearcher(items, { key: (i) => i.name })
                .search("가")
                .map((r) => r.item.name);

            expect(unfiltered.sort()).toEqual(fresh.sort());
            expect(unfiltered).toHaveLength(4);
        });
    });

    describe("mutation guard", () => {
        it("scan 진행 중 add() → 다음 next() throw", () => {
            const searcher = createSearcher(["가1", "가2", "가3", "가4"]);
            const cursor = searcher.scan("가");
            cursor.next(1);

            searcher.add("가5");

            expect(() => cursor.next()).toThrow("fuzzly: searcher was mutated during scan");
        });

        it("scan 진행 중 remove() → 다음 next() throw", () => {
            const searcher = createSearcher(["가1", "가2", "가3"]);
            const cursor = searcher.scan("가");
            cursor.next(1);

            searcher.remove((s) => s === "가2");

            expect(() => cursor.next()).toThrow("fuzzly: searcher was mutated during scan");
        });

        it("scan 진행 중 replaceAll() → 다음 next() throw", () => {
            const searcher = createSearcher(["가1", "가2", "가3"]);
            const cursor = searcher.scan("가");
            cursor.next(1);

            searcher.replaceAll(["나1"]);

            expect(() => cursor.next()).toThrow("fuzzly: searcher was mutated during scan");
        });

        it("results() 는 mutation 후에도 throw 하지 않음 (이미 만들어진 값 반환)", () => {
            const searcher = createSearcher(["가1", "가2", "가3"]);
            const cursor = searcher.scan("가");
            cursor.next(1);
            searcher.add("가4");
            expect(() => cursor.results()).not.toThrow();
        });
    });

    describe("멀티필드 smoke", () => {
        type Row = { title: string; author: string; kind: string };
        const rows: Row[] = [
            { title: "가나다", author: "홍길동", kind: "book" },
            { title: "라마바", author: "가나다", kind: "doc" },
            { title: "사아자", author: "김철수", kind: "book" },
        ];
        const mk = () =>
            createSearcher(rows, {
                fields: [{ key: (r) => r.title }, { key: (r) => r.author }],
                whitespace: "split",
            });

        it("scan ≡ search (멀티필드)", () => {
            const cursor = mk().scan("가나");
            cursor.next();
            const viaScan = cursor.results().map((r) => r.item.title);
            const viaSearch = mk()
                .search("가나")
                .map((r) => r.item.title);
            expect(viaScan).toEqual(viaSearch);
        });

        it("total (멀티필드)", () => {
            const cursor = mk().scan("가나", { limit: 1 });
            cursor.next();
            expect(cursor.results()).toHaveLength(1);
            expect(cursor.total).toBe(2); // title=가나다, author=가나다
        });

        it("filter (멀티필드)", () => {
            const searcher = mk();
            const onlyBook = (r: Row) => r.kind === "book";
            const cursor = searcher.scan("가나", { filter: onlyBook });
            cursor.next();
            expect(cursor.total).toBe(1);
            expect(cursor.results()[0].item.title).toBe("가나다");
        });
    });
});

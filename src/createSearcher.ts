import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { matchBest, matchLiteral } from "./match";
import { preprocessTarget } from "./preprocessTarget";
import type {
    MatchResult,
    ScoringConfig,
    Searcher,
    SearcherOptions,
    SearchResult,
    SearchResultOptions,
    Target,
} from "./types";

// ---------------------------------------------------------------------------
// Min-heap (score 오름차순) — limit > 0일 때 상위 N개만 유지
// ---------------------------------------------------------------------------

function heapPush<T>(heap: SearchResult<T>[], item: SearchResult<T>): void {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
        const parent = (i - 1) >> 1;
        if ((heap[parent].score ?? 0) <= (heap[i].score ?? 0)) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]];
        i = parent;
    }
}

function heapReplace<T>(heap: SearchResult<T>[], item: SearchResult<T>): void {
    heap[0] = item;
    const n = heap.length;
    let i = 0;
    for (;;) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && (heap[l].score ?? 0) < (heap[smallest].score ?? 0)) smallest = l;
        if (r < n && (heap[r].score ?? 0) < (heap[smallest].score ?? 0)) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
    }
}

// ---------------------------------------------------------------------------
// dev-mode silent-ignore guard
//
// 옵션을 잘못된 위치에 넘기는 실수 (createSearcher 에 SearchResultOptions 키,
// .search() 에 SearcherOptions 키) 를 silent ignore 하지 않고 console.warn 으로 시그널.
// 첫 호출 시 한 번만 검사 후 캐시 (중복 경고 방지). 프로덕션 빌드는 NODE_ENV === "production" 면 스킵.
// ---------------------------------------------------------------------------

const SEARCHER_ONLY_KEYS = new Set(["key", "target", "strict", "whitespace", "scoring", "score"]);
const SEARCH_ONLY_KEYS = new Set(["limit", "literal"]);

const isProd = (() => {
    try {
        // biome-ignore lint/complexity/useLiteralKeys: process 가 존재하지 않을 수 있으므로 동적 접근
        return typeof process !== "undefined" && process.env && process.env["NODE_ENV"] === "production";
    } catch {
        return false;
    }
})();

function warnUnknownKeys(opts: object | undefined, allowed: Set<string>, where: string): void {
    if (isProd || opts == null) return;
    for (const k of Object.keys(opts)) {
        if (!allowed.has(k)) {
            const hint = SEARCHER_ONLY_KEYS.has(k)
                ? `pass it to createSearcher(items, options) instead`
                : SEARCH_ONLY_KEYS.has(k)
                  ? `pass it to searcher.search(query, options) instead`
                  : `unknown option`;
            // eslint-disable-next-line no-console
            console.warn(`[fuzzly] ${where}: '${k}' is not a valid option — ${hint}.`);
        }
    }
}

// ---------------------------------------------------------------------------

/**
 * 검색 인스턴스를 생성한다. 아이템 목록을 내부에 보관하고
 * `search()` 호출마다 `matchBest`로 최적 매칭+스코어링을 수행한다.
 *
 * **매칭 정책 옵션은 `SearcherOptions`에서 고정**된다 — `strict`, `whitespace`,
 * `scoring`, `score`. 다른 정책이 필요하면 새 searcher 인스턴스를 만든다.
 * `searcher.search()` 단계에는 per-call 옵션 (`limit`, `literal`) 만 받는다.
 *
 * **IME 입력 세션 최적화**: 이전 쿼리의 atom prefix 확장이면
 * 이전에 매치된 아이템만 재검색하여 성능을 높인다. `literal` 모드 토글 시 세션이 자동 단절된다.
 *
 * @param items - 검색 대상 아이템 목록
 * @param options - 매칭 정책. T가 string이 아니면 `key` 함수 필수.
 * @returns add/remove/replaceAll로 아이템을 관리할 수 있는 Searcher 인스턴스
 */
export function createSearcher<T>(
    items: readonly T[],
    options: SearcherOptions<T> & ({ key: (item: T) => string } | { target: (item: T) => Target }),
): Searcher<T>;
export function createSearcher(items: readonly string[], options?: SearcherOptions<string>): Searcher<string>;
export function createSearcher<T>(items: readonly T[], options: SearcherOptions<T> = {}): Searcher<T> {
    warnUnknownKeys(options, SEARCHER_ONLY_KEYS, "createSearcher options");

    const key = (options as SearcherOptions<T> & { key?: (item: T) => string }).key;
    const keyFn: (item: T) => string =
        key ??
        ((item: T) => {
            if (typeof item === "string") {
                return item;
            }

            throw new TypeError("createSearcher requires options.key when items are not strings");
        });

    const toTarget: (item: T) => Target = options.target ?? ((item) => preprocessTarget(keyFn(item)));

    const strict = options.strict ?? false;
    const whitespace = options.whitespace ?? "ignore";
    const scoringOpt = options.scoring;
    const resolveScoringConfig: ((target: Target) => ScoringConfig) | undefined =
        typeof scoringOpt === "function" ? scoringOpt : scoringOpt != null ? () => scoringOpt : undefined;
    const scoreFn = options.score;

    let entries: Array<{ item: T; target: Target }> = items.map((item) => ({
        item,
        target: toTarget(item),
    }));

    // 세션 상태: 이전 쿼리의 atom 시퀀스, literal 모드, 매치된 엔트리 인덱스 배열.
    // strict/whitespace 는 SearcherOptions 에서 고정되므로 세션 비교에서 제외.
    let prevAtoms = "";
    let prevLiteral = false;
    let prevMatchedIndices: number[] | null = null;

    function resetSession() {
        prevAtoms = "";
        prevLiteral = false;
        prevMatchedIndices = null;
    }

    return {
        search(queryInput: string, searchOpts: SearchResultOptions = {}): SearchResult<T>[] {
            warnUnknownKeys(searchOpts, SEARCH_ONLY_KEYS, "searcher.search options");

            const limit = searchOpts.limit ?? 0;
            const currentLiteral = !!searchOpts.literal;

            const query = currentLiteral ? null : buildQuery(queryInput, { whitespace });
            const currentAtoms = query ? query.atoms : queryInput.toLowerCase();

            // literal 모드 토글 시 세션 단절. atoms prefix 확장이면 prev 매치만 재스캔.
            const flagsCompatible = prevLiteral === currentLiteral;
            const sessionIndices =
                prevAtoms.length > 0 &&
                currentAtoms.length > prevAtoms.length &&
                currentAtoms.startsWith(prevAtoms) &&
                flagsCompatible &&
                prevMatchedIndices !== null
                    ? prevMatchedIndices
                    : null;

            const matchedIndices: number[] = [];

            let results: SearchResult<T>[];

            if (limit > 0) {
                const heap: SearchResult<T>[] = [];
                let minScore = -Infinity;
                const scan = sessionIndices ?? iota(entries.length);

                for (const i of scan) {
                    const t = entries[i].target;
                    const result = query
                        ? matchBest(query, t, resolveScoringConfig ? resolveScoringConfig(t) : undefined, strict)
                        : matchLiteral(queryInput, t);
                    if (result === null) continue;

                    matchedIndices.push(i);
                    const score = scoreFn ? scoreFn(result, t) : (result.score ?? 0);

                    if (heap.length < limit) {
                        const sr = makeSearchResult(entries[i].item, t, result);
                        sr.score = score;
                        heapPush(heap, sr);
                        if (heap.length === limit) minScore = heap[0].score ?? 0;
                    } else if (score > minScore) {
                        const sr = makeSearchResult(entries[i].item, t, result);
                        sr.score = score;
                        heapReplace(heap, sr);
                        minScore = heap[0].score ?? 0;
                    }
                }

                results = heap.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            } else {
                results = [];
                const scan = sessionIndices ?? iota(entries.length);

                for (const i of scan) {
                    const t = entries[i].target;
                    const result = query
                        ? matchBest(query, t, resolveScoringConfig ? resolveScoringConfig(t) : undefined, strict)
                        : matchLiteral(queryInput, t);
                    if (result === null) continue;

                    matchedIndices.push(i);
                    const sr = makeSearchResult(entries[i].item, t, result);
                    sr.score = scoreFn ? scoreFn(result, t) : (result.score ?? 0);
                    results.push(sr);
                }

                results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            }

            prevAtoms = currentAtoms;
            prevLiteral = currentLiteral;
            prevMatchedIndices = matchedIndices;

            return results;
        },

        add(...newItems: T[]) {
            for (const item of newItems) {
                entries.push({ item, target: toTarget(item) });
            }
            resetSession();
        },

        remove(predicate: (item: T) => boolean) {
            entries = entries.filter((e) => !predicate(e.item));
            resetSession();
        },

        replaceAll(newItems: readonly T[]) {
            entries = newItems.map((item) => ({
                item,
                target: toTarget(item),
            }));
            resetSession();
        },
    };
}

function* iota(n: number): Generator<number> {
    for (let i = 0; i < n; i++) yield i;
}

function makeSearchResult<T>(item: T, target: Target, result: MatchResult): SearchResult<T> {
    return {
        item,
        target,
        result,
        ranges: () => buildMatchRanges([result.indices], target),
    };
}

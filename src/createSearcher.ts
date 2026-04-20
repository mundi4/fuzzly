import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { matchBest, matchLiteral } from "./match";
import { preprocessTarget } from "./preprocessTarget";
import type {
    MatchResult,
    Searcher,
    SearcherOptions,
    SearchOptions,
    SearchResult,
    Target,
    WhitespaceMode,
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

/**
 * 검색 인스턴스를 생성한다. 아이템 목록을 내부에 보관하고
 * `search()` 호출마다 `matchBest`로 최적 매칭+스코어링을 수행한다.
 *
 * **IME 입력 세션 최적화**: 이전 쿼리의 atom prefix 확장이면
 * 이전에 매치된 아이템만 재검색하여 성능을 높인다.
 * `strict` / `whitespace` / `literal` 모드가 달라지면 세션이 자동 단절되어 전체 재탐색한다.
 *
 * @param items - 검색 대상 아이템 목록
 * @param options - T가 string이 아니면 `key` 함수 필수
 * @returns add/remove/replaceAll로 아이템을 관리할 수 있는 Searcher 인스턴스
 */
export function createSearcher<T>(
    items: readonly T[],
    options: SearcherOptions<T> & { key: (item: T) => string },
): Searcher<T>;
export function createSearcher(items: readonly string[], options?: SearcherOptions<string>): Searcher<string>;
export function createSearcher<T>(items: readonly T[], options: SearcherOptions<T> = {}): Searcher<T> {
    const key = (options as SearcherOptions<T> & { key?: (item: T) => string }).key;
    const keyFn: (item: T) => string =
        key ??
        ((item: T) => {
            if (typeof item === "string") {
                return item;
            }

            throw new TypeError("createSearcher requires options.key when items are not strings");
        });
    let entries: Array<{ item: T; target: Target }> = items.map((item) => ({
        item,
        target: preprocessTarget(keyFn(item)),
    }));

    // 세션 상태: 이전 쿼리의 atom 시퀀스, 매칭 모드, 매치된 엔트리 인덱스 배열
    let prevAtoms = "";
    let prevLiteral = false;
    let prevStrict: boolean | undefined;
    let prevWhitespace: WhitespaceMode | undefined;
    let prevMatchedIndices: number[] | null = null;

    function resetSession() {
        prevAtoms = "";
        prevLiteral = false;
        prevStrict = undefined;
        prevWhitespace = undefined;
        prevMatchedIndices = null;
    }

    return {
        search(queryInput: string, searchOpts: SearchOptions = {}): SearchResult<T>[] {
            const scoreFn = searchOpts.score;
            const limit = searchOpts.limit ?? 0;
            const scoringOpt = searchOpts.scoring;
            const strict = searchOpts.strict ?? false;
            const whitespace: WhitespaceMode = searchOpts.whitespace ?? "literal";
            const resolveScoringConfig =
                typeof scoringOpt === "function" ? scoringOpt : scoringOpt != null ? () => scoringOpt : undefined;

            // 세션 연속 판단을 위한 atom 시퀀스
            const query = searchOpts.literal ? null : buildQuery(queryInput, { whitespace });
            const currentAtoms = query ? query.atoms : queryInput.toLowerCase();

            // 현재 atoms가 이전 atoms의 확장인가?
            // 매칭 모드(literal/fuzzy)나 strict/whitespace 상태가 달라지면 세션 단절
            const currentLiteral = !!searchOpts.literal;
            const sessionIndices =
                prevAtoms.length > 0 &&
                currentAtoms.length > prevAtoms.length &&
                currentAtoms.startsWith(prevAtoms) &&
                prevLiteral === currentLiteral &&
                prevStrict === strict &&
                prevWhitespace === whitespace &&
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
            prevStrict = strict;
            prevWhitespace = whitespace;
            prevMatchedIndices = matchedIndices;

            return results;
        },

        add(...newItems: T[]) {
            for (const item of newItems) {
                entries.push({ item, target: preprocessTarget(keyFn(item)) });
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
                target: preprocessTarget(keyFn(item)),
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

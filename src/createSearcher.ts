import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { matchBest, matchLiteral } from "./match";
import { preprocessTarget } from "./preprocessTarget";
import type { MatchResult, Searcher, SearcherOptions, SearchOptions, SearchResult, Target } from "./types";

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

    // 세션 상태: 이전 쿼리의 atom 시퀀스와 매치된 엔트리 인덱스
    let prevAtoms = "";
    let prevMatchedIndices: Set<number> | null = null;

    function resetSession() {
        prevAtoms = "";
        prevMatchedIndices = null;
    }

    return {
        search(queryInput: string, searchOpts: SearchOptions = {}): SearchResult<T>[] {
            const results: SearchResult<T>[] = [];
            const scoreFn = searchOpts.score;
            const limit = searchOpts.limit ?? 0;

            // 세션 연속 판단을 위한 atom 시퀀스
            const query = searchOpts.literal ? null : buildQuery(queryInput);
            const currentAtoms = query ? query.atoms : queryInput.toLowerCase();

            // 현재 atoms가 이전 atoms의 확장인가?
            const sessionFilter =
                prevAtoms.length > 0 &&
                currentAtoms.length > prevAtoms.length &&
                currentAtoms.startsWith(prevAtoms) &&
                prevMatchedIndices !== null
                    ? prevMatchedIndices
                    : null;

            const matchedIndices = new Set<number>();

            for (let i = 0; i < entries.length; i++) {
                if (sessionFilter && !sessionFilter.has(i)) continue;

                const result = query
                    ? matchBest(query, entries[i].target)
                    : matchLiteral(queryInput, entries[i].target);
                if (result === null) continue;

                matchedIndices.add(i);
                const sr = makeSearchResult(entries[i].item, entries[i].target, result);
                sr.score = scoreFn ? scoreFn(result) : (result.score ?? 0);
                results.push(sr);
            }

            prevAtoms = currentAtoms;
            prevMatchedIndices = matchedIndices;

            // 항상 score 내림차순 정렬
            results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            if (limit > 0 && results.length > limit) {
                results.length = limit;
            }

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

function makeSearchResult<T>(item: T, target: Target, result: MatchResult): SearchResult<T> {
    return {
        item,
        target,
        result,
        ranges: () => buildMatchRanges([result.indices], target),
    };
}

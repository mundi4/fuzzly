import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { match, matchLiteral } from "./match";
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

    return {
        search(queryInput: string, searchOpts: SearchOptions = {}): SearchResult<T>[] {
            const results: SearchResult<T>[] = [];
            const scoreFn = searchOpts.score;
            const limit = searchOpts.limit ?? 0;

            if (searchOpts.literal) {
                for (const entry of entries) {
                    const result = matchLiteral(queryInput, entry.target);
                    if (result === null) continue;

                    results.push(makeSearchResult(entry.item, entry.target, result));

                    if (scoreFn) {
                        results[results.length - 1].score = scoreFn(result);
                    } else if (limit > 0 && results.length >= limit) {
                        break;
                    }
                }
            } else {
                const query = buildQuery(queryInput);

                for (const entry of entries) {
                    const result = match(query, entry.target);
                    if (result === null) continue;

                    results.push(makeSearchResult(entry.item, entry.target, result));

                    if (scoreFn) {
                        results[results.length - 1].score = scoreFn(result);
                    } else if (limit > 0 && results.length >= limit) {
                        break;
                    }
                }
            }

            if (scoreFn) {
                results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
                if (limit > 0 && results.length > limit) {
                    results.length = limit;
                }
            }

            return results;
        },

        add(...newItems: T[]) {
            for (const item of newItems) {
                entries.push({ item, target: preprocessTarget(keyFn(item)) });
            }
        },

        remove(predicate: (item: T) => boolean) {
            entries = entries.filter((e) => !predicate(e.item));
        },

        replaceAll(newItems: readonly T[]) {
            entries = newItems.map((item) => ({
                item,
                target: preprocessTarget(keyFn(item)),
            }));
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

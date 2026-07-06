import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { matchBest, matchLiteral } from "./match";
import { isChosungOnlyToken, matchFields } from "./matchFields";
import { preprocessTarget } from "./preprocessTarget";
import type {
    FieldsMatchResult,
    MatchField,
    MatchResult,
    MultiFieldSearcher,
    MultiFieldSearcherOptions,
    MultiFieldSearchResult,
    Query,
    ScoringConfig,
    Searcher,
    SearcherOptions,
    SearchResult,
    SearchResultOptions,
    Target,
    WhitespaceMode,
} from "./types";

// ---------------------------------------------------------------------------
// Min-heap (score 오름차순) — limit > 0일 때 상위 N개만 유지
// ---------------------------------------------------------------------------

function heapPush<S extends { score?: number }>(heap: S[], item: S): void {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
        const parent = (i - 1) >> 1;
        if ((heap[parent].score ?? 0) <= (heap[i].score ?? 0)) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]];
        i = parent;
    }
}

function heapReplace<S extends { score?: number }>(heap: S[], item: S): void {
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

const SEARCHER_ONLY_KEYS = new Set(["key", "target", "fields", "strict", "whitespace", "scoring", "score"]);
const SEARCH_ONLY_KEYS = new Set(["limit", "literal"]);

const isProd = (() => {
    try {
        // globalThis 경유로 접근해 @types/node 없이도 타입체크된다 (브라우저 소비자 tsc 호환)
        const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
        return g.process?.env?.NODE_ENV === "production";
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
// 공유 런타임: entry 하나를 평가하는 클로저(evaluate)만 다르고
// 세션 재사용 / heap / add·remove·replaceAll 로직은 단일·멀티가 공유한다.
// ---------------------------------------------------------------------------

type Runtime<T, R> = {
    search(queryInput: string, searchOpts?: SearchResultOptions): R[];
    add(...items: T[]): void;
    remove(predicate: (item: T) => boolean): void;
    replaceAll(items: readonly T[]): void;
};

/**
 * evaluate 는 entry 하나에 대해 매치 결과를 평가한다.
 * - miss 면 `null`
 * - hit 면 `{ score, make }`: `score`는 정렬·heap 비교용 최종 값,
 *   `make()`는 heap 에 진입하는 entry 에 대해서만 호출되어 결과 객체를 만든다 (불필요한 할당 회피).
 */
type Evaluate<E, R> = (entry: E, query: Query | null, queryInput: string) => { score: number; make: () => R } | null;

function makeRuntime<T, E extends { item: T }, R extends { score?: number }>(
    items: readonly T[],
    toEntry: (item: T) => E,
    whitespace: WhitespaceMode,
    evaluate: Evaluate<E, R>,
    // chosung:false 필드가 하나라도 있으면 세션 재사용 단조성이 깨질 수 있다 (issue #35).
    // 초성-only 토큰은 chosung:false 필드에서 gate-out 되므로, 모음이 붙어 초성-only 가
    // 풀리는 순간(예: "ㅍ"→"파") 해당 필드가 un-gate 되어 매치 집합이 커진다.
    hasChosungFalseField = false,
): Runtime<T, R> {
    let entries: E[] = items.map(toEntry);

    // 세션 상태: 이전 쿼리의 토큰별 atom 시퀀스, 토큰별 초성-only 플래그, literal 모드, 매치된 엔트리 인덱스 배열.
    // split 모드는 토큰(subQuery)마다 atoms 를 가지므로 문자열 배열로 보관한다.
    let prevTokens: string[] = [];
    let prevTokenChosung: boolean[] = [];
    let prevLiteral = false;
    let prevMatchedIndices: number[] | null = null;

    function resetSession() {
        prevTokens = [];
        prevTokenChosung = [];
        prevLiteral = false;
        prevMatchedIndices = null;
    }

    return {
        search(queryInput: string, searchOpts: SearchResultOptions = {}): R[] {
            warnUnknownKeys(searchOpts, SEARCH_ONLY_KEYS, "searcher.search options");

            const limit = searchOpts.limit ?? 0;
            const currentLiteral = !!searchOpts.literal;

            const query = currentLiteral ? null : buildQuery(queryInput, { whitespace });

            // 세션 재사용 판정용 토큰 atoms. split 모드는 각 subQuery 의 atoms,
            // 그 외는 쿼리 통째 1토큰, literal 은 소문자 입력 1토큰.
            const currentTokens: string[] = currentLiteral
                ? [queryInput.toLowerCase()]
                : query?.subQueries
                  ? query.subQueries.map((s) => s.atoms)
                  : [query ? query.atoms : ""];

            // 토큰별 초성-only 여부 (chosung un-gating 가드용). literal·빈 쿼리는 무의미하므로 false.
            const currentTokenChosung: boolean[] =
                currentLiteral || !query
                    ? currentTokens.map(() => false)
                    : query.subQueries
                      ? query.subQueries.map((s) => isChosungOnlyToken(s))
                      : [isChosungOnlyToken(query)];

            // literal 모드 토글 시 세션 단절.
            // 이전 모든 토큰이 각각 어떤 현재 토큰의 atom-prefix 이면 매치 집합은 단조 축소 →
            // 이전 매치만 재스캔. 동일 쿼리 재실행(prefix == 자기 자신)도 안전하게 재사용.
            //
            // chosung un-gating 가드 (issue #35): chosung:false 필드가 있으면, 초성-only 였던 이전
            // 토큰이 초성-only 가 아닌 현재 토큰으로 확장될 때(모음 추가) 그 필드가 un-gate 되어
            // 매치 집합이 커질 수 있다 → 단조 축소 위반. 그 경우 재사용 금지(full scan).
            const flagsCompatible = prevLiteral === currentLiteral;
            const canReuse =
                prevTokens.length > 0 &&
                prevTokens.every((p, j) => {
                    if (p.length === 0) return false;
                    let matched = false;
                    for (let c = 0; c < currentTokens.length; c++) {
                        if (!currentTokens[c].startsWith(p)) continue;
                        matched = true;
                        if (hasChosungFalseField && prevTokenChosung[j] && !currentTokenChosung[c]) {
                            return false; // 초성-only → 비초성-only 전이 = un-gating → unsound
                        }
                    }
                    return matched;
                }) &&
                flagsCompatible &&
                prevMatchedIndices !== null;
            const sessionIndices = canReuse ? prevMatchedIndices : null;

            const matchedIndices: number[] = [];
            const scan = sessionIndices ?? iota(entries.length);

            let results: R[];

            if (limit > 0) {
                const heap: R[] = [];
                let minScore = -Infinity;

                for (const i of scan) {
                    const ev = evaluate(entries[i], query, queryInput);
                    if (ev === null) continue;

                    matchedIndices.push(i);

                    if (heap.length < limit) {
                        heapPush(heap, ev.make());
                        if (heap.length === limit) minScore = heap[0].score ?? 0;
                    } else if (ev.score > minScore) {
                        heapReplace(heap, ev.make());
                        minScore = heap[0].score ?? 0;
                    }
                }

                results = heap.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            } else {
                results = [];

                for (const i of scan) {
                    const ev = evaluate(entries[i], query, queryInput);
                    if (ev === null) continue;

                    matchedIndices.push(i);
                    results.push(ev.make());
                }

                results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            }

            prevTokens = currentTokens;
            prevTokenChosung = currentTokenChosung;
            prevLiteral = currentLiteral;
            prevMatchedIndices = matchedIndices;

            return results;
        },

        add(...newItems: T[]) {
            for (const item of newItems) entries.push(toEntry(item));
            resetSession();
        },

        remove(predicate: (item: T) => boolean) {
            entries = entries.filter((e) => !predicate(e.item));
            resetSession();
        },

        replaceAll(newItems: readonly T[]) {
            entries = newItems.map(toEntry);
            resetSession();
        },
    };
}

// ---------------------------------------------------------------------------

/**
 * 검색 인스턴스를 생성한다. 아이템 목록을 내부에 보관하고
 * `search()` 호출마다 최적 매칭+스코어링을 수행한다.
 *
 * **매칭 정책 옵션은 옵션 객체에서 고정**된다 — `strict`, `whitespace`, `scoring`, `score`.
 * 다른 정책이 필요하면 새 searcher 인스턴스를 만든다.
 * `searcher.search()` 단계에는 per-call 옵션 (`limit`, `literal`) 만 받는다.
 *
 * **멀티필드 모드**: `options.fields`를 주면 여러 필드(Target)에 대해 토큰 단위 cross-field AND로
 * 매칭한다 (`matchFields`). `fields`는 `key`/`target`과 상호 배타.
 *
 * **IME 입력 세션 최적화**: 이전 쿼리의 토큰별 atom prefix 확장이면
 * 이전에 매치된 아이템만 재검색하여 성능을 높인다. `literal` 모드 토글 시 세션이 자동 단절된다.
 *
 * @param items - 검색 대상 아이템 목록
 * @param options - 매칭 정책. T가 string이 아니면 `key`/`target` 또는 `fields` 필수.
 */
export function createSearcher<T>(items: readonly T[], options: MultiFieldSearcherOptions<T>): MultiFieldSearcher<T>;
export function createSearcher<T>(
    items: readonly T[],
    options: SearcherOptions<T> & ({ key: (item: T) => string } | { target: (item: T) => Target }),
): Searcher<T>;
export function createSearcher(items: readonly string[], options?: SearcherOptions<string>): Searcher<string>;
export function createSearcher<T>(
    items: readonly T[],
    options: SearcherOptions<T> | MultiFieldSearcherOptions<T> = {},
): Searcher<T> | MultiFieldSearcher<T> {
    warnUnknownKeys(options, SEARCHER_ONLY_KEYS, "createSearcher options");

    if ("fields" in options) {
        return createMultiFieldSearcher(items, options);
    }
    return createSingleFieldSearcher(items, options);
}

function createSingleFieldSearcher<T>(items: readonly T[], options: SearcherOptions<T>): Searcher<T> {
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

    const evaluate: Evaluate<{ item: T; target: Target }, SearchResult<T>> = (entry, query, queryInput) => {
        const t = entry.target;
        const result = query
            ? matchBest(query, t, resolveScoringConfig ? resolveScoringConfig(t) : undefined, strict)
            : matchLiteral(queryInput, t);
        if (result === null) return null;

        const score = scoreFn ? scoreFn(result, t) : (result.score ?? 0);
        return {
            score,
            make: () => {
                const sr = makeSearchResult(entry.item, t, result);
                sr.score = score;
                return sr;
            },
        };
    };

    return makeRuntime(items, (item) => ({ item, target: toTarget(item) }), whitespace, evaluate);
}

function createMultiFieldSearcher<T>(
    items: readonly T[],
    options: MultiFieldSearcherOptions<T>,
): MultiFieldSearcher<T> {
    const rawOpts = options as MultiFieldSearcherOptions<T> & { key?: unknown; target?: unknown };
    if (rawOpts.key !== undefined || rawOpts.target !== undefined) {
        throw new TypeError("createSearcher: 'fields' is mutually exclusive with 'key'/'target'");
    }

    const fields = options.fields;
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new TypeError("createSearcher: 'fields' must be a non-empty array");
    }

    // 필드별 target resolver 확정 + weight 검증 (matchFields 와 동일 규칙, 생성 시점 fail-fast).
    const toTargets: ((item: T) => Target)[] = fields.map((f) => {
        const tgt = f.target;
        if (tgt) return tgt;
        const kf = f.key;
        if (kf) return (item: T) => preprocessTarget(kf(item));
        throw new TypeError("createSearcher: each field requires 'key' or 'target'");
    });
    for (const f of fields) {
        const w = f.weight ?? 1;
        if (!(w > 0)) throw new RangeError(`createSearcher: field weight must be > 0, got ${w}`);
    }

    const strict = options.strict ?? false;
    const whitespace = options.whitespace ?? "ignore";
    const scoringOpt = options.scoring;
    const scoreFn = options.score;

    // GC 압박 회피용 재사용 버퍼: target 만 entry 마다 갈아 끼운다.
    // matchFields 는 결과에 MatchField 참조를 남기지 않으므로 안전.
    const placeholder = preprocessTarget("");
    const fieldBuf: MatchField[] = fields.map((f) => ({ target: placeholder, weight: f.weight, chosung: f.chosung }));

    const evaluate: Evaluate<{ item: T; targets: Target[] }, MultiFieldSearchResult<T>> = (
        entry,
        query,
        queryInput,
    ) => {
        const targets = entry.targets;
        let result: FieldsMatchResult | null;

        if (query) {
            for (let f = 0; f < fieldBuf.length; f++) fieldBuf[f].target = targets[f];
            result = matchFields(query, fieldBuf, { scoring: scoringOpt, strict });
        } else {
            // literal 멀티필드: any-field substring, score 0 (단일 필드 literal 과 동일).
            const perField: (MatchResult | null)[] = [];
            let anyHit = false;
            for (const t of targets) {
                const lit = matchLiteral(queryInput, t);
                perField.push(lit);
                if (lit !== null) anyHit = true;
            }
            result = anyHit ? { score: 0, perField } : null;
        }

        if (result === null) return null;
        const finalResult = result;
        const score = scoreFn ? scoreFn(finalResult, targets) : finalResult.score;
        return {
            score,
            make: () => makeMultiFieldResult(entry.item, targets, finalResult, score),
        };
    };

    const hasChosungFalseField = fields.some((f) => f.chosung === false);

    return makeRuntime(
        items,
        (item) => ({ item, targets: toTargets.map((tt) => tt(item)) }),
        whitespace,
        evaluate,
        hasChosungFalseField,
    );
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

function makeMultiFieldResult<T>(
    item: T,
    targets: Target[],
    result: FieldsMatchResult,
    score: number,
): MultiFieldSearchResult<T> {
    return {
        item,
        score,
        result,
        fields: targets.map((target, f) => ({
            target,
            result: result.perField[f],
            ranges: () => {
                const pf = result.perField[f];
                return pf ? buildMatchRanges([pf.indices], target) : [];
            },
        })),
    };
}

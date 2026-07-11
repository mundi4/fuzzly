import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { foldCase, isProd } from "./internal/utils";
import { matchBestImpl, matchLiteralFolded } from "./match";
import { applyWeight, matchFields } from "./matchFields";
import { preprocessTarget } from "./preprocessTarget";
import type {
    FieldsMatchResult,
    MatchField,
    MatchResult,
    MultiFieldSearcher,
    MultiFieldSearcherOptions,
    MultiFieldSearchResult,
    Query,
    ScanCursor,
    ScoringConfig,
    Searcher,
    SearcherOptions,
    SearchResult,
    SearchResultOptions,
    Target,
    TargetWhitespaceMode,
    WhitespaceMode,
} from "./types";

// ---------------------------------------------------------------------------
// Min-heap — limit > 0일 때 상위 N개만 유지.
// 정렬 순서는 score desc → tie asc 이므로, heap root 는 top-N 중 "최악"
// (최저 score, 동점이면 최대 tie) 을 유지한다. worse(a,b) = a가 b보다 하위 랭크.
// ---------------------------------------------------------------------------

type Ranked<R> = { score: number; tie: number; value: R };

// a 가 b 보다 하위 랭크(더 나쁨)이면 true. score 낮을수록, 동점이면 tie 클수록 하위.
function worse(a: { score: number; tie: number }, b: { score: number; tie: number }): boolean {
    return a.score < b.score || (a.score === b.score && a.tie > b.tie);
}

function heapPush<R>(heap: Ranked<R>[], item: Ranked<R>): void {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!worse(heap[i], heap[parent])) break; // 자식이 부모보다 나쁘지 않으면 min-heap 불변 성립
        [heap[parent], heap[i]] = [heap[i], heap[parent]];
        i = parent;
    }
}

function heapReplace<R>(heap: Ranked<R>[], item: Ranked<R>): void {
    heap[0] = item;
    const n = heap.length;
    let i = 0;
    for (;;) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && worse(heap[l], heap[smallest])) smallest = l;
        if (r < n && worse(heap[r], heap[smallest])) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
    }
}

// 최종 정렬 comparator: score desc, 동점이면 tie asc.
function byRank(a: { score: number; tie: number }, b: { score: number; tie: number }): number {
    return b.score - a.score || a.tie - b.tie;
}

// ---------------------------------------------------------------------------
// dev-mode silent-ignore guard
//
// 옵션을 잘못된 위치에 넘기는 실수 (createSearcher 에 SearchResultOptions 키,
// .search() 에 SearcherOptions 키) 를 silent ignore 하지 않고 console.warn 으로 시그널.
// 첫 호출 시 한 번만 검사 후 캐시 (중복 경고 방지). 프로덕션 빌드는 NODE_ENV === "production" 면 스킵.
// ---------------------------------------------------------------------------

const SEARCHER_ONLY_KEYS = new Set([
    "key",
    "target",
    "fields",
    "strict",
    "whitespace",
    "targetWhitespace",
    "scoring",
    "score",
    "tiebreakKey",
]);
const SEARCH_ONLY_KEYS = new Set(["limit", "literal", "filter"]);

// 동일 옵션 객체 재검사 방지 캐시 — 소비자가 옵션 객체를 재사용(메모이즈)하는 일반 패턴에서
// 키 순회를 첫 호출 1회로 줄인다 (경고 중복 방지 겸용).
// 같은 객체가 다른 검증 컨텍스트(createSearcher vs search — 허용 키 집합이 다름)에 재사용될 수
// 있으므로 캐시는 allowed 집합별로 분리한다.
const checkedOptsByContext = new WeakMap<Set<string>, WeakSet<object>>();

function warnUnknownKeys(opts: object | undefined, allowed: Set<string>, where: string): void {
    if (isProd || opts == null) return;
    let checked = checkedOptsByContext.get(allowed);
    if (checked === undefined) {
        checked = new WeakSet<object>();
        checkedOptsByContext.set(allowed, checked);
    }
    if (checked.has(opts)) return;
    checked.add(opts);
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
    search(queryInput: string, searchOpts?: SearchResultOptions<T>): R[];
    scan(queryInput: string, searchOpts?: SearchResultOptions<T>): ScanCursor<R>;
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

// 세션 스냅샷: 완료된 스캔 하나의 (쿼리 토큰, literal, filter, 매치 집합) 기록.
type SessionSnapshot<T> = {
    tokens: string[];
    literal: boolean;
    filter: ((item: T) => boolean) | null;
    matchedIndices: number[];
};

// 히스토리 깊이 상한 — 백스페이스 복원용 조상 스냅샷. 키스트로크당 int 배열 하나 수준이라 부담 없음.
const SESSION_HISTORY_MAX = 32;

function tokensEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function makeRuntime<T, E extends { item: T; tie: number }, R>(
    items: readonly T[],
    toEntry: (item: T) => E,
    whitespace: WhitespaceMode,
    // evaluate 가 구현하는 fuzzy 매칭이 "토큰 atom-prefix 확장 ⇒ 매치 집합 단조 축소"를
    // 만족하는가. lenient 는 true, strict 는 false (가 miss → 각 hit 로 집합이 커질 수 있음).
    // false 면 non-literal 스캔은 토큰 완전 동일일 때만 세션을 재사용한다.
    prefixMonotonic: boolean,
    evaluate: Evaluate<E, R>,
): Runtime<T, R> {
    let entries: E[] = items.map(toEntry);

    // 세션 상태: 완료된 스캔들의 스냅샷 스택 (오래된 것 → 최신 순).
    // - prefix 확장(순방향 타이핑): 최신 스냅샷이 재사용됨 (기존 단일-prev 동작과 동일)
    // - prefix 축소(백스페이스): 조상 스냅샷이 재사용됨 — full rescan 회피
    // split 모드는 토큰(subQuery)마다 atoms 를 가지므로 문자열 배열로 보관한다.
    // 커밋은 스캔이 **완료되는 시점(마지막 엔트리 평가)** 에만 일어난다 — 중단된 스캔의 부분 매치
    // 집합이 세션에 새지 않아 이후 prefix 쿼리 오염이 구조적으로 불가능.
    let history: SessionSnapshot<T>[] = [];

    // 뮤테이션 가드: add/remove/replaceAll 이 entries 인덱스를 무효화하므로 진행 중인 커서를 무효화한다.
    let generation = 0;

    function resetSession() {
        history = [];
    }

    // 재사용 판정 / 쿼리 빌드 / 커서 상태 초기화는 커서 생성 시 1회. next() 로 budget 단위 진행한다.
    function scan(queryInput: string, searchOpts: SearchResultOptions<T> = {}): ScanCursor<R> {
        const limit = searchOpts.limit ?? 0;
        const currentLiteral = !!searchOpts.literal;
        const currentFilter = searchOpts.filter ?? null;

        const query = currentLiteral ? null : buildQuery(queryInput, { whitespace });
        // literal 은 스캔당 1회만 fold — per-entry 재-fold 를 피하고, 세션 토큰과 실제 매칭
        // (matchLiteralFolded)이 반드시 같은 정규화 문자열을 보게 한다 (toLowerCase 와 foldCase 가
        // 갈리면 İ 같은 길이 변화 문자에서 prefix 재사용이 unsound 해진다).
        const evalInput = currentLiteral ? foldCase(queryInput) : queryInput;

        // 세션 재사용 판정용 토큰 atoms. split 모드는 각 subQuery 의 atoms,
        // 그 외는 쿼리 통째 1토큰, literal 은 fold 된 입력 1토큰.
        const currentTokens: string[] = currentLiteral
            ? [evalInput]
            : query?.subQueries
              ? query.subQueries.map((s) => s.atoms)
              : [query ? query.atoms : ""];

        // 재사용 조건: 토큰 atom-prefix (매치 집합 단조 축소) AND literal 플래그 일치 AND 필터 호환.
        // 필터 호환 = 동일 참조(재적용 무해) 또는 이전 무필터(superset 을 좁히는 방향이라 sound).
        //
        // strict fuzzy 매칭은 atom-prefix 확장이 매치 집합을 단조 축소시키지 않는다
        // (가→각: 중간 상태는 exact 불일치로 miss, 완성 상태는 hit — 집합이 커짐).
        // 따라서 strict 인스턴스의 non-literal 스캔은 토큰이 **완전 동일**할 때만 재사용한다.
        // literal 은 substring 매칭이라 문자열 확장에 대해 단조 → strict 와 무관하게 prefix 재사용 가능.
        //
        // 히스토리에서 호환 스냅샷 중 매치 집합이 가장 작은 것을 고른다
        // (백스페이스 후엔 최신 스냅샷이 아닌 조상 스냅샷이 호환된다).
        const exactTokensOnly = !prefixMonotonic && !currentLiteral;
        let source: number[] | null = null;
        for (let h = history.length - 1; h >= 0; h--) {
            const s = history[h];
            if (s.literal !== currentLiteral) continue;
            if (!(currentFilter === s.filter || s.filter === null)) continue;
            const tokensOk = exactTokensOnly
                ? tokensEqual(s.tokens, currentTokens)
                : s.tokens.length > 0 &&
                  s.tokens.every((p) => p.length > 0 && currentTokens.some((c) => c.startsWith(p)));
            if (!tokensOk) continue;
            if (source === null || s.matchedIndices.length < source.length) {
                source = s.matchedIndices;
            }
        }
        const scanSize = source ? source.length : entries.length;
        const capturedGeneration = generation;

        const matchedIndices: number[] = [];
        const heap: Ranked<R>[] = []; // limit > 0
        const collected: Ranked<R>[] = []; // limit === 0

        let position = 0;
        let done = false;
        let sorted: R[] | null = null; // 완료 시 1회 정렬 후 캐시

        function evalOne(i: number): void {
            const entry = entries[i];
            // filter 는 evaluate 전에 평가 — 미통과 엔트리는 매칭 비용을 스킵하고 결과·total 에서 제외.
            if (currentFilter && !currentFilter(entry.item)) return;

            const ev = evaluate(entry, query, evalInput);
            if (ev === null) return;

            matchedIndices.push(i);
            const tie = entry.tie;

            if (limit > 0) {
                if (heap.length < limit) {
                    heapPush(heap, { score: ev.score, tie, value: ev.make() });
                } else {
                    // full heap: root 가 top-N 중 최악. 후보가 root 보다 상위 랭크면 교체.
                    const root = heap[0];
                    if (ev.score > root.score || (ev.score === root.score && tie < root.tie)) {
                        heapReplace(heap, { score: ev.score, tie, value: ev.make() });
                    }
                }
            } else {
                collected.push({ score: ev.score, tie, value: ev.make() });
            }
        }

        return {
            next(budget?: number): boolean {
                if (done) return true;
                if (generation !== capturedGeneration) {
                    throw new Error("fuzzly: searcher was mutated during scan");
                }

                // budget 생략 = 끝까지. 음수 budget 은 no-op(0)으로 클램프해 end < position 을 막는다.
                const end = budget == null ? scanSize : Math.min(position + Math.max(0, budget), scanSize);
                for (; position < end; position++) {
                    evalOne(source ? source[position] : position);
                }

                if (position >= scanSize) {
                    done = true;
                    // 완료 시점에만 세션 커밋 (히스토리 스택에 push). 커서 동시 사용은
                    // last-completion-wins: 늦게 완료된 이전 쿼리 커서의 스냅샷이 나중에 쌓여도
                    // (tokens ↔ matched set ↔ filter) 쌍이 내부적으로 일관되므로 unsound 하지 않다.
                    // 빈 토큰 스냅샷은 어차피 재사용 불가라 push 하지 않고, 조상 스냅샷 대비
                    // 전혀 좁혀지지 않은 스냅샷(matched == source)도 재사용 가치가 동일하므로
                    // push 하지 않는다 (히스토리 메모리 절약 — 조상이 같은 집합을 제공).
                    const narrowed = source === null || matchedIndices.length < source.length;
                    if (narrowed && currentTokens.length > 0 && currentTokens.every((t) => t.length > 0)) {
                        const top = history[history.length - 1];
                        if (
                            top !== undefined &&
                            top.literal === currentLiteral &&
                            top.filter === currentFilter &&
                            tokensEqual(top.tokens, currentTokens)
                        ) {
                            // 동일 쿼리 재검색: top 교체 (히스토리 중복 방지)
                            top.matchedIndices = matchedIndices;
                        } else {
                            history.push({
                                tokens: currentTokens,
                                literal: currentLiteral,
                                filter: currentFilter,
                                matchedIndices,
                            });
                            if (history.length > SESSION_HISTORY_MAX) history.shift();
                        }
                    }
                }
                return done;
            },
            get done() {
                return done;
            },
            get processed() {
                return position;
            },
            get scanSize() {
                return scanSize;
            },
            get total() {
                return matchedIndices.length;
            },
            results(): R[] {
                // 완료 후엔 buf 가 불변이므로 정렬 결과를 캐시. 미완료엔 매번 fresh snapshot.
                if (done && sorted !== null) return sorted;
                const buf = limit > 0 ? heap : collected;
                // slice() 로 복사 후 정렬 — 진행 중 live buf(heap 불변식)를 훼손하지 않는다.
                const out = buf
                    .slice()
                    .sort(byRank)
                    .map((w) => w.value);
                if (done) sorted = out;
                return out;
            },
        };
    }

    return {
        // search 는 scan 위에 재구현 — 코드 경로 단일화. 끝까지 진행 후 정렬 결과 반환.
        search(queryInput: string, searchOpts: SearchResultOptions<T> = {}): R[] {
            warnUnknownKeys(searchOpts, SEARCH_ONLY_KEYS, "searcher.search options");
            const cursor = scan(queryInput, searchOpts);
            cursor.next();
            return cursor.results();
        },

        scan(queryInput: string, searchOpts: SearchResultOptions<T> = {}): ScanCursor<R> {
            warnUnknownKeys(searchOpts, SEARCH_ONLY_KEYS, "searcher.scan options");
            return scan(queryInput, searchOpts);
        },

        add(...newItems: T[]) {
            // 전부 변환한 뒤에 push — toEntry(preprocessTarget)가 도중에 throw 해도
            // entries 부분 추가 + 세션 미리셋 상태(신규 항목이 스캔에서 누락)가 남지 않는다.
            const newEntries = newItems.map(toEntry);
            for (const e of newEntries) entries.push(e);
            generation++;
            resetSession();
        },

        remove(predicate: (item: T) => boolean) {
            entries = entries.filter((e) => !predicate(e.item));
            generation++;
            resetSession();
        },

        replaceAll(newItems: readonly T[]) {
            entries = newItems.map(toEntry);
            generation++;
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

    // targetWhitespace 는 key 기반 전처리에만 적용 — prebuilt `target` supplier 는 존중.
    // 옵션 객체는 호이스팅해 아이템당 재할당을 피한다 (preprocessTarget 은 읽기만 한다).
    const targetOpts: { whitespace: TargetWhitespaceMode } = { whitespace: options.targetWhitespace ?? "keep" };
    const toTarget: (item: T) => Target = options.target ?? ((item) => preprocessTarget(keyFn(item), targetOpts));

    const strict = options.strict ?? false;
    const whitespace = options.whitespace ?? "ignore";
    const scoringOpt = options.scoring;
    const resolveScoringConfig: ((target: Target) => ScoringConfig) | undefined =
        typeof scoringOpt === "function" ? scoringOpt : scoringOpt != null ? () => scoringOpt : undefined;
    const scoreFn = options.score;
    const tiebreakKey = options.tiebreakKey;

    const evaluate: Evaluate<{ item: T; target: Target; scoring?: ScoringConfig; tie: number }, SearchResult<T>> = (
        entry,
        query,
        queryInput,
    ) => {
        const t = entry.target;
        // literal 경로의 queryInput 은 scan() 이 미리 fold 한 문자열 (per-entry 재-fold 없음).
        const result = query
            ? matchBestImpl(query, t, entry.scoring, strict)
            : matchLiteralFolded(queryInput, t, entry.scoring);
        if (result === null) return null;

        const score = scoreFn ? scoreFn(result, t) : result.score;
        return {
            score,
            make: () => makeSearchResult(entry.item, t, result, score),
        };
    };

    // scoring/tiebreakKey 는 entry 생성 시(생성/add/replaceAll) 아이템당 1회 평가되어 캐시된다.
    return makeRuntime(
        items,
        (item) => {
            const target = toTarget(item);
            return { item, target, scoring: resolveScoringConfig?.(target), tie: tiebreakKey ? tiebreakKey(item) : 0 };
        },
        whitespace,
        !strict,
        evaluate,
    );
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
    // targetWhitespace 는 key 기반 전처리에만 적용 — prebuilt `field.target` supplier 는 존중.
    const targetOpts: { whitespace: TargetWhitespaceMode } = { whitespace: options.targetWhitespace ?? "keep" };
    const toTargets: ((item: T) => Target)[] = fields.map((f) => {
        const tgt = f.target;
        if (tgt) return tgt;
        const kf = f.key;
        if (kf) return (item: T) => preprocessTarget(kf(item), targetOpts);
        throw new TypeError("createSearcher: each field requires 'key' or 'target'");
    });
    for (const f of fields) {
        const w = f.weight ?? 1;
        if (!(w > 0)) throw new RangeError(`createSearcher: field weight must be > 0, got ${w}`);
    }

    // 제거된 옵션 감지: 'chosung' 은 단조 narrowing 을 깨뜨려 삭제됨 (issue #36). JS 소비자 silent ignore 방지.
    if (!isProd && fields.some((f) => "chosung" in f)) {
        // eslint-disable-next-line no-console
        console.warn("[fuzzly] createSearcher: field option 'chosung' was removed and is ignored");
    }

    const strict = options.strict ?? false;
    const whitespace = options.whitespace ?? "ignore";
    const scoringOpt = options.scoring;
    const scoreFn = options.score;
    const tiebreakKey = options.tiebreakKey;

    // 함수형 scoring 은 entry 생성 시 target당 1회 resolve 해 캐시한다 (매 검색 재계산 회피).
    // 객체형은 공유 상수 하나로 충분 (entry 저장 불필요).
    const scoringFn = typeof scoringOpt === "function" ? scoringOpt : undefined;
    const staticCfg: ScoringConfig | undefined = typeof scoringOpt === "function" ? undefined : scoringOpt;

    // GC 압박 회피용 재사용 버퍼: target·scoring 만 entry 마다 갈아 끼운다.
    // matchFields 는 결과에 MatchField 참조를 남기지 않으므로 안전.
    const placeholder = preprocessTarget("");
    const fieldBuf: MatchField[] = fields.map((f) => ({ target: placeholder, weight: f.weight }));

    const evaluate: Evaluate<
        { item: T; targets: Target[]; scorings?: ScoringConfig[]; tie: number },
        MultiFieldSearchResult<T>
    > = (entry, query, queryInput) => {
        const targets = entry.targets;
        let result: FieldsMatchResult | null;

        if (query) {
            for (let f = 0; f < fieldBuf.length; f++) {
                fieldBuf[f].target = targets[f];
                fieldBuf[f].scoring = entry.scorings ? entry.scorings[f] : staticCfg;
            }
            result = matchFields(query, fieldBuf, { strict });
        } else {
            // literal 멀티필드: any-field substring. score 는 필드별 literal 간이 스코어에
            // fuzzy 경로와 동일한 부호 보존 weight 를 적용한 최대값 (best field 기준).
            const perField: (MatchResult | null)[] = [];
            let bestLit = -Infinity;
            for (let f = 0; f < targets.length; f++) {
                const lit = matchLiteralFolded(queryInput, targets[f], entry.scorings ? entry.scorings[f] : staticCfg);
                perField.push(lit);
                if (lit !== null) {
                    const weighted = applyWeight(lit.score, fields[f].weight ?? 1);
                    if (weighted > bestLit) bestLit = weighted;
                }
            }
            result = bestLit !== -Infinity ? { score: bestLit, perField } : null;
        }

        if (result === null) return null;
        const finalResult = result;
        const score = scoreFn ? scoreFn(finalResult, targets) : finalResult.score;
        return {
            score,
            make: () => makeMultiFieldResult(entry.item, targets, finalResult, score),
        };
    };

    return makeRuntime(
        items,
        (item) => {
            const targets = toTargets.map((tt) => tt(item));
            return {
                item,
                targets,
                scorings: scoringFn ? targets.map((t) => scoringFn(t)) : undefined,
                tie: tiebreakKey ? tiebreakKey(item) : 0,
            };
        },
        whitespace,
        !strict,
        evaluate,
    );
}

function makeSearchResult<T>(item: T, target: Target, result: MatchResult, score: number): SearchResult<T> {
    return {
        item,
        target,
        result,
        score,
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

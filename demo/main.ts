import {
    buildMatchRanges,
    buildQuery,
    match,
    matchBest,
    preprocessTarget,
    SCORING,
    type MatchResult,
    type Query,
    type QueryGrapheme,
    type ScoringConfig,
    type ScoringWeights,
    type SpillMode,
    type WhitespaceMode,
} from "fuzzly";

const CONSONANTS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ";

function atomIdToLabel(id: number): string {
    if (id >= 1 && id <= 19) return CONSONANTS[id - 1];
    if (id >= 20 && id <= 33) return VOWELS[id - 20];
    if (id >= 34 && id <= 128) return String.fromCharCode(0x20 + (id - 34));
    return `·${id}`;
}

type Options = {
    spillMode: SpillMode;
    whitespace: WhitespaceMode;
    allowChoseongMatch: boolean;
    useMatchBest: boolean;
    forceNoComposing: boolean;
};

const $ = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`missing #${id}`);
    return el as T;
};

const targetInput = $<HTMLTextAreaElement>("targetInput");
const targetHighlight = $<HTMLDivElement>("targetHighlight");
const queryInput = $<HTMLInputElement>("queryInput");
const targetCount = $<HTMLSpanElement>("targetCount");
const queryCount = $<HTMLSpanElement>("queryCount");
const composingBadge = $<HTMLSpanElement>("composingBadge");
const status = $<HTMLSpanElement>("status");
const queryDebug = $<HTMLDivElement>("queryDebug");
const matchDebug = $<HTMLDivElement>("matchDebug");
const queryMeta = $<HTMLSpanElement>("queryMeta");
const matchMeta = $<HTMLSpanElement>("matchMeta");
const optSpillMode = $<HTMLSelectElement>("optSpillMode");
const optWhitespace = $<HTMLSelectElement>("optWhitespace");
const optChoseong = $<HTMLInputElement>("optChoseong");
const optMatchBest = $<HTMLInputElement>("optMatchBest");
const optForceNoComposing = $<HTMLInputElement>("optForceNoComposing");
const optScoreReset = $<HTMLButtonElement>("optScoreReset");

type WeightKey =
    | "positionZero"
    | "boundary"
    | "consecutive"
    | "gapPenalty"
    | "prefixBonus"
    | "exactBonus"
    | "targetLengthPenalty"
    | "lengthPenaltyCap"
    | "choseongWeaken"
    | "tailSpillPenalty";

const WEIGHT_INPUTS: Record<WeightKey, { input: HTMLInputElement; def: number }> = {
    positionZero: { input: $<HTMLInputElement>("wPositionZero"), def: SCORING.POSITION_ZERO },
    boundary: { input: $<HTMLInputElement>("wBoundary"), def: SCORING.BOUNDARY },
    consecutive: { input: $<HTMLInputElement>("wConsecutive"), def: SCORING.CONSECUTIVE },
    gapPenalty: { input: $<HTMLInputElement>("wGapPenalty"), def: SCORING.GAP_PENALTY },
    prefixBonus: { input: $<HTMLInputElement>("wPrefixBonus"), def: SCORING.PREFIX_BONUS },
    exactBonus: { input: $<HTMLInputElement>("wExactBonus"), def: SCORING.EXACT_BONUS },
    targetLengthPenalty: { input: $<HTMLInputElement>("wTargetLengthPenalty"), def: SCORING.TARGET_LENGTH_PENALTY },
    lengthPenaltyCap: { input: $<HTMLInputElement>("wLengthPenaltyCap"), def: SCORING.LENGTH_PENALTY_CAP },
    choseongWeaken: { input: $<HTMLInputElement>("wChoseongWeaken"), def: SCORING.CHOSEONG_WEAKEN },
    tailSpillPenalty: { input: $<HTMLInputElement>("wTailSpillPenalty"), def: SCORING.TAIL_SPILL_PENALTY },
};

const LS_KEY = "fuzzly.playground.v2";

type Persisted = {
    target?: string;
    query?: string;
    spillMode?: SpillMode;
    whitespace?: WhitespaceMode;
    allowChoseongMatch?: boolean;
    useMatchBest?: boolean;
    forceNoComposing?: boolean;
    weights?: Partial<Record<WeightKey, number>>;
};

function loadPersisted(): Persisted {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? (JSON.parse(raw) as Persisted) : {};
    } catch {
        return {};
    }
}

function currentWeights(): Partial<Record<WeightKey, number>> {
    const out: Partial<Record<WeightKey, number>> = {};
    for (const k of Object.keys(WEIGHT_INPUTS) as WeightKey[]) {
        const v = parseFloat(WEIGHT_INPUTS[k].input.value);
        if (Number.isFinite(v)) out[k] = v;
    }
    return out;
}

function setWeightInputs(weights: Partial<Record<WeightKey, number>> | undefined) {
    for (const k of Object.keys(WEIGHT_INPUTS) as WeightKey[]) {
        const { input, def } = WEIGHT_INPUTS[k];
        const v = weights?.[k];
        input.value = String(typeof v === "number" && Number.isFinite(v) ? v : def);
    }
}

function isDefaultWeights(): boolean {
    for (const k of Object.keys(WEIGHT_INPUTS) as WeightKey[]) {
        const { input, def } = WEIGHT_INPUTS[k];
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) continue;
        if (v !== def) return false;
    }
    return true;
}

function persist() {
    const payload: Persisted = {
        target: targetInput.value,
        query: queryInput.value,
        spillMode: optSpillMode.value as SpillMode,
        whitespace: optWhitespace.value as WhitespaceMode,
        allowChoseongMatch: optChoseong.checked,
        useMatchBest: optMatchBest.checked,
        forceNoComposing: optForceNoComposing.checked,
        weights: currentWeights(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

(function restore() {
    const saved = loadPersisted();
    if (typeof saved.target === "string") targetInput.value = saved.target;
    if (typeof saved.query === "string") queryInput.value = saved.query;
    if (saved.spillMode) optSpillMode.value = saved.spillMode;
    if (saved.whitespace) optWhitespace.value = saved.whitespace;
    if (typeof saved.allowChoseongMatch === "boolean") optChoseong.checked = saved.allowChoseongMatch;
    if (typeof saved.useMatchBest === "boolean") optMatchBest.checked = saved.useMatchBest;
    if (typeof saved.forceNoComposing === "boolean") optForceNoComposing.checked = saved.forceNoComposing;
    setWeightInputs(saved.weights);
})();

// --- IME composition state ---
//
// 핵심: compStart는 compositionend에서 초기화하지 않고 보존한다.
// 옵션 클릭 → queryInput blur → compositionend → input(justEnded) 사이클 동안
// compStart 값을 유지해야 옵션 변경으로 인한 재매치가 올바른 composingIndex를
// 받는다. 진짜 새 타이핑(input 이벤트에서 composing=false && justEnded=false)에서만
// compStart를 -1로 리셋한다.

let composing = false;
let compStart = -1;
let compLen = 0;
let justEndedComposing = false;
// 마지막 recompute가 match에 넘긴 composingIndex — 표시용
let lastUsedComposingIndex: number | null = null;

function currentComposingIndex(): number | null {
    if (optForceNoComposing.checked) return null;
    if (compStart >= 0) return compStart;
    return null;
}

function renderComposingBadge() {
    const shown = lastUsedComposingIndex === null ? "null" : String(lastUsedComposingIndex);
    const suffix = optForceNoComposing.checked
        ? " (forced)"
        : composing
          ? ` (composing @${compStart} len=${compLen})`
          : justEndedComposing
            ? " (just ended)"
            : "";
    composingBadge.textContent = `composingIndex = ${shown}${suffix}`;
    composingBadge.className =
        "composing" + (composing ? " on" : "") + (optForceNoComposing.checked ? " forced" : "");
}

queryInput.addEventListener("compositionstart", () => {
    composing = true;
    compStart = queryInput.selectionStart ?? 0;
    compLen = 0;
    justEndedComposing = false;
    // 뒤따르는 input 이벤트가 recompute를 호출한다
});
queryInput.addEventListener("compositionupdate", (e: CompositionEvent) => {
    compLen = (e.data ?? "").length;
    // 뒤따르는 input 이벤트가 recompute를 호출한다
});
queryInput.addEventListener("compositionend", () => {
    composing = false;
    justEndedComposing = true;
    // compStart / compLen은 보존 — 직후 input 한 번 동안 유효
});

// --- rendering ---

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHighlight(input: string, ranges: { start: number; end: number }[]) {
    const pad = input.endsWith("\n") ? " " : "";
    if (ranges.length === 0) {
        targetHighlight.textContent = input + pad;
        return;
    }
    let html = "";
    let cursor = 0;
    for (const { start, end } of ranges) {
        if (start > cursor) html += escapeHtml(input.slice(cursor, start));
        html += `<mark>${escapeHtml(input.slice(start, end))}</mark>`;
        cursor = end;
    }
    if (cursor < input.length) html += escapeHtml(input.slice(cursor));
    targetHighlight.innerHTML = html + pad;
}

function graphemePill(qg: QueryGrapheme, anchorForComposing: boolean): string {
    const { atoms, vowelIndex, tailIndex } = qg;
    let inner = "";
    for (let i = 0; i < atoms.length; i++) {
        const cls = tailIndex !== -1 && i >= tailIndex ? "tail" : vowelIndex !== -1 && i >= vowelIndex ? "vowel" : "lead";
        inner += `<span class="${cls}">${escapeHtml(atomIdToLabel(atoms[i]))}</span>`;
    }
    const anchorCls = anchorForComposing ? " anchor" : "";
    return `<span class="atom-pill${anchorCls}" title="atoms=${atoms.length} vowelIndex=${vowelIndex} tailIndex=${tailIndex} hasCompoundTail=${qg.hasCompoundTail}"><span class="raw">${escapeHtml(qg.char)}</span>${inner}</span>`;
}

function composingGraphemeIndex(query: Query, composingIndex: number | null | undefined): number {
    if (composingIndex == null) return -1;
    if (composingIndex < 0 || composingIndex >= query.graphemeIndexes.length) return -1;
    return query.graphemeIndexes[composingIndex];
}

function renderQueryDebug(query: Query, composingIndex: number | null | undefined) {
    queryMeta.textContent = `${query.graphemes.length} grapheme(s) · whitespace=${query.whitespace}`;
    if (query.graphemes.length === 0) {
        queryDebug.textContent = "—";
        return;
    }
    const anchorIdx = composingGraphemeIndex(query, composingIndex);
    queryDebug.innerHTML = query.graphemes
        .map((qg, i) => graphemePill(qg, i === anchorIdx))
        .join(" ");
}

function renderMatchDebug(result: MatchResult | null, ms: number, usedMatchBest: boolean) {
    if (result === null) {
        matchMeta.textContent = `no match · ${ms.toFixed(2)}ms`;
        matchDebug.innerHTML = `<span style="color:var(--err)">no match</span>`;
        return;
    }
    matchMeta.textContent = `${usedMatchBest ? "matchBest" : "match"} · ${ms.toFixed(2)}ms`;
    const scoreRow = typeof result.score === "number" ? `<dt>score</dt><dd>${result.score.toFixed(3)}</dd>` : "";
    matchDebug.innerHTML = `
        <dl class="match-kv">
            <dt>indices</dt><dd>[${result.indices.join(", ")}]</dd>
            <dt>runCount</dt><dd>${result.runCount}</dd>
            <dt>boundaryHits</dt><dd>${result.boundaryHits}</dd>
            <dt>startsAtZero</dt><dd>${result.startsAtZero}</dd>
            <dt>initialConsonantOnly</dt><dd>${result.initialConsonantOnly}</dd>
            ${scoreRow}
        </dl>
    `;
}

// --- main recompute ---

function readOptions(): Options {
    return {
        spillMode: optSpillMode.value as SpillMode,
        whitespace: optWhitespace.value as WhitespaceMode,
        allowChoseongMatch: optChoseong.checked,
        useMatchBest: optMatchBest.checked,
        forceNoComposing: optForceNoComposing.checked,
    };
}

function recompute() {
    const rawTarget = targetInput.value;
    const rawQuery = queryInput.value;
    const opts = readOptions();

    targetCount.textContent = `${rawTarget.length} chars`;
    queryCount.textContent = `${rawQuery.length} chars`;

    const composingIndex = currentComposingIndex();
    lastUsedComposingIndex = composingIndex;
    renderComposingBadge();

    let query: Query;
    try {
        query = buildQuery(rawQuery, { whitespace: opts.whitespace });
    } catch (e) {
        queryMeta.textContent = "build error";
        queryDebug.innerHTML = `<span style="color:var(--err)">${escapeHtml(String(e))}</span>`;
        renderHighlight(rawTarget, []);
        matchMeta.textContent = "";
        matchDebug.textContent = "—";
        status.textContent = "query error";
        status.className = "status err";
        persist();
        return;
    }

    renderQueryDebug(query, composingIndex);

    if (rawTarget.length === 0) {
        renderHighlight("", []);
        status.textContent = "타겟 없음";
        status.className = "status";
        matchMeta.textContent = "";
        matchDebug.textContent = "—";
        persist();
        return;
    }
    if (query.graphemes.length === 0) {
        renderHighlight(rawTarget, []);
        status.textContent = "쿼리 없음";
        status.className = "status";
        matchMeta.textContent = "";
        matchDebug.textContent = "—";
        persist();
        return;
    }

    const target = preprocessTarget(rawTarget);

    const t0 = performance.now();
    let result: MatchResult | null;
    if (opts.useMatchBest) {
        const weights = currentWeights() as ScoringWeights;
        const scoring: ScoringConfig | undefined = isDefaultWeights() ? undefined : { weights };
        result = matchBest(query, target, scoring, composingIndex, opts.spillMode, opts.allowChoseongMatch);
    } else {
        result = match(query, target, composingIndex, opts.spillMode, opts.allowChoseongMatch);
    }
    const t1 = performance.now();

    const ranges = result ? buildMatchRanges([result.indices], target) : [];
    renderHighlight(rawTarget, ranges);
    renderMatchDebug(result, t1 - t0, opts.useMatchBest);

    if (result === null) {
        status.textContent = "no match";
        status.className = "status err";
    } else {
        status.textContent = `match · ${ranges.length} range${ranges.length === 1 ? "" : "s"}`;
        status.className = "status ok";
    }
    persist();
}

// --- style sync for target overlay ---

function syncHighlightStyle() {
    const cs = getComputedStyle(targetInput);
    const props = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "fontVariant",
        "fontStretch",
        "lineHeight",
        "letterSpacing",
        "wordSpacing",
        "textTransform",
        "textIndent",
        "textAlign",
        "tabSize",
        "whiteSpace",
        "overflowWrap",
        "wordBreak",
        "wordWrap",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "boxSizing",
        "direction",
    ] as const;
    for (const p of props) {
        (targetHighlight.style as unknown as Record<string, string>)[p] = cs.getPropertyValue(
            p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
        );
    }
}
syncHighlightStyle();
window.addEventListener("resize", syncHighlightStyle);

targetInput.addEventListener("scroll", () => {
    targetHighlight.scrollTop = targetInput.scrollTop;
    targetHighlight.scrollLeft = targetInput.scrollLeft;
});

targetInput.addEventListener("input", recompute);
queryInput.addEventListener("input", () => {
    if (composing) {
        // compositionupdate 직후 — compStart 유지
    } else if (justEndedComposing) {
        // compositionend 직후 한 번 — compStart/compLen 유지
        justEndedComposing = false;
    } else {
        // 새 비-IME 입력 — stale composition 상태 리셋
        compStart = -1;
        compLen = 0;
    }
    recompute();
});
optSpillMode.addEventListener("change", recompute);
optWhitespace.addEventListener("change", recompute);
optChoseong.addEventListener("change", recompute);
optMatchBest.addEventListener("change", () => {
    updateScoreRowDim();
    recompute();
});

for (const k of Object.keys(WEIGHT_INPUTS) as WeightKey[]) {
    WEIGHT_INPUTS[k].input.addEventListener("input", recompute);
}

optScoreReset.addEventListener("click", () => {
    setWeightInputs(undefined);
    recompute();
});

function updateScoreRowDim() {
    const dim = !optMatchBest.checked;
    for (const k of Object.keys(WEIGHT_INPUTS) as WeightKey[]) {
        const row = WEIGHT_INPUTS[k].input.closest(".opt-row");
        if (row) row.classList.toggle("dim", dim);
    }
}
updateScoreRowDim();
optForceNoComposing.addEventListener("change", recompute);

queryInput.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Delete") {
        e.preventDefault();
        queryInput.value = "";
        recompute();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (document.activeElement === queryInput) {
            targetInput.focus();
        } else {
            queryInput.focus();
        }
    }
});

recompute();
queryInput.focus();

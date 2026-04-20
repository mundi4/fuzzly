import {
    buildMatchRanges,
    buildQuery,
    matchBest,
    preprocessTarget,
    SCORING,
    type MatchResult,
    type Query,
    type QueryGrapheme,
    type ScoringConfig,
    type ScoringWeights,
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
    strict: boolean;
    whitespace: WhitespaceMode;
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
const status = $<HTMLSpanElement>("status");
const queryDebug = $<HTMLDivElement>("queryDebug");
const matchDebug = $<HTMLDivElement>("matchDebug");
const queryMeta = $<HTMLSpanElement>("queryMeta");
const matchMeta = $<HTMLSpanElement>("matchMeta");
const optStrict = $<HTMLInputElement>("optStrict");
const optWhitespace = $<HTMLSelectElement>("optWhitespace");
const optScoreReset = $<HTMLButtonElement>("optScoreReset");

type WeightKey =
    | "anchorFill"
    | "positionZero"
    | "boundary"
    | "consecutive"
    | "gapPenalty"
    | "targetLengthPenalty";

const WEIGHT_INPUTS: Record<WeightKey, { input: HTMLInputElement; def: number }> = {
    anchorFill: { input: $<HTMLInputElement>("wAnchorFill"), def: SCORING.ANCHOR_FILL },
    positionZero: { input: $<HTMLInputElement>("wPositionZero"), def: SCORING.POSITION_ZERO },
    boundary: { input: $<HTMLInputElement>("wBoundary"), def: SCORING.BOUNDARY },
    consecutive: { input: $<HTMLInputElement>("wConsecutive"), def: SCORING.CONSECUTIVE },
    gapPenalty: { input: $<HTMLInputElement>("wGapPenalty"), def: SCORING.GAP_PENALTY },
    targetLengthPenalty: { input: $<HTMLInputElement>("wTargetLengthPenalty"), def: SCORING.TARGET_LENGTH_PENALTY },
};

const LS_KEY = "fuzzly.playground.v3";

type Persisted = {
    target?: string;
    query?: string;
    strict?: boolean;
    whitespace?: WhitespaceMode;
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
        strict: optStrict.checked,
        whitespace: optWhitespace.value as WhitespaceMode,
        weights: currentWeights(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

(function restore() {
    const saved = loadPersisted();
    if (typeof saved.target === "string") targetInput.value = saved.target;
    if (typeof saved.query === "string") queryInput.value = saved.query;
    if (typeof saved.strict === "boolean") optStrict.checked = saved.strict;
    if (saved.whitespace) optWhitespace.value = saved.whitespace;
    setWeightInputs(saved.weights);
})();

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

function graphemePill(qg: QueryGrapheme): string {
    const { atoms, vowelIndex, tailIndex } = qg;
    let inner = "";
    for (let i = 0; i < atoms.length; i++) {
        const cls = tailIndex !== -1 && i >= tailIndex ? "tail" : vowelIndex !== -1 && i >= vowelIndex ? "vowel" : "lead";
        inner += `<span class="${cls}">${escapeHtml(atomIdToLabel(atoms[i]))}</span>`;
    }
    return `<span class="atom-pill" title="atoms=${atoms.length} vowelIndex=${vowelIndex} tailIndex=${tailIndex}"><span class="raw">${escapeHtml(qg.char)}</span>${inner}</span>`;
}

function renderQueryDebug(query: Query) {
    queryMeta.textContent = `${query.graphemes.length} grapheme(s) · whitespace=${query.whitespace}`;
    if (query.graphemes.length === 0) {
        queryDebug.textContent = "—";
        return;
    }
    queryDebug.innerHTML = query.graphemes.map((qg) => graphemePill(qg)).join(" ");
}

function renderMatchDebug(result: MatchResult | null, ms: number) {
    if (result === null) {
        matchMeta.textContent = `no match · ${ms.toFixed(2)}ms`;
        matchDebug.innerHTML = `<span style="color:var(--err)">no match</span>`;
        return;
    }
    matchMeta.textContent = `matchBest · ${ms.toFixed(2)}ms`;
    const scoreRow = typeof result.score === "number" ? `<dt>score</dt><dd>${result.score.toFixed(3)}</dd>` : "";
    matchDebug.innerHTML = `
        <dl class="match-kv">
            <dt>indices</dt><dd>[${result.indices.join(", ")}]</dd>
            <dt>runCount</dt><dd>${result.runCount}</dd>
            <dt>boundaryHits</dt><dd>${result.boundaryHits}</dd>
            <dt>startsAtZero</dt><dd>${result.startsAtZero}</dd>
            ${scoreRow}
        </dl>
    `;
}

// --- main recompute ---

function readOptions(): Options {
    return {
        strict: optStrict.checked,
        whitespace: optWhitespace.value as WhitespaceMode,
    };
}

function recompute() {
    const rawTarget = targetInput.value;
    const rawQuery = queryInput.value;
    const opts = readOptions();

    targetCount.textContent = `${rawTarget.length} chars`;
    queryCount.textContent = `${rawQuery.length} chars`;

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

    renderQueryDebug(query);

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
    const weights = currentWeights() as ScoringWeights;
    const scoring: ScoringConfig | undefined = isDefaultWeights() ? undefined : { weights };
    const result = matchBest(query, target, scoring, opts.strict);
    const t1 = performance.now();

    const ranges = result ? buildMatchRanges([result.indices], target) : [];
    renderHighlight(rawTarget, ranges);
    renderMatchDebug(result, t1 - t0);

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
queryInput.addEventListener("input", recompute);
optStrict.addEventListener("change", recompute);
optWhitespace.addEventListener("change", recompute);

for (const k of Object.keys(WEIGHT_INPUTS) as WeightKey[]) {
    WEIGHT_INPUTS[k].input.addEventListener("input", recompute);
}

optScoreReset.addEventListener("click", () => {
    setWeightInputs(undefined);
    recompute();
});

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

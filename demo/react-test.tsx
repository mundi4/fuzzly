import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useFuzzlyInput } from "fuzzly/react";

type RawEvent = {
    t: string;
    now: number;
    type: "compositionstart" | "compositionupdate" | "compositionend" | "input";
    data: string;
    sel: string;
    inputType?: string;
    value: string;
};

type EmitEntry = {
    t: string;
    now: number;
    text: string;
    composingIndex: number | null;
    isComposing: boolean;
    domValue: string;
    suspicious: string | null;
    invalid: string | null;
};

function nowStr(): string {
    return new Date().toISOString().slice(14, 23);
}

/**
 * Heuristic detection of transient `composingIndex=null` flickers.
 * A null emit is "suspicious" if it's sandwiched between two non-null emits
 * within SUSPICIOUS_WINDOW_MS. This catches rAF batching gaps if the browser
 * splits composition transitions across frames.
 */
const SUSPICIOUS_WINDOW_MS = 50;

function App() {
    const inputRef = useRef<HTMLInputElement>(null);
    const emit = useFuzzlyInput(inputRef);

    const [rawLog, setRawLog] = useState<RawEvent[]>([]);
    const [emitLog, setEmitLog] = useState<EmitEntry[]>([]);
    const prevEmitRef = useRef<{ now: number; composingIndex: number | null } | null>(null);

    // Raw event tracking (independent of the hook) for cross-reference.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;

        function push(ev: Omit<RawEvent, "t" | "now" | "value">) {
            const entry: RawEvent = {
                t: nowStr(),
                now: performance.now(),
                value: el?.value ?? "",
                ...ev,
            };
            setRawLog((prev) => [entry, ...prev].slice(0, 80));
        }

        const onStart = (e: CompositionEvent) => {
            push({
                type: "compositionstart",
                data: e.data ?? "",
                sel: `${el.selectionStart}-${el.selectionEnd}`,
            });
        };
        const onUpdate = (e: CompositionEvent) => {
            push({
                type: "compositionupdate",
                data: e.data ?? "",
                sel: `${el.selectionStart}-${el.selectionEnd}`,
            });
        };
        const onEnd = (e: CompositionEvent) => {
            push({
                type: "compositionend",
                data: e.data ?? "",
                sel: `${el.selectionStart}-${el.selectionEnd}`,
            });
        };
        const onInput = (e: Event) => {
            const inputEvent = e as InputEvent;
            push({
                type: "input",
                data: inputEvent.data ?? "",
                sel: `${el.selectionStart}-${el.selectionEnd}`,
                inputType: inputEvent.inputType,
            });
        };

        el.addEventListener("compositionstart", onStart);
        el.addEventListener("compositionupdate", onUpdate);
        el.addEventListener("compositionend", onEnd);
        el.addEventListener("input", onInput);

        return () => {
            el.removeEventListener("compositionstart", onStart);
            el.removeEventListener("compositionupdate", onUpdate);
            el.removeEventListener("compositionend", onEnd);
            el.removeEventListener("input", onInput);
        };
    }, []);

    // Track every hook emit and flag invalid / suspicious ones.
    useEffect(() => {
        const now = performance.now();
        const el = inputRef.current;
        const domValue = el?.value ?? "";

        let invalid: string | null = null;
        if (emit.composingIndex !== null && !emit.isComposing) {
            invalid = "composingIndex is number but isComposing=false (structural invariant violated)";
        } else if (emit.isComposing && emit.composingIndex === null) {
            invalid = "isComposing=true but composingIndex=null (structural invariant violated)";
        }

        let suspicious: string | null = null;
        const prev = prevEmitRef.current;
        if (
            !invalid &&
            prev &&
            prev.composingIndex !== null &&
            emit.composingIndex === null &&
            now - prev.now < SUSPICIOUS_WINDOW_MS
        ) {
            suspicious = `composingIndex just went ${prev.composingIndex} → null within ${(now - prev.now).toFixed(1)}ms`;
        }

        prevEmitRef.current = { now, composingIndex: emit.composingIndex };

        setEmitLog((p) =>
            [
                {
                    t: nowStr(),
                    now,
                    text: emit.text,
                    composingIndex: emit.composingIndex,
                    isComposing: emit.isComposing,
                    domValue,
                    suspicious,
                    invalid,
                },
                ...p,
            ].slice(0, 80),
        );
    }, [emit]);

    // Retroactive upgrade: if a null emit is followed by a non-null emit within the window,
    // the earlier null becomes suspicious (flicker).
    useEffect(() => {
        setEmitLog((prev) => {
            if (prev.length < 2) return prev;
            const [curr, next] = prev; // newest first
            if (
                curr.composingIndex !== null &&
                next.composingIndex === null &&
                !next.suspicious &&
                !next.invalid &&
                curr.now - next.now < SUSPICIOUS_WINDOW_MS
            ) {
                const upgraded = [...prev];
                upgraded[1] = {
                    ...next,
                    suspicious: `null emit sandwich: next emit (${curr.composingIndex}) arrived ${(curr.now - next.now).toFixed(1)}ms later`,
                };
                return upgraded;
            }
            return prev;
        });
    }, [emitLog]);

    const invalidCount = emitLog.filter((e) => e.invalid).length;
    const suspiciousCount = emitLog.filter((e) => e.suspicious).length;

    function clearLogs() {
        setRawLog([]);
        setEmitLog([]);
        prevEmitRef.current = null;
    }

    function copyEmits() {
        const text = [...emitLog]
            .reverse()
            .map((e) => {
                const tag = e.invalid ? "[INVALID]" : e.suspicious ? "[SUSPICIOUS]" : "";
                return `${e.t} emit text=${JSON.stringify(e.text)} composingIndex=${e.composingIndex} isComposing=${e.isComposing} domValue=${JSON.stringify(e.domValue)}${tag ? " " + tag : ""}${e.invalid ? " " + e.invalid : ""}${e.suspicious ? " " + e.suspicious : ""}`;
            })
            .join("\n");
        void navigator.clipboard.writeText(text);
    }

    function copyRaw() {
        const text = [...rawLog]
            .reverse()
            .map(
                (e) =>
                    `${e.t} ${e.type.padEnd(18)} data=${JSON.stringify(e.data)} value=${JSON.stringify(e.value)} sel=${e.sel}${e.inputType ? " inputType=" + e.inputType : ""}`,
            )
            .join("\n");
        void navigator.clipboard.writeText(text);
    }

    return (
        <>
            <div className="pane">
                <h3>입력 (한글 IME로 타이핑 — uncontrolled input + useFuzzlyInput)</h3>
                <input
                    ref={inputRef}
                    defaultValue=""
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="여기에 한글 타이핑… 예: 막엲ㄱ"
                />

                <h3>Hook 현재 상태</h3>
                <div className={`state ${emit.isComposing ? "composing" : "idle"}`}>
                    {emit.isComposing
                        ? `COMPOSING  composingIndex=${emit.composingIndex}`
                        : `IDLE  composingIndex=${emit.composingIndex === null ? "null" : emit.composingIndex}`}
                </div>

                <h3>text (hook)</h3>
                <pre>{JSON.stringify(emit.text)}</pre>

                <h3>domValue (live, input.value)</h3>
                <pre>{inputRef.current?.value ?? ""}</pre>

                <h3>검증 요약</h3>
                <div className={invalidCount + suspiciousCount === 0 ? "warn ok" : "warn bad"}>
                    invalid: {invalidCount}  suspicious: {suspiciousCount}
                </div>
            </div>

            <div className="pane">
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    hook emits
                    <button type="button" onClick={copyEmits}>
                        복사
                    </button>
                    <button type="button" onClick={clearLogs}>
                        clear
                    </button>
                </h3>
                <div className="log">
                    {emitLog.map((e, i) => (
                        <div
                            className={`entry ${e.invalid ? "invalid" : e.suspicious ? "suspicious" : ""}`}
                            key={`${e.now}-${i}`}
                        >
                            <span className="t">{e.t}</span>
                            <span className="ty em">emit</span>
                            <span className="field">
                                text={JSON.stringify(e.text)} composingIndex={e.composingIndex === null ? "null" : e.composingIndex} isComposing={String(e.isComposing)}
                                {e.invalid ? ` ⚠ ${e.invalid}` : ""}
                                {e.suspicious ? ` ⚠ ${e.suspicious}` : ""}
                            </span>
                        </div>
                    ))}
                </div>

                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    raw DOM events
                    <button type="button" onClick={copyRaw}>
                        복사
                    </button>
                </h3>
                <div className="log">
                    {rawLog.map((e, i) => {
                        const cls =
                            e.type === "compositionstart"
                                ? "cs"
                                : e.type === "compositionupdate"
                                    ? "cu"
                                    : e.type === "compositionend"
                                        ? "ce"
                                        : "in";
                        return (
                            <div className="entry" key={`${e.now}-${i}`}>
                                <span className="t">{e.t}</span>
                                <span className={`ty ${cls}`}>{e.type}</span>
                                <span className="field">
                                    data={JSON.stringify(e.data)} value={JSON.stringify(e.value)} sel={e.sel}
                                    {e.inputType ? ` inputType=${e.inputType}` : ""}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

const rootEl = document.getElementById("root");
if (rootEl) {
    createRoot(rootEl).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}

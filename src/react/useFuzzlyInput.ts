import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createImeController, type ImeController } from "./imeController";
import type { ImeEmitState } from "./imeStateMachine";

const INITIAL: ImeEmitState = {
    text: "",
    composingIndex: null,
    isComposing: false,
};

export interface UseFuzzlyInputOptions {
    /**
     * Lowest-priority seed for the value. Applied only when both the hook's
     * internal `text` and the DOM element's `value` are empty at attach time.
     * If you want a value that survives a remount or wins over JSX's
     * `defaultValue`, call `setValue(...)` instead.
     *
     * Attach resolution order: preserved hook state → DOM `value` (JSX
     * `defaultValue`, SSR, autofill) → `options.defaultValue`.
     */
    defaultValue?: string;
    /**
     * When the element detaches (unmount / ref swap), reset internal state to
     * INITIAL. Default true.
     *
     * Set false to carry both the React `text`/`composingIndex` state AND the
     * user-visible input value across a remount: on re-attach, the preserved
     * `text` is written back to the new element's `.value`.
     */
    resetOnDetach?: boolean;
}

export interface UseFuzzlyInputReturn<T extends HTMLInputElement | HTMLTextAreaElement> extends ImeEmitState {
    /** Callback ref — pass directly to JSX `ref={...}` or merge with other refs. */
    ref: (el: T | null) => void;
    /** Currently attached element, for imperative ops (focus/select/etc.). */
    element: RefObject<T | null>;
    /** Clear value + composition state. Does not blur. */
    reset: () => void;
    /** Programmatic value injection. Resets composition state. No native input event fires. */
    setValue: (value: string) => void;
}

interface Handlers {
    start: () => void;
    update: (e: Event) => void;
    end: () => void;
    input: () => void;
}

/**
 * Track an uncontrolled input/textarea and expose `{ text, composingIndex,
 * isComposing }`, plus a callback ref and imperative `reset` / `setValue`.
 *
 * `text` is the only field fuzzly matching needs — pass it straight to
 * `searcher.search(text)` or `matchBest(buildQuery(text), ...)`. The matching
 * pipeline no longer accepts a `composingIndex`; lenient matching covers IME
 * journey states by default.
 *
 * `composingIndex` and `isComposing` are kept as IME awareness signals for
 * consumers that need them outside the matching pipeline — e.g. rendering a
 * composition caret highlight, suppressing side effects (analytics, network
 * calls) while the user is mid-syllable, or driving composition-aware
 * autocomplete UI. `composingIndex` is the UTF-16 offset of the active
 * composition span when `isComposing` is true, otherwise `null`.
 *
 * Uncontrolled only: pairing React's `value` prop with IME composition buffers
 * breaks characters / cursor across browsers. Observe `text` and call `setValue`
 * if you need a controlled-feeling API.
 *
 * The callback ref owns the element lifecycle, so conditional mount, remount
 * (`key` change), and portal-delayed inputs all attach listeners correctly.
 * Internally `requestAnimationFrame`-batches composition transitions so
 * consumers reading `isComposing` / `composingIndex` see a clean
 * composing → composing handoff across syllable boundaries instead of a
 * one-frame `null` flicker between `compositionend` and the next
 * `compositionstart`.
 *
 * ```tsx
 * const { text, ref, reset } = useFuzzlyInput<HTMLInputElement>({
 *   defaultValue: initialQuery,
 * });
 * const results = searcher.search(text);
 * return <input ref={ref} defaultValue="" />;
 * ```
 *
 * Note: `setValue` assigns `el.value = v`, which moves the caret to the end
 * when the input is focused. Restore via `element.current?.setSelectionRange(...)`
 * if needed.
 */
export function useFuzzlyInput<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>(
    options?: UseFuzzlyInputOptions,
): UseFuzzlyInputReturn<T> {
    const [state, setState] = useState<ImeEmitState>(INITIAL);

    const elementRef = useRef<T | null>(null);
    const ctrlRef = useRef<ImeController | null>(null);
    const handlersRef = useRef<Handlers | null>(null);
    const optionsRef = useRef<UseFuzzlyInputOptions>(options ?? {});

    // Sync latest options into a ref every render. `refCallback` is pinned via
    // useCallback([], ...) so it would otherwise close over the *first* options.
    // Writing a ref during render is React-legal; useEffect would be one render
    // late and the very first attach could see stale `defaultValue`.
    optionsRef.current = options ?? {};

    // attach/detach only touch mutable refs plus the stable `setState`. They
    // never capture `options` directly (only via optionsRef.current at call
    // time), so pinning them with empty deps is safe.
    const attach = useCallback((el: T) => {
        const ctrl = createImeController(setState);
        const handlers: Handlers = {
            start: () =>
                ctrl.dispatch({
                    type: "compositionstart",
                    selectionStart: el.selectionStart ?? 0,
                }),
            update: (e: Event) =>
                ctrl.dispatch({
                    type: "compositionupdate",
                    data: (e as CompositionEvent).data ?? "",
                }),
            end: () => ctrl.dispatch({ type: "compositionend" }),
            input: () => ctrl.dispatch({ type: "input", value: el.value }),
        };

        el.addEventListener("compositionstart", handlers.start);
        el.addEventListener("compositionupdate", handlers.update);
        el.addEventListener("compositionend", handlers.end);
        el.addEventListener("input", handlers.input);

        ctrlRef.current = ctrl;
        handlersRef.current = handlers;

        // Attach init priority:
        //   1. Hook state has content (preserved from prior mount, or `setValue`
        //      called before attach) → push state.text to DOM so emit and
        //      user-visible value stay in sync.
        //   2. DOM already has content (JSX `defaultValue`, SSR hydration,
        //      browser autofill) → adopt it into state.
        //   3. `options.defaultValue` provided → seed both.
        //   4. Both empty → no-op.
        // Using the functional setState form so we read the latest state even
        // when attach runs synchronously after a `setValue` call.
        setState((current) => {
            if (current.text !== "") {
                if (el.value !== current.text) el.value = current.text;
                return current;
            }
            if (el.value !== "") {
                return {
                    text: el.value,
                    composingIndex: null,
                    isComposing: false,
                };
            }
            const { defaultValue } = optionsRef.current;
            if (defaultValue !== undefined && defaultValue !== "") {
                el.value = defaultValue;
                return {
                    text: defaultValue,
                    composingIndex: null,
                    isComposing: false,
                };
            }
            return current;
        });
    }, []);

    const detach = useCallback((el: T) => {
        const h = handlersRef.current;
        if (h) {
            el.removeEventListener("compositionstart", h.start);
            el.removeEventListener("compositionupdate", h.update);
            el.removeEventListener("compositionend", h.end);
            el.removeEventListener("input", h.input);
        }
        ctrlRef.current?.dispose();
        ctrlRef.current = null;
        handlersRef.current = null;
    }, []);

    const refCallback = useCallback(
        (el: T | null) => {
            const prev = elementRef.current;
            if (prev && prev !== el) detach(prev);
            elementRef.current = el;
            if (el) {
                attach(el);
            } else if (optionsRef.current.resetOnDetach !== false) {
                setState(INITIAL);
            }
        },
        [attach, detach],
    );

    const reset = useCallback(() => {
        const el = elementRef.current;
        if (el) el.value = "";
        ctrlRef.current?.reset();
        setState(INITIAL);
    }, []);

    const setValue = useCallback((value: string) => {
        const el = elementRef.current;
        if (el) el.value = value;
        ctrlRef.current?.reset();
        setState({ text: value, composingIndex: null, isComposing: false });
    }, []);

    // Final cleanup when the hook's owning component unmounts.
    // Callback-ref null path usually handles this first; detach is idempotent.
    useEffect(() => {
        return () => {
            const el = elementRef.current;
            if (el) detach(el);
            elementRef.current = null;
        };
    }, [detach]);

    // Stable return identity when state is unchanged — consumers using the whole
    // object as a hook dep (e.g. `useEffect(..., [emit])`) shouldn't re-fire on
    // unrelated parent re-renders. refCallback/reset/setValue have empty deps
    // and elementRef is a stable ref object, so `[state]` covers all inputs.
    return useMemo(
        () => ({
            ...state,
            ref: refCallback,
            element: elementRef,
            reset,
            setValue,
        }),
        [state, refCallback, reset, setValue],
    );
}

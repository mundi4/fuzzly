import { RefObject } from 'react';

/**
 * Public emission shape from `useFuzzlyInput`.
 *
 * - `text`: the input's current value. Pass this to `searcher.search(text)` —
 *   it's the only field the fuzzly matching pipeline consumes.
 * - `isComposing` / `composingIndex`: IME awareness signals. The matcher does
 *   not need them, but consumers can read them to render composition state
 *   (caret highlight, status badge), gate side effects (analytics,
 *   debouncing, network) while the user is mid-syllable, or drive
 *   composition-aware UI. `composingIndex` is the UTF-16 offset of the active
 *   composition span when `isComposing` is true, otherwise `null`.
 */
interface ImeEmitState {
    text: string;
    composingIndex: number | null;
    isComposing: boolean;
}

interface UseFuzzlyInputOptions {
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
interface UseFuzzlyInputReturn<T extends HTMLInputElement | HTMLTextAreaElement> extends ImeEmitState {
    /** Callback ref — pass directly to JSX `ref={...}` or merge with other refs. */
    ref: (el: T | null) => void;
    /** Currently attached element, for imperative ops (focus/select/etc.). */
    element: RefObject<T | null>;
    /** Clear value + composition state. Does not blur. */
    reset: () => void;
    /** Programmatic value injection. Resets composition state. No native input event fires. */
    setValue: (value: string) => void;
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
declare function useFuzzlyInput<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement>(options?: UseFuzzlyInputOptions): UseFuzzlyInputReturn<T>;

export { type ImeEmitState as FuzzlyInputState, type UseFuzzlyInputOptions, type UseFuzzlyInputReturn, useFuzzlyInput };

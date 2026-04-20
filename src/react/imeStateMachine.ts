export type ImeEvent =
    | { type: "compositionstart"; selectionStart: number }
    | { type: "compositionupdate"; data: string }
    | { type: "compositionend" }
    | { type: "input"; value: string };

export interface ImeInternalState {
    compStart: number;
    compLen: number;
    isComposing: boolean;
    text: string;
}

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
export interface ImeEmitState {
    text: string;
    composingIndex: number | null;
    isComposing: boolean;
}

export function createImeInternalState(): ImeInternalState {
    return { compStart: -1, compLen: 0, isComposing: false, text: "" };
}

export function applyImeEvent(state: ImeInternalState, event: ImeEvent): ImeInternalState {
    switch (event.type) {
        case "compositionstart":
            return { ...state, compStart: event.selectionStart, compLen: 0, isComposing: true };
        case "compositionupdate":
            return { ...state, compLen: event.data.length };
        case "compositionend":
            return { ...state, isComposing: false };
        case "input":
            return { ...state, text: event.value };
    }
}

export function projectEmitState(state: ImeInternalState): ImeEmitState {
    return {
        text: state.text,
        composingIndex: state.isComposing ? state.compStart : null,
        isComposing: state.isComposing,
    };
}

export function emitStatesEqual(a: ImeEmitState, b: ImeEmitState): boolean {
    return a.text === b.text && a.composingIndex === b.composingIndex && a.isComposing === b.isComposing;
}

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

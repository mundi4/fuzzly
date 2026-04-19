import {
    applyImeEvent,
    createImeInternalState,
    emitStatesEqual,
    type ImeEmitState,
    type ImeEvent,
    type ImeInternalState,
    projectEmitState,
} from "./imeStateMachine";

export type Scheduler = (fn: () => void) => () => void;

export const rafScheduler: Scheduler = (fn) => {
    const id = requestAnimationFrame(fn);
    return () => {
        cancelAnimationFrame(id);
    };
};

export interface ImeController {
    dispatch(event: ImeEvent): void;
    dispose(): void;
}

export function createImeController(
    emit: (state: ImeEmitState) => void,
    scheduler: Scheduler = rafScheduler,
): ImeController {
    let internal: ImeInternalState = createImeInternalState();
    let lastEmitted: ImeEmitState = projectEmitState(internal);
    let cancelPending: (() => void) | null = null;

    function schedulePublish() {
        if (cancelPending) return;
        cancelPending = scheduler(() => {
            cancelPending = null;
            const next = projectEmitState(internal);
            if (!emitStatesEqual(lastEmitted, next)) {
                lastEmitted = next;
                emit(next);
            }
        });
    }

    return {
        dispatch(event: ImeEvent) {
            internal = applyImeEvent(internal, event);
            schedulePublish();
        },
        dispose() {
            if (cancelPending) {
                cancelPending();
                cancelPending = null;
            }
        },
    };
}

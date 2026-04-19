import { type RefObject, useEffect, useState } from "react";
import { createImeController } from "./imeController";
import type { ImeEmitState } from "./imeStateMachine";

const INITIAL: ImeEmitState = { text: "", composingIndex: null, isComposing: false };

/**
 * IME 조합 상태를 추적하여 `fuzzly` 매치 함수에 바로 전달 가능한
 * `{ text, composingIndex, isComposing }`을 반환한다.
 *
 * 반드시 **uncontrolled** 로 사용:
 *
 * ```tsx
 * const ref = useRef<HTMLInputElement>(null);
 * const { text, composingIndex } = useFuzzlyInput(ref);
 * const results = searcher.search(text, {}, composingIndex);
 * return <input ref={ref} defaultValue="" />;
 * ```
 *
 * Controlled 패턴(`value`+`onChange`)은 IME composition buffer와 충돌하여
 * 조합중 문자가 깨지거나 커서가 튀는 버그를 유발하므로 지원하지 않는다.
 *
 * 내부적으로 `requestAnimationFrame`으로 이벤트를 프레임 단위 배칭하여
 * `compositionend` 직후 다음 `compositionstart`로 이어지는 음절 전이에서
 * 순간적인 `composingIndex=null` flicker가 소비자에게 노출되지 않도록 한다.
 */
export function useFuzzlyInput(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>): ImeEmitState {
    const [state, setState] = useState<ImeEmitState>(INITIAL);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const ctrl = createImeController(setState);

        const onStart = () => {
            ctrl.dispatch({ type: "compositionstart", selectionStart: el.selectionStart ?? 0 });
        };
        const onUpdate = (e: Event) => {
            ctrl.dispatch({ type: "compositionupdate", data: (e as CompositionEvent).data ?? "" });
        };
        const onEnd = () => {
            ctrl.dispatch({ type: "compositionend" });
        };
        const onInput = () => {
            ctrl.dispatch({ type: "input", value: el.value });
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
            ctrl.dispose();
        };
    }, [ref]);

    return state;
}

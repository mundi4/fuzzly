import { describe, expect, it } from "vitest";
import { createImeController } from "../../src/react/imeController";
import type { ImeEmitState } from "../../src/react/imeStateMachine";

function makeFakeScheduler() {
    const queue: Array<() => void> = [];
    const scheduler = (fn: () => void) => {
        queue.push(fn);
        return () => {
            const i = queue.indexOf(fn);
            if (i >= 0) queue.splice(i, 1);
        };
    };
    const flush = () => {
        while (queue.length) {
            const fn = queue.shift();
            fn?.();
        }
    };
    return { scheduler, flush, queue };
}

describe("imeController", () => {
    it("한 프레임 안의 음절 전이는 중간 null emit 없이 최종 상태만 emit (Chrome: end→start→update→input)", () => {
        const emits: ImeEmitState[] = [];
        const { scheduler, flush } = makeFakeScheduler();
        const ctrl = createImeController((s) => emits.push(s), scheduler);

        // 막 조합 완료 후 같은 프레임에 엲 시작
        ctrl.dispatch({ type: "compositionstart", selectionStart: 0 });
        ctrl.dispatch({ type: "compositionupdate", data: "막" });
        ctrl.dispatch({ type: "input", value: "막" });
        ctrl.dispatch({ type: "compositionend" });
        ctrl.dispatch({ type: "compositionstart", selectionStart: 1 });
        ctrl.dispatch({ type: "compositionupdate", data: "ㅇ" });
        ctrl.dispatch({ type: "input", value: "막ㅇ" });
        flush();

        expect(emits).toEqual([{ text: "막ㅇ", composingIndex: 1, isComposing: true }]);
        expect(emits.every((e) => e.composingIndex !== null)).toBe(true);
    });

    it("Firefox 시퀀스: compositionend 양쪽에 input이 끼어도 null flicker 없음", () => {
        const emits: ImeEmitState[] = [];
        const { scheduler, flush } = makeFakeScheduler();
        const ctrl = createImeController((s) => emits.push(s), scheduler);

        ctrl.dispatch({ type: "compositionstart", selectionStart: 0 });
        ctrl.dispatch({ type: "compositionupdate", data: "막" });
        ctrl.dispatch({ type: "input", value: "막" });
        // FF-only: compositionend 직전 input
        ctrl.dispatch({ type: "input", value: "막" });
        ctrl.dispatch({ type: "compositionend" });
        // FF-only: compositionend 직후 input
        ctrl.dispatch({ type: "input", value: "막" });
        ctrl.dispatch({ type: "compositionstart", selectionStart: 1 });
        ctrl.dispatch({ type: "compositionupdate", data: "ㅇ" });
        ctrl.dispatch({ type: "input", value: "막ㅇ" });
        flush();

        expect(emits).toEqual([{ text: "막ㅇ", composingIndex: 1, isComposing: true }]);
    });

    it("프레임 경계를 넘어 실제로 composition이 끝난 경우 null emit 1회", () => {
        const emits: ImeEmitState[] = [];
        const { scheduler, flush } = makeFakeScheduler();
        const ctrl = createImeController((s) => emits.push(s), scheduler);

        ctrl.dispatch({ type: "compositionstart", selectionStart: 0 });
        ctrl.dispatch({ type: "compositionupdate", data: "막" });
        ctrl.dispatch({ type: "input", value: "막" });
        flush();

        ctrl.dispatch({ type: "compositionend" });
        flush();

        expect(emits).toEqual([
            { text: "막", composingIndex: 0, isComposing: true },
            { text: "막", composingIndex: null, isComposing: false },
        ]);
    });

    it("같은 상태로의 재emit은 억제됨 (emitStatesEqual)", () => {
        const emits: ImeEmitState[] = [];
        const { scheduler, flush } = makeFakeScheduler();
        const ctrl = createImeController((s) => emits.push(s), scheduler);

        ctrl.dispatch({ type: "compositionstart", selectionStart: 0 });
        ctrl.dispatch({ type: "compositionupdate", data: "ㅁ" });
        ctrl.dispatch({ type: "input", value: "ㅁ" });
        flush();

        // 같은 프레임 내 상태 변화 없음 (compositionupdate만 와서 compLen만 바뀜, emit에 영향 없음)
        ctrl.dispatch({ type: "compositionupdate", data: "ㅁ" });
        flush();

        expect(emits).toHaveLength(1);
    });

    it("중복 schedule 호출은 한 번만 실행됨", () => {
        const emits: ImeEmitState[] = [];
        const { scheduler, flush, queue } = makeFakeScheduler();
        const ctrl = createImeController((s) => emits.push(s), scheduler);

        ctrl.dispatch({ type: "compositionstart", selectionStart: 0 });
        ctrl.dispatch({ type: "compositionupdate", data: "ㅁ" });
        ctrl.dispatch({ type: "input", value: "ㅁ" });

        expect(queue.length).toBe(1);

        flush();
        expect(emits).toHaveLength(1);
    });

    it("dispose는 pending emit을 취소", () => {
        const emits: ImeEmitState[] = [];
        const { scheduler, flush } = makeFakeScheduler();
        const ctrl = createImeController((s) => emits.push(s), scheduler);

        ctrl.dispatch({ type: "compositionstart", selectionStart: 0 });
        ctrl.dispose();
        flush();

        expect(emits).toHaveLength(0);
    });
});

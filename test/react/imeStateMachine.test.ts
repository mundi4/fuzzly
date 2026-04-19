import { describe, expect, it } from "vitest";
import {
    applyImeEvent,
    createImeInternalState,
    type ImeEvent,
    projectEmitState,
} from "../../src/react/imeStateMachine";

function drive(events: ImeEvent[]) {
    let s = createImeInternalState();
    for (const e of events) s = applyImeEvent(s, e);
    return projectEmitState(s);
}

describe("imeStateMachine", () => {
    it("초기 상태는 empty text / null composingIndex / not composing", () => {
        expect(projectEmitState(createImeInternalState())).toEqual({
            text: "",
            composingIndex: null,
            isComposing: false,
        });
    });

    it("compositionstart가 composingIndex를 selectionStart로 설정", () => {
        expect(drive([{ type: "compositionstart", selectionStart: 2 }])).toEqual({
            text: "",
            composingIndex: 2,
            isComposing: true,
        });
    });

    it("compositionstart + update + input: composing 상태 유지, text 갱신", () => {
        expect(
            drive([
                { type: "compositionstart", selectionStart: 0 },
                { type: "compositionupdate", data: "ㅁ" },
                { type: "input", value: "ㅁ" },
            ]),
        ).toEqual({ text: "ㅁ", composingIndex: 0, isComposing: true });
    });

    it("compositionend 후 composingIndex는 null, isComposing은 false", () => {
        expect(
            drive([
                { type: "compositionstart", selectionStart: 0 },
                { type: "compositionupdate", data: "막" },
                { type: "input", value: "막" },
                { type: "compositionend" },
            ]),
        ).toEqual({ text: "막", composingIndex: null, isComposing: false });
    });

    it("음절 전이: compositionend 후 새 compositionstart는 composingIndex를 새 위치로 갱신", () => {
        expect(
            drive([
                { type: "compositionstart", selectionStart: 0 },
                { type: "compositionupdate", data: "막" },
                { type: "input", value: "막" },
                { type: "compositionend" },
                { type: "compositionstart", selectionStart: 1 },
                { type: "compositionupdate", data: "ㅇ" },
                { type: "input", value: "막ㅇ" },
            ]),
        ).toEqual({ text: "막ㅇ", composingIndex: 1, isComposing: true });
    });

    it("막엲ㄱ 전체 journey 최종 상태", () => {
        expect(
            drive([
                { type: "compositionstart", selectionStart: 0 },
                { type: "compositionupdate", data: "ㅁ" },
                { type: "input", value: "ㅁ" },
                { type: "compositionupdate", data: "마" },
                { type: "input", value: "마" },
                { type: "compositionupdate", data: "막" },
                { type: "input", value: "막" },
                { type: "compositionend" },
                { type: "compositionstart", selectionStart: 1 },
                { type: "compositionupdate", data: "ㅇ" },
                { type: "input", value: "막ㅇ" },
                { type: "compositionupdate", data: "여" },
                { type: "input", value: "막여" },
                { type: "compositionupdate", data: "연" },
                { type: "input", value: "막연" },
                { type: "compositionupdate", data: "엲" },
                { type: "input", value: "막엲" },
                { type: "compositionend" },
                { type: "compositionstart", selectionStart: 2 },
                { type: "compositionupdate", data: "ㄱ" },
                { type: "input", value: "막엲ㄱ" },
            ]),
        ).toEqual({ text: "막엲ㄱ", composingIndex: 2, isComposing: true });
    });
});

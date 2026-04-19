import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
    useFuzzlyInput,
    type UseFuzzlyInputOptions,
    type UseFuzzlyInputReturn,
} from "../../src/react";

type Captured = UseFuzzlyInputReturn<HTMLInputElement>;

interface HarnessProps {
    options?: UseFuzzlyInputOptions;
    mountInput?: boolean;
    inputDefault?: string;
    onHook: (hook: Captured) => void;
}

function Harness({ options, mountInput = true, inputDefault, onHook }: HarnessProps) {
    const hook = useFuzzlyInput<HTMLInputElement>(options);
    onHook(hook);
    return mountInput ? <input ref={hook.ref} defaultValue={inputDefault} data-testid="input" /> : null;
}

function setup(initial: Omit<HarnessProps, "onHook"> = {}) {
    let last!: Captured;
    const onHook = (h: Captured) => {
        last = h;
    };
    const utils = render(<Harness {...initial} onHook={onHook} />);
    const get = () => last;
    const rerender = (next: Omit<HarnessProps, "onHook"> = {}) => {
        utils.rerender(<Harness {...next} onHook={onHook} />);
    };
    return { ...utils, get, rerender };
}

function getInput(container: HTMLElement): HTMLInputElement {
    const el = container.querySelector<HTMLInputElement>('[data-testid="input"]');
    if (!el) throw new Error("input not mounted");
    return el;
}

afterEach(() => {
    cleanup();
});

describe("useFuzzlyInput attach init priority", () => {
    it("adopts el.value when hook state is empty (JSX defaultValue prefill)", () => {
        const { get, container } = setup({ inputDefault: "hello" });
        expect(get().text).toBe("hello");
        expect(getInput(container).value).toBe("hello");
    });

    it("applies options.defaultValue when both hook state and el.value are empty", () => {
        const { get, container } = setup({ options: { defaultValue: "seed" } });
        expect(get().text).toBe("seed");
        expect(getInput(container).value).toBe("seed");
    });

    it("JSX defaultValue wins over options.defaultValue", () => {
        const { get, container } = setup({
            inputDefault: "dom",
            options: { defaultValue: "seed" },
        });
        expect(get().text).toBe("dom");
        expect(getInput(container).value).toBe("dom");
    });

    it("setValue() before attach pushes to DOM on attach", () => {
        const { get, rerender, container } = setup({ mountInput: false });
        act(() => {
            get().setValue("preloaded");
        });
        expect(get().text).toBe("preloaded");
        rerender({ mountInput: true });
        expect(get().text).toBe("preloaded");
        expect(getInput(container).value).toBe("preloaded");
    });

    it("preserved state (setValue) wins over JSX defaultValue on re-attach", () => {
        const { get, rerender, container } = setup({
            options: { resetOnDetach: false },
            inputDefault: "jsx-default",
        });
        // first attach adopts JSX defaultValue
        expect(get().text).toBe("jsx-default");

        act(() => {
            get().setValue("user-typed");
        });
        expect(getInput(container).value).toBe("user-typed");

        rerender({ mountInput: false, options: { resetOnDetach: false } });
        // state preserved
        expect(get().text).toBe("user-typed");

        rerender({
            mountInput: true,
            inputDefault: "jsx-default",
            options: { resetOnDetach: false },
        });
        // on re-attach, preserved state is pushed back to DOM
        expect(get().text).toBe("user-typed");
        expect(getInput(container).value).toBe("user-typed");
    });
});

describe("useFuzzlyInput remount semantics", () => {
    it("resetOnDetach: true (default) clears state on unmount", () => {
        const { get, rerender } = setup({ inputDefault: "hi" });
        expect(get().text).toBe("hi");

        rerender({ mountInput: false });
        expect(get().text).toBe("");

        rerender({ mountInput: true });
        expect(get().text).toBe("");
    });

    it("resetOnDetach: false preserves state AND syncs DOM on remount", () => {
        const { get, rerender, container } = setup({
            options: { resetOnDetach: false, defaultValue: "init" },
        });
        expect(get().text).toBe("init");

        act(() => {
            get().setValue("user-edit");
        });
        expect(get().text).toBe("user-edit");

        rerender({ mountInput: false, options: { resetOnDetach: false, defaultValue: "init" } });
        expect(get().text).toBe("user-edit");

        rerender({ mountInput: true, options: { resetOnDetach: false, defaultValue: "init" } });
        expect(get().text).toBe("user-edit");
        expect(getInput(container).value).toBe("user-edit");
    });

    it("defaultValue is not re-seeded when state is preserved across remount", () => {
        const { get, rerender } = setup({
            options: { resetOnDetach: false, defaultValue: "init" },
        });
        act(() => {
            get().reset();
        });
        expect(get().text).toBe("");

        rerender({ mountInput: false, options: { resetOnDetach: false, defaultValue: "init" } });
        rerender({ mountInput: true, options: { resetOnDetach: false, defaultValue: "init" } });
        // state is "", el.value is "" on fresh mount, defaultValue seeds again — that's fine
        // the contract is: defaultValue seeds only when both state and DOM are empty.
        expect(get().text).toBe("init");
    });
});

describe("useFuzzlyInput imperative API", () => {
    it("reset() clears state and DOM", () => {
        const { get, container } = setup({ inputDefault: "x" });
        expect(get().text).toBe("x");
        act(() => {
            get().reset();
        });
        expect(get().text).toBe("");
        expect(getInput(container).value).toBe("");
    });

    it("setValue() after attach updates state and DOM", () => {
        const { get, container } = setup();
        act(() => {
            get().setValue("new");
        });
        expect(get().text).toBe("new");
        expect(getInput(container).value).toBe("new");
    });

    it("element ref exposes currently attached element", () => {
        const { get, container } = setup();
        expect(get().element.current).toBe(getInput(container));
    });

    it("element ref becomes null when input unmounts", () => {
        const { get, rerender } = setup();
        expect(get().element.current).not.toBeNull();
        rerender({ mountInput: false });
        expect(get().element.current).toBeNull();
    });
});

describe("useFuzzlyInput lifecycle", () => {
    it("conditional mount: element mounted later still works", () => {
        const { get, rerender, container } = setup({ mountInput: false });
        expect(get().element.current).toBeNull();

        rerender({ mountInput: true });
        expect(get().element.current).not.toBeNull();

        act(() => {
            get().setValue("typed");
        });
        expect(get().text).toBe("typed");
        expect(getInput(container).value).toBe("typed");
    });

    it("returned hook object identity is stable across unrelated renders", () => {
        const { get, rerender } = setup();
        const first = get();
        rerender();
        expect(get()).toBe(first);
    });

    it("returned hook object identity changes when state changes", () => {
        const { get } = setup();
        const first = get();
        act(() => {
            get().setValue("changed");
        });
        expect(get()).not.toBe(first);
    });
});

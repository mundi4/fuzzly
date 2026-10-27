// src/react/useFuzzlyInput.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// src/react/imeStateMachine.ts
function createImeInternalState() {
  return { compStart: -1, compLen: 0, isComposing: false, text: "" };
}
function applyImeEvent(state, event) {
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
function projectEmitState(state) {
  return {
    text: state.text,
    composingIndex: state.isComposing ? state.compStart : null,
    isComposing: state.isComposing
  };
}
function emitStatesEqual(a, b) {
  return a.text === b.text && a.composingIndex === b.composingIndex && a.isComposing === b.isComposing;
}

// src/react/imeController.ts
var rafScheduler = (fn) => {
  const id = requestAnimationFrame(fn);
  return () => {
    cancelAnimationFrame(id);
  };
};
function createImeController(emit, scheduler = rafScheduler) {
  let internal = createImeInternalState();
  let lastEmitted = projectEmitState(internal);
  let cancelPending = null;
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
    dispatch(event) {
      internal = applyImeEvent(internal, event);
      schedulePublish();
    },
    reset() {
      if (cancelPending) {
        cancelPending();
        cancelPending = null;
      }
      internal = createImeInternalState();
      lastEmitted = projectEmitState(internal);
    },
    dispose() {
      if (cancelPending) {
        cancelPending();
        cancelPending = null;
      }
    }
  };
}

// src/react/useFuzzlyInput.ts
var INITIAL = {
  text: "",
  composingIndex: null,
  isComposing: false
};
function useFuzzlyInput(options) {
  const [state, setState] = useState(INITIAL);
  const elementRef = useRef(null);
  const ctrlRef = useRef(null);
  const handlersRef = useRef(null);
  const optionsRef = useRef(options ?? {});
  optionsRef.current = options ?? {};
  const attach = useCallback((el) => {
    const ctrl = createImeController(setState);
    const handlers = {
      start: () => ctrl.dispatch({
        type: "compositionstart",
        selectionStart: el.selectionStart ?? 0
      }),
      update: (e) => ctrl.dispatch({
        type: "compositionupdate",
        data: e.data ?? ""
      }),
      end: () => ctrl.dispatch({ type: "compositionend" }),
      input: () => ctrl.dispatch({ type: "input", value: el.value })
    };
    el.addEventListener("compositionstart", handlers.start);
    el.addEventListener("compositionupdate", handlers.update);
    el.addEventListener("compositionend", handlers.end);
    el.addEventListener("input", handlers.input);
    ctrlRef.current = ctrl;
    handlersRef.current = handlers;
    setState((current) => {
      if (current.text !== "") {
        if (el.value !== current.text) el.value = current.text;
        return current;
      }
      if (el.value !== "") {
        return {
          text: el.value,
          composingIndex: null,
          isComposing: false
        };
      }
      const { defaultValue } = optionsRef.current;
      if (defaultValue !== void 0 && defaultValue !== "") {
        el.value = defaultValue;
        return {
          text: defaultValue,
          composingIndex: null,
          isComposing: false
        };
      }
      return current;
    });
  }, []);
  const detach = useCallback((el) => {
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
    (el) => {
      const prev = elementRef.current;
      if (prev && prev !== el) detach(prev);
      elementRef.current = el;
      if (el) {
        attach(el);
      } else if (optionsRef.current.resetOnDetach !== false) {
        setState(INITIAL);
      }
    },
    [attach, detach]
  );
  const reset = useCallback(() => {
    const el = elementRef.current;
    if (el) el.value = "";
    ctrlRef.current?.reset();
    setState(INITIAL);
  }, []);
  const setValue = useCallback((value) => {
    const el = elementRef.current;
    if (el) el.value = value;
    ctrlRef.current?.reset();
    setState({ text: value, composingIndex: null, isComposing: false });
  }, []);
  useEffect(() => {
    return () => {
      const el = elementRef.current;
      if (el) detach(el);
      elementRef.current = null;
    };
  }, [detach]);
  return useMemo(
    () => ({
      ...state,
      ref: refCallback,
      element: elementRef,
      reset,
      setValue
    }),
    [state, refCallback, reset, setValue]
  );
}
export {
  useFuzzlyInput
};
//# sourceMappingURL=index.js.map
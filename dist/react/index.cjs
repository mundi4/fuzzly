"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react/index.ts
var react_exports = {};
__export(react_exports, {
  useFuzzlyInput: () => useFuzzlyInput
});
module.exports = __toCommonJS(react_exports);

// src/react/useFuzzlyInput.ts
var import_react = require("react");

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
  const [state, setState] = (0, import_react.useState)(INITIAL);
  const elementRef = (0, import_react.useRef)(null);
  const ctrlRef = (0, import_react.useRef)(null);
  const handlersRef = (0, import_react.useRef)(null);
  const optionsRef = (0, import_react.useRef)(options ?? {});
  optionsRef.current = options ?? {};
  const attach = (0, import_react.useCallback)((el) => {
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
  const detach = (0, import_react.useCallback)((el) => {
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
  const refCallback = (0, import_react.useCallback)(
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
  const reset = (0, import_react.useCallback)(() => {
    const el = elementRef.current;
    if (el) el.value = "";
    ctrlRef.current?.reset();
    setState(INITIAL);
  }, []);
  const setValue = (0, import_react.useCallback)((value) => {
    const el = elementRef.current;
    if (el) el.value = value;
    ctrlRef.current?.reset();
    setState({ text: value, composingIndex: null, isComposing: false });
  }, []);
  (0, import_react.useEffect)(() => {
    return () => {
      const el = elementRef.current;
      if (el) detach(el);
      elementRef.current = null;
    };
  }, [detach]);
  return (0, import_react.useMemo)(
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  useFuzzlyInput
});
//# sourceMappingURL=index.cjs.map
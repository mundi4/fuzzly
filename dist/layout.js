// src/layout.ts
var KEY_TO_JAMO = {
  q: "\u3142",
  w: "\u3148",
  e: "\u3137",
  r: "\u3131",
  t: "\u3145",
  y: "\u315B",
  u: "\u3155",
  i: "\u3151",
  o: "\u3150",
  p: "\u3154",
  a: "\u3141",
  s: "\u3134",
  d: "\u3147",
  f: "\u3139",
  g: "\u314E",
  h: "\u3157",
  j: "\u3153",
  k: "\u314F",
  l: "\u3163",
  z: "\u314B",
  x: "\u314C",
  c: "\u314A",
  v: "\u314D",
  b: "\u3160",
  n: "\u315C",
  m: "\u3161",
  Q: "\u3143",
  W: "\u3149",
  E: "\u3138",
  R: "\u3132",
  T: "\u3146",
  O: "\u3152",
  P: "\u3156"
};
var JAMO_TO_KEY = {};
for (const key of Object.keys(KEY_TO_JAMO)) {
  JAMO_TO_KEY[KEY_TO_JAMO[key]] = key;
}
var SHIFTABLE_KEYS = new Set("qwertop");
var LEADS = "\u3131\u3132\u3134\u3137\u3138\u3139\u3141\u3142\u3143\u3145\u3146\u3147\u3148\u3149\u314A\u314B\u314C\u314D\u314E";
var MEDIALS = "\u314F\u3150\u3151\u3152\u3153\u3154\u3155\u3156\u3157\u3158\u3159\u315A\u315B\u315C\u315D\u315E\u315F\u3160\u3161\u3162\u3163";
var FINALS = "\0\u3131\u3132\u3133\u3134\u3135\u3136\u3137\u3139\u313A\u313B\u313C\u313D\u313E\u313F\u3140\u3141\u3142\u3144\u3145\u3146\u3147\u3148\u314A\u314B\u314C\u314D\u314E";
var SYLLABLE_BASE = 44032;
var SYLLABLE_LAST = 55203;
var MEDIAL_COUNT = 21;
var FINAL_COUNT = 28;
var MEDIAL_JOIN = {
  \u3157\u314F: "\u3158",
  \u3157\u3150: "\u3159",
  \u3157\u3163: "\u315A",
  \u315C\u3153: "\u315D",
  \u315C\u3154: "\u315E",
  \u315C\u3163: "\u315F",
  \u3161\u3163: "\u3162"
};
var FINAL_JOIN = {
  \u3131\u3145: "\u3133",
  \u3134\u3148: "\u3135",
  \u3134\u314E: "\u3136",
  \u3139\u3131: "\u313A",
  \u3139\u3141: "\u313B",
  \u3139\u3142: "\u313C",
  \u3139\u3145: "\u313D",
  \u3139\u314C: "\u313E",
  \u3139\u314D: "\u313F",
  \u3139\u314E: "\u3140",
  \u3142\u3145: "\u3144"
};
var CLUSTER_SPLIT = {};
for (const pair of Object.keys(MEDIAL_JOIN)) {
  CLUSTER_SPLIT[MEDIAL_JOIN[pair]] = pair;
}
for (const pair of Object.keys(FINAL_JOIN)) {
  CLUSTER_SPLIT[FINAL_JOIN[pair]] = pair;
}
var isMedial = (jamo) => MEDIALS.includes(jamo);
var isFinal = (jamo) => FINALS.indexOf(jamo) > 0;
function composeJamos(jamos) {
  let out = "";
  let lead = null;
  let medial = null;
  let final = null;
  const flush = () => {
    if (lead !== null && medial !== null) {
      const code = SYLLABLE_BASE + (LEADS.indexOf(lead) * MEDIAL_COUNT + MEDIALS.indexOf(medial)) * FINAL_COUNT + (final === null ? 0 : FINALS.indexOf(final));
      out += String.fromCharCode(code);
    } else {
      if (lead !== null) out += lead;
      if (medial !== null) out += medial;
      if (final !== null) out += final;
    }
    lead = medial = final = null;
  };
  for (const jamo of jamos) {
    if (isMedial(jamo)) {
      if (final !== null) {
        const split = CLUSTER_SPLIT[final];
        const carried = split ? split[1] : final;
        final = split ? split[0] : null;
        flush();
        lead = carried;
        medial = jamo;
      } else if (medial !== null && MEDIAL_JOIN[medial + jamo]) {
        medial = MEDIAL_JOIN[medial + jamo];
      } else if (medial !== null) {
        flush();
        medial = jamo;
      } else {
        medial = jamo;
      }
    } else if (lead !== null && medial !== null && final === null && isFinal(jamo)) {
      final = jamo;
    } else if (final !== null && FINAL_JOIN[final + jamo]) {
      final = FINAL_JOIN[final + jamo];
    } else {
      flush();
      lead = jamo;
    }
  }
  flush();
  return out;
}
function conjoiningToCompat(code) {
  if (code >= 4352 && code <= 4370) return LEADS[code - 4352];
  if (code >= 4449 && code <= 4469) return MEDIALS[code - 4449];
  if (code >= 4520 && code <= 4546) return FINALS[code - 4520 + 1];
  return null;
}
function decomposeHangul(ch) {
  const code = ch.charCodeAt(0);
  let jamos;
  if (code >= SYLLABLE_BASE && code <= SYLLABLE_LAST) {
    const offset = code - SYLLABLE_BASE;
    const finalIndex = offset % FINAL_COUNT;
    jamos = LEADS[Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT))] + MEDIALS[Math.floor(offset / FINAL_COUNT) % MEDIAL_COUNT] + (finalIndex === 0 ? "" : FINALS[finalIndex]);
  } else {
    jamos = conjoiningToCompat(code) ?? ch;
  }
  let out = "";
  for (const jamo of jamos) {
    out += CLUSTER_SPLIT[jamo] ?? jamo;
  }
  return out;
}
var isHangul = (ch) => {
  const code = ch.charCodeAt(0);
  return code >= SYLLABLE_BASE && code <= SYLLABLE_LAST || code >= 12593 && code <= 12643 || conjoiningToCompat(code) !== null;
};
function inferCapsLock(input) {
  let h1Refuted = false;
  let h2Refuted = false;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isUpper && !isLower) continue;
    if (SHIFTABLE_KEYS.has(isUpper ? String.fromCharCode(code + 32) : input[i])) continue;
    if (isLower) h2Refuted = true;
    else h1Refuted = true;
  }
  return h1Refuted && !h2Refuted;
}
function swapLayout(input, capsLock) {
  if (input === "") return "";
  const invertCase = capsLock ?? inferCapsLock(input);
  let out = "";
  let latinRun = [];
  let hangulRun = "";
  const flushLatin = () => {
    if (latinRun.length > 0) {
      out += composeJamos(latinRun);
      latinRun = [];
    }
  };
  const flushHangul = () => {
    if (hangulRun !== "") {
      for (const jamo of hangulRun) {
        out += JAMO_TO_KEY[jamo] ?? jamo;
      }
      hangulRun = "";
    }
  };
  for (const ch of input) {
    const keyed = invertCase ? ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase() : ch;
    const jamo = KEY_TO_JAMO[keyed] ?? KEY_TO_JAMO[keyed.toLowerCase()];
    if (jamo !== void 0) {
      flushHangul();
      latinRun.push(jamo);
    } else if (isHangul(ch)) {
      flushLatin();
      hangulRun += decomposeHangul(ch);
    } else {
      flushLatin();
      flushHangul();
      out += ch;
    }
  }
  flushLatin();
  flushHangul();
  return out;
}
export {
  swapLayout
};
//# sourceMappingURL=layout.js.map
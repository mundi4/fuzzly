// src/internal/atomRegistry.ts
var CONSONANTS = "\u3131\u3132\u3134\u3137\u3138\u3139\u3141\u3142\u3143\u3145\u3146\u3147\u3148\u3149\u314A\u314B\u314C\u314D\u314E";
var VOWELS = "\u314F\u3150\u3151\u3152\u3153\u3154\u3155\u3156\u3157\u315B\u315C\u3160\u3161\u3163";
var FIRST_CONSONANT_ID = 1;
var FIRST_VOWEL_ID = 20;
var FIRST_ASCII_ID = 34;
var ASCII_START = 32;
var ASCII_END = 126;
var idToCharTable = [];
for (let i = 0; i < CONSONANTS.length; i++) {
  const id = FIRST_CONSONANT_ID + i;
  idToCharTable[id] = CONSONANTS[i];
}
for (let i = 0; i < VOWELS.length; i++) {
  const id = FIRST_VOWEL_ID + i;
  idToCharTable[id] = VOWELS[i];
}
for (let code = ASCII_START; code <= ASCII_END; code++) {
  const id = FIRST_ASCII_ID + (code - ASCII_START);
  idToCharTable[id] = String.fromCharCode(code);
}
var isVowelLUT = new Uint8Array(256);
for (let i = FIRST_VOWEL_ID; i < FIRST_VOWEL_ID + VOWELS.length; i++) {
  isVowelLUT[i] = 1;
}
var isHangulJamoLUT = new Uint8Array(256);
for (let i = FIRST_CONSONANT_ID; i < FIRST_CONSONANT_ID + CONSONANTS.length; i++) {
  isHangulJamoLUT[i] = 1;
}
for (let i = FIRST_VOWEL_ID; i < FIRST_VOWEL_ID + VOWELS.length; i++) {
  isHangulJamoLUT[i] = 1;
}
var isConsonantLUT = new Uint8Array(256);
for (let i = FIRST_CONSONANT_ID; i < FIRST_CONSONANT_ID + CONSONANTS.length; i++) {
  isConsonantLUT[i] = 1;
}
var compatJamoToId = new Uint8Array(12643 - 12593 + 1);
for (let i = 0; i < CONSONANTS.length; i++) {
  compatJamoToId[CONSONANTS.charCodeAt(i) - 12593] = FIRST_CONSONANT_ID + i;
}
for (let i = 0; i < VOWELS.length; i++) {
  compatJamoToId[VOWELS.charCodeAt(i) - 12593] = FIRST_VOWEL_ID + i;
}
function atomCharToId(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 12593 && code <= 12643) {
    const id = compatJamoToId[code - 12593];
    if (id !== 0) return id;
  }
  if (code >= ASCII_START && code <= ASCII_END) {
    return FIRST_ASCII_ID + (code - ASCII_START);
  }
  return code;
}
function atomIdToChar(id) {
  return idToCharTable[id] ?? String.fromCodePoint(id);
}
var SPACE_ID = atomCharToId(" ");
var SPACE_CHAR_CODE = 32;
var isBoundarySeparatorLUT = new Uint8Array(256);
for (const ch of " _-./\\:") {
  isBoundarySeparatorLUT[atomCharToId(ch)] = 1;
}

// src/score.ts
var SCORING = {
  /**
   * 각 target anchor에 떨어진 atom 수의 제곱에 곱해지는 가중치.
   * 한 anchor에 atom이 많이 몰릴수록 (완전 매치) 비선형으로 보상.
   * 분산된 spill 매치는 anchorFill 기여만 놓고 보면 Σ(atoms²)가 작아져 불리하다.
   */
  ANCHOR_FILL: 50,
  /** 첫 매치가 target index 0에서 시작할 때 보너스 */
  POSITION_ZERO: 30,
  /** 단어 경계 매치당 보너스 */
  BOUNDARY: 20,
  /**
   * 각 maximal consecutive run에 대해 (runLen - 1)² 을 곱해 가산되는 가중치.
   * 제곱이라 긴 run을 비선형 우대 (L=4 → 9, L=3 → 4, L=2 → 1).
   * anchorFill의 Σ(atoms²) 철학과 대칭.
   */
  CONSECUTIVE: 20,
  /** gap 거리(tgi)당 페널티 */
  GAP_PENALTY: -3,
  /** target 길이(grapheme)당 페널티 */
  TARGET_LENGTH_PENALTY: -1
};
var NO_BONUS = () => 0;
var DEFAULT_RESOLVED = {
  anchorFill: SCORING.ANCHOR_FILL,
  positionZero: SCORING.POSITION_ZERO,
  boundary: SCORING.BOUNDARY,
  consecutive: SCORING.CONSECUTIVE,
  gapPenalty: SCORING.GAP_PENALTY,
  targetLengthPenalty: SCORING.TARGET_LENGTH_PENALTY,
  getBonus: NO_BONUS
};
var resolvedCache = /* @__PURE__ */ new WeakMap();
function resolveScoring(config, _target) {
  if (config == null) return DEFAULT_RESOLVED;
  const w = config.weights;
  const gb = config.graphemeBonus;
  if (w == null && gb == null) return DEFAULT_RESOLVED;
  const cacheable = typeof gb !== "function";
  if (cacheable) {
    const hit = resolvedCache.get(config);
    if (hit !== void 0) return hit;
  }
  let getBonus;
  if (gb == null) {
    getBonus = NO_BONUS;
  } else if (typeof gb === "function") {
    getBonus = (gi) => gb(gi, _target);
  } else {
    getBonus = (gi) => gi < gb.length ? Number(gb[gi] ?? 0) : 0;
  }
  const resolved = {
    anchorFill: w?.anchorFill ?? SCORING.ANCHOR_FILL,
    positionZero: w?.positionZero ?? SCORING.POSITION_ZERO,
    boundary: w?.boundary ?? SCORING.BOUNDARY,
    consecutive: w?.consecutive ?? SCORING.CONSECUTIVE,
    gapPenalty: w?.gapPenalty ?? SCORING.GAP_PENALTY,
    targetLengthPenalty: w?.targetLengthPenalty ?? SCORING.TARGET_LENGTH_PENALTY,
    getBonus
  };
  if (cacheable) resolvedCache.set(config, resolved);
  return resolved;
}
function createGraphemeBonuses(target, ranges) {
  const bonuses = new Array(target.graphemeCount).fill(0);
  const gIdx = target.graphemeIndexes;
  const charIdx = target.charIndexes;
  const transparent = target.whitespace === "transparent";
  const normalized = target.normalizedInput;
  const isSkippedSpace = (p) => normalized.charCodeAt(p) === SPACE_CHAR_CODE && charIdx[gIdx[p]] !== p;
  for (const range of ranges) {
    const { bonus } = range;
    let start = range.start;
    let last = Math.min(range.end - 1, gIdx.length - 1);
    if (transparent) {
      while (start <= last && isSkippedSpace(start)) start++;
      while (last >= start && isSkippedSpace(last)) last--;
    }
    if (start > last) continue;
    const startGi = gIdx[start];
    const endGi = gIdx[last];
    if (startGi == null || endGi == null) continue;
    for (let gi = startGi; gi <= endGi; gi++) {
      bonuses[gi] += bonus;
    }
  }
  return bonuses;
}
function defaultScore(result) {
  let s = 0;
  if (result.startsAtZero) s += 1e3;
  s += result.boundaryHits * 100;
  s -= result.runCount * 5;
  return s;
}

export {
  isVowelLUT,
  isConsonantLUT,
  atomCharToId,
  atomIdToChar,
  SPACE_ID,
  SPACE_CHAR_CODE,
  isBoundarySeparatorLUT,
  SCORING,
  resolveScoring,
  createGraphemeBonuses,
  defaultScore
};
//# sourceMappingURL=chunk-OT55QZ37.js.map
// src/buildMatchRanges.ts
function buildMatchRanges(hitMaps, target) {
  let indices;
  if (hitMaps.length === 1) {
    indices = hitMaps[0];
  } else if (hitMaps.length === 0) {
    return [];
  } else {
    indices = [];
    for (const hitMap of hitMaps) {
      if (hitMap) indices.push(...hitMap);
    }
    indices.sort((a, b) => a - b);
  }
  if (indices.length === 0) return [];
  const ranges = [];
  const charIndexes = target.charIndexes;
  const inputLength = target.input.length;
  let rangeStart = indices[0];
  let prev = indices[0];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === prev) continue;
    if (indices[i] !== prev + 1) {
      ranges.push({
        start: charIndexes[rangeStart],
        end: charIndexes[prev + 1] ?? inputLength
      });
      rangeStart = indices[i];
    }
    prev = indices[i];
  }
  ranges.push({
    start: charIndexes[rangeStart],
    end: charIndexes[prev + 1] ?? inputLength
  });
  return ranges;
}

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
var UNDERSCORE_ID = atomCharToId("_");
var DASH_ID = atomCharToId("-");
var DOT_ID = atomCharToId(".");

// src/internal/segmenter.ts
var segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
function isFastSegmentable(input) {
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (!(c >= 32 && c <= 126 || c >= 44032 && c <= 55203 || c >= 12593 && c <= 12686)) {
      return false;
    }
  }
  return true;
}
function eachGrapheme(input, cb) {
  if (isFastSegmentable(input)) {
    for (let i = 0; i < input.length; i++) {
      cb(input[i], i);
    }
    return;
  }
  for (const seg of segmenter.segment(input)) {
    cb(seg.segment, seg.index);
  }
}

// src/internal/utils.ts
var VOWEL_SPLIT_MAP = {
  \u3158: "\u3157\u314F",
  \u3159: "\u3157\u3150",
  \u315A: "\u3157\u3163",
  \u315D: "\u315C\u3153",
  \u315E: "\u315C\u3154",
  \u315F: "\u315C\u3163",
  \u3162: "\u3161\u3163"
};
var TAIL_SPLIT_MAP = {
  \u3133: "\u3131\u3145",
  \u3135: "\u3134\u3148",
  \u3136: "\u3134\u314E",
  \u313A: "\u3139\u3131",
  \u313B: "\u3139\u3141",
  \u313C: "\u3139\u3142",
  \u313D: "\u3139\u3145",
  \u313E: "\u3139\u314C",
  \u313F: "\u3139\u314D",
  \u3140: "\u3139\u314E",
  \u3144: "\u3142\u3145"
};
var LEAD_TABLE = [
  "\u3131",
  "\u3132",
  "\u3134",
  "\u3137",
  "\u3138",
  "\u3139",
  "\u3141",
  "\u3142",
  "\u3143",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u3149",
  "\u314A",
  "\u314B",
  "\u314C",
  "\u314D",
  "\u314E"
];
var VOWEL_TABLE = [
  "\u314F",
  "\u3150",
  "\u3151",
  "\u3152",
  "\u3153",
  "\u3154",
  "\u3155",
  "\u3156",
  "\u3157",
  "\u3158",
  "\u3159",
  "\u315A",
  "\u315B",
  "\u315C",
  "\u315D",
  "\u315E",
  "\u315F",
  "\u3160",
  "\u3161",
  "\u3162",
  "\u3163"
];
var TAIL_TABLE = [
  "",
  // 종성 없음
  "\u3131",
  "\u3132",
  "\u3133",
  "\u3134",
  "\u3135",
  "\u3136",
  "\u3137",
  "\u3139",
  "\u313A",
  "\u313B",
  "\u313C",
  "\u313D",
  "\u313E",
  "\u313F",
  "\u3140",
  "\u3141",
  "\u3142",
  "\u3144",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u314A",
  "\u314B",
  "\u314C",
  "\u314D",
  "\u314E"
];
var NORMALIZE_LEAD = [
  "\u3131",
  "\u3132",
  "\u3134",
  "\u3137",
  "\u3138",
  "\u3139",
  "\u3141",
  "\u3142",
  "\u3143",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u3149",
  "\u314A",
  "\u314B",
  "\u314C",
  "\u314D",
  "\u314E"
];
var NORMALIZE_VOWEL = [
  "\u314F",
  "\u3150",
  "\u3151",
  "\u3152",
  "\u3153",
  "\u3154",
  "\u3155",
  "\u3156",
  "\u3157",
  "\u3158",
  "\u3159",
  "\u315A",
  "\u315B",
  "\u315C",
  "\u315D",
  "\u315E",
  "\u315F",
  "\u3160",
  "\u3161",
  "\u3162",
  "\u3163"
];
var NORMALIZE_TAIL = [
  "\u3131",
  "\u3132",
  "\u3133",
  "\u3134",
  "\u3135",
  "\u3136",
  "\u3137",
  "\u3139",
  "\u313A",
  "\u313B",
  "\u313C",
  "\u313D",
  "\u313E",
  "\u313F",
  "\u3140",
  "\u3141",
  "\u3142",
  "\u3144",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u314A",
  "\u314B",
  "\u314C",
  "\u314D",
  "\u314E"
];
function splitVowel(v) {
  return VOWEL_SPLIT_MAP[v] ?? v;
}
function splitTail(t) {
  return TAIL_SPLIT_MAP[t] ?? t;
}
function normalizeCharToCompat(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 4352 && code <= 4370) {
    return NORMALIZE_LEAD[code - 4352];
  }
  if (code >= 4449 && code <= 4469) {
    return NORMALIZE_VOWEL[code - 4449];
  }
  if (code >= 4520 && code <= 4546) {
    return NORMALIZE_TAIL[code - 4520];
  }
  return ch;
}
var isProd = (() => {
  try {
    const g = globalThis;
    return g.process?.env?.NODE_ENV === "production";
  } catch {
    return false;
  }
})();
function foldCase(input) {
  let lowered = input.toLowerCase();
  if (lowered.length !== input.length) {
    lowered = "";
    for (const cp of input) {
      const l = cp.toLowerCase();
      lowered += l.length === cp.length ? l : cp;
    }
  }
  if (lowered.indexOf("\u03C2") >= 0) lowered = lowered.replace(/ς/g, "\u03C3");
  return lowered;
}
function computeAtomRoles(atoms) {
  let vowelIndex = -1;
  let tailIndex = -1;
  for (let i = 0; i < atoms.length; i++) {
    const v = isVowelLUT[atoms[i]] === 1;
    if (vowelIndex === -1) {
      if (v) vowelIndex = i;
    } else {
      if (!v) {
        tailIndex = i;
        break;
      }
    }
  }
  return { vowelIndex, tailIndex };
}
var atomsCache = /* @__PURE__ */ new Map();
var buildBuf = new Uint16Array(8);
function decomposeToAtoms(ch) {
  const cached = atomsCache.get(ch);
  if (cached) return cached;
  const code = ch.charCodeAt(0);
  let len = 0;
  if (code >= 44032 && code <= 55203) {
    const base = code - 44032;
    const leadIndex = Math.floor(base / 588);
    const vowelIndex = Math.floor(base % 588 / 28);
    const tailIndex = base % 28;
    buildBuf[len++] = atomCharToId(LEAD_TABLE[leadIndex]);
    const splitV = splitVowel(VOWEL_TABLE[vowelIndex]);
    for (let i = 0; i < splitV.length; i++) {
      buildBuf[len++] = atomCharToId(splitV[i]);
    }
    if (tailIndex !== 0) {
      const splitT = splitTail(TAIL_TABLE[tailIndex]);
      for (let i = 0; i < splitT.length; i++) {
        buildBuf[len++] = atomCharToId(splitT[i]);
      }
    }
  } else if (code >= 4352 && code <= 4607 || code >= 12592 && code <= 12687) {
    const norm = normalizeCharToCompat(ch);
    const mid = splitVowel(norm);
    const broken = splitTail(mid);
    for (let i = 0; i < broken.length; i++) {
      buildBuf[len++] = atomCharToId(broken[i]);
    }
  } else {
    if (ch.length <= buildBuf.length) {
      for (let i = 0; i < ch.length; i++) {
        buildBuf[len++] = atomCharToId(ch[i]);
      }
      const ret3 = new Uint16Array(len);
      ret3.set(buildBuf.subarray(0, len));
      atomsCache.set(ch, ret3);
      return ret3;
    }
    const ret2 = new Uint16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      ret2[i] = atomCharToId(ch[i]);
    }
    atomsCache.set(ch, ret2);
    return ret2;
  }
  const ret = new Uint16Array(len);
  ret.set(buildBuf.subarray(0, len));
  atomsCache.set(ch, ret);
  return ret;
}

// src/buildQuery.ts
function buildQuery(input, opts) {
  if (input.length > 65535) {
    throw new RangeError(`buildQuery: input length ${input.length} exceeds Uint16Array limit (65535)`);
  }
  const whitespace = opts?.whitespace ?? "ignore";
  if (whitespace === "split") {
    return buildSplitQuery(input);
  }
  const cleaned = foldCase(input);
  if (cleaned === "") {
    return {
      input,
      graphemes: [],
      atoms: "",
      whitespace
    };
  }
  const graphemes = [];
  eachGrapheme(cleaned, (rawGrapheme) => {
    const atoms = decomposeToAtoms(rawGrapheme);
    if (whitespace === "ignore" && atoms.length === 1 && atoms[0] === SPACE_ID) {
      return;
    }
    const { vowelIndex, tailIndex } = computeAtomRoles(atoms);
    graphemes.push({
      char: rawGrapheme,
      atoms,
      vowelIndex,
      tailIndex
    });
  });
  let atomsStr = "";
  for (const g of graphemes) {
    for (let i = 0; i < g.atoms.length; i++) {
      atomsStr += atomIdToChar(g.atoms[i]);
    }
  }
  return {
    input,
    graphemes,
    atoms: atomsStr,
    whitespace
  };
}
function buildSplitQuery(input) {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { input, graphemes: [], atoms: "", whitespace: "split" };
  }
  const tokensRaw = trimmed.split(/\s+/);
  const subsRaw = tokensRaw.map((t) => buildQuery(t, { whitespace: "ignore" }));
  const nonEmpty = subsRaw.filter((s) => s.atoms.length > 0);
  if (nonEmpty.length === 0) {
    return { input, graphemes: [], atoms: "", whitespace: "split" };
  }
  const sorted = [...nonEmpty].sort((a, b) => b.atoms.length - a.atoms.length);
  const kept = [];
  for (const sub of sorted) {
    let redundant = false;
    for (const k of kept) {
      if (k.atoms.startsWith(sub.atoms)) {
        redundant = true;
        break;
      }
    }
    if (!redundant) kept.push(sub);
  }
  return {
    input,
    graphemes: [],
    atoms: "",
    whitespace: "split",
    subQueries: kept
  };
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
  for (const { start, end, bonus } of ranges) {
    if (start >= end) continue;
    const startGi = gIdx[start];
    const endGi = gIdx[Math.min(end - 1, gIdx.length - 1)];
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

// src/match.ts
function buildMatchResult(indices, target, score) {
  const startsAtZero = indices.length > 0 && indices[0] === 0;
  let runCount = indices.length > 0 ? 1 : 0;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1 && indices[i] !== indices[i - 1]) {
      runCount++;
    }
  }
  let boundaryHits = 0;
  for (const idx of indices) {
    if (target.boundaryFlags[idx]) boundaryHits++;
  }
  return { indices, startsAtZero, runCount, boundaryHits, score };
}
function matchLiteral(literal, target, scoring) {
  return matchLiteralFolded(foldCase(literal), target, scoring);
}
function matchLiteralFolded(text, target, scoring) {
  if (text === "") {
    return { indices: [], startsAtZero: false, runCount: 0, boundaryHits: 0, score: 0 };
  }
  const normalized = target.normalizedInput;
  let foundAt = normalized.indexOf(text);
  if (foundAt < 0) return null;
  const sc = resolveScoring(scoring, target);
  const graphemeIndexes = target.graphemeIndexes;
  let bestAt = foundAt;
  let bestPosScore = -Infinity;
  while (foundAt >= 0) {
    let s = 0;
    if (foundAt === 0) s += sc.positionZero;
    if (target.boundaryFlags[graphemeIndexes[foundAt]]) s += sc.boundary;
    if (s > bestPosScore) {
      bestPosScore = s;
      bestAt = foundAt;
    }
    foundAt = normalized.indexOf(text, foundAt + 1);
  }
  const indices = [];
  for (let i = 0; i < text.length; i++) {
    const gi = graphemeIndexes[bestAt + i];
    if (indices[indices.length - 1] !== gi) {
      indices.push(gi);
    }
  }
  return buildMatchResult(indices, target, bestPosScore + sc.targetLengthPenalty * target.graphemeCount);
}
function atomsEqual(qAtoms, target, tgi) {
  const tLen = target.atomLens[tgi];
  if (qAtoms.length !== tLen) return false;
  const tStart = target.atomStarts[tgi];
  for (let i = 0; i < tLen; i++) {
    if (qAtoms[i] !== target.atomsFlat[tStart + i]) return false;
  }
  return true;
}
function checkAnchorExtrasPrefix(qAtoms, qTailStart, target, tStart, tLen, qLeadVowelEnd) {
  const anchorExtras = tLen - qLeadVowelEnd;
  if (anchorExtras <= 0) return true;
  const qTailLen = qAtoms.length - qTailStart;
  const n = anchorExtras < qTailLen ? anchorExtras : qTailLen;
  for (let i = 0; i < n; i++) {
    if (qAtoms[qTailStart + i] !== target.atomsFlat[tStart + qLeadVowelEnd + i]) return false;
  }
  return true;
}
function computeInternalRunLen(indices) {
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return 1;
  }
  return indices.length;
}
function findVowelCandidatesLenient(qg, target, minTgi) {
  const qAtoms = qg.atoms;
  const qTailStart = qg.tailIndex;
  const qLeadVowelEnd = qTailStart === -1 ? qAtoms.length : qTailStart;
  const candidates = [];
  const T = target.graphemeCount;
  for (let tgi = minTgi; tgi < T; tgi++) {
    if (target.vowelIdxs[tgi] === -1) continue;
    const tStart = target.atomStarts[tgi];
    const tLen = target.atomLens[tgi];
    if (tLen < qLeadVowelEnd) continue;
    let ok = true;
    for (let i = 0; i < qLeadVowelEnd; i++) {
      if (qAtoms[i] !== target.atomsFlat[tStart + i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (qTailStart === -1) {
      candidates.push({
        startTgi: tgi,
        endTgi: tgi,
        indices: [tgi],
        filledAtoms: [qLeadVowelEnd],
        internalRunLen: 1
      });
      continue;
    }
    if (!checkAnchorExtrasPrefix(qAtoms, qTailStart, target, tStart, tLen, qLeadVowelEnd)) continue;
    const tailResult = matchTailFrom(qg, target, tgi, tStart + qLeadVowelEnd);
    if (tailResult) candidates.push(tailResult);
  }
  return candidates;
}
function matchTailFrom(qg, target, anchorTgi, searchStartFlat) {
  const qAtoms = qg.atoms;
  const qTailStart = qg.tailIndex;
  const qLeadVowelEnd = qTailStart;
  const indices = [anchorTgi];
  const filledAtoms = [];
  let curTgi = anchorTgi;
  let tai = searchStartFlat;
  let lastMatchedTgi = anchorTgi;
  const T = target.graphemeCount;
  const anchorTStart = target.atomStarts[anchorTgi];
  const anchorTEnd = anchorTStart + target.atomLens[anchorTgi];
  let anchorFilled = qLeadVowelEnd;
  for (let qai = qTailStart; qai < qAtoms.length; qai++) {
    const needle = qAtoms[qai];
    let found = false;
    while (curTgi < T) {
      const tStart = target.atomStarts[curTgi];
      let idx = -1;
      if (curTgi === anchorTgi) {
        for (let i = tai; i < anchorTEnd; i++) {
          if (target.atomsFlat[i] === needle) {
            idx = i;
            break;
          }
        }
      } else if (target.atomsFlat[tStart] === needle) {
        idx = tStart;
      }
      if (idx !== -1) {
        tai = idx + 1;
        if (curTgi === anchorTgi) {
          anchorFilled++;
        } else if (curTgi !== lastMatchedTgi) {
          indices.push(curTgi);
          filledAtoms.push(1);
          lastMatchedTgi = curTgi;
        }
        found = true;
        break;
      }
      curTgi++;
      tai = curTgi < T ? target.atomStarts[curTgi] : 0;
    }
    if (!found) return null;
  }
  filledAtoms.unshift(anchorFilled);
  return {
    startTgi: anchorTgi,
    endTgi: lastMatchedTgi,
    indices,
    filledAtoms,
    internalRunLen: computeInternalRunLen(indices)
  };
}
function findConsonantCandidates(qAtoms, target, minTgi) {
  const candidates = [];
  const T = target.graphemeCount;
  for (let startTgi = minTgi; startTgi < T; startTgi++) {
    if (target.atomsFlat[target.atomStarts[startTgi]] !== qAtoms[0]) continue;
    if (qAtoms.length === 1) {
      candidates.push({
        startTgi,
        endTgi: startTgi,
        indices: [startTgi],
        filledAtoms: [1],
        internalRunLen: 1
      });
      continue;
    }
    const indices = [startTgi];
    const filledAtoms = [1];
    let curTgi = startTgi + 1;
    let ok = true;
    for (let qai = 1; qai < qAtoms.length; qai++) {
      const needle = qAtoms[qai];
      let found = false;
      while (curTgi < T) {
        if (target.atomsFlat[target.atomStarts[curTgi]] === needle) {
          indices.push(curTgi);
          filledAtoms.push(1);
          curTgi++;
          found = true;
          break;
        }
        curTgi++;
      }
      if (!found) {
        ok = false;
        break;
      }
    }
    if (ok) {
      candidates.push({
        startTgi,
        endTgi: indices[indices.length - 1],
        indices,
        filledAtoms,
        internalRunLen: computeInternalRunLen(indices)
      });
    }
  }
  return candidates;
}
function findExactCandidates(qAtoms, target, minTgi) {
  const candidates = [];
  const T = target.graphemeCount;
  for (let tgi = minTgi; tgi < T; tgi++) {
    if (atomsEqual(qAtoms, target, tgi)) {
      candidates.push({
        startTgi: tgi,
        endTgi: tgi,
        indices: [tgi],
        filledAtoms: [qAtoms.length],
        internalRunLen: 1
      });
    }
  }
  return candidates;
}
function findCandidates(qg, target, minTgi, strict) {
  if (qg.vowelIndex !== -1) {
    if (strict) {
      return findExactCandidates(qg.atoms, target, minTgi);
    }
    return findVowelCandidatesLenient(qg, target, minTgi);
  }
  if (isConsonantLUT[qg.atoms[0]] === 1) {
    return findConsonantCandidates(qg.atoms, target, minTgi);
  }
  return findExactCandidates(qg.atoms, target, minTgi);
}
function candTrailingL(c) {
  return c.internalRunLen === c.indices.length ? c.internalRunLen : 1;
}
function candStandaloneBonus(c, consecutive) {
  if (c.internalRunLen === c.indices.length && c.internalRunLen > 1) {
    const L = c.internalRunLen;
    return (L - 1) * (L - 1) * consecutive;
  }
  return 0;
}
function candidatePositionScore(c, target, sc) {
  let s = 0;
  for (let i = 0; i < c.indices.length; i++) {
    const tgi = c.indices[i];
    const filled = c.filledAtoms[i];
    s += sc.anchorFill * filled * filled;
    if (tgi === 0) s += sc.positionZero;
    if (target.boundaryFlags[tgi]) s += sc.boundary;
    s += sc.getBonus(tgi) * filled;
  }
  return s;
}
function matchBest(query, target, scoringOrOptions, strictArg) {
  let scoring;
  let strict;
  if (scoringOrOptions == null) {
    scoring = void 0;
    strict = strictArg ?? false;
  } else {
    const hasBagKey = "scoring" in scoringOrOptions || "strict" in scoringOrOptions;
    const hasConfigKey = "weights" in scoringOrOptions || "graphemeBonus" in scoringOrOptions;
    if (hasBagKey && !hasConfigKey) {
      const bag = scoringOrOptions;
      scoring = bag.scoring;
      strict = bag.strict ?? strictArg ?? false;
    } else {
      if (hasBagKey && hasConfigKey && !isProd) {
        console.warn(
          "[fuzzly] matchBest: 3rd argument mixes ScoringConfig keys (weights/graphemeBonus) with option keys (scoring/strict) \u2014 treated as ScoringConfig, the 'scoring'/'strict' keys are ignored. Use matchBest(query, target, { scoring, strict })."
        );
      }
      scoring = scoringOrOptions;
      strict = strictArg ?? false;
    }
  }
  return matchBestImpl(query, target, scoring, strict);
}
function matchBestImpl(query, target, scoring, strict) {
  if (query.subQueries) {
    return matchBestSplit(query.subQueries, target, scoring, strict);
  }
  const qGraphemes = query.graphemes;
  const T = target.graphemeCount;
  const Q = qGraphemes.length;
  if (Q === 0) {
    return {
      indices: [],
      startsAtZero: false,
      runCount: 0,
      boundaryHits: 0,
      score: 0
    };
  }
  if (Q > T) return null;
  const sc = resolveScoring(scoring, target);
  const allCandidates = [];
  for (let qi = 0; qi < Q; qi++) {
    const candidates = findCandidates(qGraphemes[qi], target, 0, strict);
    if (candidates.length === 0) return null;
    allCandidates.push(candidates);
  }
  const dp = [];
  const firstStates = [];
  for (let ci = 0; ci < allCandidates[0].length; ci++) {
    const c = allCandidates[0][ci];
    const posScore = candidatePositionScore(c, target, sc);
    firstStates.push([
      {
        score: posScore + candStandaloneBonus(c, sc.consecutive),
        parentPci: -1,
        parentRunLen: -1,
        runLen: candTrailingL(c)
      }
    ]);
  }
  dp.push(firstStates);
  for (let qi = 1; qi < Q; qi++) {
    const currCandidates = allCandidates[qi];
    const prevCands = allCandidates[qi - 1];
    const prevDP = dp[qi - 1];
    const currStates = [];
    const P = prevCands.length;
    const gp = sc.gapPenalty;
    const prevBestScore = new Array(P);
    const prevBestRunLen = new Array(P);
    for (let pci = 0; pci < P; pci++) {
      let bs = -Infinity;
      let br = -1;
      const list = prevDP[pci];
      for (let psi = 0; psi < list.length; psi++) {
        const ps = list[psi];
        if (ps.score > bs) {
          bs = ps.score;
          br = ps.runLen;
        }
      }
      prevBestScore[pci] = bs;
      prevBestRunLen[pci] = br;
    }
    const order = new Array(P);
    for (let pci = 0; pci < P; pci++) order[pci] = pci;
    let endSorted = true;
    for (let pci = 1; pci < P; pci++) {
      if (prevCands[pci].endTgi < prevCands[pci - 1].endTgi) {
        endSorted = false;
        break;
      }
    }
    if (!endSorted) order.sort((a, b) => prevCands[a].endTgi - prevCands[b].endTgi);
    let ptr = 0;
    let consPtr = 0;
    let gapMax = -Infinity;
    let gapMaxPci = -1;
    let gapMaxRunLen = -1;
    const byRunLen = /* @__PURE__ */ new Map();
    const consider = (score, runLen, parentPci, parentRunLen) => {
      const cur = byRunLen.get(runLen);
      if (cur === void 0 || score > cur.score) {
        byRunLen.set(runLen, { score, parentPci, parentRunLen, runLen });
      }
    };
    for (let ci = 0; ci < currCandidates.length; ci++) {
      const c = currCandidates[ci];
      const s = c.startTgi;
      const posScore = candidatePositionScore(c, target, sc);
      const standaloneBonus = candStandaloneBonus(c, sc.consecutive);
      const trailing = candTrailingL(c);
      const connected = c.internalRunLen === c.indices.length;
      const L = c.internalRunLen;
      byRunLen.clear();
      while (ptr < P) {
        const pci = order[ptr];
        if (prevCands[pci].endTgi > s - 2) break;
        const bs = prevBestScore[pci];
        if (bs !== -Infinity) {
          const adjusted = bs - gp * prevCands[pci].endTgi;
          if (adjusted > gapMax) {
            gapMax = adjusted;
            gapMaxPci = pci;
            gapMaxRunLen = prevBestRunLen[pci];
          }
        }
        ptr++;
      }
      if (gapMax !== -Infinity) {
        consider(gapMax + gp * (s - 1) + posScore + standaloneBonus, trailing, gapMaxPci, gapMaxRunLen);
      }
      while (consPtr < P && prevCands[order[consPtr]].endTgi < s - 1) consPtr++;
      for (let k = consPtr; k < P; k++) {
        const pci = order[k];
        if (prevCands[pci].endTgi !== s - 1) break;
        const prevStatesList = prevDP[pci];
        for (let psi = 0; psi < prevStatesList.length; psi++) {
          const ps = prevStatesList[psi];
          if (ps.score === -Infinity) continue;
          const R = ps.runLen;
          let delta;
          let newRunLen;
          if (connected) {
            delta = L * (2 * R + L - 2) * sc.consecutive;
            newRunLen = R + L;
          } else {
            delta = (2 * R - 1) * sc.consecutive;
            newRunLen = 1;
          }
          consider(ps.score + posScore + delta, newRunLen, pci, R);
        }
      }
      if (byRunLen.size === 0) {
        currStates.push([{ score: -Infinity, parentPci: -1, parentRunLen: -1, runLen: trailing }]);
      } else {
        currStates.push(Array.from(byRunLen.values()));
      }
    }
    dp.push(currStates);
  }
  let bestFinalScore = -Infinity;
  let bestFinalCi = -1;
  let bestFinalRunLen = -1;
  const lastStates = dp[Q - 1];
  for (let ci = 0; ci < lastStates.length; ci++) {
    const states = lastStates[ci];
    for (let si = 0; si < states.length; si++) {
      const st = states[si];
      if (st.score > bestFinalScore) {
        bestFinalScore = st.score;
        bestFinalCi = ci;
        bestFinalRunLen = st.runLen;
      }
    }
  }
  if (bestFinalCi === -1 || bestFinalScore === -Infinity) return null;
  const chosenCi = new Array(Q);
  const chosenRunLen = new Array(Q);
  chosenCi[Q - 1] = bestFinalCi;
  chosenRunLen[Q - 1] = bestFinalRunLen;
  for (let qi = Q - 1; qi > 0; qi--) {
    const states = dp[qi][chosenCi[qi]];
    let state;
    for (let si = 0; si < states.length; si++) {
      if (states[si].runLen === chosenRunLen[qi]) {
        state = states[si];
        break;
      }
    }
    if (state === void 0) return null;
    chosenCi[qi - 1] = state.parentPci;
    chosenRunLen[qi - 1] = state.parentRunLen;
  }
  const allIndices = [];
  for (let qi = 0; qi < Q; qi++) {
    const candidate = allCandidates[qi][chosenCi[qi]];
    for (const idx of candidate.indices) {
      allIndices.push(idx);
    }
  }
  const indices = [];
  for (const idx of allIndices) {
    if (indices.length === 0 || indices[indices.length - 1] !== idx) {
      indices.push(idx);
    }
  }
  return buildMatchResult(indices, target, bestFinalScore + sc.targetLengthPenalty * T);
}
function mergeMatchResults(results) {
  let totalScore = 0;
  let totalBoundaryHits = 0;
  let totalRunCount = 0;
  let anyStartsAtZero = false;
  const allIndices = [];
  for (const r of results) {
    totalScore += r.score;
    totalBoundaryHits += r.boundaryHits;
    totalRunCount += r.runCount;
    if (r.startsAtZero) anyStartsAtZero = true;
    for (const i of r.indices) allIndices.push(i);
  }
  allIndices.sort((a, b) => a - b);
  const indices = [];
  for (const i of allIndices) {
    if (indices.length === 0 || indices[indices.length - 1] !== i) {
      indices.push(i);
    }
  }
  return {
    indices,
    startsAtZero: anyStartsAtZero,
    runCount: totalRunCount,
    boundaryHits: totalBoundaryHits,
    score: totalScore
  };
}
function matchBestSplit(subQueries, target, scoring, strict) {
  const results = [];
  for (const sub of subQueries) {
    const r = matchBestImpl(sub, target, scoring, strict);
    if (r === null) return null;
    results.push(r);
  }
  return mergeMatchResults(results);
}

// src/matchFields.ts
function applyWeight(score, w) {
  return score >= 0 ? score * w : score / w;
}
function matchFields(query, fields, opts) {
  for (const f of fields) {
    const w = f.weight ?? 1;
    if (!(w > 0)) throw new RangeError(`matchFields: field weight must be > 0, got ${w}`);
  }
  if (fields.length === 0) return null;
  const tokens = (query.subQueries ?? [query]).filter((t) => t.graphemes.length > 0);
  if (tokens.length === 0) {
    return { score: 0, perField: fields.map(() => null) };
  }
  const strict = opts?.strict ?? false;
  const scoringOpt = opts?.scoring;
  const cfgFor = typeof scoringOpt === "function" ? scoringOpt : scoringOpt != null ? () => scoringOpt : () => void 0;
  const fieldCfgs = fields.map((f) => f.scoring ?? cfgFor(f.target));
  let totalScore = 0;
  const winners = fields.map(() => []);
  for (const token of tokens) {
    let bestIdx = -1;
    let bestWeighted = -Infinity;
    let bestResult = null;
    for (let i = 0; i < fields.length; i++) {
      const r = matchBestImpl(token, fields[i].target, fieldCfgs[i], strict);
      if (r === null) continue;
      const weighted = applyWeight(r.score, fields[i].weight ?? 1);
      if (weighted > bestWeighted) {
        bestWeighted = weighted;
        bestIdx = i;
        bestResult = r;
      }
    }
    if (bestIdx === -1 || bestResult === null) return null;
    totalScore += bestWeighted;
    winners[bestIdx].push(bestResult);
  }
  const perField = winners.map((ws) => ws.length === 0 ? null : mergeMatchResults(ws));
  return { score: totalScore, perField };
}

// src/preprocessTarget.ts
var PREPROCESS_VERSION = 2;
function preprocessTarget(input) {
  if (input.length > 65535) {
    throw new RangeError(`preprocessTarget: input length ${input.length} exceeds Uint16Array limit (65535)`);
  }
  const normalizedInput = foldCase(input);
  const tmpAtomArrays = [];
  const tmpCharIndexes = [];
  const tmpGraphemeIndexes = [];
  let graphemeIndex = 0;
  eachGrapheme(normalizedInput, (cluster, startIndex) => {
    tmpCharIndexes[graphemeIndex] = startIndex;
    const atoms = decomposeToAtoms(cluster);
    for (let i = 0; i < cluster.length; i++) {
      tmpGraphemeIndexes[startIndex + i] = graphemeIndex;
    }
    tmpAtomArrays[graphemeIndex] = atoms;
    graphemeIndex++;
  });
  const graphemeCount = graphemeIndex;
  let totalAtoms = 0;
  for (let i = 0; i < graphemeCount; i++) {
    totalAtoms += tmpAtomArrays[i].length;
  }
  const atomsFlat = new Uint16Array(totalAtoms);
  const atomStarts = new Uint32Array(graphemeCount);
  const atomLens = new Uint8Array(graphemeCount);
  const vowelIdxs = new Int8Array(graphemeCount);
  const tailIdxs = new Int8Array(graphemeCount);
  const boundaryFlags = new Uint8Array(graphemeCount);
  let atomOffset = 0;
  for (let i = 0; i < graphemeCount; i++) {
    const atoms = tmpAtomArrays[i];
    if (atoms.length > 255) {
      throw new RangeError(`preprocessTarget: grapheme at index ${i} has ${atoms.length} atoms (max 255)`);
    }
    atomStarts[i] = atomOffset;
    atomLens[i] = atoms.length;
    atomsFlat.set(atoms, atomOffset);
    const { vowelIndex, tailIndex } = computeAtomRoles(atoms);
    vowelIdxs[i] = vowelIndex;
    tailIdxs[i] = tailIndex;
    if (i === 0) {
      boundaryFlags[i] = 1;
    } else {
      const prev = tmpAtomArrays[i - 1];
      if (prev.length === 1) {
        const pid = prev[0];
        if (pid === SPACE_ID || pid === UNDERSCORE_ID || pid === DASH_ID || pid === DOT_ID) {
          boundaryFlags[i] = 1;
        }
      }
    }
    atomOffset += atoms.length;
  }
  const charIndexes = new Uint16Array(graphemeCount);
  for (let i = 0; i < graphemeCount; i++) {
    charIndexes[i] = tmpCharIndexes[i];
  }
  const graphemeIndexes = new Uint16Array(normalizedInput.length);
  for (let i = 0; i < normalizedInput.length; i++) {
    graphemeIndexes[i] = tmpGraphemeIndexes[i] ?? 0;
  }
  return {
    input,
    normalizedInput,
    graphemeCount,
    atomsFlat,
    atomStarts,
    atomLens,
    vowelIdxs,
    tailIdxs,
    boundaryFlags,
    graphemeIndexes,
    charIndexes
  };
}

// src/createSearcher.ts
function worse(a, b) {
  return a.score < b.score || a.score === b.score && a.tie > b.tie;
}
function heapPush(heap, item) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = i - 1 >> 1;
    if (!worse(heap[i], heap[parent])) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}
function heapReplace(heap, item) {
  heap[0] = item;
  const n = heap.length;
  let i = 0;
  for (; ; ) {
    let smallest = i;
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l < n && worse(heap[l], heap[smallest])) smallest = l;
    if (r < n && worse(heap[r], heap[smallest])) smallest = r;
    if (smallest === i) break;
    [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
    i = smallest;
  }
}
function byRank(a, b) {
  return b.score - a.score || a.tie - b.tie;
}
var SEARCHER_ONLY_KEYS = /* @__PURE__ */ new Set([
  "key",
  "target",
  "fields",
  "strict",
  "whitespace",
  "scoring",
  "score",
  "tiebreakKey"
]);
var SEARCH_ONLY_KEYS = /* @__PURE__ */ new Set(["limit", "literal", "filter"]);
var checkedOptsByContext = /* @__PURE__ */ new WeakMap();
function warnUnknownKeys(opts, allowed, where) {
  if (isProd || opts == null) return;
  let checked = checkedOptsByContext.get(allowed);
  if (checked === void 0) {
    checked = /* @__PURE__ */ new WeakSet();
    checkedOptsByContext.set(allowed, checked);
  }
  if (checked.has(opts)) return;
  checked.add(opts);
  for (const k of Object.keys(opts)) {
    if (!allowed.has(k)) {
      const hint = SEARCHER_ONLY_KEYS.has(k) ? `pass it to createSearcher(items, options) instead` : SEARCH_ONLY_KEYS.has(k) ? `pass it to searcher.search(query, options) instead` : `unknown option`;
      console.warn(`[fuzzly] ${where}: '${k}' is not a valid option \u2014 ${hint}.`);
    }
  }
}
var SESSION_HISTORY_MAX = 32;
function tokensEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
function makeRuntime(items, toEntry, whitespace, prefixMonotonic, evaluate) {
  let entries = items.map(toEntry);
  let history = [];
  let generation = 0;
  function resetSession() {
    history = [];
  }
  function scan(queryInput, searchOpts = {}) {
    const limit = searchOpts.limit ?? 0;
    const currentLiteral = !!searchOpts.literal;
    const currentFilter = searchOpts.filter ?? null;
    const query = currentLiteral ? null : buildQuery(queryInput, { whitespace });
    const evalInput = currentLiteral ? foldCase(queryInput) : queryInput;
    const currentTokens = currentLiteral ? [evalInput] : query?.subQueries ? query.subQueries.map((s) => s.atoms) : [query ? query.atoms : ""];
    const exactTokensOnly = !prefixMonotonic && !currentLiteral;
    let source = null;
    for (let h = history.length - 1; h >= 0; h--) {
      const s = history[h];
      if (s.literal !== currentLiteral) continue;
      if (!(currentFilter === s.filter || s.filter === null)) continue;
      const tokensOk = exactTokensOnly ? tokensEqual(s.tokens, currentTokens) : s.tokens.length > 0 && s.tokens.every((p) => p.length > 0 && currentTokens.some((c) => c.startsWith(p)));
      if (!tokensOk) continue;
      if (source === null || s.matchedIndices.length < source.length) {
        source = s.matchedIndices;
      }
    }
    const scanSize = source ? source.length : entries.length;
    const capturedGeneration = generation;
    const matchedIndices = [];
    const heap = [];
    const collected = [];
    let position = 0;
    let done = false;
    let sorted = null;
    function evalOne(i) {
      const entry = entries[i];
      if (currentFilter && !currentFilter(entry.item)) return;
      const ev = evaluate(entry, query, evalInput);
      if (ev === null) return;
      matchedIndices.push(i);
      const tie = entry.tie;
      if (limit > 0) {
        if (heap.length < limit) {
          heapPush(heap, { score: ev.score, tie, value: ev.make() });
        } else {
          const root = heap[0];
          if (ev.score > root.score || ev.score === root.score && tie < root.tie) {
            heapReplace(heap, { score: ev.score, tie, value: ev.make() });
          }
        }
      } else {
        collected.push({ score: ev.score, tie, value: ev.make() });
      }
    }
    return {
      next(budget) {
        if (done) return true;
        if (generation !== capturedGeneration) {
          throw new Error("fuzzly: searcher was mutated during scan");
        }
        const end = budget == null ? scanSize : Math.min(position + Math.max(0, budget), scanSize);
        for (; position < end; position++) {
          evalOne(source ? source[position] : position);
        }
        if (position >= scanSize) {
          done = true;
          const narrowed = source === null || matchedIndices.length < source.length;
          if (narrowed && currentTokens.length > 0 && currentTokens.every((t) => t.length > 0)) {
            const top = history[history.length - 1];
            if (top !== void 0 && top.literal === currentLiteral && top.filter === currentFilter && tokensEqual(top.tokens, currentTokens)) {
              top.matchedIndices = matchedIndices;
            } else {
              history.push({
                tokens: currentTokens,
                literal: currentLiteral,
                filter: currentFilter,
                matchedIndices
              });
              if (history.length > SESSION_HISTORY_MAX) history.shift();
            }
          }
        }
        return done;
      },
      get done() {
        return done;
      },
      get processed() {
        return position;
      },
      get scanSize() {
        return scanSize;
      },
      get total() {
        return matchedIndices.length;
      },
      results() {
        if (done && sorted !== null) return sorted;
        const buf = limit > 0 ? heap : collected;
        const out = buf.slice().sort(byRank).map((w) => w.value);
        if (done) sorted = out;
        return out;
      }
    };
  }
  return {
    // search 는 scan 위에 재구현 — 코드 경로 단일화. 끝까지 진행 후 정렬 결과 반환.
    search(queryInput, searchOpts = {}) {
      warnUnknownKeys(searchOpts, SEARCH_ONLY_KEYS, "searcher.search options");
      const cursor = scan(queryInput, searchOpts);
      cursor.next();
      return cursor.results();
    },
    scan(queryInput, searchOpts = {}) {
      warnUnknownKeys(searchOpts, SEARCH_ONLY_KEYS, "searcher.scan options");
      return scan(queryInput, searchOpts);
    },
    add(...newItems) {
      const newEntries = newItems.map(toEntry);
      for (const e of newEntries) entries.push(e);
      generation++;
      resetSession();
    },
    remove(predicate) {
      entries = entries.filter((e) => !predicate(e.item));
      generation++;
      resetSession();
    },
    replaceAll(newItems) {
      entries = newItems.map(toEntry);
      generation++;
      resetSession();
    }
  };
}
function createSearcher(items, options = {}) {
  warnUnknownKeys(options, SEARCHER_ONLY_KEYS, "createSearcher options");
  if ("fields" in options) {
    return createMultiFieldSearcher(items, options);
  }
  return createSingleFieldSearcher(items, options);
}
function createSingleFieldSearcher(items, options) {
  const key = options.key;
  const keyFn = key ?? ((item) => {
    if (typeof item === "string") {
      return item;
    }
    throw new TypeError("createSearcher requires options.key when items are not strings");
  });
  const toTarget = options.target ?? ((item) => preprocessTarget(keyFn(item)));
  const strict = options.strict ?? false;
  const whitespace = options.whitespace ?? "ignore";
  const scoringOpt = options.scoring;
  const resolveScoringConfig = typeof scoringOpt === "function" ? scoringOpt : scoringOpt != null ? () => scoringOpt : void 0;
  const scoreFn = options.score;
  const tiebreakKey = options.tiebreakKey;
  const evaluate = (entry, query, queryInput) => {
    const t = entry.target;
    const result = query ? matchBestImpl(query, t, entry.scoring, strict) : matchLiteralFolded(queryInput, t, entry.scoring);
    if (result === null) return null;
    const score = scoreFn ? scoreFn(result, t) : result.score;
    return {
      score,
      make: () => makeSearchResult(entry.item, t, result, score)
    };
  };
  return makeRuntime(
    items,
    (item) => {
      const target = toTarget(item);
      return { item, target, scoring: resolveScoringConfig?.(target), tie: tiebreakKey ? tiebreakKey(item) : 0 };
    },
    whitespace,
    !strict,
    evaluate
  );
}
function createMultiFieldSearcher(items, options) {
  const rawOpts = options;
  if (rawOpts.key !== void 0 || rawOpts.target !== void 0) {
    throw new TypeError("createSearcher: 'fields' is mutually exclusive with 'key'/'target'");
  }
  const fields = options.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TypeError("createSearcher: 'fields' must be a non-empty array");
  }
  const toTargets = fields.map((f) => {
    const tgt = f.target;
    if (tgt) return tgt;
    const kf = f.key;
    if (kf) return (item) => preprocessTarget(kf(item));
    throw new TypeError("createSearcher: each field requires 'key' or 'target'");
  });
  for (const f of fields) {
    const w = f.weight ?? 1;
    if (!(w > 0)) throw new RangeError(`createSearcher: field weight must be > 0, got ${w}`);
  }
  if (!isProd && fields.some((f) => "chosung" in f)) {
    console.warn("[fuzzly] createSearcher: field option 'chosung' was removed and is ignored");
  }
  const strict = options.strict ?? false;
  const whitespace = options.whitespace ?? "ignore";
  const scoringOpt = options.scoring;
  const scoreFn = options.score;
  const tiebreakKey = options.tiebreakKey;
  const scoringFn = typeof scoringOpt === "function" ? scoringOpt : void 0;
  const staticCfg = typeof scoringOpt === "function" ? void 0 : scoringOpt;
  const placeholder = preprocessTarget("");
  const fieldBuf = fields.map((f) => ({ target: placeholder, weight: f.weight }));
  const evaluate = (entry, query, queryInput) => {
    const targets = entry.targets;
    let result;
    if (query) {
      for (let f = 0; f < fieldBuf.length; f++) {
        fieldBuf[f].target = targets[f];
        fieldBuf[f].scoring = entry.scorings ? entry.scorings[f] : staticCfg;
      }
      result = matchFields(query, fieldBuf, { strict });
    } else {
      const perField = [];
      let bestLit = -Infinity;
      for (let f = 0; f < targets.length; f++) {
        const lit = matchLiteralFolded(queryInput, targets[f], entry.scorings ? entry.scorings[f] : staticCfg);
        perField.push(lit);
        if (lit !== null) {
          const weighted = applyWeight(lit.score, fields[f].weight ?? 1);
          if (weighted > bestLit) bestLit = weighted;
        }
      }
      result = bestLit !== -Infinity ? { score: bestLit, perField } : null;
    }
    if (result === null) return null;
    const finalResult = result;
    const score = scoreFn ? scoreFn(finalResult, targets) : finalResult.score;
    return {
      score,
      make: () => makeMultiFieldResult(entry.item, targets, finalResult, score)
    };
  };
  return makeRuntime(
    items,
    (item) => {
      const targets = toTargets.map((tt) => tt(item));
      return {
        item,
        targets,
        scorings: scoringFn ? targets.map((t) => scoringFn(t)) : void 0,
        tie: tiebreakKey ? tiebreakKey(item) : 0
      };
    },
    whitespace,
    !strict,
    evaluate
  );
}
function makeSearchResult(item, target, result, score) {
  return {
    item,
    target,
    result,
    score,
    ranges: () => buildMatchRanges([result.indices], target)
  };
}
function makeMultiFieldResult(item, targets, result, score) {
  return {
    item,
    score,
    result,
    fields: targets.map((target, f) => ({
      target,
      result: result.perField[f],
      ranges: () => {
        const pf = result.perField[f];
        return pf ? buildMatchRanges([pf.indices], target) : [];
      }
    }))
  };
}

// src/segmentByRanges.ts
function segmentByRanges(text, ranges) {
  const segments = [];
  let pos = 0;
  for (const range of ranges) {
    const start = Math.max(range.start, pos);
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > pos) {
      segments.push({ text: text.slice(pos, start), matched: false });
    }
    segments.push({ text: text.slice(start, end), matched: true });
    pos = end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), matched: false });
  }
  return segments;
}
export {
  PREPROCESS_VERSION,
  SCORING,
  buildMatchRanges,
  buildQuery,
  createGraphemeBonuses,
  createSearcher,
  defaultScore,
  matchBest,
  matchFields,
  matchLiteral,
  preprocessTarget,
  segmentByRanges
};

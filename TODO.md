# TODO

## API 재설계

### [x] SearchOptions → SearcherOptions 이관
`scoring`, `score`, `whitespace`, `strict` 를 `createSearcher` 시점 고정으로
이동. `SearchResultOptions` (`{ limit?, literal? }`) 만 per-call 로 남김.
`SearchOptions` 는 `SearchResultOptions` alias 로 deprecate.

- silent-ignore guard 추가 — 잘못된 위치 옵션 (per-call 키를 createSearcher 에,
  정책 키를 search 에) 은 dev 모드에서 console.warn

### [x] literal을 search-time 인자로
`SearchResultOptions` 에 남김. literal 모드 토글 시에만 세션 단절.

### [x] composingIndex를 options 객체로 흡수 — 해소됨 (stale)
`search()`에서 composingIndex positional 인자 자체가 제거되어 해당 없음.
composingIndex는 react 레이어(`useFuzzlyInput`)에만 존재.

### [ ] score vs scoring 이름·문서 정리
- `scoring` → `scoringConfig` (DP 내부 가중치임을 명확히)
- `score` → `rankBy` 또는 `scoreFn` (item 간 최종 정렬 콜백임을 명확히)
- `types.ts` JSDoc에 두 필드 역할 차이 예제 추가
- `CLAUDE.md` Public API 섹션도 동기화

### [ ] 콜백 필드 네이밍 통일
- `SearcherOptions.key` → `getKey` (또는 `keyOf`)
- 위 `rankBy`/`scoreFn` 결정과 일관된 네이밍 규칙 채택
- `README`/`CLAUDE.md` 예제 전체 동기화

### [x] WhitespaceMode 값 리네임 + 기본값 변경 + `"split"` 추가
- `WhitespaceMode`: `"literal" | "ignore"` → `"preserve" | "ignore" | "split"`
  - `"literal"` → `"preserve"` (이름 충돌 제거, 행위 대칭 `preserve`/`ignore`)
  - `"split"` 추가: 공백 boundary로 sub-query 분리 후 순서 무관 AND
    (atom-prefix dedup 포함 — `"a ab"` → `["ab"]`)
- 기본값 `"literal"` → `"ignore"`로 변경
- `SearchOptions.literal`(substring 플래그)은 **그대로 유지**

### [x] split 모드 토큰별 prefix 캐시 reuse — 구현됨
세션 재사용 판정이 토큰별 atom-prefix로 동작하며 split 모드도 동일 규칙으로
재사용된다. 추가로 세션이 스냅샷 히스토리 스택으로 확장되어 백스페이스(prefix
축소)도 조상 스냅샷으로 복원된다 (issue #28-2).

### [ ] caller API에서 낯선 용어/내부 개념 노출 최소화
caller는 원문 char index(UTF-16 offset)와 score/hit 여부만 알면 충분하다.
현재 public 표면에 구현 디테일이 다수 새어나와 있음. 아래 카테고리별로
`@internal` 마크, internal/ 이동, 혹은 export 중단을 검토한다.

**A. grapheme 좌표계**
- `MatchResult.indices`(grapheme index 배열) → char range로 변환해 제공.
  `MatchResult.ranges: MatchRange[]`를 기본 필드로 승격하고 `indices`는
  `@internal`로 격하 또는 제거
- `GraphemeIndices` 타입 export 제거
- `Query.graphemeIndexes`, `Target.graphemeIndexes` 필드 `@internal`
- `buildMatchRanges`는 고급 용도로만 남기고 caller는 `MatchResult.ranges`
  사용을 권장
- `composingIndex`는 char index 기반이므로 그대로 유지 OK

**B. atom / 자모 분해 내부**
- `Atoms`(Uint8Array alias) export 제거 후보
- `QueryGrapheme`(`atoms`, `vowelIndex`, `tailIndex`) → `@internal`.
  `Query.graphemes` 필드 자체를 내부로 숨기거나 elements 접근 금지
- `Target.atomsFlat`, `atomStarts`, `atomLens`, `vowelIdxs`, `tailIdxs`,
  `graphemeCount`, `boundaryFlags` → `@internal` (Target은 opaque handle로
  취급. 직렬화 필요 시 별도 `serializeTarget`/`deserializeTarget` API)
- `Query.atoms`(concatenated string) → `@internal`
- `normalizedInput` → `@internal`

**C. 한글-특수 튜닝 노브**
- `ScoringWeights.choseongWeaken` — "초성 약화"라는 개념 자체가 내부 DP의
  구현 디테일. 이름을 일반화하거나 고급 옵션으로 격하 (예: `advanced`
  하위 객체로)
- `ScoringWeights.tailSpillPenalty`, `SpillMode`의 "spill" 용어 —
  도메인-내부 개념. caller가 의도하는 것은 "finalized 음절을 얼마나
  엄격하게 매칭할 것인가"이므로 **strictness** 계열 용어로 재설계
  - `SpillMode` → `StrictnessMode` (혹은 `MatchStrictness`)
  - 옵션 이름 `spillMode` → `strictness`
  - `ScoringWeights.tailSpillPenalty` → `looseMatchPenalty` 등
    strictness-역(loose) 기준으로 재명명
  - 값(`"always"` / `"composing"` / `"composingOrLast"`)은 현재 "어느
    grapheme이 조합중인가"를 표현 → strictness 관점으로 재표현
    (예: `"strict"` / `"composingOnly"` / `"composingOrLast"`,
    기본값 의미 정합성 유지) — 구체 네이밍은 구현 단계에서 확정

**D. 원자 레지스트리 export** — 해소됨
- `hasDynamicAtoms` / `snapshotDynamicAtoms` / `restoreDynamicAtoms`는
  글로벌 가변 상태(dynamicMap)를 caller에 노출하던 design smell이었음.
- atom ID를 codepoint-as-ID + UTF-16 cluster 인코딩으로 전환하면서 글로벌 상태 자체가 사라짐.
  Target이 self-contained가 되어 IDB 직렬화에 추가 매핑 불필요. 세 함수 모두 제거됨.

**E. MatchResult 메타데이터**
- `startsAtZero`, `runCount`, `boundaryHits`, `initialConsonantOnly` —
  대체로 유지하되 JSDoc에 caller 사용 예제 추가 (사실 caller가 직접 쓸
  일은 드물고 `score` 튜닝 시에만 필요 → `@internal`로 내릴지 검토)

**실행 원칙**
- 공개 표면은 "쿼리 문자열 입력 → 매치 여부 + char ranges + score" 외에는
  전부 advanced/internal로 내린다
- 사용자 문서에서 "grapheme", "atom", "choseong", "spill" 같은 용어를
  첫 학습 단계에서 만나지 않도록 README/CLAUDE.md 재구성

### [ ] 테스트에서 옵션값 명시 전달
모든 테스트가 현재 기본값에 암묵적으로 의존하고 있다. 기본값이 바뀌면
사일런트 회귀가 나므로, 각 테스트가 의도하는 옵션 값을 항상 명시하도록
수정한다.

- `test/**/*.test.ts` 전수 감사: `buildQuery`, `match`/`matchBest`,
  `searcher.search` 호출부마다 관련 옵션 (`whitespace`, `spillMode`,
  `composingIndex`, `literal`, `scoring`, `score` 등) 명시
- 특히 `whitespace` 기본값 전환 시 기존 테스트가 어느 값을 검증 중인지
  명시되어야 함
- 새 테스트 작성 규칙으로 문서화 (`CLAUDE.md`의 Conventions 섹션)

## 마이그레이션 체크리스트
- [ ] `test/createSearcher.test.ts`, `test/scoring.test.ts` 호출부 수정
- [ ] `test/**/*.test.ts` 전수 옵션 명시화
- [ ] `src/buildMatchRanges.ts` 사용처 조사 → `MatchResult`로 흡수 여부 결정
- [ ] `CLAUDE.md` Public API 블록 + WhitespaceMode 설명 갱신
- [ ] README 예제(있다면) 갱신
- [ ] breaking change이므로 메이저 버전 bump

# fuzzly 설계 노트 — monotonic 원칙 감사

> **Status**: 초안 / 논의 진행 중 / 미구현
>
> 이 문서는 fuzzly의 monotonic narrowing 철학을 잣대 삼아 기존·신규 feature를 감사한 기록이다. 현재는 분석 단계이며 실제 코드 변경은 아직 없다. 나중에 이어서 결정 사항들을 확정하고 구현할 예정.

## 배경

fuzzly의 핵심 UX 계약:

> "키를 추가할 때마다 결과셋은 단조 감소한다 (monotonic narrowing). 이미 보고 있던 결과 중 일부가 사라지는 것만 허용되고, 다른 종류로 바뀌는 것은 원칙 위배."

이 계약으로 다음 두 기능을 재검토했다:

- **리터럴 기능 (`"..."` wrapping)**: 부분적으로 위배. 수정 필요.
- **imeSwap (한/영 자동 변환)**: 조건부 활성화 형태는 위배. 다른 형태는 허용 가능.

더불어 향후 feature 제안을 1차 필터링할 수 있는 **일반화된 원칙**을 도출했다.

---

## 공통 실패 모드: "조건부 reinterpretation"

두 feature(`literal`의 `"..."` 감지, `imeSwap auto fallback`)는 같은 병의 다른 증상이다.

**공통 패턴**:
- step N: 해석 A로 평가 → 결과 R_N
- step N+1: 조건이 바뀌어 해석 B로 전환 → 결과 R_{N+1}
- R_{N+1}은 R_N의 subset이 아닐 수 있음 (disjoint 가능)

이건 fuzzly의 핵심 철학과 정면 충돌:
> "키를 추가할 때마다 **이미 보고 있던 결과 중 일부가 사라지는** 것만 허용. **다른 종류로 바뀌는** 건 원칙 위배."

조건부 reinterpretation은 **autocomplete 영역**이지 monotonic narrowing 영역이 아니다.
- Autocomplete: "사용자 의도 추측" → interpretation 갈아치워도 OK
- Monotonic search: "사용자가 친 것에 부합하는 집합 좁히기" → interpretation 고정

---

## 핵심 refinement — Implicit vs Explicit modality

"literal 제거"라고 뭉쳐 말하기 쉽지만, 실은 **두 개의 별개 문제**다:

1. **`"..."` wrapping으로 쿼리 문자열에서 암묵적으로 모드 감지** — 위배. 사용자가 모드 전환을 인지할 수 없음.
2. **Literal이라는 검색 모드 자체가 존재** — 위배 아님. UI 토글 버튼은 **명시적 상태 전환**이라 결과 변화가 드라마틱해도 사용자가 원인을 이해.

올바른 결론:

- `"..."` 감지는 **제거**
- literal **모드**는 **API 옵션으로 유지 가능**
- 모드 전환은 쿼리 문자열 **외부**에서 일어나야 함 (search 호출 시 옵션 전달)

### 비유: VSCode 검색창

- 검색 텍스트 입력: monotonic narrow
- Regex/CaseSensitive/WholeWord 토글 버튼: 누르는 순간 결과가 드라마틱하게 바뀜 → **허용**
- 이유: 버튼은 쿼리 **외부** affordance라 사용자가 인지

fuzzly의 `"..."` 감지는 "검색창 내부에 `/regex/` delimiter를 넣어서 감지하는 나쁜 UI" 패턴.

---

## Case 1: 리터럴 기능

### 현재 동작

`src/buildQuery.ts`는 쿼리 문자열이 `"..."`로 감싸진 형태면 substring 매칭(literal) 모드로 해석하고, 그렇지 않으면 fuzzy 매칭으로 해석한다. 추가로 non-literal 쿼리에서는 모든 `"` 문자를 스트립한다.

### 반례 — 타겟 `"a_b_c"` (흔한 변수명·파일명 패턴)

| step | 키스트로크 | `buildQuery` 해석 | `a_b_c` 매치 |
|---|---|---|---|
| 1 | `"` | not literal, strip → 빈 쿼리 | O (전부 매치) |
| 2 | `"a` | fuzzy `a` | O |
| 3 | `"ab` | fuzzy `ab` | O |
| 4 | `"ab"` | **literal `ab`** (substring) | **X** (연속 `ab` 없음) |
| 5 | `"ab"c` | not literal, strip → fuzzy `abc` | **O** |

**4→5** 전환에서 `a_b_c`가 결과에 **다시 등장**. 결과셋 확장. **monotonic 위배 확정**.

### 왜 이 전환만 문제인가

- literal substring ⊂ fuzzy match (strict subset) → `"ab` → `"ab"` 전환은 항상 narrowing
- literal `ab` ⊄ fuzzy `abc` → `"ab"` → `"ab"c` 전환은 narrowing 보장 없음

이미 타이핑된 `ab`의 해석이 substring → scatter로 **재해석**된다. 이게 fuzzly 철학과 정면 충돌.

### literal을 always-on parallel union으로 만들면?

`fuzzy(q) ∪ literal(q)` = `fuzzy(q)` — literal ⊂ fuzzy이므로 literal이 아무것도 기여하지 못한다.
→ **parallel 형태로는 무의미.** literal은 explicit mode로만 가치가 있다.

### 제거 vs 재설계 — 올바른 분할

- **`"..."` 감지**: 제거 (implicit reinterpretation 패턴)
- **`"` 스트립**: 제거 (`"`는 일반 문자가 되어 "`"`를 검색하고 싶다"는 기존 code comment 이슈도 해소)
- **literal 모드 자체**: explicit API 옵션으로 유지 가능

### 제안된 API 형태

사용자 요청: *"리터럴 모드가 가능하려면 쿼리문자열로부터 리터럴을 체크해서 활성할지 결정할 게 아니라 api를 호출할 때 옵션으로 받아야함. 구현예: 입력상자에서 특정 키를 누르든지 버튼 토글하면 리터럴 모드를 켜서 그 on/off 상태를 넘겨줘야함."*

```ts
interface Searcher {
    search(query: string, options?: { mode?: "fuzzy" | "literal" }): SearchResult[];
}

// 사용 예
const searcher = createSearcher(items);
searcher.search("안녕");                              // fuzzy (기본)
searcher.search("안녕", { mode: "literal" });         // UI 토글 켜졌을 때
searcher.search("안녕");                              // 토글 해제, fuzzy 복귀
```

**선택 근거**:
- Target 캐시가 모드 변경에도 살아남음 (Searcher 재생성 불필요)
- UI state와 1:1 매핑
- 4함수 로우레벨 API에는 영향 없음

**거부한 형태**:
- `createSearcher(items, { mode })` — 생성 때만 고정. 모드 바꿀 때마다 재생성해야 해서 target 캐시 재계산. 비쌈.
- `search(q)` + `searchLiteral(q)` 별도 메서드 — UI 토글 바인딩이 어색. 분기가 consumer 쪽으로 밀림.

### 내부 변경 스케치 (구현 시)

- `src/buildQuery.ts`:
  - `"..."` 감지 제거
  - `"` 스트립 제거
  - 항상 fuzzy `Query`만 생성
- `src/types.ts`:
  - `Query.literal: string | null` 필드 **제거** → `Query` shape 단순화, nullable 하나 해소
- `src/match.ts`:
  - literal 분기 제거 — 이 파일은 순수 fuzzy만 처리
  - literal은 별도 함수로 분리: `matchLiteral(target, text): GraphemeIndices | null`
- `src/createSearcher.ts`:
  - `search(query, options?)` 시그니처 확장
  - `options.mode === "literal"`이면 `matchLiteral` 경로로 분기
- 테스트:
  - `buildQuery.test.ts`: literal describe 제거
  - `match.test.ts`: literal describe → `matchLiteral` 테스트로 이동
  - `integration.test.ts`, `createSearcher.test.ts`: explicit mode 토글 케이스 추가

---

## Case 2: imeSwap (한/영 자동 변환)

### 배경

"사용자가 한영키 안 누르고 `gksrmf` 쳐놓고 `한글`을 찾거나, `ㅗ디ㅣㅐ` 쳐놓고 `hello`를 찾는" 시나리오 지원 여부.

### 세 가지 구현 방식

#### (1) auto fallback — "literal 0건일 때만 swap 시도"

타겟: `["good", "great", "한국", "한번"]`

| step | 키 | 평가 | 결과 |
|---|---|---|---|
| 1 | `g` | fuzzy `g` → `{good, great}`. 0건 아님, fallback 스킵 | `{good, great}` |
| 2 | `gk` | fuzzy `gk` → `{}`. 0건이므로 swap `ㅎㅏ` → `{한국}` | `{한국, 한번}` |

**1→2 전환**: `{good, great}` → `{한국, 한번}`, **disjoint**. 키 하나 추가했는데 이전 결과가 전부 사라지고 다른 것들로 교체. 리터럴 반례와 **동형**.

→ **거부**. autocomplete 영역이지 monotonic search 영역이 아님.

#### (2) always-on parallel union — "항상 literal과 swap 둘 다 평가하고 union"

| step | q | fuzzy(q) | swap(q) | fuzzy(swap(q)) | union |
|---|---|---|---|---|---|
| 1 | `g` | `{good, great}` | `ㅎ` | `{한국, 한번}` | `{good, great, 한국, 한번}` |
| 2 | `gk` | `{}` | `ㅎㅏ` | `{한국}` | `{한국}` |

`{한국}` ⊂ `{good, great, 한국, 한번}`. **Monotonic 유지**.

**왜 안 깨지는가**: `swap`은 char-by-char 함수이므로 `q`에 한 글자 추가 = `swap(q)`에 한 원자 추가 → `fuzzy(swap(q_{n+1})) ⊆ fuzzy(swap(q_n))`. 두 monotonic narrowing 함수의 union도 monotonic narrowing. 매 step에서 두 해석을 둘 다 평가하므로 step 간 해석 교체가 없음.

**트레이드오프**: step 1부터 `{한국, 한번}`이 딸려 나오는 **노이즈**. 다만 이건 "짧은 쿼리 = 많은 결과"라는 fuzzly 기존 특성과 같은 종류라 철학 위배는 아님.

→ **opt-in 형태로 허용 가능**.

#### (3) explicit mode toggle — "한/영 변환 버튼 토글"

리터럴 모드와 같은 패턴. 사용자가 UI 버튼으로 명시적으로 한/영 변환 모드를 켜면 search 호출 시 옵션으로 전달.

→ **허용**. 가장 자연스러운 형태일 수 있음. 실제로 일부 한글 도구(Karabiner 한영 변환, IntelliJ 한/영 자동변환)가 이렇게 동작.

### 결론

- (1) 거부
- (2) / (3) 허용, 어느 쪽을 구현할지 추후 결정
- 내 권장은 "일단 안 함, 수요가 생기면 (3)부터"

### 자동인식 설계 재검토 (2026-07-30)

위 Case 2가 던진 질문은 "swap을 할 것이냐"였다. 이 절은 그 다음 질문 — **"언제 swap인지
기계가 판단할 수 있느냐"** — 를 끝까지 따라간 기록이다. **구현하지 않기로 결론냈고**, 그
이유는 맨 아래 있다. 전제: 두벌식 + QWERTY만 고려.

#### 원칙: 인식은 필터가 아니라 랭킹 문제다

(1)이 거부된 이유(disjoint 점프)가 자동인식 전체를 지배한다. 어떤 판정 신호를 쓰든
**신호는 조합 도중 진동한다**:

```
g:0.00(ㅎ)  gk:1.00(하)  gks:1.00(한)  gksr:0.75(한ㄱ)  gksrm:1.00(한그)  gksrmf:1.00(한글)
```

`gksr`(= `한ㄱ`, 조합 중)에서 신뢰도가 떨어진다. 이걸 후보 집합 게이트로 쓰면 monotonic
narrowing이 깨진다. → **후보 집합은 항상 `fuzzy(q) ∪ fuzzy(swap(q))`(Case 2-(2)에서 단조 증명됨),
신뢰도는 점수에만 반영한다.** 그러면 신호가 매 키마다 요동쳐도 계약은 구조적으로 안 깨진다.

#### swap 함수와 fuzzly의 궁합

en→ko를 단순 문자 치환이 아니라 **두벌식 오토마타 리플레이**로 구현하면, 출력이
`ㅎ → 하 → 한 → 한ㄱ → 한그 → 한글` — fuzzly가 이미 1급으로 지원하는 IME journey다.
이 시퀀스는 flat atom 스트림 기준 append-only이고(도깨비불 `한`+`ㅏ`→`하나`도 flat으로는
`ㅎㅏㄴ`→`ㅎㅏㄴㅏ`), 세션 재사용 판정이 `Query.atoms` 연결 문자열의 prefix 비교
(`createSearcher.ts`의 `c.startsWith(p)`)이므로 **swap 브랜치도 기존 세션 기계를 그대로 탄다**.

ko→en은 자모 분해 후 역매핑(겹모음 `ㅘ`→`hk`, 겹받침 `ㄳ`→`rt` 분해). 33키 + shift 7키
양방향 테이블 하나면 되고, `decomposeToAtoms`/`atomIdToChar`가 이미 있다.

**제약**: `buildQuery`가 `foldCase`를 때리므로 swap은 **foldCase 앞단(raw input)** 에서 해야 한다.

#### 반드시 토큰별로 swap해야 한다 (전체 문자열 X)

이게 이 설계의 핵심이고, 틀리면 세션 재사용이 unsound해진다.

- **의미론**: 토큰별이면 `∩_t (native_t ∪ alt_t)` — 토큰 AND는 유지되고 **브랜치 OR이 토큰
  안에 갇힌다**. 전체 문자열 swap이면 OR이 토큰 AND 바깥으로 나와서, AND를 가정한 기존
  스냅샷 prefix 체크가 깨진다.
- **재사용 체크가 공짜**: swap이 atom-prefix 보존이므로 `native_t`가 `native_t'`의 atom-prefix면
  `alt_t`도 `alt_t'`의 atom-prefix다. → **native 토큰만 검사해도 alt까지 커버**된다.
  split의 atom-prefix dedup(`"a ab"` → `["ab"]`)도 같은 이유로 그대로 안전.
- **혼합 스크립트**: `"제목 gksrmf"`를 통째로 swap하면 `"wpahr 한글"` — 어느 해석도 아닌
  쓰레기. 토큰별이면 각 토큰이 독립적으로 `native ∪ alt`.

단, **`capsLock`은 재사용 호환 키에 명시적으로 넣어야 한다.** capsLock이 뒤집히면 native
토큰은 그대로인데 alt만 바뀌므로 prefix 체크가 못 잡는다 (`literal` 플래그와 같은 자리).
그리고 alt-dead latch(아래)는 **글로벌이 아니라 스냅샷별**이어야 한다 — 백스페이스가 조상
스냅샷을 복원하므로 alt가 되살아날 수 있다.

#### CapsLock 애매성: 길이가 아니라 키 집합으로 판정

두벌식에서 shift가 다른 자모를 내는 건 `q w e r t o p` 7개뿐(ㅂㅈㄷㄱㅅㅐㅔ ↔ ㅃㅉㄸㄲㅆㅒㅖ).
나머지 19키는 대소문자 무관 — `GKSRMF`도 그대로 `한글`이다.

CapsLock은 전역 모드라 가설이 딱 둘이다: **H1**(caps off, 보이는 대문자 = 실제 shift = 쌍자모),
**H2**(caps on, 케이스 전부 반전). 핵심은 — **shift를 누를 *이유*가 있는 키는 `qwertop`뿐**이라는 것:

| | 반박 조건 |
| --- | --- |
| **H1** (caps off) | `qwertop` 밖의 **대문자**가 있음 (shift 누를 이유 없는 자리에 눌렀다 ⇒ caps가 켜진 것) |
| **H2** (caps on)  | `qwertop` 밖의 **소문자**가 있음 (caps 켜졌는데 그 자리에 shift 눌렀다 ⇒ caps가 꺼진 것) |

```
e / we / to / pot   H1 살아있음  H2 살아있음   ← 진짜 애매
ek / tk / Ek        H1 살아있음  H2 반박       → 다 / 사 / 따
Ekfrl               H1 살아있음  H2 반박       → 딸기   (혼합 케이스인데 확정된다)
gksrmf / dkssud     H1 살아있음  H2 반박       → 한글 / 안녕
GKSRMF / EKFRL      H1 반박      H2 살아있음   → 한글 / 달기
GksRmf              H1 반박      H2 반박       → 정상 입력 아님, 신뢰도 바닥
```

**남는 애매함 = 쿼리가 `qwertop` 7글자로만 이루어진 경우뿐** — 사실상 1~2글자.
"전부 소문자면 caps off"라는 길이 기반 논증은 **1글자에서 무너진다** (caps 켜진 채 `Shift+E`
한 번 = 소문자 `e` = ㄸ 의도). 키 집합 규칙은 길이와 무관하게 성립한다.

이 반박 규칙은 **hard gate가 아니라 prior로** 써야 한다 — 타이핑 중 shift가 한 키 늘어지는
일은 실제로 일어나고, 위 "필터 아닌 랭킹" 원칙도 그대로 적용된다.

브라우저에서는 `KeyboardEvent.getModifierState("CapsLock")`으로 **실제 상태를 읽을 수 있다**.
`useFuzzlyInput`이 keydown을 보므로 사실상 항상 알 수 있고, 그러면 이 추론 전체가 불필요해진다.
API 모양은 per-call `capsLock?: boolean` (`true | false | undefined` 삼항, undefined = 추론 폴백).

#### 신호: 조합 수율 (composition yield)

swap 결과 자모 중 완성형 음절에 흡수된 비율. 한국어는 CV(C)가 강제라 항상 1.0이지만,
영어 철자를 두벌식에 사상하면 자음/모음 배치가 무관해져 고아 자모가 쏟아진다.
**꼬리 고아 자모 1개를 제외**해야 조합 중 진동이 사라진다:

```
gksrmf   g:—  gk:1.00 gks:1.00 gksr:1.00 gksrm:1.00 gksrmf:1.00   → 한글
rjator   r:—  rj:1.00 rja:1.00 rjat:1.00 rjato:1.00 rjator:1.00   → 검색
search   s:—  se:0.00 sea:0.00 sear:0.00 searc:0.00 search:0.33   → ㄴㄷㅁㄱ초
settings s:—  se:0.00 set:0.00 sett:0.00 setti:0.40 ...     :0.29 → ㄴㄷㅅ샤ㅜㅎㄴ
```

측정(한글 의도 40개 / 영어 83개): 한글은 전원 1.00(round-trip이므로 구조적 보장),
영어는 평균 0.47. 임계값 1.0에서 영어 오탐 10/83(12%) — `world the and cut for with query
queue theme syzygy`. **오탐이 전부 짧은 단어에 몰린다. capsLock 추론이 무너지는 구간과 정확히 같다.**
→ 두 prior 모두 짧은 쿼리에서 무력하다. 그 구간은 어차피 후보가 넘쳐 정확도가 무의미하므로
랭킹에 맡기는 게 맞다.

#### L2(코퍼스 증거)는 기각

"두 브랜치의 top score를 비교하면 어떤 언어학적 휴리스틱보다 정확하다"가 처음 결론이었으나,
**`scan` 커서와 상충한다**. 브랜치 비교는 스캔이 끝나야 알 수 있는데 커서는 부분 결과를
증분으로 내보내므로, 뒤늦게 페널티가 바뀌면 이미 그려진 순위가 뒤집힌다. 직전 스캔 결과를
재사용하는 변형은 같은 쿼리가 히스토리에 따라 다른 결과를 내서 결정성이 깨진다.
→ **L1 prior(수율 + capsLock)만 쓴다.**

#### 스코어링 전략 (가산만 — 5축 철학 준수)

```
altScore = rawScore − (swapBase + swapYieldPenalty × (1 − yield))
```

- `yield`는 쿼리당 1회 계산, target 무관 → 캐시가 자연스럽다
- fuzzly 점수는 음수가 될 수 있지만 **가산** 페널티라 멀티필드 weight 같은 부호 보존 처리 불필요
- 같은 아이템이 양쪽에 걸리면 `max(native, alt)`. 동점이면 native 승(결정적), 하이라이트도 이긴 쪽
- 페널티가 상수이므로 긴 쿼리일수록 상대적으로 작아진다 = 증거가 많을수록 alt를 신뢰. 의도된 동작
- 튜닝 목표: `완벽한 alt 매치 > 흩어진 native 매치` 이면서 `괜찮은 native 매치 > 완벽한 alt 매치`.
  `swapBase`는 `positionZero + boundary` 보너스 합 근처에서 출발
- capsLock 애매 구간(`qwertop`-only)에서 alt를 둘 다 만들면 브랜치가 3개가 된다. **H1 하나만** 쓴다

#### 사이드이펙트 목록

| 항목 | 대응 |
| --- | --- |
| 번들 크기 (오토마타+테이블 ~1.5–2KB) | `fuzzly/layout` 서브엔트리 + DI (`SearcherOptions.layoutSwap`) 로 tree-shake |
| alt-dead latch | 글로벌 아님 — **스냅샷별**. 백스페이스로 조상 복원 시 alt가 되살아난다 |
| `scan`의 `total` | 아이템 단위 dedup 후 카운트 |
| 하이라이트 설명 | ranges는 target 좌표계라 무해. 단 `MatchResult`에 이긴 해석 + 해석된 쿼리 노출 필요 |
| 멀티필드 | 브랜치 OR은 cross-field AND **안쪽**(토큰 레벨)에 |
| strict | alt도 동일 가드(토큰 완전 동일일 때만 재사용). 추가 예외 불필요 |
| `literal: true` | swap 적용 안 함 (whitespace도 무시하는 raw substring 경로와 동일 취급) |
| dev silent-ignore guard | `capsLock`을 per-call 키 목록에 추가 |
| 순위 요동 | 꼬리 고아 자모 1개 제외로 해소 (위 실측) |
| `PREPROCESS_VERSION` | **bump 불필요** — Target 레이아웃/atom 인코딩 무변경. 쿼리 축만 건드린다 |

#### 결론: 라이브러리 경계는 `swapLayout`까지다

union 랭킹은 **구현하지 않았다.** 이유는 비용이 아니라 경계다.

위 스코어링 전략에는 `swapBase`라는 튜닝 상수가 있고, 이 값은 코퍼스(항목 길이 분포, 필드 수,
점수 스케일)에 의존한다. 내 코퍼스에서 맞춘 값이 남의 코퍼스에서 안 맞는다. **실사용 데이터가
있어야 정해지는 상수가 필요하다는 건, 그 기능이 라이브러리에 속하지 않는다는 신호다.**

그리고 그 상수가 필요했던 유일한 이유는 **두 해석을 하나의 순위로 합치려 했기 때문**이다.
합치려면 비교 불가능한 두 점수 스케일을 억지로 통약해야 한다. 안 합치면 상수가 없다.
"as-typed 해석과 swap 해석 중 무엇을 위에 놓을 것인가"는 매칭 문제가 아니라 제품 결정이고,
그 판단에 필요한 지식(사용자층, 코퍼스 언어 분포, 오탐의 비용)은 라이브러리에 없다.

→ 경계를 다시 그으면 라이브러리 몫은 **`swapLayout(input, capsLock?)` 하나**다
(`src/layout.ts`, `fuzzly/layout`). 순수함수, 튜닝 노브 0, 임계값 0, 입력만으로 완전 결정,
round-trip property로 검증된다. 합성은 소비자가 한다 — Target을 공유하는 두 번째 searcher를
만들면 세션 오염도 전처리 중복도 없다 (README 참고).

`compositionYield`(조합 수율)는 **내보내지 않았다.** always-on union의 신뢰도 가중치로만
필요했던 것이고, "native 검색이 0건인데 swap 검색은 히트"라는 코퍼스 증거가 이미 공짜로
같은 일을 한다. 위 수율 분석은 판단 근거로만 남긴다.

다시 손댈 일이 생기면: 소비자 쪽 "제안 표면"(결과 집합은 건드리지 않고 *"혹시 `한글`?"* 만
띄우기)이 단조성 계약을 전혀 건드리지 않으면서 가치의 대부분을 가져간다. 그걸로 실사용
오탐률이 모인 **다음에야** union 랭킹을 얘기할 수 있다.

---

## Case 3: `tailSpillover` 옵션

### 현재 상태

`src/types.ts`의 `MatchOptions.tailSpillover: "never" | "always" | "lastOnly"`. 기본값 `"lastOnly"`.

- **`"never"`**: spillover 금지
- **`"always"`**: 모든 쿼리 글자에서 spillover 허용
- **`"lastOnly"`**: **마지막 쿼리 글자만** spillover 허용 (기본값, "마지막 글자는 mid-composition일 것이다"라는 가정)

### lastOnly는 set-containment는 지키지만 의도-monotonic을 깬다

#### Set-containment 증명 (형식)

**Claim**: `R(q+c, lastOnly) ⊆ R(q, lastOnly)`.

Proof sketch:
- `q+c` 매치에서 `q[n-1]`은 internal 위치이므로 spillover 없이 매칭됨
- `q` 매치에서 `q[n-1]`은 last 위치이므로 spillover 허용으로 매칭됨
- Spillover 허용은 spillover 금지의 superset → `q+c`의 모든 `q[n-1]` 매치는 `q`에서도 성공
- `q`는 `q[n-1]` 이후 grapheme이 없으므로 commitment가 후속 매칭을 방해할 수 없음
- ∴ `T ∈ R(q+c) → T ∈ R(q)` — narrowing 성립

기술적으로 set-containment는 보장된다.

#### 실제 UX에서는 사용자 의도가 뒤집힌다

사용자가 `가방사`를 찾고 싶어서 `갑사`를 타이핑한다. `갑`은 `가방`의 mid-composition이고, ㅂ은 `방`의 초성으로 spillover 돼야 한다.

**step 1: 쿼리 `갑` (lastOnly)**
- qi=0 last, spillover 허용
- `가방사` 매치: 갑 spillover ㅂ → 방[0]=ㅂ match → 매치 [0, 1] ✓

**step 2: 쿼리 `갑사` (lastOnly)**
- qi=0 (갑) NOT last, spillover **불허**
- 갑 vs 가: tail mismatch, spillover 안 됨 → 실패
- 갑 vs 방: ㄱ≠ㅂ → 실패
- 갑 vs 사: ㄱ≠ㅅ → 실패
- **매치 실패**

**사용자 체감**: "갑 쳤을 때 `가방사` 나왔는데, 그게 내가 찾던 거라서 `갑사`로 더 좁히려 했는데 사라짐."

`가방사` ∈ R(`갑`) 이지만 `가방사` ∉ R(`갑사`). 기술적으론 narrowing이지만, 사용자가 **동일한 타겟을 염두에 두고 계속 타이핑**하는 intent를 위배함.

### lastOnly의 근본 결함

"last 글자만 mid-composition"이라는 전제가 부정확하다:

- 사용자가 `갑사`를 쳤을 때, `갑`도 여전히 `가방`의 approximate 입력. 앞 글자라고 해서 retroactively "finalized"가 아님.
- spillover는 "조합 중"이라는 일시적 상태가 아니라 **한글 음절 경계의 구조적 모호성**에서 오는 것
- ㅂ이 앞 음절의 종성이냐 다음 음절의 초성이냐는 타이핑이 얼마나 더 진행되었는지와 **무관한** 구조적 특성
- 사용자가 추가 키를 쳤다고 해서 앞 글자의 음절 경계 해석이 바뀌면 안 됨

**lastOnly는 앞 글자의 spillover 해석을 post-hoc으로 뒤집는다.** 이는 우리가 reject한 `"..."` 감지나 imeSwap auto fallback과 **같은 family의 implicit reinterpretation**이다. Set-containment가 우연히 narrowing 방향이라 일반 감사 기준(step 3)은 빠져나가지만, 사용자 의도 모델 관점에선 동일한 문제.

### 세 옵션 비교

|  | 해석 stability | monotonic (set) | 사용자 의도 |
|---|---|---|---|
| `"never"` | ✓ 일관 | ✓ | 너무 엄격 (기본 spillover 유스케이스 놓침) |
| **`"always"`** | **✓ 일관** | **✓** | **✓ 부합** |
| `"lastOnly"` | ✗ step마다 재해석 | ✓ | ✗ 앞 글자 spillover 사라짐 |

### 결론 — `"always"`가 정답

- `"lastOnly"`는 under-baked 최적화. 제거 대상.
- `"never"`는 monotonic이지만 기본 spillover 유스케이스를 놓쳐서 "엄격 검색" 이외 쓸 데 없음
- `"always"`만이 철학·기술·사용자 의도 세 축 모두 부합

### 정리 방향 — 두 경로

**(A) 옵션 제거, 내부적으로 항상 spillover 허용**
- 가장 단순
- `remainder` 옵션도 연쇄 재검토:
  - 현재 `"strict"` 분기는 `if (!matchOptions.tailSpillover)` boolean 체크로 spillover에 coupled (이전 boolean 시절 잔재)
  - 현재 `"tailSpilloverOnly"`는 lastOnly 로직에 의존 — spillover 상시 on이면 `"allow"`와 동치 → 중복 → 제거
  - 결과: `remainder: "strict" | "allow"` 두 옵션만 남음

**(B) 옵션 유지, 기본값만 `"lastOnly"` → `"always"`**
- 하위호환
- `"lastOnly"`는 "use at your own risk"로 남음
- 아래 strict-remainder 버그를 별도 수정 필요

### 관련 버그 (report 받음, 현재 브랜치에서 미수정)

`src/match.ts:149`의 `if (!matchOptions.tailSpillover)` 체크는 이전 boolean 시절 잔재로, 현재 string union 하에서 항상 `false`다. 즉 `remainder: "strict"`의 failure path가 죽은 코드.

구체적 재현:

```ts
const q = buildQuery("가")!;
const t = preprocessTarget("각", { caseSensitive: true });
match(q, t, { remainder: "strict", tailSpillover: "never", caseSensitive: true });
// 기대: null (strict, spillover off, leftover atom ㄱ 있음)
// 실제: [0] (strict failure path가 죽어서 그냥 accept)
```

- (A) 채택 시: `remainder` 재설계로 **자연 해소**, 별도 fix 불필요.
- (B) 채택 시: 조건을 `matchOptions.tailSpillover === "never"`로 수정.

### 지금은 기록만

이 분석은 Case 1 (literal) / Case 2 (imeSwap)와 함께 기록해두고, 실제 구현/제거 작업은 후속 결정 대기. `claude/review-api-design-W4nv1`에서 strict-remainder 버그를 **fix하지 않고** 넘어간다.

---

## 일반화된 원칙 — Feature 감사 기준

```
Monotonic narrowing은 "단일 모드 내에서" 적용된다.
모드 전환은 다음 조건을 모두 만족하면 정당하다:
  (a) 쿼리 문자열 내용과 독립적으로 trigger됨
  (b) 쿼리 문자열 외부의 명시적 user action (버튼/키/API 옵션) 으로 trigger됨
  (c) 사용자가 현재 모드를 UI 상으로 인지할 수 있음
```

`"..."` 감지 = (a)(b) 둘 다 위반 → 제거
UI 토글 버튼 = 셋 다 충족 → 허용

### Feature 심사 1차 필터

fuzzly에 새 feature 제안이 들어오면 다음 순서로 심사:

1. **쿼리 문자열에서 모드를 감지하는가?**
   - 예 → **거부** (implicit reinterpretation)

2. **모든 키스트로크에서 같은 방식(동일 모드)으로 평가되는가?**
   - 아니오 (조건부 활성화, auto fallback 등) → **거부** (autocomplete 영역)
   - 예외: 사용자가 명시적 action으로 모드를 바꿨을 때는 OK

3. **always-on parallel union 형태로 짤 수 있는가?**
   - 가능하고 기여가 있음 → 채택 후보 (트레이드오프는 노이즈)
   - 가능하지만 기여 없음 → 불필요 (ex: literal은 fuzzy의 strict subset이라 parallel로 짤 이유 없음 → explicit mode로만 존재)
   - 불가능 → explicit mode toggle만 가능

4. **parallel / 모드 형태가 각각 독립적으로 monotonic하게 narrow하는가?**
   - 각 해석이 monotonic이고 union도 monotonic인지 case-by-case 검증

### 이 원칙이 해결하는 것들

- **리터럴**: `"..."` 감지 제거. literal 모드는 explicit API 옵션으로만 유지.
- **imeSwap**: auto fallback 거부. parallel union / explicit toggle 허용.
- **`tailSpillover` 옵션** (Case 3): `"lastOnly"`가 의도-monotonic을 깨는 implicit reinterpretation. `"always"`로 환원 권장, 나아가 옵션 자체 제거.
- **향후 오타 교정(typo correction)**: 보통 조건부 활성화 → 거부. parallel로 짜면 노이즈 심함 → 아마 거부.
- **향후 동의어 확장** (한↔영 번역 매칭 등): parallel로 짜면 monotonic 유지되지만 스코프 의문.

### 이 원칙이 건드리지 않는 것들

- `tailSpillover: "always"` / `"never"`: 매 step 동일 해석 → OK. (`"lastOnly"`만 문제 — Case 3 참조)
- `remainder` 옵션: 결정 보류. Case 3의 tailSpillover 정리 방향에 따라 같이 재검토 필요 (현재 `"strict"` 분기가 spillover boolean 잔재에 coupled).
- `caseSensitive`: 쿼리/타겟 생성 시점에 고정, 런타임 재해석 없음. OK.
- `whitespace` (이미 API 개편에서 타입 제거): 해당 없음.

---

## 미결정 사항 (나중에 이어서)

1. **리터럴**: `"..."` 감지 제거 + explicit `mode` 옵션으로 유지 vs 완전 제거
2. **API 형태**: `search(q, { mode })` 확정 여부
3. **imeSwap**: 구현 안 함 / parallel union opt-in / explicit mode toggle 중 택일
4. **`tailSpillover`** (Case 3):
   - (A) 옵션 제거하고 내부적으로 `"always"` 고정 + `remainder` 연쇄 재설계 (`"tailSpilloverOnly"` 제거)
   - (B) 기본값만 `"always"`로 변경 + `src/match.ts:149` 버그 (`!matchOptions.tailSpillover` → `=== "never"`) 별도 수정
   - 관련 버그: `remainder: "strict"`가 현재 죽은 코드임. (A) 선택 시 자연 해소, (B) 선택 시 별도 수정 필요.
5. **원칙 문서화**: `CLAUDE.md`에 "Implicit modality 금지" 섹션을 정식 추가할지

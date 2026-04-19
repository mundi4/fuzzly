# IME Event Logs

`demo/ime-inspector.html`에서 수집한 실측 이벤트 시퀀스. 쿼리 `"막엲ㄱ"` rapid typing 기준.

## Chrome

```
09:32.477  compositionstart   data=""  sel=0-0
09:32.477  compositionupdate  data="ㅁ"  sel=0-0
09:32.479  input              data="ㅁ"  sel=1-1  inputType=insertCompositionText
09:32.805  compositionupdate  data="마"  sel=0-1
09:32.806  input              data="마"  sel=1-1  inputType=insertCompositionText
09:33.052  compositionupdate  data="막"  sel=0-1
09:33.054  input              data="막"  sel=1-1  inputType=insertCompositionText
09:33.322  compositionupdate  data="막"  sel=0-1
09:33.324  input              data="막"  sel=1-1  inputType=insertCompositionText
09:33.325  compositionend     data="막"  sel=1-1
09:33.326  compositionstart   data=""  sel=1-1
09:33.326  compositionupdate  data="ㅇ"  sel=1-1
09:33.329  input              data="ㅇ"  sel=2-2  inputType=insertCompositionText
09:33.510  compositionupdate  data="여"  sel=1-2
09:33.510  input              data="여"  sel=2-2  inputType=insertCompositionText
09:33.683  compositionupdate  data="연"  sel=1-2
09:33.686  input              data="연"  sel=2-2  inputType=insertCompositionText
09:34.055  compositionupdate  data="엲"  sel=1-2
09:34.058  input              data="엲"  sel=2-2  inputType=insertCompositionText
09:34.312  compositionupdate  data="엲"  sel=1-2
09:34.315  input              data="엲"  sel=2-2  inputType=insertCompositionText
09:34.316  compositionend     data="엲"  sel=2-2
09:34.318  compositionstart   data=""  sel=2-2
09:34.318  compositionupdate  data="ㄱ"  sel=2-2
09:34.320  input              data="ㄱ"  sel=3-3  inputType=insertCompositionText
09:35.967  compositionend     data="ㄱ"  sel=3-3
```

**관찰**:
- `compositionstart`는 항상 `data=""`. 조합 문자는 `compositionupdate`부터.
- `compositionend` → 다음 `compositionstart`: **1~2ms 간격의 별도 macrotask**.
- `compositionstart` → `compositionupdate`: 동일 ms (같은 tick 가능성 높음).
- `input` 이벤트는 `compositionupdate` 바로 뒤에만. `compositionend`와 다음 `compositionstart` 사이에는 끼지 않음.
- 마지막 explicit `compositionend` (후속 start 없음)는 사용자 stop 후 ~1.6s.

## Firefox

```
17:28.103  compositionstart   data=""  sel=0-0
17:28.104  compositionupdate  data="ㅁ"  sel=0-0
17:28.105  input              data="ㅁ"  sel=1-1  inputType=insertCompositionText
17:28.448  compositionupdate  data="마"  sel=1-1
17:28.450  input              data="마"  sel=1-1  inputType=insertCompositionText
17:28.725  compositionupdate  data="막"  sel=1-1
17:28.725  input              data="막"  sel=1-1  inputType=insertCompositionText
17:29.066  input              data="막"  sel=1-1  inputType=insertCompositionText
17:29.067  compositionend     data="막"  sel=1-1
17:29.067  input              data="막"  sel=1-1  inputType=insertCompositionText
17:29.069  compositionstart   data=""  sel=1-1
17:29.070  compositionupdate  data="ㅇ"  sel=1-1
17:29.072  input              data="ㅇ"  sel=2-2  inputType=insertCompositionText
17:29.325  compositionupdate  data="여"  sel=2-2
17:29.325  input              data="여"  sel=2-2  inputType=insertCompositionText
17:29.564  compositionupdate  data="연"  sel=2-2
17:29.564  input              data="연"  sel=2-2  inputType=insertCompositionText
17:29.889  compositionupdate  data="엲"  sel=2-2
17:29.889  input              data="엲"  sel=2-2  inputType=insertCompositionText
17:30.364  input              data="엲"  sel=2-2  inputType=insertCompositionText
17:30.364  compositionend     data="엲"  sel=2-2
17:30.364  input              data="엲"  sel=2-2  inputType=insertCompositionText
17:30.365  compositionstart   data=""  sel=2-2
17:30.367  compositionupdate  data="ㄱ"  sel=2-2
17:30.368  input              data="ㄱ"  sel=3-3  inputType=insertCompositionText
17:33.977  input              data="ㄱ"  sel=3-3  inputType=insertCompositionText
17:33.977  compositionend     data="ㄱ"  sel=3-3
17:33.978  input              data="ㄱ"  sel=3-3  inputType=insertCompositionText
```

**관찰 (Chrome과 공통)**:
- `compositionstart`는 항상 `data=""`, 조합 문자는 `compositionupdate`부터.
- 음절 전이 전체 (`compositionend` → 다음 `input`)는 ~5-6ms 안에 완료 → 한 프레임(16.67ms) 안에 들어옴.

**Firefox-specific 차이**:
- `compositionend` **양쪽에 `input` 이벤트가 추가로 붙음** (같은 ms). 예: `input(막)` → `compositionend(막)` → `input(막)` → `compositionstart`. Chrome에는 없는 패턴.
- `compositionstart` → `compositionupdate` 간격 1ms (Chrome은 동일 ms).

## 공통: 최종 compositionend의 발동 조건

- Chrome/FF 둘 다 마지막 `compositionend`는 **사용자가 명시적으로 종료한 것이 아니라 포커스 이동(복사 버튼 클릭 등)에 의해 촉발**.
- 사용자가 타이핑을 멈추고 가만히 있는 상태에서는 브라우저가 **여전히 composition 상태로 인식**. `isComposing` 유지, `composingIndex` 유지.
- **함의**: 훅은 "사용자가 멈췄으니 조합이 끝났을 것"을 추정하면 안 된다. 타이머로 idle 전환하는 설계가 틀린 이유이기도 함.

## 배칭 메커니즘 검증

두 브라우저 모두 음절 전이의 모든 이벤트(~4-6ms)가 한 프레임 안에 들어오므로 `requestAnimationFrame` 배칭으로 중간 `null` emit을 제거 가능. 프레임 경계를 걸치는 경우는 실측 범위 내에서 관찰되지 않았으나, 저성능 환경이나 탭 background 등에서 발생 시 double-rAF 등 추가 방어가 필요할 수 있음 — 현재 범위 밖.

# Multi-Agent Evidence-Separated UEBA 학회 발표 흐름 정리

## 0. 이 문서의 목적

이 문서는 SHIELD/RECALL-UEBA 프로젝트를 학회 발표용 슬라이드로 만들기 위한 내용 정리 파일이다. 발표의 중심은 "멀티에이전트를 붙였다"가 아니라, 기존 UEBA가 놓치기 쉬운 정상 업무 맥락과 위험 증거를 분리해 오탐을 줄였다는 점이다.

슬라이드 제작자는 아래 흐름을 그대로 PPT 목차로 옮기면 된다.

## 1. 발표 핵심 한 문장

> 기존 UEBA가 "평소와 다른 행동"을 하나의 점수로 판단했다면, 본 연구는 로그인, 파일, 웹, 이메일, 장치, 맥락 판단을 전문 에이전트로 분리하고, 위험 증거와 정상 업무 맥락을 따로 평가해 내부자 위협 탐지의 오탐을 줄이는 Multi-Agent Evidence-Separated UEBA 구조를 제안한다.

더 쉽게 말하면:

> 한 명의 분석가가 모든 로그를 혼자 보는 대신, 여러 전문 분석가가 각자 맡은 부분을 보고 마지막에 종합 판단하게 만든 구조이다. 여기에 "위험해 보이는 행동"과 "정상 업무로 설명되는 행동"을 구분해 정상 사용자를 잘못 경고하는 문제를 줄였다.

## 2. 발표 전체 스토리라인

발표 흐름은 아래 6단계로 잡는다.

1. 내부자 위협은 정상 계정과 정상 도구를 사용하기 때문에 탐지가 어렵다.
2. SIEM은 정해진 rule에 강하지만, rule 밖의 사용자 행동 흐름을 놓치기 쉽다.
3. 기존 UEBA는 평소와 다른 행동을 찾지만, "왜 위험한지"와 "정상 업무인지"를 구분하는 데 한계가 있다.
4. 싱글 에이전트 UEBA는 전체 로그와 규칙을 한 번에 판단하므로 탐지 기준이 흔들릴 수 있다.
5. 멀티에이전트 UEBA는 규칙별 전문 에이전트가 병렬로 판단해 탐지율을 높인다.
6. Evidence-separated 구조는 위험 증거와 정상 맥락 증거를 분리해 멀티에이전트의 오탐을 줄인다.

발표에서 가장 중요한 결론:

> 60개 stability case 기준, 단순 멀티에이전트는 Recall 93.3%를 달성했지만 FP가 8건 발생했다. Evidence-separated 구조를 적용하자 Recall 93.3%는 유지하면서 FP를 0건으로 줄였고, F1-score는 84.8%에서 96.6%로 개선되었다.

## 3. 연구 배경

### 3.1 내부자 위협이 어려운 이유

| 관점 | 외부 공격 탐지 | 내부자 위협 탐지 |
|---|---|---|
| 계정 | 외부 침입자 또는 탈취 계정 | 정상 임직원 계정 |
| 권한 | 권한 상승 또는 비인가 접근 | 이미 가진 권한 사용 |
| 도구 | 악성코드, exploit, 공격 도구 | 브라우저, 이메일, USB, 파일 시스템 |
| 탐지 기준 | signature, IOC, rule | 사용자별 평소 행동과의 차이 |
| 핵심 난점 | 알려지지 않은 공격 변종 | 정상 업무와 위협 행동의 경계가 흐림 |

발표 멘트:

> 내부자 위협은 공격자가 회사 밖에서 들어오는 것이 아니라, 이미 권한을 가진 사용자가 평소 쓰던 도구로 자료를 유출하는 경우가 많다. 그래서 "이 행동이 있었는가"보다 "이 사용자에게 이 행동이 자연스러운가"를 봐야 한다.

### 3.2 기존 SIEM과 UEBA의 한계

| 방식 | 핵심 질문 | 장점 | 한계 |
|---|---|---|---|
| SIEM | 정해진 rule에 걸렸는가? | 명확한 정책 위반 탐지에 강함 | rule에 없는 흐름은 놓침 |
| 기존 UEBA | 평소와 다른 행동인가? | 정상 계정 기반 이상행동 탐지에 유리 | 정상 업무 맥락과 위협 맥락 구분이 약함 |
| 싱글 에이전트 UEBA | 전체 로그를 보고 위협인가? | 맥락을 볼 수 있음 | 많은 규칙을 한 번에 보며 판단이 흔들릴 수 있음 |

발표 멘트:

> 기존 UEBA는 평소와 다르다는 사실은 잘 포착할 수 있지만, 그 차이가 실제 위협인지, 아니면 승인된 업무인지까지 분리해서 설명하기 어렵다.

## 4. 제안 방법

## 4.1 Multi-Agent UEBA

기존 싱글 에이전트 방식은 하나의 모델이 전체 로그와 모든 규칙을 동시에 본다. 본 연구에서는 규칙을 작게 나누고, 각 규칙을 전담하는 specialist agent가 병렬로 판단하도록 구성했다.

| Agent | 담당 규칙 | 보는 증거 |
|---|---|---|
| `login_time_agent` | 비정상 시간 접속 | 야간/주말 로그인, 평소 활동 시간대 |
| `device_ip_agent` | 장치/IP 이상 | 낯선 PC, 낯선 IP, 다른 사용자 PC |
| `usb_agent` | 이동식 매체 | USB 연결, 파일 복사 |
| `file_access_agent` | 파일 접근 이상 | 대량 다운로드, 민감 문서 접근 |
| `web_exfil_agent` | 웹 기반 유출 | Wikileaks, Dropbox, job site, upload |
| `email_agent` | 이메일 유출 | 외부 수신자, 첨부파일 전송 |
| `memory_agent` | 반복 위반 유사도 | 과거 위반 패턴과의 유사성 |
| `context_exception_agent` | 정상 업무 맥락 | 승인 예외, 유지보수, 교육/훈련, incident review |
| `case_flow_agent` | 전체 흐름 | 로그인 -> 파일 접근 -> 외부 전송 같은 kill chain |

핵심 차별점:

> 한 에이전트가 모든 규칙을 동시에 판단하지 않고, 규칙별 전담 에이전트가 병렬로 판단한 뒤 Supervisor가 종합한다.

### 4.2 Evidence-Separated 구조

멀티에이전트만 적용하면 탐지율은 올라가지만, 정상인데 공격처럼 보이는 hard-negative case도 함께 경고할 수 있다. 이를 줄이기 위해 위험 증거와 정상 맥락 증거를 분리했다.

| 구분 | 예시 | 역할 |
|---|---|---|
| 위험 증거 | 야간 로그인, 대량 다운로드, USB 사용, 외부 업로드 | 위협 가능성을 높임 |
| 정상 맥락 증거 | 승인된 유지보수, 훈련용 export, incident review, approved exception | 오탐 가능성을 낮춤 |

구조:

```text
Case logs
  |
  +--> Risk specialist agents
  |      login / device / usb / file / web / email / memory / flow
  |
  +--> Context exception agent
         approved exception / maintenance / training / incident review
  |
  v
Supervisor
  - confirmed exfiltration이면 alert 유지
  - profile-only 이상 + 강한 정상 맥락이면 observe로 낮춤
```

발표 멘트:

> 핵심은 정상 맥락을 위험 증거와 같은 바구니에 넣지 않는 것이다. 먼저 위험 증거를 따로 보고, 정상 업무로 설명되는 증거를 따로 본 뒤, Supervisor가 둘을 비교해 최종 경고를 결정한다.

## 5. 실험 설계

### 5.1 데이터셋

이번 최종 비교는 CERT selected dataset에서 만든 case-level 평가셋을 사용했다.

| 항목 | 값 |
|---|---|
| 원천 데이터 | CMU SEI CERT Insider Threat Dataset 기반 selected dataset |
| 평가 단위 | case-level |
| 사용 case set | `stability_cases.json` |
| 전체 case 수 | 60 |
| Positive / Normal | 30 / 30 |
| 선택 scenario | 1, 2, 4 |
| LLM model | `gpt-4.1-mini` |
| 실행 결과 경로 | `out/multi_agent_triage/llm_stability_once` |

주의:

> 이 결과는 전체 CERT 모든 로그에 대한 최종 성능이 아니라, 선택된 60개 stability case에 대한 확장 검증이다.

### 5.2 비교 방법

같은 60개 case에 대해 아래 4개 방법을 비교했다.

| Method | 의미 | 발표에서의 역할 |
|---|---|---|
| Existing SIEM | 기존 rule 기반 탐지 결과를 case-level로 집계 | 기존 보안 시스템 baseline |
| Single-Agent UEBA | 단일 행동 점수 기반 UEBA를 case-level로 집계 | 기존 UEBA에 가까운 baseline |
| Multi-Agent UEBA | LLM specialist agent 결과에서 정상 맥락 분리 없이 종합 | 멀티에이전트 자체 효과 |
| Multi-Agent + Evidence-Separated UEBA | 위험 증거와 정상 맥락 증거를 분리해 Supervisor가 종합 | 본 연구 제안 방식 |

중요한 실험 포인트:

> 3번째와 4번째 방법은 같은 멀티에이전트 결과를 사용한다. 차이는 context/evidence separation을 적용했는지 여부이다. 따라서 evidence-separated 구조가 오탐 감소에 기여했는지 직접 비교할 수 있다.

## 6. 최종 실험 결과

### 6.1 60개 stability case 결과표

| Method | Precision | Recall | F1 | TP | FP | FN | TN | Review Queue / 100 Normal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Existing SIEM | 0.0% | 0.0% | 0.0% | 0 | 0 | 30 | 30 | 0.00 |
| Single-Agent UEBA | 100.0% | 33.3% | 50.0% | 10 | 0 | 20 | 30 | 0.00 |
| Multi-Agent UEBA | 77.8% | 93.3% | 84.8% | 28 | 8 | 2 | 22 | 26.67 |
| Multi-Agent + Evidence-Separated UEBA | 100.0% | 93.3% | 96.6% | 28 | 0 | 2 | 30 | 0.00 |

출처:

- Markdown report: `out/final_multi_agent_comparison_stability60/final_method_comparison.md`
- CSV: `out/final_multi_agent_comparison_stability60/final_method_comparison.csv`
- SVG graph: `out/final_multi_agent_comparison_stability60/final_method_comparison.svg`
- LLM summary: `out/multi_agent_triage/llm_stability_once/multi_agent_summary.md`

### 6.2 결과 해석

| 관찰 | 해석 |
|---|---|
| Existing SIEM recall 0.0% | 선택된 case-level set에서는 고정 rule이 공격 흐름을 충분히 포착하지 못했다. |
| Single-Agent UEBA recall 33.3% | 단일 점수 기반 UEBA는 오탐은 없지만 실제 위협 20건을 놓쳤다. |
| Multi-Agent UEBA recall 93.3% | 규칙별 전문 agent 병렬 판단으로 실제 위협 탐지율이 크게 올랐다. |
| Multi-Agent UEBA FP 8건 | 탐지 민감도가 올라가면서 정상 hard-negative case까지 경고했다. |
| Evidence-Separated FP 0건 | 정상 맥락 agent와 Supervisor가 오탐 8건을 억제했다. |
| Recall 93.3% 유지 | 오탐을 줄이면서 탐지율은 떨어뜨리지 않았다. |

발표 핵심 문장:

> 단순 멀티에이전트는 실제 위협을 잘 잡았지만 정상 케이스 8건을 오탐했다. Evidence-separated 구조를 적용하자 같은 Recall 93.3%를 유지하면서 FP를 0건으로 줄였고, F1-score가 84.8%에서 96.6%로 개선되었다.

### 6.3 실패 케이스

60개 평가에서 놓친 FN은 2건이며, 둘 다 scenario 2 계열이다.

```text
cert:r5.2:r5.2-2-GWG0497
cert:r5.2:r5.2-2-KSS1005
```

발표에서의 의미:

> 결과를 100%라고 과장하지 않고, scenario 2의 일부 구직/자료 유출 흐름은 아직 놓친다는 한계를 명확히 제시할 수 있다.

## 7. 슬라이드 구성안

총 13장 구성을 권장한다. 시간이 짧으면 10-11장으로 줄일 수 있다.

| Slide | 제목 | 핵심 메시지 | 추천 자료 |
|---:|---|---|---|
| 1 | Title | Multi-Agent Evidence-Separated UEBA 제안 | 제목/키워드 |
| 2 | Problem | 내부자 위협은 정상 계정과 정상 도구를 사용한다 | 외부 공격 vs 내부자 위협 표 |
| 3 | Limitation | SIEM/기존 UEBA/싱글 에이전트의 한계 | 3-way 비교표 |
| 4 | Research Question | 어떻게 탐지율을 높이면서 오탐을 줄일 것인가? | 질문 2개 |
| 5 | Proposed Architecture | 규칙별 specialist agent + Supervisor | agent flow diagram |
| 6 | Specialist Agents | 어떤 agent들이 어떤 증거를 보는가 | agent 역할 표 |
| 7 | Evidence Separation | 위험 증거와 정상 맥락 증거 분리 | risk/context split 그림 |
| 8 | Dataset | CERT selected stability case 60개 | dataset 표 |
| 9 | Experimental Setup | SIEM, Single UEBA, Multi-Agent, Evidence-Separated 비교 | 4-method 표 |
| 10 | Main Results | F1 84.8% -> 96.6%, FP 8 -> 0 | `final_method_comparison.svg` |
| 11 | Error Analysis | FN 2건은 scenario 2 계열 | failure case 2개 |
| 12 | Discussion | 오탐 감소와 운영 부담 감소 | Review Queue 설명 |
| 13 | Conclusion | 멀티에이전트 + evidence separation의 의미 | 3줄 요약 |

## 8. 슬라이드별 상세 내용

### Slide 1. Title

제목:

> Multi-Agent Evidence-Separated UEBA for Insider Threat Detection

한국어 제목:

> 내부자 위협 탐지를 위한 멀티에이전트 기반 Evidence-Separated UEBA

부제:

> CERT Insider Threat Dataset 기반 case-level 확장 검증

키워드:

- Insider Threat
- UEBA
- Multi-Agent
- Evidence Separation
- False Positive Reduction

### Slide 2. Problem

핵심 문장:

> 내부자 위협은 정상 계정과 정상 권한을 사용하기 때문에 rule 하나로는 탐지하기 어렵다.

넣을 표:

| 일반 공격 탐지 | 내부자 위협 탐지 |
|---|---|
| 외부 침입자 중심 | 정상 임직원 계정 |
| 악성코드/IOC 중심 | 정상 업무 도구 사용 |
| signature rule에 강함 | 사용자 맥락이 중요 |
| 단일 이벤트 탐지 가능 | 여러 이벤트의 흐름이 중요 |

### Slide 3. 기존 방식의 한계

| 방식 | 장점 | 한계 |
|---|---|---|
| SIEM | 명확한 rule 탐지 | rule 밖 흐름을 놓침 |
| Single-score UEBA | 평소와 다른 행동 포착 | 위험 이유와 정상 사유 분리 약함 |
| Single-Agent UEBA | 전체 맥락 판단 가능 | 규칙이 많아질수록 판단 흔들림 |

발표 멘트:

> 실제 운영에서는 탐지를 많이 하는 것도 중요하지만, 정상 사용자를 너무 많이 경고하지 않는 것도 중요하다. 그래서 본 연구의 목표는 탐지율과 오탐 감소를 동시에 보는 것이다.

### Slide 4. Research Question

연구 질문:

1. 규칙별 전문 에이전트로 나누면 실제 위협 탐지율이 좋아지는가?
2. 위험 증거와 정상 맥락 증거를 분리하면 멀티에이전트의 오탐을 줄일 수 있는가?

한 줄 답:

> 60개 case 평가에서 멀티에이전트는 Recall을 93.3%까지 높였고, evidence-separated 구조는 FP를 8건에서 0건으로 줄였다.

### Slide 5. Proposed Architecture

화면 구성:

```text
CERT case logs
   |
   v
Rule-sharded specialist agents
 login / device / usb / file / web / email / memory / flow
   |
   +--> risk findings
   |
   +--> context_exception_agent
          legitimate context findings
   |
   v
Supervisor
   |
   v
Alert: none / observe / medium / high
```

### Slide 6. Specialist Agents

이 표를 그대로 사용한다.

| Agent | 질문 |
|---|---|
| login_time_agent | 이 접속 시간은 평소와 다른가? |
| device_ip_agent | 낯선 PC/IP에서 접근했는가? |
| usb_agent | 이동식 매체 사용이 있었는가? |
| file_access_agent | 파일 접근량이나 민감도가 비정상인가? |
| web_exfil_agent | 외부 유출 경로 접근이 있었는가? |
| email_agent | 외부 이메일 전송이 있었는가? |
| memory_agent | 과거 위반 패턴과 닮았는가? |
| context_exception_agent | 정상 업무로 설명되는 근거가 있는가? |
| case_flow_agent | 여러 이벤트가 공격 흐름을 이루는가? |

### Slide 7. Evidence Separation

핵심 그림:

```text
Risk Evidence                         Context Evidence
- off-hours login                     - approved exception
- bulk file access                    - maintenance window
- USB connection                      - incident review
- external upload                     - training export
        \                              /
         \                            /
          v                          v
                 Supervisor
```

발표 멘트:

> 정상 업무 맥락은 위험 증거가 아니다. 따라서 정상 사유를 위험 점수에 섞지 않고 별도 evidence lane으로 분리했다.

### Slide 8. Dataset

| 항목 | 값 |
|---|---:|
| Case set | `stability_cases.json` |
| Total cases | 60 |
| Positive cases | 30 |
| Normal cases | 30 |
| Scenario | 1, 2, 4 |
| LLM | `gpt-4.1-mini` |
| Repeats | 1 |

주의 문장:

> 전체 CERT 최종 성능이 아니라, 선택된 stability case 60개에 대한 확장 검증이다.

### Slide 9. Experimental Setup

| 비교군 | 설명 |
|---|---|
| Existing SIEM | rule-based detector를 case-level로 집계 |
| Single-Agent UEBA | single-score UEBA를 case-level로 집계 |
| Multi-Agent UEBA | context separation 없이 specialist 결과 종합 |
| Multi-Agent + Evidence-Separated UEBA | risk/context evidence 분리 후 Supervisor 종합 |

### Slide 10. Main Results

결과표:

| Method | Precision | Recall | F1 | FP | FN |
|---|---:|---:|---:|---:|---:|
| Existing SIEM | 0.0% | 0.0% | 0.0% | 0 | 30 |
| Single-Agent UEBA | 100.0% | 33.3% | 50.0% | 0 | 20 |
| Multi-Agent UEBA | 77.8% | 93.3% | 84.8% | 8 | 2 |
| Multi-Agent + Evidence-Separated UEBA | 100.0% | 93.3% | 96.6% | 0 | 2 |

추천 그림:

`out/final_multi_agent_comparison_stability60/final_method_comparison.svg`

핵심 메시지:

> Evidence-separated 구조는 멀티에이전트의 높은 recall을 유지하면서 FP를 8건에서 0건으로 줄였다.

### Slide 11. Error Analysis

남은 FN:

```text
cert:r5.2:r5.2-2-GWG0497
cert:r5.2:r5.2-2-KSS1005
```

해석:

- 둘 다 scenario 2 계열이다.
- 구직 활동과 자료 유출 흐름은 일부 케이스에서 정상 맥락과 위험 맥락의 경계가 여전히 어렵다.
- 향후에는 scenario 2 전용 web/file/USB chain prompt와 memory retrieval을 보강할 필요가 있다.

### Slide 12. Discussion

운영 관점 해석:

| 지표 | 의미 |
|---|---|
| Precision | 경고가 실제 위협일 확률 |
| Recall | 실제 위협을 놓치지 않는 정도 |
| F1 | Precision과 Recall의 균형 |
| Review Queue / 100 Normal | 정상 100건당 분석가가 확인해야 하는 경고 수 |

핵심:

> 보안 시스템에서는 recall만 높으면 충분하지 않다. 오탐이 많으면 분석가가 경고를 신뢰하지 않게 되므로, review queue를 줄이는 것이 실제 운영 성능이다.

### Slide 13. Conclusion

3줄 결론:

1. 멀티에이전트 구조는 규칙별 전문 판단을 통해 싱글 UEBA보다 위협 탐지율을 높였다.
2. Evidence-separated 구조는 정상 업무 맥락을 별도로 판단해 멀티에이전트의 오탐을 줄였다.
3. 60개 stability case에서 FP 8건을 0건으로 줄이면서 Recall 93.3%를 유지했다.

마지막 문장:

> 본 연구는 UEBA를 단일 이상점수 모델이 아니라, 전문 에이전트의 병렬 판단과 정상 맥락 분리를 결합한 설명 가능한 내부자 위협 탐지 구조로 확장했다.

## 9. 발표에서 조심해야 할 표현

| 피해야 할 표현 | 권장 표현 |
|---|---|
| 전체 CERT에서 100% 성능을 달성했다 | 선택된 60개 stability case에서 확장 검증했다 |
| 오탐이 완전히 없다 | 해당 평가셋에서는 FP가 0건이었다 |
| LLM을 학습시켰다 | LLM specialist agent를 사용해 rule별 판단을 수행했다 |
| 싱글 UEBA를 완전히 대체한다 | 기존 UEBA의 한계를 보완하는 구조이다 |
| SIEM은 쓸모없다 | SIEM은 명확한 rule에는 강하지만 내부자 행동 흐름에는 한계가 있다 |

## 10. PPT 제작에 바로 쓸 문장

### 문제 정의

> 내부자 위협은 정상 계정과 정상 업무 도구를 사용하기 때문에 단일 rule이나 signature만으로 탐지하기 어렵다.

### 방법

> 본 연구는 로그인, 장치/IP, USB, 파일, 웹, 이메일, 메모리, 전체 흐름, 정상 맥락 판단을 각각 전문 에이전트로 분리하고, Supervisor가 이를 종합해 최종 경고를 생성한다.

### 차별점

> 위험 증거와 정상 업무 맥락을 분리함으로써, 단순히 이상해 보이는 행동이 아니라 실제로 경고해야 하는 행동을 구분한다.

### 결과

> 60개 stability case에서 Multi-Agent UEBA는 Recall 93.3%를 달성했지만 FP가 8건 발생했다. Evidence-separated 구조를 적용하자 Recall은 유지하면서 FP를 0건으로 줄였고, F1-score는 84.8%에서 96.6%로 향상되었다.

### 한계

> 본 결과는 전체 CERT 로그에 대한 최종 검증이 아니라, scenario 1/2/4 중심의 선택된 stability case 확장 검증이다. 향후 전체 release 단위 streaming 평가와 scenario 2 미탐 케이스 보강이 필요하다.

## 11. 산출물 경로

최종 실험 산출물:

| 파일 | 용도 |
|---|---|
| `out/final_multi_agent_comparison_stability60/final_method_comparison.md` | 발표용 결과 표 원본 |
| `out/final_multi_agent_comparison_stability60/final_method_comparison.csv` | 그래프/표 재가공용 |
| `out/final_multi_agent_comparison_stability60/final_method_comparison.svg` | PPT 삽입용 성능 그래프 |
| `out/multi_agent_triage/llm_stability_once/multi_agent_summary.md` | LLM multi-agent 평가 요약 |
| `out/multi_agent_triage/llm_stability_once/failure_cases.json` | FN 2건 분석용 |

재실행 명령:

```bash
npm run shield:multi-agent:dataset
node ./tools/cli/run_multi_agent_triage_eval.js \
  --dataset ./out/multi_agent_triage/datasets/stability_cases.json \
  --labels ./out/multi_agent_triage/datasets/case_labels.json \
  --mode multi-agent \
  --repeats 1 \
  --concurrency 4 \
  --out ./out/multi_agent_triage/llm_stability_once
node ./tools/cli/run_final_multi_agent_comparison.js \
  --cases ./out/multi_agent_triage/datasets/stability_cases.json \
  --multi-agent ./out/multi_agent_triage/llm_stability_once/triage_predictions.json \
  --out ./out/final_multi_agent_comparison_stability60
```

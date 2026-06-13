# Multi-Agent UEBA 구현 및 실험 결과 정리

## 1. 오늘 구현한 핵심 내용

오늘 작업의 목표는 기존 UEBA 구조에 멀티에이전트 판단과 evidence-separated 구조를 붙여, 싱글 UEBA 대비 탐지율을 높이면서 오탐을 줄이는지 확인하는 것이었다.

구현한 주요 구성은 다음과 같다.

| 구성 | 설명 |
|---|---|
| Multi-agent case builder | CERT selected dataset을 case-level 평가셋으로 변환 |
| Specialist agents | 로그인, 장치/IP, USB, 파일, 웹, 이메일, 메모리, 정상 맥락, 전체 흐름을 각각 전담 |
| LangChain runner | OpenAI/LangChain 기반 LLM specialist 실행 |
| Supervisor | specialist 결과를 종합해 `none`, `observe`, `medium`, `high`로 최종 판단 |
| Evidence separation | 위험 증거와 정상 업무 맥락 증거를 분리해 오탐 억제 |
| Final comparison runner | SIEM, Single-Agent UEBA, Multi-Agent UEBA, Evidence-Separated UEBA를 같은 case set에서 비교 |

## 2. 실행 환경 설정

`.env`는 GitHub에 올리지 않고, 실행 시 `/home/ys/workspace/.env`를 자동 로드하도록 구성했다.

필요한 주요 환경 변수:

```bash
OPENAI_API_KEY=...
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true
```

`OPEN_AI_KEY`처럼 기존에 다르게 저장된 키 이름도 `OPENAI_API_KEY`로 매핑되도록 처리했다.

## 3. 최종 비교 실험

최종 발표용 결과는 30개 smoke set이 아니라 더 큰 60개 stability case set으로 산출했다.

| 항목 | 값 |
|---|---|
| 평가 단위 | case-level |
| Case set | `out/multi_agent_triage/datasets/stability_cases.json` |
| 전체 case 수 | 60 |
| Positive / Normal | 30 / 30 |
| LLM model | `gpt-4.1-mini` |
| 실행 모드 | multi-agent, repeats 1 |

## 4. 최종 결과

| Method | Precision | Recall | F1 | TP | FP | FN | TN | Review Queue / 100 Normal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Existing SIEM | 0.0% | 0.0% | 0.0% | 0 | 0 | 30 | 30 | 0.00 |
| Single-Agent UEBA | 100.0% | 33.3% | 50.0% | 10 | 0 | 20 | 30 | 0.00 |
| Multi-Agent UEBA | 77.8% | 93.3% | 84.8% | 28 | 8 | 2 | 22 | 26.67 |
| Multi-Agent + Evidence-Separated UEBA | 100.0% | 93.3% | 96.6% | 28 | 0 | 2 | 30 | 0.00 |

핵심 해석:

> Multi-Agent UEBA는 Single-Agent UEBA보다 Recall을 크게 높였지만 FP가 8건 발생했다. Evidence-separated 구조를 적용하자 Recall 93.3%는 유지하면서 FP를 0건으로 줄였고, F1-score는 84.8%에서 96.6%로 개선되었다.

## 5. 실패 케이스

60개 평가에서 놓친 FN은 2건이며 둘 다 scenario 2 계열이다.

```text
cert:r5.2:r5.2-2-GWG0497
cert:r5.2:r5.2-2-KSS1005
```

발표에서는 "완벽한 탐지"가 아니라 "오탐을 줄이면서 탐지율을 유지했다"는 방향으로 설명하는 것이 안전하다.

## 6. 재실행 명령

```bash
npm install
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

## 7. 주요 산출물

| 파일 | 용도 |
|---|---|
| `docs/06.15/01_requirements/multi_agent_conference_slide_story.md` | 학회 발표 슬라이드 흐름 정리 |
| `out/final_multi_agent_comparison_stability60/final_method_comparison.md` | 최종 비교 결과표 |
| `out/final_multi_agent_comparison_stability60/final_method_comparison.csv` | 그래프/표 재가공용 |
| `out/final_multi_agent_comparison_stability60/final_method_comparison.svg` | PPT 삽입용 그래프 |
| `out/multi_agent_triage/llm_stability_once/multi_agent_summary.md` | LLM multi-agent 평가 요약 |
| `out/multi_agent_triage/llm_stability_once/failure_cases.json` | FN 분석용 |

## 8. 발표 시 주의할 점

- 전체 CERT 전체 로그에서 96.6% F1이라고 말하면 안 된다.
- 정확한 표현은 "선택된 60개 stability case 기준 F1 96.6%"이다.
- LLM을 파인튜닝한 것이 아니라, LangChain 기반 specialist agent로 rule별 판단을 수행한 것이다.
- Evidence-separated 구조는 탐지율을 올리는 장치라기보다, 멀티에이전트가 만든 오탐을 정상 맥락으로 억제하는 장치이다.

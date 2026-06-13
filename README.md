# Multi-Agent Evidence-Separated UEBA

학회 발표용으로 정리한 최소 Multi-Agent UEBA 구현체입니다.

이 저장소는 기존 SHIELD 전체 코드가 아니라, 오늘 구현/검증한 핵심 파일만 담습니다.

## 핵심 아이디어

기존 UEBA가 사용자 행동을 하나의 이상 점수로 판단했다면, 이 구조는 보안 규칙을 specialist agent로 나누어 병렬 판단합니다.

- `login_time_agent`: 비정상 시간 접속
- `device_ip_agent`: 낯선 장치/IP
- `usb_agent`: 이동식 매체 사용
- `file_access_agent`: 파일 접근/다운로드 이상
- `web_exfil_agent`: 웹 기반 유출 경로
- `email_agent`: 외부 이메일 전송
- `memory_agent`: 과거 위반 패턴 유사도
- `context_exception_agent`: 정상 업무 맥락
- `case_flow_agent`: 전체 공격 흐름

핵심 차별점은 **위험 증거**와 **정상 업무 맥락 증거**를 분리해, 멀티에이전트가 만든 오탐을 Supervisor가 낮출 수 있게 한 것입니다.

## 최종 실험 결과

60개 stability case 기준 결과입니다.

| Method | Precision | Recall | F1 | FP | FN |
|---|---:|---:|---:|---:|---:|
| Existing SIEM | 0.0% | 0.0% | 0.0% | 0 | 30 |
| Single-Agent UEBA | 100.0% | 33.3% | 50.0% | 0 | 20 |
| Multi-Agent UEBA | 77.8% | 93.3% | 84.8% | 8 | 2 |
| Multi-Agent + Evidence-Separated UEBA | 100.0% | 93.3% | 96.6% | 0 | 2 |

해석:

> Multi-Agent UEBA는 탐지율을 높였지만 FP가 8건 발생했다. Evidence-separated 구조를 적용하자 Recall 93.3%는 유지하면서 FP를 0건으로 줄였고, F1-score는 84.8%에서 96.6%로 개선되었다.

## 폴더 구조

```text
packages/shield_core/src/agents/   # multi-agent 핵심 구현
tools/cli/                         # dataset build / LLM triage 실행 CLI
tools/test/                        # multi-agent 단위 테스트
docs/                              # 발표 흐름 및 구현 결과 정리
results/                           # 최종 60-case 실험 결과 요약
```

## 바로 실행하기

이 저장소에는 발표용으로 사용한 작은 case-level 평가 데이터셋이 포함되어 있습니다.

포함 데이터:

```text
data/datasets/dev_smoke_cases.json     # 30 cases
data/datasets/stability_cases.json     # 60 cases
data/datasets/case_labels.json
data/datasets/dataset_manifest.json
```

따라서 원본 CERT 데이터셋 없이도, API key만 넣으면 LLM multi-agent 평가를 바로 실행할 수 있습니다.

### 1. 설치

```bash
git clone https://github.com/yusin8/Multi_UEBA.git
cd Multi_UEBA
npm install
```

### 2. API key 설정

```bash
cp .env.example .env
```

`.env`에 본인 키를 넣습니다.

```bash
OPENAI_API_KEY=...
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true
```

### 3. 테스트

```bash
npm test
```

### 4. LLM 평가 실행

작은 smoke set:

```bash
npm run eval:llm:smoke
```

발표에 사용한 60개 stability set:

```bash
npm run eval:llm:stability
```

LLM 비용 없이 deterministic baseline만 확인:

```bash
npm run eval:deterministic
```

## 주의

- 이 결과는 전체 CERT 전체 로그 성능이 아니라, 선택된 60개 stability case 기준입니다.
- 원본 CERT 데이터셋과 API key는 저장소에 포함하지 않았습니다.
- 저장소에는 재현용으로 가공된 case-level 평가셋만 포함했습니다.
- LLM을 파인튜닝한 것이 아니라, LangChain 기반 specialist agent를 구성한 것입니다.

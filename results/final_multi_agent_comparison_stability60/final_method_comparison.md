# Final UEBA Method Comparison

## Dataset

- Case dataset: /home/ys/workspace/SHIELD/out/multi_agent_triage/datasets/stability_cases.json
- Raw event source: /home/ys/workspace/SHIELD/out/cert_selected_dataset/selected_dataset.raw.json
- Multi-agent result: /home/ys/workspace/SHIELD/out/multi_agent_triage/llm_stability_once/triage_predictions.json
- Cases: 60
- Positive / Normal cases: 30 / 30

## Method Definitions

| Method | Meaning |
|---|---|
| Existing SIEM | Fixed rule-style event detector aggregated to case level |
| Single-Agent UEBA | Single-score behavior baseline aggregated to case level |
| Multi-Agent UEBA | Same LLM specialist findings, but context/evidence separation removed before supervision |
| Multi-Agent + Evidence-Separated UEBA | Current proposed flow: specialist risk findings plus separate context exception evidence |

## Results

| Method | Precision | Recall | F1 | TP | FP | FN | TN | Review Queue / 100 Normal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Existing SIEM | 0.0% | 0.0% | 0.0% | 0 | 0 | 30 | 30 | 0.0000 |
| Single-Agent UEBA | 100.0% | 33.3% | 50.0% | 10 | 0 | 20 | 30 | 0.0000 |
| Multi-Agent UEBA | 77.8% | 93.3% | 84.8% | 28 | 8 | 2 | 22 | 26.6667 |
| Multi-Agent + Evidence-Separated UEBA | 100.0% | 93.3% | 96.6% | 28 | 0 | 2 | 30 | 0.0000 |

## Reading Guide

- Precision answers: "When the system raises an alert, how often is it a real threat?"
- Recall answers: "How many real threats did it catch?"
- Review Queue / 100 Normal answers: "For 100 normal cases, how many would analysts still need to review?"
- The third row is an ablation: it uses the same multi-agent findings but removes the dedicated normal-context evidence lane.

# Multi-Agent Triage Evaluation Summary

**Mode:** multi-agent  
**Dataset:** stability_cases.json  
**Repeats:** 1  
**Generated:** 2026-06-13T20:04:20.095Z

## Detection Metrics

| Metric | Value |
|---|---|
| TP | 28 |
| FP | 0 |
| FN | 2 |
| TN | 30 |
| Precision | 100.0% |
| Recall | 93.3% |
| F1 | 0.9655 |
| Review Queue / 100 Normal | 0.0000 |

## Explainability

| Metric | Value |
|---|---|
| Findings per Alert | 9.0000 |
| Evidence Coverage | 100.0% |
| Context Downgrade Count | 21 |

### Top Triggered Rules

| Rule | Count |
|---|---|
| file_access_risk | 28 |
| context_exception_check | 28 |
| attack_flow_risk | 27 |
| login_time_risk | 16 |
| web_exfil_risk | 13 |


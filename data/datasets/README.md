# Included Evaluation Datasets

This folder contains the small case-level evaluation datasets used for the Multi-Agent UEBA presentation experiment.

## Files

| File | Cases | Purpose |
|---|---:|---|
| `dev_smoke_cases.json` | 30 | quick LLM smoke evaluation |
| `stability_cases.json` | 60 | larger presentation evaluation set |
| `case_labels.json` | 1414 labels | labels for all generated cases; evaluation scripts filter to the selected dataset |
| `dataset_manifest.json` | - | generation metadata |

## Important Scope Note

These are derived case packets for reproducible evaluation. They are not the full raw CERT Insider Threat Dataset.

The published headline result uses `stability_cases.json`:

| Method | Precision | Recall | F1 | FP | FN |
|---|---:|---:|---:|---:|---:|
| Multi-Agent UEBA | 77.8% | 93.3% | 84.8% | 8 | 2 |
| Multi-Agent + Evidence-Separated UEBA | 100.0% | 93.3% | 96.6% | 0 | 2 |

#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  computeDetectionMetrics,
  computeStabilityMetrics,
  computeParseFailureRate,
  computeExplainabilityMetrics,
  buildSummaryReport,
  renderSummaryMarkdown
} from "../../packages/shield_core/src/agents/triage_metrics.js";
import { makeFailureFinding } from "../../packages/shield_core/src/agents/agent_schema.js";

// --- computeDetectionMetrics: basic precision/recall ---
{
  const predictions = { "c1": 1, "c2": 1, "c3": 0, "c4": 0 };
  const labels = { "c1": 1, "c2": 0, "c3": 1, "c4": 0 };
  const m = computeDetectionMetrics(predictions, labels);
  assert.equal(m.tp, 1, "TP should be 1");
  assert.equal(m.fp, 1, "FP should be 1");
  assert.equal(m.fn, 1, "FN should be 1");
  assert.equal(m.tn, 1, "TN should be 1");
  assert.ok(Math.abs(m.precision - 0.5) < 0.001, "Precision should be 0.5");
  assert.ok(Math.abs(m.recall - 0.5) < 0.001, "Recall should be 0.5");
  assert.ok(Math.abs(m.f1 - 0.5) < 0.001, "F1 should be 0.5");
}

// --- computeDetectionMetrics: perfect precision ---
{
  const predictions = { "c1": 1, "c2": 0 };
  const labels = { "c1": 1, "c2": 0 };
  const m = computeDetectionMetrics(predictions, labels);
  assert.equal(m.precision, 1, "Perfect precision");
  assert.equal(m.recall, 1, "Perfect recall");
  assert.equal(m.f1, 1, "Perfect F1");
}

// --- computeDetectionMetrics: all misses ---
{
  const predictions = { "c1": 0, "c2": 0 };
  const labels = { "c1": 1, "c2": 1 };
  const m = computeDetectionMetrics(predictions, labels);
  assert.equal(m.tp, 0);
  assert.equal(m.fn, 2);
  assert.equal(m.recall, 0);
}

// --- computeDetectionMetrics: review queue ---
{
  const predictions = { "c1": 1, "c2": 1, "c3": 0, "c4": 0, "c5": 0 };
  const labels = { "c1": 1, "c2": 0, "c3": 0, "c4": 0, "c5": 0 };
  const m = computeDetectionMetrics(predictions, labels);
  assert.equal(m.fp, 1, "FP should be 1");
  assert.ok(m.review_queue_per_100_normal > 0, "Review queue should be positive");
}

// --- computeStabilityMetrics: single run ---
{
  const runs = [{ "c1": { alert_level: "high", predicted: 1, triggered_rules: ["usb"] } }];
  const labels = { "c1": 1 };
  const s = computeStabilityMetrics(runs, labels);
  assert.equal(s.runs, 1);
  assert.equal(s.alert_consistency, 1, "Single run should have perfect consistency");
}

// --- computeStabilityMetrics: 3 runs, all consistent ---
{
  const run = { "c1": { alert_level: "high", predicted: 1, triggered_rules: ["usb", "file"] } };
  const runs = [run, run, run];
  const labels = { "c1": 1 };
  const s = computeStabilityMetrics(runs, labels);
  assert.equal(s.alert_consistency, 1, "All-same runs should have consistency 1");
  assert.equal(s.prediction_flip_rate, 0, "No flips");
  assert.ok(Math.abs(s.jaccard_avg - 1) < 0.001, "Identical rule sets => Jaccard=1");
}

// --- computeStabilityMetrics: inconsistent runs ---
{
  const runs = [
    { "c1": { alert_level: "high", predicted: 1, triggered_rules: ["usb"] } },
    { "c1": { alert_level: "none", predicted: 0, triggered_rules: [] } }
  ];
  const labels = { "c1": 1 };
  const s = computeStabilityMetrics(runs, labels);
  assert.ok(s.alert_consistency < 1, "Inconsistent runs should have consistency < 1");
  assert.ok(s.prediction_flip_rate > 0, "Should record flip");
  assert.equal(s.jaccard_avg, 0, "Disjoint rule sets => Jaccard=0");
}

// --- computeParseFailureRate ---
{
  const findings = [
    makeFailureFinding("usb_agent", "removable_media_risk", "timeout"),
    { agent: "login_time_agent", rule_id: "login_time_risk", triggered: false, severity: "none", confidence: 0.9, evidence: [], event_ids: [], notes: "" }
  ];
  const rate = computeParseFailureRate(findings);
  assert.ok(Math.abs(rate - 0.5) < 0.001, "Failure rate should be 0.5");
}

// --- computeParseFailureRate: empty ---
{
  assert.equal(computeParseFailureRate([]), 0, "Empty findings should have 0 failure rate");
}

// --- computeExplainabilityMetrics ---
{
  const results = [
    {
      case_id: "c1",
      alert_level: "high",
      suppressed_by_context: false,
      findings: [
        { triggered: true, rule_id: "usb_risk", event_ids: ["e1"], notes: "" },
        { triggered: true, rule_id: "file_risk", event_ids: ["e2"], notes: "" },
        { triggered: false, rule_id: "email_risk", event_ids: [], notes: "" }
      ]
    },
    {
      case_id: "c2",
      alert_level: "none",
      suppressed_by_context: false,
      findings: []
    }
  ];
  const e = computeExplainabilityMetrics(results);
  assert.ok(e.findings_per_alert > 0, "Should compute findings per alert");
  assert.ok(e.evidence_coverage > 0, "Evidence coverage should be > 0");
  assert.equal(e.context_downgrade_count, 0, "No context downgrades");
  assert.ok(e.top_triggered_rules.length > 0, "Should have top triggered rules");
}

// --- renderSummaryMarkdown contains key sections ---
{
  const report = buildSummaryReport({
    detectionMetrics: { tp: 10, fp: 2, fn: 3, tn: 85, precision: 0.83, recall: 0.77, f1: 0.80, review_queue_per_100_normal: 2.3 },
    stabilityMetrics: { alert_consistency: 0.92, prediction_flip_rate: 0.05, jaccard_avg: 0.88, runs: 5, cases_evaluated: 60 },
    explainabilityMetrics: { findings_per_alert: 4.2, evidence_coverage: 0.95, context_downgrade_count: 2, top_triggered_rules: [{ rule: "usb_risk", count: 8 }] },
    mode: "deterministic",
    dataset: "stability_cases.json",
    repeats: 5
  });
  const md = renderSummaryMarkdown(report);
  assert.ok(md.includes("Multi-Agent Triage"), "Should have title");
  assert.ok(md.includes("Detection Metrics"), "Should have detection section");
  assert.ok(md.includes("Stability"), "Should have stability section");
  assert.ok(md.includes("Explainability"), "Should have explainability section");
  assert.ok(md.includes("deterministic"), "Should include mode");
}

console.log("test_shield_multi_agent_eval_metrics: all tests passed");

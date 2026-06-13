/**
 * Precision/recall/stability/review-queue metrics for multi-agent triage evaluation.
 */

export function computeDetectionMetrics(predictions, labels) {
  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (const caseId of Object.keys(labels)) {
    const label = labels[caseId];
    const pred = predictions[caseId] ?? 0;

    if (label === 1 && pred === 1) tp++;
    else if (label === 0 && pred === 1) fp++;
    else if (label === 1 && pred === 0) fn++;
    else tn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const totalNormal = fp + tn;
  const reviewQueuePer100Normal = totalNormal > 0 ? (fp / totalNormal) * 100 : 0;

  return { tp, fp, fn, tn, precision, recall, f1, review_queue_per_100_normal: reviewQueuePer100Normal };
}

/**
 * Computes alert-level consistency across N repeated runs for the same case set.
 * repeatRuns: Array of run results, each is { [case_id]: { alert_level, predicted } }
 */
export function computeStabilityMetrics(repeatRuns, labels) {
  if (repeatRuns.length < 2) {
    return { alert_consistency: 1, prediction_flip_rate: 0, jaccard_avg: 1, runs: repeatRuns.length };
  }

  const caseIds = Object.keys(repeatRuns[0]);
  let consistentCount = 0;
  let flipCount = 0;
  let jaccardSum = 0;
  let jaccardCount = 0;

  for (const caseId of caseIds) {
    const levels = repeatRuns.map(r => r[caseId]?.alert_level ?? "none");
    const preds = repeatRuns.map(r => r[caseId]?.predicted ?? 0);
    const rules = repeatRuns.map(r => new Set(r[caseId]?.triggered_rules ?? []));

    const allSameLevel = levels.every(l => l === levels[0]);
    if (allSameLevel) consistentCount++;

    const uniquePreds = new Set(preds);
    if (uniquePreds.size > 1) flipCount++;

    // Pairwise Jaccard on triggered rules
    for (let i = 0; i < rules.length - 1; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const union = new Set([...rules[i], ...rules[j]]);
        const intersection = [...rules[i]].filter(r => rules[j].has(r));
        const jaccard = union.size > 0 ? intersection.length / union.size : 1;
        jaccardSum += jaccard;
        jaccardCount++;
      }
    }
  }

  return {
    alert_consistency: caseIds.length > 0 ? consistentCount / caseIds.length : 1,
    prediction_flip_rate: caseIds.length > 0 ? flipCount / caseIds.length : 0,
    jaccard_avg: jaccardCount > 0 ? jaccardSum / jaccardCount : 1,
    runs: repeatRuns.length,
    cases_evaluated: caseIds.length
  };
}

export function computeParseFailureRate(allFindings) {
  const total = allFindings.length;
  if (total === 0) return 0;
  const failures = allFindings.filter(f => f.notes === "failure finding").length;
  return failures / total;
}

export function computeExplainabilityMetrics(triageResults) {
  const alerts = triageResults.filter(r => r.alert_level !== "none");
  const findingsPerAlert = alerts.length > 0
    ? alerts.reduce((sum, r) => sum + (r.findings?.length || 0), 0) / alerts.length
    : 0;

  const allFindings = triageResults.flatMap(r => r.findings || []);
  const triggeredFindings = allFindings.filter(f => f.triggered);
  const withEventIds = triggeredFindings.filter(f => f.event_ids && f.event_ids.length > 0);
  const evidenceCoverage = triggeredFindings.length > 0
    ? withEventIds.length / triggeredFindings.length
    : 1;

  const contextDowngradeCount = triageResults.filter(r => r.suppressed_by_context).length;

  const ruleCounts = {};
  for (const f of triggeredFindings) {
    ruleCounts[f.rule_id] = (ruleCounts[f.rule_id] || 0) + 1;
  }
  const topTriggeredRules = Object.entries(ruleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rule, count]) => ({ rule, count }));

  return {
    findings_per_alert: findingsPerAlert,
    evidence_coverage: evidenceCoverage,
    context_downgrade_count: contextDowngradeCount,
    top_triggered_rules: topTriggeredRules
  };
}

export function buildSummaryReport({ detectionMetrics, stabilityMetrics, explainabilityMetrics, mode, dataset, repeats }) {
  return {
    generated_at: new Date().toISOString(),
    mode,
    dataset,
    repeats: repeats || 1,
    detection: detectionMetrics,
    stability: stabilityMetrics || null,
    explainability: explainabilityMetrics
  };
}

export function renderSummaryMarkdown(report) {
  const { detection: d, stability: s, explainability: e } = report;

  const fmt = v => (typeof v === "number" ? v.toFixed(4) : String(v ?? "—"));
  const pct = v => (typeof v === "number" ? (v * 100).toFixed(1) + "%" : "—");

  let md = `# Multi-Agent Triage Evaluation Summary\n\n`;
  md += `**Mode:** ${report.mode}  \n`;
  md += `**Dataset:** ${report.dataset}  \n`;
  md += `**Repeats:** ${report.repeats}  \n`;
  md += `**Generated:** ${report.generated_at}\n\n`;

  md += `## Detection Metrics\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| TP | ${d.tp} |\n`;
  md += `| FP | ${d.fp} |\n`;
  md += `| FN | ${d.fn} |\n`;
  md += `| TN | ${d.tn} |\n`;
  md += `| Precision | ${pct(d.precision)} |\n`;
  md += `| Recall | ${pct(d.recall)} |\n`;
  md += `| F1 | ${fmt(d.f1)} |\n`;
  md += `| Review Queue / 100 Normal | ${fmt(d.review_queue_per_100_normal)} |\n\n`;

  if (s) {
    md += `## Stability Metrics (${s.runs} runs)\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Alert-Level Consistency | ${pct(s.alert_consistency)} |\n`;
    md += `| Prediction Flip Rate | ${pct(s.prediction_flip_rate)} |\n`;
    md += `| Triggered-Rule Jaccard Avg | ${fmt(s.jaccard_avg)} |\n`;
    md += `| Cases Evaluated | ${s.cases_evaluated} |\n\n`;
  }

  if (e) {
    md += `## Explainability\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Findings per Alert | ${fmt(e.findings_per_alert)} |\n`;
    md += `| Evidence Coverage | ${pct(e.evidence_coverage)} |\n`;
    md += `| Context Downgrade Count | ${e.context_downgrade_count} |\n\n`;

    if (e.top_triggered_rules?.length > 0) {
      md += `### Top Triggered Rules\n\n`;
      md += `| Rule | Count |\n|---|---|\n`;
      for (const { rule, count } of e.top_triggered_rules) {
        md += `| ${rule} | ${count} |\n`;
      }
      md += "\n";
    }
  }

  return md;
}

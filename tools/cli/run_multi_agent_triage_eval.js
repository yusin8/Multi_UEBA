#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { runParallelTriage } from "../../packages/shield_core/src/agents/parallel_triage.js";
import { runDeterministicSpecialist } from "../../packages/shield_core/src/agents/deterministic_specialists.js";
import { createLangChainRunner, createMockRunner } from "../../packages/shield_core/src/agents/langchain_agent_runner.js";
import {
  computeDetectionMetrics,
  computeStabilityMetrics,
  computeParseFailureRate,
  computeExplainabilityMetrics,
  buildSummaryReport,
  renderSummaryMarkdown
} from "../../packages/shield_core/src/agents/triage_metrics.js";
import { AGENT_DEFINITIONS } from "../../packages/shield_core/src/agents/agent_schema.js";
import { loadShieldAgentEnv, requireOpenAiKeyForAgents } from "./shield_agent_env.js";

const { values: args } = parseArgs({
  options: {
    dataset: { type: "string" },
    labels: { type: "string" },
    mode: { type: "string", default: "deterministic" },
    repeats: { type: "string", default: "1" },
    out: { type: "string", default: "./out/multi_agent_triage/eval" },
    concurrency: { type: "string", default: "8" },
    "env-file": { type: "string" }
  }
});

function getRunnerFn(mode) {
  if (mode === "multi-agent" || mode === "langchain") {
    return createLangChainRunner({
      modelName: process.env.SHIELD_AGENT_MODEL || "gpt-4.1-mini",
      provider: process.env.SHIELD_AGENT_PROVIDER || "openai",
      temperature: Number(process.env.SHIELD_AGENT_TEMPERATURE ?? 0)
    });
  }
  if (mode === "mock") {
    return createMockRunner();
  }
  // deterministic (default)
  return runDeterministicSpecialist;
}

async function runOnce(cases, runnerFn, concurrency) {
  const results = [];
  for (let i = 0; i < cases.length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(cp => runParallelTriage(cp, { runnerFn, userProfiles: {} }))
    );
    results.push(...batchResults);
    process.stdout.write(`\r  Progress: ${Math.min(i + concurrency, cases.length)}/${cases.length} cases`);
  }
  console.log();
  return results;
}

function resultsToPredictionMap(results) {
  const map = {};
  for (const r of results) {
    map[r.case_id] = { predicted: r.predicted, alert_level: r.alert_level, triggered_rules: r.triggered_rules };
  }
  return map;
}

async function main() {
  if (!args.dataset || !args.labels) {
    console.error("Usage: run_multi_agent_triage_eval.js --dataset <cases.json> --labels <labels.json> [--mode deterministic|multi-agent|mock] [--repeats N] [--out <dir>]");
    process.exit(1);
  }

  const datasetPath = path.resolve(args.dataset);
  const labelsPath = path.resolve(args.labels);
  const outDir = path.resolve(args.out);
  const repeats = Math.max(1, parseInt(args.repeats, 10));
  const concurrency = Math.max(1, parseInt(args.concurrency, 10));
  const mode = args.mode;
  const envInfo = loadShieldAgentEnv({ envFile: args["env-file"] });

  if (mode === "multi-agent" || mode === "langchain") {
    requireOpenAiKeyForAgents();
  }

  console.log(`\nMulti-Agent Triage Evaluation`);
  console.log(`  Dataset: ${datasetPath}`);
  console.log(`  Labels:  ${labelsPath}`);
  console.log(`  Mode:    ${mode}`);
  console.log(`  Repeats: ${repeats}`);
  console.log(`  Out:     ${outDir}\n`);
  if (mode === "multi-agent" || mode === "langchain") {
    console.log(`  Env:     ${envInfo.env_path || "process env only"}`);
    console.log(`  Model:   ${envInfo.provider}:${envInfo.model}`);
    console.log(`  Trace:   LANGSMITH_TRACING=${envInfo.langsmith_tracing}\n`);
  }

  const cases = JSON.parse(await fs.readFile(datasetPath, "utf-8"));
  const labels = JSON.parse(await fs.readFile(labelsPath, "utf-8"));

  // Filter labels to only cases in this dataset
  const datasetCaseIds = new Set(cases.map(c => c.case_id));
  const relevantLabels = Object.fromEntries(
    Object.entries(labels).filter(([id]) => datasetCaseIds.has(id))
  );

  console.log(`  Cases loaded: ${cases.length} | Labels matched: ${Object.keys(relevantLabels).length}\n`);

  const runnerFn = getRunnerFn(mode);
  const repeatRuns = [];
  const allFindingsFlat = [];

  for (let rep = 0; rep < repeats; rep++) {
    console.log(`Run ${rep + 1}/${repeats}...`);
    const results = await runOnce(cases, runnerFn, concurrency);
    repeatRuns.push(resultsToPredictionMap(results));
    allFindingsFlat.push(...results.flatMap(r => r.findings || []));

    if (rep === 0) {
      // Save first-run detailed findings
      const findingsLines = results.map(r => JSON.stringify({
        case_id: r.case_id,
        run: rep + 1,
        ...r
      }));
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "agent_findings.jsonl"), findingsLines.join("\n") + "\n");
      await fs.writeFile(path.join(outDir, "triage_predictions.json"), JSON.stringify(results, null, 2));
    }
  }

  // Detection metrics on first run
  const firstRunPreds = Object.fromEntries(
    Object.entries(repeatRuns[0]).map(([id, v]) => [id, v.predicted])
  );
  const detectionMetrics = computeDetectionMetrics(firstRunPreds, relevantLabels);

  // Stability metrics
  const stabilityMetrics = repeats > 1
    ? computeStabilityMetrics(repeatRuns, relevantLabels)
    : null;

  const parseFailureRate = computeParseFailureRate(allFindingsFlat);
  const firstRunResults = JSON.parse(await fs.readFile(path.join(outDir, "triage_predictions.json"), "utf-8"));
  const explainabilityMetrics = computeExplainabilityMetrics(firstRunResults);

  const report = buildSummaryReport({
    detectionMetrics,
    stabilityMetrics,
    explainabilityMetrics,
    mode,
    dataset: path.basename(datasetPath),
    repeats
  });
  report.parse_failure_rate = parseFailureRate;

  const markdown = renderSummaryMarkdown(report);

  await fs.writeFile(path.join(outDir, "multi_agent_summary.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(outDir, "multi_agent_summary.md"), markdown);

  if (repeats > 1) {
    await fs.writeFile(path.join(outDir, "repeat_predictions.json"), JSON.stringify(repeatRuns, null, 2));
    await fs.writeFile(path.join(outDir, "stability_report.json"), JSON.stringify(stabilityMetrics, null, 2));
    await fs.writeFile(path.join(outDir, "stability_report.md"), [
      "# Stability Report\n",
      `**Runs:** ${stabilityMetrics?.runs || repeats}`,
      `**Cases:** ${stabilityMetrics?.cases_evaluated || Object.keys(relevantLabels).length}`,
      "",
      "| Metric | Value |",
      "|---|---|",
      `| Alert-Level Consistency | ${((stabilityMetrics?.alert_consistency || 0) * 100).toFixed(1)}% |`,
      `| Prediction Flip Rate | ${((stabilityMetrics?.prediction_flip_rate || 0) * 100).toFixed(1)}% |`,
      `| Jaccard Avg (Triggered Rules) | ${(stabilityMetrics?.jaccard_avg || 0).toFixed(4)} |`,
    ].join("\n") + "\n");
  }

  // Identify failure cases (FN and FP)
  const failureCases = Object.entries(relevantLabels)
    .filter(([id, label]) => {
      const pred = firstRunPreds[id] ?? 0;
      return pred !== label;
    })
    .map(([id, label]) => ({ case_id: id, label, predicted: firstRunPreds[id] ?? 0 }));

  await fs.writeFile(path.join(outDir, "failure_cases.json"), JSON.stringify(failureCases, null, 2));

  console.log(`\nResults written to: ${outDir}`);
  console.log(`\nDetection Metrics (${mode}, run 1):`);
  console.log(`  TP=${detectionMetrics.tp} FP=${detectionMetrics.fp} FN=${detectionMetrics.fn}`);
  console.log(`  Precision=${(detectionMetrics.precision * 100).toFixed(1)}%`);
  console.log(`  Recall=${(detectionMetrics.recall * 100).toFixed(1)}%`);
  console.log(`  F1=${detectionMetrics.f1.toFixed(4)}`);
  console.log(`  Review Queue/100 Normal=${detectionMetrics.review_queue_per_100_normal.toFixed(2)}`);

  if (stabilityMetrics) {
    console.log(`\nStability (${repeats} runs):`);
    console.log(`  Alert Consistency: ${(stabilityMetrics.alert_consistency * 100).toFixed(1)}%`);
    console.log(`  Flip Rate: ${(stabilityMetrics.prediction_flip_rate * 100).toFixed(1)}%`);
    console.log(`  Jaccard Avg: ${stabilityMetrics.jaccard_avg.toFixed(4)}`);
  }

  return report;
}

export { main as runMultiAgentTriageEval };
await main();

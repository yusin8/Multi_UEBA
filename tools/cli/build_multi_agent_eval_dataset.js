#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  buildAllCases,
  buildSmokeDataset,
  buildStabilityDataset,
  buildFullEvalDataset,
  buildCaseLabels,
  buildDatasetManifest
} from "../../packages/shield_core/src/agents/case_builder.js";
import { SAMPLING_SEED } from "../../packages/shield_core/src/agents/agent_schema.js";

const { values: args } = parseArgs({
  options: {
    source: { type: "string" },
    profiles: { type: "string" },
    out: { type: "string", default: "./out/multi_agent_triage/datasets" }
  }
});

async function main() {
  if (!args.source) {
    console.error("Usage: build_multi_agent_eval_dataset.js --source <raw.json> [--profiles <profiles.json>] [--out <dir>]");
    process.exit(1);
  }

  const sourcePath = path.resolve(args.source);
  const outDir = path.resolve(args.out);

  console.log(`Loading raw dataset from: ${sourcePath}`);
  const rawDataset = JSON.parse(await fs.readFile(sourcePath, "utf-8"));

  let userProfiles = {};
  if (args.profiles) {
    const profilesPath = path.resolve(args.profiles);
    console.log(`Loading user profiles from: ${profilesPath}`);
    userProfiles = JSON.parse(await fs.readFile(profilesPath, "utf-8"));
  }

  console.log("Building cases...");
  const { positive, negative } = buildAllCases(rawDataset);
  console.log(`  Positive cases: ${positive.length}`);
  console.log(`  Negative cases: ${negative.length}`);

  const smoke = buildSmokeDataset(positive, negative);
  const stability = buildStabilityDataset(positive, negative);
  const fullEval = buildFullEvalDataset(positive, negative);

  // case_labels only covers smoke+stability+full - all cases combined deduped
  const allCases = [...new Map([...smoke, ...stability, ...fullEval].map(c => [c.case_id, c])).values()];
  const labels = buildCaseLabels(allCases);

  const manifest = buildDatasetManifest({
    smoke,
    stability,
    fullEval,
    labels,
    outDir,
    seed: SAMPLING_SEED
  });

  // Attach user profile summaries to cases (but not label info)
  function enrichWithProfiles(cases) {
    return cases.map(c => ({
      ...c,
      user_profile: userProfiles[c.user_id] || {},
      memory_matches: [],
      allowed_context: { train_release: "r4.2", test_release: "r5.2", scenarios: [1, 2, 4] }
    }));
  }

  const smokeEnriched = enrichWithProfiles(smoke);
  const stabilityEnriched = enrichWithProfiles(stability);
  const fullEvalEnriched = enrichWithProfiles(fullEval);

  await fs.mkdir(outDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(outDir, "dev_smoke_cases.json"), JSON.stringify(smokeEnriched, null, 2)),
    fs.writeFile(path.join(outDir, "stability_cases.json"), JSON.stringify(stabilityEnriched, null, 2)),
    fs.writeFile(path.join(outDir, "full_eval_cases.json"), JSON.stringify(fullEvalEnriched, null, 2)),
    fs.writeFile(path.join(outDir, "case_labels.json"), JSON.stringify(labels, null, 2)),
    fs.writeFile(path.join(outDir, "dataset_manifest.json"), JSON.stringify(manifest, null, 2))
  ]);

  console.log(`\nDataset written to: ${outDir}`);
  console.log(`  dev_smoke_cases.json    : ${smoke.length} cases`);
  console.log(`  stability_cases.json    : ${stability.length} cases`);
  console.log(`  full_eval_cases.json    : ${fullEval.length} cases`);
  console.log(`  case_labels.json        : ${Object.keys(labels).length} labels`);
  console.log(`  dataset_manifest.json`);

  return manifest;
}

export { main as buildMultiAgentEvalDataset };
await main();

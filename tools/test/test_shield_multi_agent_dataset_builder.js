#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  buildAllCases,
  buildSmokeDataset,
  buildStabilityDataset,
  buildFullEvalDataset,
  buildCaseLabels,
  buildDatasetManifest
} from "../../packages/shield_core/src/agents/case_builder.js";
import { SAMPLING_SEED } from "../../packages/shield_core/src/agents/agent_schema.js";

const RAW_DATASET_PATH = "./out/cert_selected_dataset/selected_dataset.raw.json";

let rawDataset;
try {
  rawDataset = JSON.parse(await fs.readFile(RAW_DATASET_PATH, "utf-8"));
} catch {
  console.log("test_shield_multi_agent_dataset_builder: raw dataset not found, using synthetic data");
  rawDataset = {
    portalEvents: [
      // Positive: scenario 1 attack
      { session_id: "s1", action_id: "e1", user_id: "ALT1", ts: "2010-08-13T22:16:10.000Z", action_type: "off_hours_or_unusual_access", label: 1, attack_id: "cert:r5.2:atk1", raw: { scenario: 1 } },
      { session_id: "s1", action_id: "e2", user_id: "ALT1", ts: "2010-08-14T04:14:02.000Z", action_type: "removable_media_use", label: 1, attack_id: "cert:r5.2:atk1", raw: { scenario: 1 } },
      // Positive: scenario 2
      { session_id: "s2", action_id: "e3", user_id: "ALT2", ts: "2010-09-01T23:00:00.000Z", action_type: "web_upload", label: 1, attack_id: "cert:r5.2:atk2", raw: { scenario: 2 } },
      // Positive: scenario 4
      { session_id: "s4", action_id: "e4", user_id: "ALT3", ts: "2010-10-01T02:00:00.000Z", action_type: "email_send", label: 1, attack_id: "cert:r5.2:atk4", raw: { scenario: 4 } },
      // Negative: normal events for windowing
      { session_id: "n1", action_id: "e5", user_id: "NORM1", ts: "2010-08-13T09:00:00.000Z", action_type: "logon", label: 0 },
      { session_id: "n1", action_id: "e6", user_id: "NORM1", ts: "2010-08-13T10:00:00.000Z", action_type: "file_access", label: 0 },
      { session_id: "n2", action_id: "e7", user_id: "NORM2", ts: "2010-08-13T09:30:00.000Z", action_type: "logon", label: 0 }
    ]
  };
}

// --- buildAllCases ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  assert.ok(positive.length > 0, "Should produce positive cases");
  assert.ok(negative.length > 0, "Should produce negative cases");

  // All positive cases should have case_label: 1
  for (const c of positive) {
    assert.equal(c.case_label, 1, `Positive case ${c.case_id} should have label 1`);
  }

  // All negative cases should have case_label: 0
  for (const c of negative) {
    assert.equal(c.case_label, 0, `Negative case ${c.case_id} should have label 0`);
  }

  // case_id format for normal cases
  const normalCase = negative[0];
  assert.ok(normalCase.case_id.startsWith("normal:"), "Negative case_id should start with 'normal:'");
}

// --- No label/prediction in events ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const allCases = [...positive, ...negative];
  for (const c of allCases) {
    for (const e of c.events) {
      assert.ok(!("label" in e), `Event should not have label field in case ${c.case_id}`);
      assert.ok(!("predicted" in e), "Event should not have predicted field");
      assert.ok(!("tp" in e), "Event should not have tp field");
    }
  }
}

// --- buildSmokeDataset returns <= 30 cases ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const smoke = buildSmokeDataset(positive, negative);
  assert.ok(smoke.length > 0, "Smoke dataset should have cases");
  assert.ok(smoke.length <= 30, `Smoke dataset should have at most 30 cases, got ${smoke.length}`);
}

// --- buildStabilityDataset returns <= 60 cases ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const stability = buildStabilityDataset(positive, negative);
  assert.ok(stability.length > 0, "Stability dataset should have cases");
  assert.ok(stability.length <= 60, `Stability dataset should have at most 60 cases, got ${stability.length}`);

  const sourceHasN4 = negative.some(c => c.events.some(e => e.event_type === "N4"));
  if (sourceHasN4) {
    assert.ok(
      stability.some(c => c.events.some(e => e.event_type === "N4")),
      "Stability dataset should include N4 hard-negative cases when available"
    );
  }

  const sourceHasApprovedException = negative.some(c => c.events.some(e => e.approved_exception === true));
  if (sourceHasApprovedException) {
    assert.ok(
      stability.some(c => c.events.some(e => e.approved_exception === true)),
      "Stability dataset should include approved-exception cases when available"
    );
  }
}

// --- buildFullEvalDataset returns all cases ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const fullEval = buildFullEvalDataset(positive, negative);
  assert.equal(fullEval.length, positive.length + negative.length, "Full eval should contain all cases");
}

// --- buildCaseLabels produces correct labels ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const allCases = [...positive, ...negative];
  const labels = buildCaseLabels(allCases);
  for (const c of positive) assert.equal(labels[c.case_id], 1, `Label for ${c.case_id} should be 1`);
  for (const c of negative) assert.equal(labels[c.case_id], 0, `Label for ${c.case_id} should be 0`);
}

// --- deterministic sampling: same order every run ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const smoke1 = buildSmokeDataset(positive, negative).map(c => c.case_id);
  const smoke2 = buildSmokeDataset(positive, negative).map(c => c.case_id);
  assert.deepEqual(smoke1, smoke2, "Sampling must be deterministic");
}

// --- buildDatasetManifest ---
{
  const { positive, negative } = buildAllCases(rawDataset);
  const smoke = buildSmokeDataset(positive, negative);
  const stability = buildStabilityDataset(positive, negative);
  const fullEval = buildFullEvalDataset(positive, negative);
  const labels = buildCaseLabels([...smoke, ...stability, ...fullEval]);
  const manifest = buildDatasetManifest({ smoke, stability, fullEval, labels, outDir: "/tmp/test", seed: SAMPLING_SEED });
  assert.ok(manifest.generated_at, "Manifest should have generated_at");
  assert.ok(manifest.counts.smoke >= 0, "Manifest should have smoke count");
  assert.equal(manifest.seed, SAMPLING_SEED, "Manifest should record seed");
}

console.log("test_shield_multi_agent_dataset_builder: all tests passed");

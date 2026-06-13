#!/usr/bin/env node
import assert from "node:assert/strict";

import { runParallelTriage, runBatchTriage } from "../../packages/shield_core/src/agents/parallel_triage.js";
import { runDeterministicSpecialist } from "../../packages/shield_core/src/agents/deterministic_specialists.js";
import { makeFailureFinding, AGENT_DEFINITIONS } from "../../packages/shield_core/src/agents/agent_schema.js";

function makeCase(overrides = {}) {
  return {
    case_id: "test:case:001",
    user_id: "ALT1465",
    events: [
      {
        action_id: "{P2W1-C6NJ88YS}",
        user_id: "ALT1465",
        ts: "2010-08-13T22:16:10.000Z",
        action_type: "off_hours_or_unusual_access",
        device: "PC-3407",
        ip: "0.0.0.0",
        downloads: 0,
        tool: "logon",
        command: "Logon"
      },
      {
        action_id: "{C4E8-U7VA71XB}",
        user_id: "ALT1465",
        ts: "2010-08-14T04:14:02.000Z",
        action_type: "removable_media_use",
        device: "PC-3407",
        ip: "0.0.0.0",
        downloads: 3,
        tool: "device",
        command: "R:\\;R:\\ALT1465"
      }
    ],
    user_profile: { common_device: "PC-3000", common_ip: "192.168.1.1" },
    memory_matches: [],
    allowed_context: { train_release: "r4.2", test_release: "r5.2", scenarios: [1, 2, 4] },
    ...overrides
  };
}

// --- runParallelTriage returns structured result ---
{
  const cp = makeCase();
  const result = await runParallelTriage(cp, { runnerFn: runDeterministicSpecialist });

  assert.equal(result.case_id, cp.case_id, "Result should have case_id");
  assert.ok(["none", "observe", "medium", "high"].includes(result.alert_level), "alert_level should be valid");
  assert.ok([0, 1].includes(result.predicted), "predicted should be 0 or 1");
  assert.ok(typeof result.confidence === "number", "confidence should be a number");
  assert.ok(Array.isArray(result.findings), "findings should be an array");
  assert.ok(Array.isArray(result.triggered_rules), "triggered_rules should be an array");
  assert.equal(result.agent_count, AGENT_DEFINITIONS.length, "Should run all agents");
}

// --- Attack case: off-hours + USB should trigger high ---
{
  const cp = makeCase();
  const result = await runParallelTriage(cp, { runnerFn: runDeterministicSpecialist });
  assert.ok(["medium", "high"].includes(result.alert_level), `Attack case should be medium or high, got: ${result.alert_level}`);
  assert.equal(result.predicted, 1, "Attack case should be predicted positive");
}

// --- Failure isolation: one failing agent shouldn't break the whole triage ---
{
  let callCount = 0;
  function failingAgent(agentName, agentInput) {
    callCount++;
    if (agentName === "usb_agent") throw new Error("simulated agent failure");
    return runDeterministicSpecialist(agentName, agentInput);
  }

  const cp = makeCase();
  const result = await runParallelTriage(cp, { runnerFn: failingAgent });
  assert.ok(result, "Should produce result even when one agent fails");
  assert.equal(result.agent_count, AGENT_DEFINITIONS.length, "All agents should be accounted for");
  assert.ok(result.failure_count >= 1, "Should record at least one failure");

  const usbFinding = result.findings.find(f => f.agent === "usb_agent");
  assert.ok(usbFinding, "Should have usb_agent finding");
  assert.equal(usbFinding.notes, "failure finding", "Failed agent should have failure finding");
}

// --- Normal case: no attack signals -> predicted 0 ---
{
  const normalCase = {
    case_id: "normal:NORM1:2010-08-13T08:00:00.000Z",
    user_id: "NORM1",
    events: [
      {
        action_id: "e1",
        user_id: "NORM1",
        ts: "2010-08-13T09:00:00.000Z",
        action_type: "logon",
        device: "PC-100",
        ip: "192.168.1.50",
        downloads: 0,
        tool: "logon",
        command: "Logon"
      }
    ],
    user_profile: { common_device: "PC-100", common_ip: "192.168.1.50" },
    memory_matches: [],
    allowed_context: { train_release: "r4.2", test_release: "r5.2", scenarios: [1, 2, 4] }
  };

  const result = await runParallelTriage(normalCase, { runnerFn: runDeterministicSpecialist });
  assert.ok(["none", "observe"].includes(result.alert_level), `Normal case should be none or observe, got: ${result.alert_level}`);
}

// --- Sparse profile with 0.0.0.0 alone should not become positive ---
{
  const sparseProfileCase = {
    case_id: "normal:SPARSE:2010-08-13T08:00:00.000Z",
    user_id: "SPARSE",
    events: [
      {
        action_id: "sparse-1",
        user_id: "SPARSE",
        ts: "2010-08-13T09:00:00.000Z",
        action_type: "logon",
        device: "PC-100",
        ip: "0.0.0.0",
        downloads: 0,
        tool: "logon",
        command: "Logon"
      }
    ],
    user_profile: {},
    memory_matches: [],
    allowed_context: { train_release: "r4.2", test_release: "r5.2", scenarios: [1, 2, 4] }
  };

  const result = await runParallelTriage(sparseProfileCase, { runnerFn: runDeterministicSpecialist });
  assert.ok(["none", "observe"].includes(result.alert_level), `Sparse profile unresolved IP should not be positive, got: ${result.alert_level}`);
  assert.equal(result.predicted, 0);
}

// --- runBatchTriage handles multiple cases ---
{
  const cases = [makeCase({ case_id: "batch:001" }), makeCase({ case_id: "batch:002" })];
  const results = await runBatchTriage(cases, { runnerFn: runDeterministicSpecialist, concurrency: 2 });
  assert.equal(results.length, 2, "Should return result for each case");
  const ids = results.map(r => r.case_id);
  assert.ok(ids.includes("batch:001"), "Should include batch:001");
  assert.ok(ids.includes("batch:002"), "Should include batch:002");
}

// --- All findings have valid agents ---
{
  const cp = makeCase();
  const result = await runParallelTriage(cp, { runnerFn: runDeterministicSpecialist });
  const agentNames = new Set(AGENT_DEFINITIONS.map(a => a.name));
  for (const f of result.findings) {
    assert.ok(agentNames.has(f.agent), `Finding agent ${f.agent} should be a known agent`);
  }
}

// --- No label/predicted in findings ---
{
  const cp = makeCase();
  const result = await runParallelTriage(cp, { runnerFn: runDeterministicSpecialist });
  for (const f of result.findings) {
    assert.ok(!("label" in f), "Findings should not contain label");
  }
}

console.log("test_shield_multi_agent_parallel_triage: all tests passed");

#!/usr/bin/env node
/**
 * Tests LangChain runner in mock mode (no LLM API calls).
 * Live LLM tests only run when SHIELD_RUN_LLM_TESTS=1.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createMockRunner,
  createLangChainRunner
} from "../../packages/shield_core/src/agents/langchain_agent_runner.js";
import { runParallelTriage } from "../../packages/shield_core/src/agents/parallel_triage.js";
import { validateFinding, makeFailureFinding } from "../../packages/shield_core/src/agents/agent_schema.js";
import { getSystemPrompt, getPromptVersion, getAllPromptVersions, SPECIALIST_PROMPTS } from "../../packages/shield_core/src/agents/specialist_prompts.js";

const RUN_LLM_TESTS = process.env.SHIELD_RUN_LLM_TESTS === "1";

// --- Mock runner returns valid findings ---
{
  const mockRunner = createMockRunner();
  const agentInput = {
    case_id: "test:mock:001",
    user_id: "MOCK_USER",
    events: [{ action_id: "e1", action_type: "logon", ts: "2010-08-13T22:00:00Z" }],
    user_profile: {},
    memory_matches: []
  };

  const finding = await mockRunner("usb_agent", agentInput);
  assert.equal(typeof finding.triggered, "boolean", "Mock should return boolean triggered");
  assert.ok(["none", "low", "medium", "high"].includes(finding.severity), "Mock should return valid severity");
  assert.equal(finding.notes, "mock finding", "Mock should have 'mock finding' notes");
}

// --- Mock runner with custom findings ---
{
  const customFinding = {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: true,
    severity: "high",
    confidence: 0.9,
    evidence: ["custom mock evidence"],
    event_ids: ["e1"],
    notes: "custom mock"
  };
  const mockRunner = createMockRunner({ usb_agent: customFinding });
  const result = await mockRunner("usb_agent", {});
  assert.equal(result.severity, "high", "Should return custom finding");
  assert.equal(result.notes, "custom mock");
}

// --- Mock runner integrates with parallel triage ---
{
  const mockRunner = createMockRunner();
  const cp = {
    case_id: "test:mock:parallel:001",
    user_id: "ALT1465",
    events: [{ action_id: "e1", action_type: "logon", ts: "2010-08-13T22:00:00Z" }],
    user_profile: {},
    memory_matches: []
  };

  const result = await runParallelTriage(cp, { runnerFn: mockRunner });
  assert.ok(result.case_id, "Should have case_id");
  assert.ok(result.findings.length > 0, "Should have findings");
  assert.equal(result.failure_count, 0, "Mock runner should not produce failures");
}

// --- Mock runner with function-based finding ---
{
  const mockRunner = createMockRunner({
    login_time_agent: (input) => ({
      agent: "login_time_agent",
      rule_id: "login_time_risk",
      triggered: input.events?.length > 0,
      severity: "low",
      confidence: 0.6,
      evidence: ["function mock"],
      event_ids: input.events?.length > 0 ? ["e1"] : [],
      notes: "fn mock"
    })
  });

  const finding = await mockRunner("login_time_agent", { events: [{ action_id: "e1" }] });
  assert.equal(finding.triggered, true);
  assert.equal(finding.notes, "fn mock");
}

// --- All system prompts are present and non-empty ---
{
  const agentNames = [
    "login_time_agent", "device_ip_agent", "usb_agent", "file_access_agent",
    "web_exfil_agent", "email_agent", "memory_agent", "context_exception_agent", "case_flow_agent"
  ];
  for (const name of agentNames) {
    const prompt = getSystemPrompt(name);
    assert.ok(prompt, `${name} should have a system prompt`);
    assert.ok(prompt.length > 100, `${name} prompt should be substantial`);
    assert.ok(prompt.includes("Return structured JSON"), `${name} prompt should require JSON output`);
  }
}

// --- Prompt versions are deterministic ---
{
  const v1 = getPromptVersion("usb_agent");
  const v2 = getPromptVersion("usb_agent");
  assert.equal(v1, v2, "Prompt version should be deterministic");
  assert.ok(v1.startsWith("v1.0-"), "Prompt version should include version prefix");
}

// --- getAllPromptVersions returns all 9 agents ---
{
  const versions = getAllPromptVersions();
  assert.equal(Object.keys(versions).length, 9, "Should have 9 prompt versions");
  for (const [name, version] of Object.entries(versions)) {
    assert.ok(version, `${name} should have a version`);
  }
}

// --- getSystemPrompt returns null for unknown agent ---
{
  const prompt = getSystemPrompt("nonexistent_agent");
  assert.equal(prompt, null, "Should return null for unknown agent");
}

// --- validateFinding rejects fabricated event_ids when triggered ---
{
  const bad = {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: true,
    severity: "high",
    confidence: 0.8,
    evidence: ["some evidence"],
    event_ids: []   // triggered but no event_ids
  };
  const result = validateFinding(bad);
  assert.ok(!result.ok, "Should reject triggered finding with no event_ids");
}

// --- Live LLM tests (only when SHIELD_RUN_LLM_TESTS=1) ---
if (RUN_LLM_TESTS) {
  console.log("\nRunning live LLM tests...");
  const { runLangChainAgent } = await import("../../packages/shield_core/src/agents/langchain_agent_runner.js");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "shield-llm-test-"));
  const agentInput = {
    case_id: "live:llm:test:001",
    user_id: "ALT1465",
    events: [{
      action_id: "{TEST-EVT-001}",
      action_type: "removable_media_use",
      ts: "2010-08-14T04:14:02.000Z",
      device: "PC-3407",
      ip: "0.0.0.0",
      downloads: 3,
      tool: "device",
      command: "R:\\;R:\\ALT1465"
    }],
    user_profile: {},
    memory_matches: []
  };

  const finding = await runLangChainAgent("usb_agent", "removable_media_risk", agentInput, {
    cacheDir: path.join(tmpDir, "cache"),
    useCache: true
  });

  const { ok, error } = validateFinding(finding);
  assert.ok(ok || finding.notes === "failure finding", `Live LLM finding should be valid or failure: ${error}`);
  console.log("  Live LLM test passed. Finding:", JSON.stringify(finding, null, 2));
} else {
  console.log("  (Skipping live LLM tests. Set SHIELD_RUN_LLM_TESTS=1 to run them.)");
}

console.log("test_shield_multi_agent_langchain_runner: all tests passed");

#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  validateFinding,
  makeFailureFinding,
  hashCasePacket,
  stableHash,
  FindingSchema,
  TriageResultSchema,
  CasePacketSchema,
  AGENT_DEFINITIONS,
  SAMPLING_SEED
} from "../../packages/shield_core/src/agents/agent_schema.js";

// --- validateFinding: valid triggered finding ---
{
  const finding = {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: true,
    severity: "high",
    confidence: 0.85,
    evidence: ["USB connect detected"],
    event_ids: ["{C4E8-U7VA71XB-2459TEID}"],
    notes: "test"
  };
  const result = validateFinding(finding);
  assert.ok(result.ok, `Should be valid: ${result.error}`);
  assert.equal(result.finding.agent, "usb_agent");
}

// --- validateFinding: valid non-triggered finding ---
{
  const finding = {
    agent: "email_agent",
    rule_id: "email_exfil_risk",
    triggered: false,
    severity: "none",
    confidence: 0.9,
    evidence: [],
    event_ids: [],
    notes: ""
  };
  const result = validateFinding(finding);
  assert.ok(result.ok, `Should be valid: ${result.error}`);
}

// --- validateFinding: triggered with no event_ids should fail ---
{
  const finding = {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: true,
    severity: "high",
    confidence: 0.8,
    evidence: ["USB detected"],
    event_ids: []
  };
  const result = validateFinding(finding);
  assert.ok(!result.ok, "Should fail: triggered with no event_ids");
}

// --- validateFinding: non-triggered with high severity should fail ---
{
  const finding = {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: false,
    severity: "high",
    confidence: 0.8,
    evidence: [],
    event_ids: []
  };
  const result = validateFinding(finding);
  assert.ok(!result.ok, "Should fail: non-triggered with high severity");
}

// --- validateFinding: confidence out of range ---
{
  const finding = {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: false,
    severity: "none",
    confidence: 1.5,
    evidence: [],
    event_ids: []
  };
  const result = validateFinding(finding);
  assert.ok(!result.ok, "Should fail: confidence > 1");
}

// --- makeFailureFinding ---
{
  const f = makeFailureFinding("usb_agent", "removable_media_risk", "timeout");
  assert.equal(f.agent, "usb_agent");
  assert.equal(f.triggered, false);
  assert.equal(f.severity, "none");
  assert.equal(f.confidence, 0);
  assert.ok(f.evidence[0].includes("timeout"));
  assert.equal(f.notes, "failure finding");
}

// --- hashCasePacket is deterministic ---
{
  const cp = {
    case_id: "test:001",
    user_id: "ALT1465",
    events: [{ action_id: "e1", action_type: "logon" }]
  };
  const h1 = hashCasePacket(cp);
  const h2 = hashCasePacket(cp);
  assert.equal(h1, h2, "Hash must be deterministic");
  assert.equal(typeof h1, "string");
  assert.ok(h1.length > 0);
}

// --- stableHash is deterministic ---
{
  const h1 = stableHash(SAMPLING_SEED, "s1_smoke", "cert:r5.2:test");
  const h2 = stableHash(SAMPLING_SEED, "s1_smoke", "cert:r5.2:test");
  assert.equal(h1, h2, "Stable hash must be deterministic");
}

// --- stableHash differs by bucket ---
{
  const h1 = stableHash(SAMPLING_SEED, "s1_smoke", "case-001");
  const h2 = stableHash(SAMPLING_SEED, "s2_smoke", "case-001");
  assert.notEqual(h1, h2, "Different buckets should produce different hashes");
}

// --- AGENT_DEFINITIONS has 9 agents ---
{
  assert.equal(AGENT_DEFINITIONS.length, 9, "Should have 9 specialist agents");
  const names = AGENT_DEFINITIONS.map(a => a.name);
  assert.ok(names.includes("login_time_agent"));
  assert.ok(names.includes("usb_agent"));
  assert.ok(names.includes("case_flow_agent"));
  assert.ok(names.includes("context_exception_agent"));
}

// --- CasePacketSchema ---
{
  const cp = {
    case_id: "test:001",
    user_id: "ALT1465",
    events: [{ action_id: "e1" }]
  };
  const result = CasePacketSchema.safeParse(cp);
  assert.ok(result.success, "CasePacketSchema should accept valid packet");
}

console.log("test_shield_multi_agent_schema: all tests passed");

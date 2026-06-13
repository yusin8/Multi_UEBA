#!/usr/bin/env node
import assert from "node:assert/strict";

import { runSupervisor } from "../../packages/shield_core/src/agents/supervisor.js";
import { makeFailureFinding } from "../../packages/shield_core/src/agents/agent_schema.js";

function makeFinding(agent, rule_id, triggered, severity, confidence = 0.8) {
  return {
    agent,
    rule_id,
    triggered,
    severity,
    confidence,
    evidence: triggered ? [`${rule_id} triggered`] : [],
    event_ids: triggered ? ["evt-001"] : [],
    notes: ""
  };
}

// --- high + medium findings -> high alert ---
{
  const findings = [
    makeFinding("usb_agent", "removable_media_risk", true, "high"),
    makeFinding("file_access_agent", "file_access_risk", true, "medium"),
    makeFinding("login_time_agent", "login_time_risk", false, "none"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-001", findings);
  assert.equal(result.alert_level, "high", "high+medium should produce high alert");
  assert.equal(result.predicted, 1);
  assert.ok(result.confidence > 0.5);
}

// --- high only -> medium alert ---
{
  const findings = [
    makeFinding("usb_agent", "removable_media_risk", true, "high"),
    makeFinding("login_time_agent", "login_time_risk", false, "none"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-002", findings);
  assert.equal(result.alert_level, "medium", "high alone should produce medium alert");
  assert.equal(result.predicted, 1);
}

// --- 2x medium -> medium ---
{
  const findings = [
    makeFinding("web_exfil_agent", "web_exfil_risk", true, "medium"),
    makeFinding("email_agent", "email_exfil_risk", true, "medium"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-003", findings);
  assert.equal(result.alert_level, "medium", "2x medium should produce medium alert");
}

// --- 1x medium -> observe ---
{
  const findings = [
    makeFinding("login_time_agent", "login_time_risk", true, "medium"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-004", findings);
  assert.equal(result.alert_level, "observe", "1x medium should produce observe");
  assert.equal(result.predicted, 0);
}

// --- 1x web/email exfil medium -> medium ---
{
  const findings = [
    makeFinding("web_exfil_agent", "web_exfil_risk", true, "medium"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-egress-medium", findings);
  assert.equal(result.alert_level, "medium", "Medium suspicious egress should produce medium alert");
  assert.equal(result.predicted, 1);
}

// --- no triggered findings -> none ---
{
  const findings = [
    makeFinding("login_time_agent", "login_time_risk", false, "none"),
    makeFinding("usb_agent", "removable_media_risk", false, "none"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-005", findings);
  assert.equal(result.alert_level, "none");
  assert.equal(result.predicted, 0);
}

// --- context exception suppression ---
{
  const findings = [
    makeFinding("login_time_agent", "login_time_risk", true, "medium"),
    makeFinding("context_exception_agent", "context_exception_check", true, "none", 0.9)
  ];
  const result = runSupervisor("case-006", findings);
  assert.equal(result.suppressed_by_context, true, "Should be suppressed by high-confidence context exception");
  assert.equal(result.alert_level, "observe");
}

// --- context exception suppresses profile-only high findings ---
{
  const findings = [
    makeFinding("device_ip_agent", "device_ip_risk", true, "high"),
    makeFinding("context_exception_agent", "context_exception_check", true, "none", 0.9)
  ];
  const result = runSupervisor("case-007", findings);
  assert.equal(result.suppressed_by_context, true, "Should suppress high device-only findings with strong context");
  assert.equal(result.alert_level, "observe");
}

// --- context exception does NOT suppress confirmed exfil chain ---
{
  const findings = [
    makeFinding("web_exfil_agent", "web_exfil_risk", true, "high"),
    makeFinding("file_access_agent", "file_access_risk", true, "medium"),
    makeFinding("context_exception_agent", "context_exception_check", true, "none", 0.9)
  ];
  const result = runSupervisor("case-007b", findings);
  assert.equal(result.suppressed_by_context, false, "Should not suppress confirmed exfiltration chain");
  assert.equal(result.alert_level, "high");
}

// --- exfil chain boost: web_exfil high + file_access medium -> high ---
{
  const findings = [
    makeFinding("web_exfil_agent", "web_exfil_risk", true, "high"),
    makeFinding("file_access_agent", "file_access_risk", true, "medium"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-008", findings);
  assert.equal(result.alert_level, "high", "Exfil chain boost should produce high");
}

// --- failure findings don't break supervisor ---
{
  const findings = [
    makeFailureFinding("usb_agent", "removable_media_risk", "timeout"),
    makeFinding("web_exfil_agent", "web_exfil_risk", true, "high"),
    makeFinding("context_exception_agent", "context_exception_check", false, "none")
  ];
  const result = runSupervisor("case-009", findings);
  assert.ok(result, "Supervisor should produce result even with failure finding");
  assert.ok(result.alert_level, "Should have alert_level");
}

// --- triggered_rules list ---
{
  const findings = [
    makeFinding("usb_agent", "removable_media_risk", true, "high"),
    makeFinding("file_access_agent", "file_access_risk", true, "medium"),
    makeFinding("login_time_agent", "login_time_risk", false, "none")
  ];
  const result = runSupervisor("case-010", findings);
  assert.ok(result.triggered_rules.includes("removable_media_risk"), "Should list triggered removable_media_risk");
  assert.ok(result.triggered_rules.includes("file_access_risk"), "Should list triggered file_access_risk");
  assert.ok(!result.triggered_rules.includes("login_time_risk"), "Should not list non-triggered login_time_risk");
}

// --- supervisor is deterministic ---
{
  const findings = [
    makeFinding("usb_agent", "removable_media_risk", true, "high"),
    makeFinding("web_exfil_agent", "web_exfil_risk", true, "medium")
  ];
  const r1 = runSupervisor("case-det", findings);
  const r2 = runSupervisor("case-det", findings);
  assert.equal(r1.alert_level, r2.alert_level, "Supervisor must be deterministic");
  assert.equal(r1.predicted, r2.predicted);
}

console.log("test_shield_multi_agent_supervisor: all tests passed");

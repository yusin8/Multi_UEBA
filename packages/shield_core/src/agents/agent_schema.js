import { z } from "zod";
import crypto from "node:crypto";

export const SEVERITY_LEVELS = ["none", "low", "medium", "high"];

export const FindingSchema = z.object({
  agent: z.string().min(1),
  rule_id: z.string().min(1),
  triggered: z.boolean(),
  severity: z.enum(["none", "low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  event_ids: z.array(z.string()),
  notes: z.string().optional().default("")
}).refine(
  (f) => !f.triggered || f.event_ids.length > 0,
  { message: "triggered finding must have at least one event_id" }
).refine(
  (f) => f.triggered || ["none", "low"].includes(f.severity),
  { message: "non-triggered finding must have severity none or low" }
);

export const TriageResultSchema = z.object({
  case_id: z.string().min(1),
  alert_level: z.enum(["none", "observe", "medium", "high"]),
  predicted: z.number().int().min(0).max(1),
  confidence: z.number().min(0).max(1),
  triggered_rules: z.array(z.string()),
  suppressed_by_context: z.boolean(),
  findings: z.array(FindingSchema)
});

export const CasePacketSchema = z.object({
  case_id: z.string().min(1),
  user_id: z.string().min(1),
  events: z.array(z.record(z.unknown())),
  user_profile: z.record(z.unknown()).optional().default({}),
  memory_matches: z.array(z.record(z.unknown())).optional().default([]),
  allowed_context: z.object({
    train_release: z.string(),
    test_release: z.string(),
    scenarios: z.array(z.number())
  }).optional()
});

export function validateFinding(raw) {
  const result = FindingSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message, finding: null };
  }
  return { ok: true, error: null, finding: result.data };
}

export function makeFailureFinding(agentName, ruleId, reason) {
  return {
    agent: agentName,
    rule_id: ruleId,
    triggered: false,
    severity: "none",
    confidence: 0,
    evidence: [`agent_failed: ${reason}`],
    event_ids: [],
    notes: "failure finding"
  };
}

export function hashCasePacket(casePacket) {
  const canonical = JSON.stringify({
    case_id: casePacket.case_id,
    user_id: casePacket.user_id,
    events: casePacket.events
  });
  return crypto.createHash("sha1").update(canonical).digest("hex");
}

export function stableHash(seed, bucketName, caseId) {
  const key = `${seed}:${bucketName}:${caseId}`;
  return crypto.createHash("sha1").update(key).digest("hex");
}

export const AGENT_DEFINITIONS = [
  { name: "login_time_agent",      rule_id: "login_time_risk" },
  { name: "device_ip_agent",       rule_id: "device_ip_risk" },
  { name: "usb_agent",             rule_id: "removable_media_risk" },
  { name: "file_access_agent",     rule_id: "file_access_risk" },
  { name: "web_exfil_agent",       rule_id: "web_exfil_risk" },
  { name: "email_agent",           rule_id: "email_exfil_risk" },
  { name: "memory_agent",          rule_id: "violation_memory_risk" },
  { name: "context_exception_agent", rule_id: "context_exception_check" },
  { name: "case_flow_agent",       rule_id: "attack_flow_risk" }
];

export const SAMPLING_SEED = "20260615-multi-agent-triage-v1";

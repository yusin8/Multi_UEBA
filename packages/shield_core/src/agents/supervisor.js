/**
 * Deterministic supervisor: aggregates specialist findings into final triage result.
 * No LLM involved. Pure rule-based aggregation.
 */

const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };

function rankSeverity(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

function topSeverity(findings) {
  return findings.reduce((best, f) =>
    rankSeverity(f.severity) > rankSeverity(best) ? f.severity : best,
    "none"
  );
}

function countBySeverity(findings, severity) {
  return findings.filter(f => f.triggered && f.severity === severity).length;
}

function isConfirmedExfilFinding(finding) {
  if (!finding.triggered) return false;
  if (["web_exfil_agent", "email_agent"].includes(finding.agent)) {
    return rankSeverity(finding.severity) >= rankSeverity("medium");
  }
  if (finding.agent === "case_flow_agent") {
    return rankSeverity(finding.severity) >= rankSeverity("high");
  }
  return false;
}

function computeConfidence(findings, alertLevel) {
  const triggered = findings.filter(f => f.triggered);
  if (triggered.length === 0) return 0.1;
  const avg = triggered.reduce((s, f) => s + f.confidence, 0) / triggered.length;
  const boost = alertLevel === "high" ? 0.05 : alertLevel === "medium" ? 0.02 : 0;
  return Math.min(1, avg + boost);
}

export function runSupervisor(caseId, findings) {
  const triggered = findings.filter(f => f.triggered);
  const highCount = countBySeverity(findings, "high");
  const mediumCount = countBySeverity(findings, "medium");
  const triggeredRules = triggered.map(f => f.rule_id);

  const contextFinding = findings.find(f => f.rule_id === "context_exception_check");
  const contextHighConfidence = contextFinding?.triggered && (contextFinding.confidence >= 0.75);
  const hasConfirmedExfil = findings.some(isConfirmedExfilFinding);
  const suppressedByContext = contextHighConfidence && !hasConfirmedExfil;

  let alertLevel;

  if (suppressedByContext) {
    alertLevel = "observe";
  } else if (highCount >= 1 && mediumCount >= 1) {
    alertLevel = "high";
  } else if (highCount >= 1) {
    alertLevel = "medium";
  } else if (mediumCount >= 2) {
    alertLevel = "medium";
  } else if (mediumCount >= 1) {
    alertLevel = "observe";
  } else if (triggered.length > 0) {
    alertLevel = "observe";
  } else {
    alertLevel = "none";
  }

  if (!suppressedByContext && alertLevel === "observe") {
    const suspiciousEgressMedium = findings.some(f =>
      ["web_exfil_agent", "email_agent"].includes(f.agent) &&
      f.triggered &&
      rankSeverity(f.severity) >= rankSeverity("medium")
    );
    if (suspiciousEgressMedium) {
      alertLevel = "medium";
    }
  }

  // Exfil chain boost: if exfil agent OR email agent is high AND (file or flow is medium+)
  if (!suppressedByContext) {
    const exfilHigh = findings.some(f =>
      ["web_exfil_agent", "email_agent", "usb_agent"].includes(f.agent) &&
      f.triggered && f.severity === "high"
    );
    const fileOrFlowMedium = findings.some(f =>
      ["file_access_agent", "case_flow_agent"].includes(f.agent) &&
      f.triggered && rankSeverity(f.severity) >= rankSeverity("medium")
    );
    if (exfilHigh && fileOrFlowMedium) {
      alertLevel = "high";
    }
  }

  const predicted = alertLevel === "high" || alertLevel === "medium" ? 1 : 0;
  const confidence = computeConfidence(findings, alertLevel);

  return {
    case_id: caseId,
    alert_level: alertLevel,
    predicted,
    confidence,
    triggered_rules: triggeredRules,
    suppressed_by_context: suppressedByContext,
    findings
  };
}

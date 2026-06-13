/**
 * Rule-based deterministic specialist implementations.
 * Used for testing and as a comparison baseline (no LLM calls required).
 */

import { makeFailureFinding } from "./agent_schema.js";

const OFF_HOURS_START = 20;
const OFF_HOURS_END = 6;
const WEEKEND_DAYS = new Set([0, 6]);

function getHour(ts) {
  return new Date(ts).getUTCHours();
}

function getDay(ts) {
  return new Date(ts).getUTCDay();
}

function isOffHours(ts) {
  const h = getHour(ts);
  return h >= OFF_HOURS_START || h < OFF_HOURS_END;
}

function isWeekend(ts) {
  return WEEKEND_DAYS.has(getDay(ts));
}

function matchesActionTypes(events, ...types) {
  const typeSet = new Set(types);
  return events.filter(e => typeSet.has(e.action_type));
}

function pickEventIds(events, max = 3) {
  return events.slice(0, max).map(e => e.action_id || e.id || e.event_id).filter(Boolean);
}

function meaningfulKnownValues(values) {
  return new Set([...values].filter(value => value && value !== "0.0.0.0" && value !== "unknown"));
}

// --- login_time_agent ---
function runLoginTimeAgent(agentInput) {
  const events = agentInput.events || [];
  const loginEvents = matchesActionTypes(events,
    "off_hours_or_unusual_access", "logon", "authentication", "after_hours_logon",
    "weekend_logon", "unusual_time_logon"
  );

  const offHours = loginEvents.filter(e => isOffHours(e.ts));
  const weekend = loginEvents.filter(e => isWeekend(e.ts));
  const veryLate = loginEvents.filter(e => {
    const h = getHour(e.ts);
    return h >= 0 && h < 5;
  });

  if (veryLate.length > 0) {
    return {
      agent: "login_time_agent",
      rule_id: "login_time_risk",
      triggered: true,
      severity: "high",
      confidence: 0.88,
      evidence: veryLate.map(e => `Login at ${e.ts} (00:00-05:00 window)`),
      event_ids: pickEventIds(veryLate),
      notes: "Very late night access detected"
    };
  }

  if (offHours.length > 0) {
    return {
      agent: "login_time_agent",
      rule_id: "login_time_risk",
      triggered: true,
      severity: "medium",
      confidence: 0.72,
      evidence: offHours.map(e => `Login at ${e.ts} (after-hours)`),
      event_ids: pickEventIds(offHours),
      notes: "After-hours login detected"
    };
  }

  if (weekend.length > 0) {
    return {
      agent: "login_time_agent",
      rule_id: "login_time_risk",
      triggered: true,
      severity: "low",
      confidence: 0.55,
      evidence: weekend.map(e => `Weekend login at ${e.ts}`),
      event_ids: pickEventIds(weekend),
      notes: "Weekend login detected"
    };
  }

  return {
    agent: "login_time_agent",
    rule_id: "login_time_risk",
    triggered: false,
    severity: "none",
    confidence: 0.9,
    evidence: [],
    event_ids: [],
    notes: "No off-hours login detected"
  };
}

// --- device_ip_agent ---
function runDeviceIpAgent(agentInput) {
  const events = agentInput.events || [];
  const profile = agentInput.user_profile || {};
  const knownDevices = meaningfulKnownValues(profile.known_devices || (profile.common_device ? [profile.common_device] : []));
  const knownIps = meaningfulKnownValues(profile.known_ips || (profile.common_ip ? [profile.common_ip] : []));

  const anomalous = events.filter(e => {
    const unknownDev = e.device && knownDevices.size > 0 && !knownDevices.has(e.device);
    const unknownIp = e.ip && knownIps.size > 0 && !knownIps.has(e.ip) && e.ip !== "0.0.0.0";
    return unknownDev || unknownIp;
  });

  const unresolvedIpEvents = events.filter(e => e.ip === "0.0.0.0");

  if (anomalous.length === 0) {
    if (unresolvedIpEvents.length > 0) {
      return {
        agent: "device_ip_agent",
        rule_id: "device_ip_risk",
        triggered: true,
        severity: "low",
        confidence: 0.35,
        evidence: unresolvedIpEvents.slice(0, 3).map(e => `Unresolved CERT IP placeholder 0.0.0.0 on device ${e.device || "unknown"}`),
        event_ids: pickEventIds(unresolvedIpEvents),
        notes: "0.0.0.0 is treated as missing CERT IP context, not high-risk by itself"
      };
    }
    return {
      agent: "device_ip_agent",
      rule_id: "device_ip_risk",
      triggered: false,
      severity: "none",
      confidence: 0.85,
      evidence: [],
      event_ids: [],
      notes: "All devices and IPs match known profile"
    };
  }

  const unknownBoth = anomalous.filter(e => {
    const unknownDev = e.device && knownDevices.size > 0 && !knownDevices.has(e.device);
    const unknownIp = e.ip && knownIps.size > 0 && !knownIps.has(e.ip);
    return unknownDev && unknownIp;
  });

  if (unknownBoth.length > 0) {
    return {
      agent: "device_ip_agent",
      rule_id: "device_ip_risk",
      triggered: true,
      severity: "high",
      confidence: 0.82,
      evidence: unknownBoth.map(e => `Unknown device ${e.device} and unknown IP ${e.ip}`),
      event_ids: pickEventIds(unknownBoth),
      notes: "Both device and IP are unfamiliar"
    };
  }

  return {
    agent: "device_ip_agent",
    rule_id: "device_ip_risk",
    triggered: true,
    severity: "medium",
    confidence: 0.65,
    evidence: anomalous.slice(0, 3).map(e => `Anomalous device/IP: device=${e.device} ip=${e.ip}`),
    event_ids: pickEventIds(anomalous),
    notes: "Unfamiliar device or IP detected"
  };
}

// --- usb_agent ---
function runUsbAgent(agentInput) {
  const events = agentInput.events || [];
  const usbEvents = matchesActionTypes(events,
    "removable_media_use", "removable_media_connect", "usb_connect",
    "device_connect", "file_copy_to_removable"
  );

  const deviceEvents = events.filter(e =>
    e.tool === "device" ||
    (typeof e.command === "string" && e.command.includes("R:\\"))
  );

  const allUsb = [...usbEvents, ...deviceEvents.filter(e => !usbEvents.includes(e))];

  if (allUsb.length === 0) {
    return {
      agent: "usb_agent",
      rule_id: "removable_media_risk",
      triggered: false,
      severity: "none",
      confidence: 0.92,
      evidence: [],
      event_ids: [],
      notes: "No removable media events detected"
    };
  }

  const hasFileCopy = allUsb.some(e => e.downloads > 0 || e.command?.includes("R:\\"));

  if (hasFileCopy) {
    return {
      agent: "usb_agent",
      rule_id: "removable_media_risk",
      triggered: true,
      severity: "high",
      confidence: 0.87,
      evidence: allUsb.map(e => `Removable media event with file activity: ${e.command || e.action_type}`),
      event_ids: pickEventIds(allUsb),
      notes: "USB connect with file copy activity detected"
    };
  }

  return {
    agent: "usb_agent",
    rule_id: "removable_media_risk",
    triggered: true,
    severity: "medium",
    confidence: 0.75,
    evidence: allUsb.map(e => `Removable media connect: ${e.action_type}`),
    event_ids: pickEventIds(allUsb),
    notes: "USB connect detected, no confirmed file copy"
  };
}

// --- file_access_agent ---
function runFileAccessAgent(agentInput) {
  const events = agentInput.events || [];
  const fileEvents = matchesActionTypes(events,
    "file_access", "file_download", "file_open", "file_copy",
    "file_delete", "bulk_file_access", "sensitive_file_access",
    "download_spike", "file_exfiltration"
  );

  const allDownloads = events.reduce((sum, e) => sum + (Number(e.downloads) || 0), 0);
  const maxDpm = Math.max(...events.map(e => Number(e.downloads_per_min) || 0), 0);
  const classifiedAccess = events.filter(e =>
    e.classification_level === "Confidential" || e.classification_level === "Secret"
  );

  if (allDownloads > 20 || maxDpm > 3) {
    return {
      agent: "file_access_agent",
      rule_id: "file_access_risk",
      triggered: true,
      severity: "high",
      confidence: 0.84,
      evidence: [
        `Total downloads: ${allDownloads}`,
        `Max downloads/min: ${maxDpm.toFixed(2)}`
      ],
      event_ids: pickEventIds(fileEvents.length > 0 ? fileEvents : events),
      notes: "Excessive file download activity"
    };
  }

  if (allDownloads > 5 || classifiedAccess.length > 0) {
    return {
      agent: "file_access_agent",
      rule_id: "file_access_risk",
      triggered: true,
      severity: "medium",
      confidence: 0.68,
      evidence: [
        allDownloads > 5 ? `Elevated downloads: ${allDownloads}` : null,
        classifiedAccess.length > 0 ? `Classified document access: ${classifiedAccess.length} events` : null
      ].filter(Boolean),
      event_ids: pickEventIds([...(fileEvents.length > 0 ? fileEvents : []), ...classifiedAccess]),
      notes: "Elevated or classified file access"
    };
  }

  if (fileEvents.length > 0) {
    return {
      agent: "file_access_agent",
      rule_id: "file_access_risk",
      triggered: true,
      severity: "low",
      confidence: 0.5,
      evidence: [`File access events: ${fileEvents.length}`],
      event_ids: pickEventIds(fileEvents),
      notes: "Minor file access activity"
    };
  }

  return {
    agent: "file_access_agent",
    rule_id: "file_access_risk",
    triggered: false,
    severity: "none",
    confidence: 0.88,
    evidence: [],
    event_ids: [],
    notes: "No abnormal file access detected"
  };
}

// --- web_exfil_agent ---
function runWebExfilAgent(agentInput) {
  const events = agentInput.events || [];
  const webEvents = matchesActionTypes(events,
    "web_upload", "web_browse", "http_upload", "cloud_upload",
    "external_upload", "wikileaks_visit", "job_search", "web_exfiltration"
  );

  const exfilKeywords = ["wikileaks", "dropbox", "pastebin", "mega", "wetransfer"];
  const exfilEvents = [...webEvents, ...events.filter(e =>
    exfilKeywords.some(k => (e.url || e.target || e.command || "").toLowerCase().includes(k))
  )];

  const jobSearch = events.filter(e =>
    ["job_search", "linkedin_visit", "monster_visit"].includes(e.action_type)
  );

  if (exfilEvents.length > 0) {
    return {
      agent: "web_exfil_agent",
      rule_id: "web_exfil_risk",
      triggered: true,
      severity: "high",
      confidence: 0.85,
      evidence: exfilEvents.slice(0, 3).map(e => `Exfil target web event: ${e.action_type} url=${e.url || e.target || ""}`),
      event_ids: pickEventIds(exfilEvents),
      notes: "External upload or exfiltration site visit detected"
    };
  }

  if (jobSearch.length > 0) {
    return {
      agent: "web_exfil_agent",
      rule_id: "web_exfil_risk",
      triggered: true,
      severity: "medium",
      confidence: 0.6,
      evidence: jobSearch.slice(0, 2).map(e => `Job search activity: ${e.action_type}`),
      event_ids: pickEventIds(jobSearch),
      notes: "Job search activity may indicate pre-departure exfiltration intent"
    };
  }

  return {
    agent: "web_exfil_agent",
    rule_id: "web_exfil_risk",
    triggered: false,
    severity: "none",
    confidence: 0.88,
    evidence: [],
    event_ids: [],
    notes: "No web exfiltration signals detected"
  };
}

// --- email_agent ---
function runEmailAgent(agentInput) {
  const events = agentInput.events || [];
  const emailEvents = matchesActionTypes(events,
    "email_send", "email_forward", "email_attachment",
    "personal_email", "external_email", "email_exfiltration"
  );

  const externalEmail = emailEvents.filter(e =>
    e.action_type === "external_email" ||
    e.action_type === "personal_email" ||
    e.action_type === "email_exfiltration" ||
    (e.recipient && !e.recipient.endsWith("@company.com"))
  );

  if (externalEmail.length > 0) {
    const hasAttachment = externalEmail.some(e => e.has_attachment || e.docs_viewed > 0);
    return {
      agent: "email_agent",
      rule_id: "email_exfil_risk",
      triggered: true,
      severity: hasAttachment ? "high" : "medium",
      confidence: hasAttachment ? 0.83 : 0.65,
      evidence: externalEmail.slice(0, 3).map(e =>
        `Email to external recipient: ${e.recipient || "unknown"}, attachment: ${e.has_attachment || false}`
      ),
      event_ids: pickEventIds(externalEmail),
      notes: hasAttachment ? "External email with attachments" : "External email without confirmed attachment"
    };
  }

  if (emailEvents.length > 0) {
    return {
      agent: "email_agent",
      rule_id: "email_exfil_risk",
      triggered: true,
      severity: "low",
      confidence: 0.4,
      evidence: emailEvents.slice(0, 2).map(e => `Email event: ${e.action_type}`),
      event_ids: pickEventIds(emailEvents),
      notes: "Email activity detected, no confirmed external recipients"
    };
  }

  return {
    agent: "email_agent",
    rule_id: "email_exfil_risk",
    triggered: false,
    severity: "none",
    confidence: 0.9,
    evidence: [],
    event_ids: [],
    notes: "No suspicious email activity"
  };
}

// --- memory_agent ---
function runMemoryAgent(agentInput) {
  const memoryMatches = agentInput.memory_matches || [];

  if (memoryMatches.length === 0) {
    return {
      agent: "memory_agent",
      rule_id: "violation_memory_risk",
      triggered: false,
      severity: "none",
      confidence: 0.9,
      evidence: [],
      event_ids: [],
      notes: "No memory matches found"
    };
  }

  const highSim = memoryMatches.filter(m => (m.similarity || 0) >= 0.8);
  const midSim = memoryMatches.filter(m => (m.similarity || 0) >= 0.6 && (m.similarity || 0) < 0.8);

  const topMatch = memoryMatches[0];
  const evidenceEvents = (agentInput.events || []).slice(0, 3);

  if (highSim.length > 0) {
    return {
      agent: "memory_agent",
      rule_id: "violation_memory_risk",
      triggered: true,
      severity: "high",
      confidence: Math.min(0.95, highSim[0].similarity || 0.8),
      evidence: highSim.slice(0, 2).map(m => `High-similarity violation match: ${m.match_id || "unknown"} (sim=${m.similarity?.toFixed(2)})`),
      event_ids: pickEventIds(evidenceEvents),
      notes: "Strong prior violation pattern match"
    };
  }

  if (midSim.length > 0) {
    return {
      agent: "memory_agent",
      rule_id: "violation_memory_risk",
      triggered: true,
      severity: "medium",
      confidence: midSim[0].similarity || 0.65,
      evidence: midSim.slice(0, 2).map(m => `Partial violation match: ${m.match_id || "unknown"} (sim=${m.similarity?.toFixed(2)})`),
      event_ids: pickEventIds(evidenceEvents),
      notes: "Partial prior violation pattern match"
    };
  }

  return {
    agent: "memory_agent",
    rule_id: "violation_memory_risk",
    triggered: true,
    severity: "low",
    confidence: topMatch.similarity || 0.4,
    evidence: [`Loose violation match: ${topMatch.match_id || "unknown"}`],
    event_ids: pickEventIds(evidenceEvents),
    notes: "Weak prior violation pattern match"
  };
}

// --- context_exception_agent ---
function runContextExceptionAgent(agentInput) {
  const events = agentInput.events || [];
  const approvedExceptions = events.filter(e => e.approved_exception === true);
  const hasApprovedContext = events.some(e =>
    e.operation_phase === "Maintenance" ||
    e.operation_phase === "Training" ||
    e.mission_justification != null
  );

  if (approvedExceptions.length > 0 || hasApprovedContext) {
    return {
      agent: "context_exception_agent",
      rule_id: "context_exception_check",
      triggered: true,
      severity: "none",
      confidence: 0.85,
      evidence: [
        approvedExceptions.length > 0 ? `${approvedExceptions.length} approved exception event(s) present` : null,
        hasApprovedContext ? "Legitimate operation phase or mission justification found" : null
      ].filter(Boolean),
      event_ids: pickEventIds([...approvedExceptions, ...events].slice(0, 3)),
      notes: "Legitimate business context found — suppression/downgrade signal"
    };
  }

  return {
    agent: "context_exception_agent",
    rule_id: "context_exception_check",
    triggered: false,
    severity: "none",
    confidence: 0.7,
    evidence: [],
    event_ids: [],
    notes: "No legitimate exception context found"
  };
}

// --- case_flow_agent ---
function runCaseFlowAgent(agentInput) {
  const events = agentInput.events || [];
  const actionTypes = events.map(e => e.action_type || "");

  const hasLogon = actionTypes.some(t => ["logon", "off_hours_or_unusual_access", "authentication"].includes(t));
  const hasUsb = actionTypes.some(t => ["removable_media_use", "removable_media_connect", "usb_connect"].includes(t));
  const hasFile = actionTypes.some(t => ["file_access", "file_download", "bulk_file_access"].includes(t));
  const hasWeb = actionTypes.some(t => ["web_upload", "web_exfiltration", "wikileaks_visit", "external_upload"].includes(t));
  const hasEmail = actionTypes.some(t => ["email_send", "email_exfiltration", "external_email"].includes(t));

  const chainSteps = [hasLogon, hasUsb || hasFile, hasWeb || hasEmail].filter(Boolean).length;
  const fullChain = hasLogon && (hasUsb || hasFile) && (hasWeb || hasEmail);

  if (fullChain) {
    const chainDesc = [
      hasLogon ? "logon" : null,
      hasUsb ? "usb_connect" : null,
      hasFile ? "file_access" : null,
      hasWeb ? "web_exfil" : null,
      hasEmail ? "email_exfil" : null
    ].filter(Boolean).join(" -> ");

    return {
      agent: "case_flow_agent",
      rule_id: "attack_flow_risk",
      triggered: true,
      severity: "high",
      confidence: 0.88,
      evidence: [`Insider threat kill chain detected: ${chainDesc}`],
      event_ids: pickEventIds(events),
      notes: "Multi-step attack flow identified"
    };
  }

  if (chainSteps >= 2) {
    return {
      agent: "case_flow_agent",
      rule_id: "attack_flow_risk",
      triggered: true,
      severity: "medium",
      confidence: 0.65,
      evidence: [`Partial attack chain: ${chainSteps} of 3 steps present`],
      event_ids: pickEventIds(events),
      notes: "Partial attack flow detected"
    };
  }

  return {
    agent: "case_flow_agent",
    rule_id: "attack_flow_risk",
    triggered: false,
    severity: "none",
    confidence: 0.8,
    evidence: [],
    event_ids: [],
    notes: "No attack flow chain detected"
  };
}

const SPECIALIST_RUNNERS = {
  login_time_agent: runLoginTimeAgent,
  device_ip_agent: runDeviceIpAgent,
  usb_agent: runUsbAgent,
  file_access_agent: runFileAccessAgent,
  web_exfil_agent: runWebExfilAgent,
  email_agent: runEmailAgent,
  memory_agent: runMemoryAgent,
  context_exception_agent: runContextExceptionAgent,
  case_flow_agent: runCaseFlowAgent
};

export function runDeterministicSpecialist(agentName, agentInput) {
  const runner = SPECIALIST_RUNNERS[agentName];
  if (!runner) {
    return makeFailureFinding(agentName, `${agentName}_rule`, `unknown agent: ${agentName}`);
  }
  try {
    return runner(agentInput);
  } catch (err) {
    return makeFailureFinding(agentName, `${agentName}_rule`, err.message);
  }
}

export function runAllDeterministicSpecialists(casePacket, agentInputs) {
  return Object.fromEntries(
    Object.entries(agentInputs).map(([agentName, input]) => [
      agentName,
      runDeterministicSpecialist(agentName, input)
    ])
  );
}

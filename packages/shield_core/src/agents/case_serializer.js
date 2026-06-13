/**
 * Produces per-agent minimal context from a full case packet.
 * Each agent only sees fields relevant to its rule.
 */

const ACTION_TYPE_FILTERS = {
  login_time_agent: new Set([
    "off_hours_or_unusual_access", "logon", "logoff", "authentication",
    "after_hours_logon", "weekend_logon", "unusual_time_logon"
  ]),
  device_ip_agent: new Set([
    "device_change", "ip_change", "unusual_device", "unusual_ip",
    "remote_access", "vpn", "logon", "authentication", "off_hours_or_unusual_access"
  ]),
  usb_agent: new Set([
    "removable_media_use", "removable_media_connect", "usb_connect",
    "device_connect", "file_copy_to_removable"
  ]),
  file_access_agent: new Set([
    "file_access", "file_download", "file_open", "file_copy",
    "file_delete", "bulk_file_access", "sensitive_file_access",
    "download_spike", "file_exfiltration"
  ]),
  web_exfil_agent: new Set([
    "web_upload", "web_browse", "http_upload", "cloud_upload",
    "external_upload", "wikileaks_visit", "job_search", "web_exfiltration"
  ]),
  email_agent: new Set([
    "email_send", "email_forward", "email_attachment",
    "personal_email", "external_email", "email_exfiltration"
  ]),
  memory_agent: new Set([]), // uses all events for memory matching
  context_exception_agent: new Set([]), // uses all events + context
  case_flow_agent: new Set([]) // uses all events for flow analysis
};

function filterEventsForAgent(agentName, events) {
  const allowedTypes = ACTION_TYPE_FILTERS[agentName];
  if (!allowedTypes || allowedTypes.size === 0) {
    return events;
  }
  const filtered = events.filter(e => allowedTypes.has(e.action_type));
  // always include at least a few events for context even if no match
  return filtered.length > 0 ? filtered : events.slice(0, 5);
}

function stripSensitiveFields(event, index) {
  const { label, methods, predicted, tp, fp, fn, ...safe } = event;
  if (!safe.event_id && !safe.action_id && !safe.id) {
    safe.event_id = `event_${index}`;
  }
  return safe;
}

export function serializeCaseForAgent(agentName, casePacket, userProfiles = {}) {
  const userProfile = userProfiles[casePacket.user_id] || {};
  const relevantEvents = filterEventsForAgent(agentName, casePacket.events || []);
  const safeEvents = relevantEvents.map(stripSensitiveFields);

  return {
    case_id: casePacket.case_id,
    user_id: casePacket.user_id,
    events: safeEvents,
    user_profile: stripProfileForAgent(agentName, userProfile),
    memory_matches: agentName === "memory_agent" ? (casePacket.memory_matches || []) : [],
    allowed_context: casePacket.allowed_context || {
      train_release: "r4.2",
      test_release: "r5.2",
      scenarios: [1, 2, 4]
    }
  };
}

function stripProfileForAgent(agentName, profile) {
  if (!profile || typeof profile !== "object") return {};

  const base = {
    common_device: profile.common_device,
    common_ip: profile.common_ip,
    typical_hours: profile.typical_hours || profile.active_hours,
    active_hours: profile.active_hours,
    typical_days: profile.typical_days,
    role: profile.role,
    department: profile.department,
    common_action: profile.common_action
  };

  if (agentName === "login_time_agent") {
    return { ...base, login_hour_distribution: profile.login_hour_distribution };
  }
  if (agentName === "device_ip_agent") {
    return { ...base, known_devices: profile.known_devices, known_ips: profile.known_ips };
  }
  if (agentName === "file_access_agent") {
    return {
      ...base,
      avg_downloads_per_session: profile.avg_downloads_per_session || profile.avg_downloads,
      avg_downloads: profile.avg_downloads,
      avg_docs_viewed: profile.avg_docs_viewed
    };
  }

  return base;
}

export function serializeAllAgents(casePacket, userProfiles = {}, agentNames) {
  return Object.fromEntries(
    agentNames.map(name => [name, serializeCaseForAgent(name, casePacket, userProfiles)])
  );
}

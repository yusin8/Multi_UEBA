import { stableHash, SAMPLING_SEED } from "./agent_schema.js";

const FORBIDDEN_FIELDS = new Set(["label", "methods", "predicted", "tp", "fp", "fn"]);
const WINDOW_MS = 12 * 60 * 60 * 1000;

function stripForbidden(event) {
  const out = {};
  for (const [k, v] of Object.entries(event)) {
    if (!FORBIDDEN_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function eventLabel(event) {
  return event.label ?? 0;
}

function attackId(event) {
  return event.attack_id || null;
}

function flowId(event) {
  return event.flow_id || event.session_id || null;
}

function buildPositiveCases(portalEvents) {
  const byAttackId = new Map();
  const byFlowId = new Map();

  for (const event of portalEvents) {
    if (eventLabel(event) !== 1) continue;

    const aid = attackId(event);
    const fid = flowId(event);

    if (aid) {
      if (!byAttackId.has(aid)) byAttackId.set(aid, []);
      byAttackId.get(aid).push(event);
    } else if (fid) {
      if (!byFlowId.has(fid)) byFlowId.set(fid, []);
      byFlowId.get(fid).push(event);
    }
  }

  const cases = [];

  for (const [aid, events] of byAttackId) {
    cases.push({
      case_id: aid,
      user_id: events[0].user_id,
      case_label: 1,
      scenario: events[0].raw?.scenario ?? null,
      events: events.map(stripForbidden)
    });
  }

  for (const [fid, events] of byFlowId) {
    const caseId = `flow:${fid}`;
    cases.push({
      case_id: caseId,
      user_id: events[0].user_id,
      case_label: 1,
      scenario: events[0].raw?.scenario ?? null,
      events: events.map(stripForbidden)
    });
  }

  return cases;
}

function buildNegativeCases(portalEvents) {
  const byUserWindow = new Map();

  for (const event of portalEvents) {
    if (eventLabel(event) !== 0) continue;

    const userId = event.user_id;
    const ts = new Date(event.ts).getTime();
    const windowStart = Math.floor(ts / WINDOW_MS) * WINDOW_MS;
    const windowKey = `${userId}__${windowStart}`;

    if (!byUserWindow.has(windowKey)) {
      byUserWindow.set(windowKey, {
        user_id: userId,
        window_start: windowStart,
        events: []
      });
    }
    byUserWindow.get(windowKey).events.push(event);
  }

  const cases = [];
  for (const [windowKey, group] of byUserWindow) {
    const windowStartIso = new Date(group.window_start).toISOString();
    const caseId = `normal:${group.user_id}:${windowStartIso}`;
    cases.push({
      case_id: caseId,
      user_id: group.user_id,
      case_label: 0,
      scenario: null,
      events: group.events.map(stripForbidden)
    });
  }

  return cases;
}

export function buildAllCases(rawDataset) {
  const events = rawDataset.portalEvents || [];
  const positive = buildPositiveCases(events);
  const negative = buildNegativeCases(events);
  return { positive, negative };
}

function bucketByScenario(positiveCases) {
  const buckets = { 1: [], 2: [], 4: [], unknown: [] };
  for (const c of positiveCases) {
    const s = c.scenario;
    if (s === 1 || s === 2 || s === 4) buckets[s].push(c);
    else buckets.unknown.push(c);
  }
  return buckets;
}

function sampleBucket(cases, bucketName, n) {
  const sorted = [...cases].sort((a, b) => {
    const ha = stableHash(SAMPLING_SEED, bucketName, a.case_id);
    const hb = stableHash(SAMPLING_SEED, bucketName, b.case_id);
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
  return sorted.slice(0, n);
}

function sampleBucketWithFallback(primary, fallback, bucketName, n) {
  const selected = sampleBucket(primary, bucketName, n);
  if (selected.length >= n) return selected;

  const selectedIds = new Set(selected.map(c => c.case_id));
  const remainingFallback = fallback.filter(c => !selectedIds.has(c.case_id));
  return [
    ...selected,
    ...sampleBucket(remainingFallback, `${bucketName}_fallback`, n - selected.length)
  ];
}

export function buildSmokeDataset(positive, negative) {
  const scenarioBuckets = bucketByScenario(positive);
  const hardNeg = negative.filter(c => c.events.some(isHardNegativeEvent));
  const hardNegIds = new Set(hardNeg.map(c => c.case_id));
  const approvedExc = negative.filter(c =>
    !hardNegIds.has(c.case_id) &&
    c.events.some(e => e.approved_exception === true)
  );
  const approvedExcIds = new Set(approvedExc.map(c => c.case_id));
  const n0Normal = negative.filter(c => !hardNegIds.has(c.case_id) && !approvedExcIds.has(c.case_id));

  return [
    ...sampleBucket(scenarioBuckets[1], "s1_smoke", 5),
    ...sampleBucket(scenarioBuckets[2], "s2_smoke", 5),
    ...sampleBucket(scenarioBuckets[4], "s4_smoke", 5),
    ...sampleBucket(n0Normal, "n0_smoke", 5),
    ...sampleBucketWithFallback(hardNeg, n0Normal, "n4_smoke", 5),
    ...sampleBucketWithFallback(approvedExc, n0Normal, "n5_smoke", 5)
  ];
}

export function buildStabilityDataset(positive, negative) {
  const scenarioBuckets = bucketByScenario(positive);
  const hardNeg = negative.filter(c => c.events.some(isHardNegativeEvent));
  const hardNegIds = new Set(hardNeg.map(c => c.case_id));
  const approvedExc = negative.filter(c =>
    !hardNegIds.has(c.case_id) &&
    c.events.some(e => e.approved_exception === true)
  );
  const approvedExcIds = new Set(approvedExc.map(c => c.case_id));
  const n0Normal = negative.filter(c => !hardNegIds.has(c.case_id) && !approvedExcIds.has(c.case_id));

  return [
    ...sampleBucket(scenarioBuckets[1], "s1_stability", 10),
    ...sampleBucket(scenarioBuckets[2], "s2_stability", 10),
    ...sampleBucket(scenarioBuckets[4], "s4_stability", 10),
    ...sampleBucket(n0Normal, "n0_stability", 10),
    ...sampleBucketWithFallback(hardNeg, n0Normal, "n4_stability", 10),
    ...sampleBucketWithFallback(approvedExc, n0Normal, "n5_stability", 10)
  ];
}

export function buildFullEvalDataset(positive, negative) {
  return [...positive, ...negative];
}

function isHardNegativeEvent(event) {
  return (
    event.event_type === "N4" ||
    event.source === "benign_admin_hard_negative" ||
    event.action_type === "benign_admin_hard_negative"
  );
}

export function buildCaseLabels(cases) {
  const labels = {};
  for (const c of cases) {
    labels[c.case_id] = c.case_label;
  }
  return labels;
}

export function buildDatasetManifest({ smoke, stability, fullEval, labels, outDir, seed }) {
  return {
    generated_at: new Date().toISOString(),
    seed,
    out_dir: outDir,
    files: {
      dev_smoke_cases: "dev_smoke_cases.json",
      stability_cases: "stability_cases.json",
      full_eval_cases: "full_eval_cases.json",
      case_labels: "case_labels.json"
    },
    counts: {
      smoke: smoke.length,
      stability: stability.length,
      full_eval: fullEval.length,
      labels: Object.keys(labels).length
    },
    positive_in_smoke: smoke.filter(c => c.case_label === 1).length,
    negative_in_smoke: smoke.filter(c => c.case_label === 0).length,
    positive_in_stability: stability.filter(c => c.case_label === 1).length,
    negative_in_stability: stability.filter(c => c.case_label === 0).length,
    positive_in_full_eval: fullEval.filter(c => c.case_label === 1).length,
    negative_in_full_eval: fullEval.filter(c => c.case_label === 0).length
  };
}

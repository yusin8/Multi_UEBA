import { makeFailureFinding, validateFinding, AGENT_DEFINITIONS } from "./agent_schema.js";
import { serializeCaseForAgent } from "./case_serializer.js";
import { runDeterministicSpecialist } from "./deterministic_specialists.js";
import { runSupervisor } from "./supervisor.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function withTimeout(promise, ms, agentName) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`agent_timeout:${agentName}`)), ms)
    )
  ]);
}

async function runSingleAgent(agentName, ruleId, agentInput, runnerFn, timeoutMs) {
  try {
    const raw = await withTimeout(
      Promise.resolve(runnerFn(agentName, agentInput)),
      timeoutMs,
      agentName
    );
    const { ok, error, finding } = validateFinding(raw);
    if (!ok) {
      return makeFailureFinding(agentName, ruleId, `schema_validation: ${error}`);
    }
    return finding;
  } catch (err) {
    const reason = err.message.startsWith("agent_timeout") ? "timeout" : err.message;
    return makeFailureFinding(agentName, ruleId, reason);
  }
}

/**
 * Runs all specialist agents in parallel using Promise.allSettled.
 * If one agent fails, the rest continue and a failure finding is produced.
 */
export async function runParallelTriage(casePacket, options = {}) {
  const {
    runnerFn = runDeterministicSpecialist,
    userProfiles = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    agentDefinitions = AGENT_DEFINITIONS
  } = options;

  const agentTasks = agentDefinitions.map(({ name, rule_id }) => {
    const agentInput = serializeCaseForAgent(name, casePacket, userProfiles);
    return runSingleAgent(name, rule_id, agentInput, runnerFn, timeoutMs);
  });

  const settled = await Promise.allSettled(agentTasks);

  const findings = settled.map((result, i) => {
    const { name, rule_id } = agentDefinitions[i];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return makeFailureFinding(name, rule_id, result.reason?.message || "unknown");
  });

  const triageResult = runSupervisor(casePacket.case_id, findings);

  return {
    ...triageResult,
    agent_count: agentDefinitions.length,
    failure_count: findings.filter(f => f.notes === "failure finding").length
  };
}

/**
 * Runs multiple cases in parallel with controlled concurrency.
 */
export async function runBatchTriage(casePackets, options = {}) {
  const concurrency = options.concurrency ?? 8;
  const results = [];

  for (let i = 0; i < casePackets.length; i += concurrency) {
    const batch = casePackets.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(cp => runParallelTriage(cp, options))
    );
    results.push(...batchResults);
  }

  return results;
}

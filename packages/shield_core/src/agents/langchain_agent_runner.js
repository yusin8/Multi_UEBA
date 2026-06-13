/**
 * LangChain-based specialist agent runner.
 * Uses structured output via withStructuredOutput.
 * Falls back to failure finding on parse errors with 1 repair retry.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getSystemPrompt, getPromptVersion } from "./specialist_prompts.js";
import { AGENT_DEFINITIONS, makeFailureFinding, validateFinding, hashCasePacket } from "./agent_schema.js";

const DEFAULT_CACHE_DIR = path.resolve("out/multi_agent_triage/cache/findings");
const FINDING_JSON_SCHEMA = {
  type: "object",
  properties: {
    agent: { type: "string" },
    rule_id: { type: "string" },
    triggered: { type: "boolean" },
    severity: { type: "string", enum: ["none", "low", "medium", "high"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: { type: "string" } },
    event_ids: { type: "array", items: { type: "string" } },
    notes: { type: "string" }
  },
  required: ["agent", "rule_id", "triggered", "severity", "confidence", "evidence", "event_ids"]
};

function buildCacheKey(modelName, agentName, promptVersion, casePacketHash) {
  const raw = `${modelName}:${agentName}:${promptVersion}:${casePacketHash}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

async function readCache(cacheDir, cacheKey) {
  try {
    const filePath = path.join(cacheDir, `${cacheKey}.json`);
    const data = JSON.parse(await fs.readFile(filePath, "utf-8"));
    return { hit: true, data };
  } catch {
    return { hit: false, data: null };
  }
}

async function writeCache(cacheDir, cacheKey, data) {
  await fs.mkdir(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `${cacheKey}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function buildUserMessage(agentInput) {
  return `Case ID: ${agentInput.case_id}
User ID: ${agentInput.user_id}

Events:
${JSON.stringify(agentInput.events, null, 2)}

User Profile:
${JSON.stringify(agentInput.user_profile, null, 2)}

Memory Matches:
${JSON.stringify(agentInput.memory_matches, null, 2)}

Allowed Context:
${JSON.stringify(agentInput.allowed_context, null, 2)}

Return your finding as JSON only.`;
}

async function attemptLLMCall(llm, systemPrompt, userMessage) {
  const { HumanMessage, SystemMessage } = await import("@langchain/core/messages");
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage)
  ]);

  // Extract text content
  const content = typeof response.content === "string"
    ? response.content
    : response.content?.[0]?.text || JSON.stringify(response);

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("no_json_in_response");
  return JSON.parse(jsonMatch[0]);
}

export async function runLangChainAgent(agentName, ruleId, agentInput, options = {}) {
  const {
    modelName = process.env.SHIELD_AGENT_MODEL || "gpt-4.1-mini",
    provider = process.env.SHIELD_AGENT_PROVIDER || "openai",
    temperature = Number(process.env.SHIELD_AGENT_TEMPERATURE ?? 0),
    cacheDir = DEFAULT_CACHE_DIR,
    useCache = true
  } = options;

  const systemPrompt = getSystemPrompt(agentName);
  if (!systemPrompt) {
    return makeFailureFinding(agentName, ruleId, `no_prompt_for_agent: ${agentName}`);
  }

  const promptVersion = getPromptVersion(agentName);
  const caseHash = hashCasePacket(agentInput);
  const cacheKey = buildCacheKey(modelName, agentName, promptVersion, caseHash);

  if (useCache) {
    const cached = await readCache(cacheDir, cacheKey);
    if (cached.hit) {
      return { ...cached.data, _cache_hit: true };
    }
  }

  let llm;
  try {
    if (provider === "openai") {
      const { ChatOpenAI } = await import("@langchain/openai");
      llm = new ChatOpenAI({ model: modelName, temperature });
    } else {
      throw new Error(`unsupported_provider: ${provider}`);
    }
  } catch (err) {
    return makeFailureFinding(agentName, ruleId, `llm_init_failed: ${err.message}`);
  }

  const userMessage = buildUserMessage(agentInput);

  let raw;
  try {
    raw = await attemptLLMCall(llm, systemPrompt, userMessage);
  } catch (err) {
    // 1 repair retry
    try {
      const repairPrompt = `${systemPrompt}\n\nIMPORTANT: You must return ONLY valid JSON. No markdown, no code blocks, just raw JSON.`;
      raw = await attemptLLMCall(llm, repairPrompt, userMessage);
    } catch (retryErr) {
      return makeFailureFinding(agentName, ruleId, `parse_error_after_retry: ${retryErr.message}`);
    }
  }

  const { ok, error, finding } = validateFinding(raw);
  if (!ok) {
    return makeFailureFinding(agentName, ruleId, `schema_validation: ${error}`);
  }

  const result = {
    ...finding,
    agent: agentName,
    rule_id: ruleId,
    _model: modelName,
    _prompt_version: promptVersion,
    _cache_key: cacheKey,
    _cache_hit: false,
    _created_at: new Date().toISOString()
  };

  if (useCache) {
    await writeCache(cacheDir, cacheKey, result);
  }

  return result;
}

/**
 * Mock model runner for testing — returns deterministic findings without LLM calls.
 */
export function createMockRunner(mockFindings = {}) {
  return async function mockRunnerFn(agentName, agentInput) {
    if (mockFindings[agentName]) {
      return typeof mockFindings[agentName] === "function"
        ? mockFindings[agentName](agentInput)
        : mockFindings[agentName];
    }
    // Default mock: return not-triggered finding
    return {
      agent: agentName,
      rule_id: `${agentName}_rule`,
      triggered: false,
      severity: "none",
      confidence: 0.5,
      evidence: ["mock_finding: no real LLM called"],
      event_ids: [],
      notes: "mock finding"
    };
  };
}

/**
 * Async runner adapter for LangChain agents (used in parallel_triage as runnerFn).
 */
export function createLangChainRunner(options = {}) {
  const ruleIdsByAgent = new Map(AGENT_DEFINITIONS.map(({ name, rule_id }) => [name, rule_id]));
  return async function langChainRunnerFn(agentName, agentInput) {
    const ruleId = ruleIdsByAgent.get(agentName) || agentInput.rule_id || `${agentName}_rule`;
    return runLangChainAgent(agentName, ruleId, agentInput, options);
  };
}

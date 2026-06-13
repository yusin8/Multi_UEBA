import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_CANDIDATES = [
  "/home/ys/workspace/.env",
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), ".env")
];

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const separator = normalized.indexOf("=");
  if (separator <= 0) return null;

  const key = normalized.slice(0, separator).trim();
  let value = normalized.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
}

function resolveEnvFile(envFile) {
  if (envFile) return path.resolve(envFile);
  if (process.env.SHIELD_AGENT_ENV_FILE) return path.resolve(process.env.SHIELD_AGENT_ENV_FILE);
  return DEFAULT_ENV_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

export function loadShieldAgentEnv(options = {}) {
  const envPath = resolveEnvFile(options.envFile);
  const loadedKeys = [];

  if (envPath && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loadedKeys.push(key);
      }
    }
  }

  if (!process.env.OPENAI_API_KEY && process.env.OPEN_AI_KEY) {
    process.env.OPENAI_API_KEY = process.env.OPEN_AI_KEY;
    loadedKeys.push("OPENAI_API_KEY");
  }

  process.env.SHIELD_AGENT_PROVIDER ||= "openai";
  process.env.SHIELD_AGENT_MODEL ||= "gpt-4.1-mini";
  process.env.SHIELD_AGENT_TEMPERATURE ||= "0";
  process.env.LANGSMITH_TRACING ||= "true";

  return {
    env_path: envPath,
    loaded_keys: loadedKeys,
    provider: process.env.SHIELD_AGENT_PROVIDER,
    model: process.env.SHIELD_AGENT_MODEL,
    langsmith_tracing: process.env.LANGSMITH_TRACING
  };
}

export function requireOpenAiKeyForAgents() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Put it in /home/ys/workspace/.env, set SHIELD_AGENT_ENV_FILE, or export it before running multi-agent mode."
    );
  }
}

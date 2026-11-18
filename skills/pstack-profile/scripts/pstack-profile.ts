import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const adapter = new URL("../../pstack-omp/SKILL.md", import.meta.url);
const overrideKey = "task.agentModelOverrides";
const headers = [
  "# pstack model configuration. One line per role. A role with no line runs on its default agent's override.",
  "# Each line runs on the agent the pstack-omp Model routing section names. /setup-pstack writes that agent's task.agentModelOverrides entry.",
];
const agentName = /^[A-Za-z0-9_.-]+$/;
const modelSpec = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._@/+\-]*:[a-z][a-z0-9-]*$/i;
const profileName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type ModelSetup = {
  budget: string;
  roles: string[];
  overrides: Map<string, string>;
};

function readRouting() {
  const markdown = readFileSync(adapter, "utf8");
  const section = markdown.split(/^## Model routing\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const routing = new Map(
    Array.from(section.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/gm), ([, label, agent]) => [label, agent]),
  );
  if (routing.size === 0) throw new Error(`${adapter.pathname}: no Model routing rows found`);
  return routing;
}

function parseSetup(text: string, source: string, routing: Map<string, string>, allowAgents: boolean): ModelSetup {
  let budget = "";
  const roles: string[] = [];
  const overrides = new Map<string, string>();
  const locations = new Map<string, number>();

  const fail = (line: number, reason: string): never => {
    throw new Error(`${source}:${line}: ${reason}`);
  };
  const assign = (agent: string, value: string, line: number) => {
    if (!modelSpec.test(value)) fail(line, `${agent} needs a concrete provider/model:level, got ${JSON.stringify(value)}`);
    const previous = overrides.get(agent);
    if (previous !== undefined && previous !== value) {
      fail(line, `${agent} maps to ${value}, but line ${locations.get(agent)} maps it to ${previous}`);
    }
    overrides.set(agent, value);
    locations.set(agent, line);
  };

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const entry = raw.trim();
    if (entry.startsWith("# budget:")) {
      if (!/^# budget: [a-z]+ \([a-z]+\)$/.test(entry)) fail(line, "expected # budget: <label> (<level>)");
      if (budget) fail(line, "duplicate budget line");
      budget = entry;
      continue;
    }
    if (!entry || entry.startsWith("#")) continue;

    const colon = entry.indexOf(":");
    if (colon === -1) fail(line, "expected a role or agent followed by :");
    const label = entry.slice(0, colon).trimEnd();
    const value = entry.slice(colon + 1).trim();
    const agent = routing.get(label);
    if (agent === undefined) {
      const name = label.slice("agent ".length);
      if (!allowAgents || !label.startsWith("agent ") || !agentName.test(name)) fail(line, `unknown role ${JSON.stringify(label)}`);
      assign(name, value, line);
      continue;
    }
    if (agent.includes("<N>")) {
      const values = value.split(",").map((model) => model.trim());
      if (values.length > 3) fail(line, `${label} has more than three entries`);
      values.forEach((model, seat) => assign(agent.replace("<N>", String(seat + 1)), model, line));
    } else {
      assign(agent, value, line);
    }
    roles.push(entry);
  }
  if (!budget) fail(1, "missing budget line");
  return { budget, roles, overrides };
}

function omp(...args: string[]) {
  const command = process.env.PSTACK_OMP_BIN ?? "omp";
  const result = Bun.spawnSync([command, "config", ...args]);
  if (result.exitCode !== 0) {
    const message = result.stderr.toString().trim() || result.stdout.toString().trim();
    throw new Error(`${command} config ${args[0]} failed: ${message || result.exitCode}`);
  }
  return result.stdout.toString();
}

function readOverrides() {
  const output: unknown = JSON.parse(omp("get", overrideKey, "--json"));
  if (typeof output !== "object" || output === null || !("value" in output) || output.value === null ||
      typeof output.value !== "object" || Array.isArray(output.value)) {
    throw new Error(`omp config get did not return a record for ${overrideKey}`);
  }
  const overrides = new Map<string, string>();
  for (const [agent, model] of Object.entries(output.value)) {
    if (typeof model !== "string") throw new Error(`${overrideKey}.${agent} is not a string`);
    overrides.set(agent, model);
  }
  return overrides;
}

function sameOverrides(left: Map<string, string>, right: Map<string, string>) {
  return left.size === right.size && Array.from(left).every(([agent, model]) => right.get(agent) === model);
}

function readIfPresent<T>(read: () => T) {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

function renderConfig({ budget, roles }: ModelSetup) {
  return [...headers, budget, ...roles, ""].join("\n");
}

function applied(current: Map<string, string>, setup: ModelSetup) {
  const next = new Map(Array.from(current).filter(([agent]) => !/^pstack-(runner|judge)-\d+$/.test(agent)));
  for (const [agent, model] of setup.overrides) next.set(agent, model);
  return next;
}

function main([command, name, ...rest]: string[]) {
  if (rest.length || (command === "list" ? name !== undefined :
    !["save", "use", "diff"].includes(command) || !name || !profileName.test(name))) {
    throw new Error("Usage: pstack-profile list | save <name> | use <name> | diff <name>");
  }

  const config = resolve(process.env.PSTACK_CONFIG ?? ".pstack/config.md");
  const profiles = resolve(process.env.PSTACK_PROFILES_DIR ?? join(dirname(config), "profiles"));
  const routing = readRouting();
  const readSetup = (path: string, allowAgents: boolean) => parseSetup(readFileSync(path, "utf8"), path, routing, allowAgents);

  if (command === "list") {
    const names = (readIfPresent(() => readdirSync(profiles, { withFileTypes: true })) ?? [])
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md"))
      .map((entry) => entry.name.slice(0, -3))
      .filter((profile) => profileName.test(profile))
      .sort();
    if (!names.length) return;
    const currentConfig = readIfPresent(() => readFileSync(config, "utf8"));
    const current = readOverrides();
    for (const profile of names) {
      let active = false;
      try {
        const setup = readSetup(join(profiles, `${profile}.md`), true);
        active = currentConfig === renderConfig(setup) && sameOverrides(current, applied(current, setup));
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
      }
      process.stdout.write(`${profile}${active ? " (current)" : ""}\n`);
    }
    return;
  }

  const path = join(profiles, `${name}.md`);
  if (command === "save") {
    const setup = readSetup(config, false);
    const extras = [];
    for (const [agent, model] of readOverrides()) {
      if (setup.overrides.has(agent)) continue;
      if (!agentName.test(agent) || !modelSpec.test(model)) {
        throw new Error(`${overrideKey}.${agent}: cannot save agent ${agent}: ${model}`);
      }
      extras.push(`agent ${agent}: ${model}`);
    }
    mkdirSync(profiles, { recursive: true });
    writeFileSync(path, [setup.budget, ...setup.roles, ...extras, ""].join("\n"));
    process.stdout.write(`Saved ${path}\n`);
    return;
  }

  const setup = readSetup(path, true);
  const current = readOverrides();
  const next = applied(current, setup);

  if (command === "diff") {
    for (const agent of [...new Set([...current.keys(), ...next.keys()])].sort()) {
      const before = current.get(agent);
      const after = next.get(agent);
      if (before !== after) process.stdout.write(`${agent}: ${before ?? "(unset)"} -> ${after ?? "(unset)"}\n`);
    }
    return;
  }

  const currentConfig = readIfPresent(() => readFileSync(config, "utf8"));
  const nextConfig = renderConfig(setup);
  if (!sameOverrides(current, next)) omp("set", overrideKey, JSON.stringify(Object.fromEntries(next)));
  if (currentConfig !== nextConfig) {
    mkdirSync(dirname(config), { recursive: true });
    writeFileSync(config, nextConfig);
  }
  process.stdout.write(`Applied ${name}. Changes apply to new sessions.\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}

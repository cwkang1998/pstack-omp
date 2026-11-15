import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const agentsRoot = join(root, "agents");
const failures = [];
const rel = (path) => relative(root, path);
const exists = (path) => stat(path).then(() => true, () => false);

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files;
}

function frontmatter(source) {
  const block = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
  const scalar = (key) => block.match(new RegExp(`^${key}:[ \\t]*(\\S.*)$`, "mu"))?.[1];
  const list = (key) =>
    [...(block.match(new RegExp(`^${key}:\\n((?:  - .*\\n?)*)`, "mu"))?.[1] ?? "").matchAll(/^  - "?([^"\n]+)"?$/gmu)].map((m) => m[1]);
  return { scalar, list };
}

const skillDirs = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const skillFiles = await filesUnder(skillsRoot);
const markdownFiles = [...skillFiles, ...(await filesUnder(agentsRoot)), join(root, "README.md")].filter((path) => path.endsWith(".md"));

for (const name of skillDirs) {
  const path = join(skillsRoot, name, "SKILL.md");
  if (!(await exists(path))) {
    failures.push(`${rel(path)} is missing`);
    continue;
  }
  const meta = frontmatter(await readFile(path, "utf8"));
  if (meta.scalar("name") !== name) failures.push(`${rel(path)} frontmatter name is not ${name}`);
  if (!meta.scalar("description")) failures.push(`${rel(path)} has no description`);
}

for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  const prose = source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gmu, "");
  for (const [, link] of prose.matchAll(/\]\(([^)#][^)]*)\)/gu)) {
    const target = link.split("#", 1)[0];
    if (target === "" || /^[a-z]+[0-9]*$/u.test(target) || /^(https?|skill):\/\//u.test(target)) continue;
    if (!(await exists(resolve(path, "..", target)))) failures.push(`${rel(path)} links to missing ${target}`);
  }
  for (const [, name, subpath] of source.matchAll(/skill:\/\/([a-z0-9-]+)((?:\/[A-Za-z0-9._-]+)*)(?![A-Za-z0-9._<-])/gu)) {
    if (!skillDirs.includes(name)) failures.push(`${rel(path)} refers to missing skill://${name}`);
    else if (subpath && !(await exists(join(skillsRoot, name, subpath)))) failures.push(`${rel(path)} refers to missing skill://${name}${subpath}`);
  }
  for (const [, name, principle] of source.matchAll(/\*\*([a-z0-9-]+)\*\* (principle )?skill/gu)) {
    const skill = principle && !name.startsWith("principle-") ? `principle-${name}` : name;
    if (!skillDirs.includes(skill)) failures.push(`${rel(path)} names missing skill ${skill}`);
  }
}

for (const path of skillFiles) {
  if (/^(<{7}|>{7}) /mu.test(await readFile(path, "utf8"))) failures.push(`${rel(path)} contains merge conflict markers`);
}

for (const entry of await readdir(root)) {
  if (!entry.endsWith(".json")) continue;
  try {
    JSON.parse(await readFile(join(root, entry), "utf8"));
  } catch {
    failures.push(`${entry} is not valid JSON`);
  }
}

const shippedAgents = new Map();
for (const entry of await readdir(agentsRoot)) {
  if (!entry.endsWith(".md")) continue;
  const path = join(agentsRoot, entry);
  const meta = frontmatter(await readFile(path, "utf8"));
  const name = entry.slice(0, -3);
  if (meta.scalar("name") !== name) failures.push(`${rel(path)} frontmatter name is not ${name}`);
  if (!meta.scalar("description")) failures.push(`${rel(path)} has no description`);
  if (meta.list("model").length === 0) failures.push(`${rel(path)} has no model`);
  shippedAgents.set(name, { path, models: meta.list("model") });
}

// The adapter's role map, roster, and Model routing table, and the config shape setup-pstack writes,
// describe one routing contract. These checks keep them consistent with each other and with agents/.
const adapterPath = join(skillsRoot, "pstack-omp", "SKILL.md");
const adapter = await readFile(adapterPath, "utf8");
const setupPath = join(skillsRoot, "setup-pstack", "SKILL.md");
const roster = new Set(adapter.match(/roster is closed:\n\n```text\n([\s\S]*?)\n```/u)?.[1].split("\n") ?? []);
const roleAgents = new Set([...adapter.matchAll(/^\| `[a-z]+` \| `([a-z-]+)` \|/gmu)].map((m) => m[1]));
const routing = new Map([...adapter.matchAll(/^\| `([a-z ,-]+)` \| `([a-z<>N-]+)` \|$/gmu)].map((m) => [m[1], m[2]]));
const configShape = (await readFile(setupPath, "utf8")).match(/^```\n# pstack model configuration[\s\S]*?\n```/mu)?.[0] ?? "";
const configLines = new Map([...configShape.matchAll(/^([a-z][a-z ,-]*): (.+)$/gmu)].map((m) => [m[1], m[2].split(",").length]));

if (roster.size === 0) failures.push(`${rel(adapterPath)} has no agent roster`);
if (configLines.size === 0) failures.push(`${rel(setupPath)} has no config shape`);
for (const line of configLines.keys()) {
  if (!routing.has(line)) failures.push(`${rel(adapterPath)} has no Model routing row for the ${line} line`);
}
const routedAgents = new Set(roleAgents);
for (const [line, agent] of routing) {
  if (!configLines.has(line)) {
    failures.push(`${rel(adapterPath)} routes ${line}, which ${rel(setupPath)} does not write`);
    continue;
  }
  const seats = agent.includes("<N>") ? configLines.get(line) : 1;
  for (let seat = 1; seat <= seats; seat++) routedAgents.add(agent.replace("<N>", String(seat)));
}
for (const agent of routedAgents) {
  if (!roster.has(agent)) failures.push(`${rel(adapterPath)} routes to ${agent}, which is not in its roster`);
}
for (const [name, agent] of shippedAgents) {
  // An agent that exists only to carry a config line must have no model but its override, or it could
  // run on another model when the override is missing.
  if (!routedAgents.has(name) || roleAgents.has(name)) continue;
  if (agent.models.length !== 1 || agent.models[0] !== `@${name}`) {
    failures.push(`${rel(agent.path)} must name only @${name} as its model`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`verified ${skillDirs.length} skill directories and ${markdownFiles.length} markdown files`);
}

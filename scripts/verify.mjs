import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const skillsRoot = join(root, "skills");
const requiredSkills = new Set([
  "architect",
  "arena",
  "automate-me",
  "blast-radius",
  "bro",
  "create-verification-skill",
  "figure-it-out",
  "how",
  "interrogate",
  "maintain-verification-skill",
  "no-comments",
  "poteto-mode",
  "pstack-omp",
  "recall",
  "reflect",
  "setup-pstack",
  "show-me-your-work",
  "swarm",
  "tdd",
  "teach",
  "technical-writing",
  "typescript-best-practices",
  "unslop",
  "why",
  "reproduce-and-fix-issues",
  "setup-benny",
  "triage-issue-reports",
  "principle-boundary-discipline",
  "principle-build-the-lever",
  "principle-encode-lessons-in-structure",
  "principle-exhaust-the-design-space",
  "principle-experience-first",
  "principle-fix-root-causes",
  "principle-foundational-thinking",
  "principle-guard-the-context-window",
  "principle-laziness-protocol",
  "principle-make-operations-idempotent",
  "principle-migrate-callers-then-delete-legacy-apis",
  "principle-minimize-reader-load",
  "principle-model-the-domain",
  "principle-never-block-on-the-human",
  "principle-outcome-oriented-execution",
  "principle-prove-it-works",
  "principle-redesign-from-first-principles",
  "principle-separate-before-serializing-shared-state",
  "principle-sequence-verifiable-units",
  "principle-subtract-before-you-add",
  "principle-type-system-discipline",
  "rust-best-practices",
  "ketchup",
  "sharpen",
  "in-your-own-words",
]);

const failures = [];
const skillDirs = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const name of requiredSkills) {
  const path = join(skillsRoot, name, "SKILL.md");
  try {
    const source = await readFile(path, "utf8");
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
    if (!/^name:\s*\S+/mu.test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter name`);
    }
    if (!/^description:\s*\S+/mu.test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter description`);
    }
  } catch {
    failures.push(`missing ${relative(root, path)}`);
  }
}

const markdownFiles = [];
const collect = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith(".md")) markdownFiles.push(path);
  }
};
await collect(skillsRoot);

for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(/\]\(([^)#][^)]*)\)/gu)) {
    const target = match[1].split("#", 1)[0];
    if (target === "" || /^[a-z]+[0-9]*$/u.test(target)) continue;
    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("skill://")
    ) continue;
    const targetPath = resolve(path, "..", target);
    try {
      await stat(targetPath);
    } catch {
      failures.push(`${relative(root, path)} references missing ${target}`);
    }
  }
}

for (const path of [
  join(root, "package.json"),
  join(root, "upstream.lock.json"),
]) {
  try {
    JSON.parse(await readFile(path, "utf8"));
  } catch {
    failures.push(`${relative(root, path)} is not valid JSON`);
  }
}

try {
  const packageManifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  );
  const requiredKeywords = [
    "pstack",
    "agent-skills",
    "coding-agent",
    "omp",
  ];
  if (packageManifest.name !== "pstack-omp") {
    failures.push("package.json does not use the pstack-omp package name");
  }
  if (!packageManifest.omp?.skills?.includes("./skills")) {
    failures.push("package.json does not expose ./skills through the omp manifest");
  }
  if (requiredKeywords.some((keyword) => !packageManifest.keywords?.includes(keyword))) {
    failures.push("package.json is missing discoverability keywords");
  }
  const upstreamLock = JSON.parse(
    await readFile(join(root, "upstream.lock.json"), "utf8")
  );
  if (
    upstreamLock.repository !== "https://github.com/cursor/plugins.git" ||
    upstreamLock.ref !== "main" ||
    !/^[0-9a-f]{40}$/u.test(upstreamLock.commit) ||
    !Array.isArray(upstreamLock.sourceRoots)
  ) {
    failures.push("upstream.lock.json is missing an authoritative pinned source");
  }
} catch {
  // The JSON parse and existence failures above provide the actionable report.
}

const forbidden = [
  "~/.cursor/",
  "~/.agents/skills/",
  ".cursor/skills/",
  ".cursor/plugins/",
  "subagent_type:",
  "AskQuestion",
  "environment: \"cloud\"",
  "claude-fable-5-thinking-max",
  "gpt-5.6-sol-max",
  "grok-4.6-fast-xhigh",
  "claude-opus-5-thinking-xhigh",
];
for (const path of markdownFiles) {
  const source = await readFile(path, "utf8");
  for (const token of forbidden) {
    if (source.includes(token)) {
      failures.push(`${relative(root, path)} contains forbidden runtime binding ${token}`);
    }
  }
}

const skillFiles = [];
const collectAll = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectAll(path);
    else skillFiles.push(path);
  }
};
await collectAll(skillsRoot);
for (const path of skillFiles) {
  if (/^(<{7}|>{7}) /mu.test(await readFile(path, "utf8"))) {
    failures.push(`${relative(root, path)} contains unresolved merge conflict markers`);
  }
}

const ompBundledAgents = new Set(["scout", "reviewer", "security-reviewer", "task", "sonic"]);
const packageAgents = new Set();
for (const entry of await readdir(join(root, "agents"))) {
  if (!entry.endsWith(".md")) continue;
  const path = join(root, "agents", entry);
  const frontmatter = (await readFile(path, "utf8")).match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
  const name = frontmatter.match(/^name:\s*(\S+)/mu)?.[1];
  if (name !== entry.slice(0, -3)) {
    failures.push(`${relative(root, path)} frontmatter name does not match its filename`);
  }
  for (const key of ["description", "model"]) {
    if (!new RegExp(`^${key}:`, "mu").test(frontmatter)) {
      failures.push(`${relative(root, path)} is missing frontmatter ${key}`);
    }
  }
  packageAgents.add(name);
}
const adapterPath = join(skillsRoot, "pstack-omp", "SKILL.md");
const adapter = await readFile(adapterPath, "utf8");
const roster = adapter.match(/The reference roster is closed:\n\n```text\n([\s\S]*?)\n```/u)?.[1];
const mappedAgents = [...adapter.matchAll(/^\| `[a-z]+` \| `([a-z-]+)` \|/gmu)].map((match) => match[1]);
if (!roster) failures.push(`${relative(root, adapterPath)} is missing the closed agent roster`);
for (const agent of new Set([...(roster?.split("\n") ?? []), ...mappedAgents])) {
  if (!ompBundledAgents.has(agent) && !packageAgents.has(agent)) {
    failures.push(`${relative(root, adapterPath)} routes to ${agent}, which is neither OMP-bundled nor shipped in agents/`);
  }
}

const expectedSkillCount = requiredSkills.size;
if (skillDirs.length < expectedSkillCount) {
  failures.push(`expected at least ${expectedSkillCount} skill directories, found ${skillDirs.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`verified ${skillDirs.length} skill directories and ${markdownFiles.length} markdown files`);
}

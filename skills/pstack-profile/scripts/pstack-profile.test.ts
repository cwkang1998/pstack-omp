import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./pstack-profile.ts", import.meta.url));
const sol = "openai-codex/gpt-6.2-sol:xhigh";
const astra = "openai-codex/gpt-6.2-astra:high";
const opus = "anthropic/claude-opus-5-5:high";
const budget = "# budget: large (xhigh)\n";
const headers = `# pstack model configuration. One line per role. A role with no line runs on its default agent's override.
# Each line runs on the agent the pstack-omp Model routing section names. /setup-pstack writes that agent's task.agentModelOverrides entry.
`;
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(roles: string, overrides: string, explicitProfiles = false) {
  const dir = mkdtempSync(join(tmpdir(), "pstack-profile-"));
  dirs.push(dir);
  const config = join(dir, "settings", "models.md");
  const profiles = explicitProfiles ? join(dir, "saved") : join(dirname(config), "profiles");
  const omp = join(dir, "fake omp");
  const overrideFile = join(dir, "overrides.json");
  const source = headers + budget + roles;
  mkdirSync(dirname(config));
  writeFileSync(config, source);
  writeFileSync(overrideFile, overrides);
  writeFileSync(omp, `#!/bin/sh
set -eu
[ "$1" = config ] && [ "$3" = task.agentModelOverrides ]
case "$2" in
  get) [ "$4" = --json ]
       printf '%s' '{"key":"task.agentModelOverrides","type":"record","value":'
       cat "$PSTACK_TEST_OVERRIDES"
       printf '%s\\n' '}' ;;
  set) printf '%s' "$4" > "$PSTACK_TEST_OVERRIDES" ;;
  *) exit 2 ;;
esac
`, { mode: 0o755 });

  const env = { ...process.env, PSTACK_CONFIG: config, PSTACK_OMP_BIN: omp, PSTACK_TEST_OVERRIDES: overrideFile };
  if (explicitProfiles) env.PSTACK_PROFILES_DIR = profiles;
  else delete env.PSTACK_PROFILES_DIR;

  return {
    config,
    overrideFile,
    profile(name: string, contents?: string) {
      const path = join(profiles, `${name}.md`);
      if (contents !== undefined) {
        mkdirSync(profiles, { recursive: true });
        writeFileSync(path, budget + contents);
      }
      return path;
    },
    run(...args: string[]) {
      const result = Bun.spawnSync([process.execPath, script, ...args], { cwd: dir, env });
      return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
    },
  };
}

test("use maps roles and seats, removes old seats, and keeps unrelated agents", () => {
  const state = fixture(`feature, refactoring: ${opus}\n`, JSON.stringify({
    task: opus,
    sonic: astra,
    planner: opus,
    "pstack-runner-2": opus,
    "pstack-runner-3": opus,
    "pstack-judge-3": opus,
  }), true);
  const roles = `feature, refactoring: ${sol}\nbug-fix: ${sol}\nreflect judgment, divergent, synthesizer: ${astra}\n` +
    `arena runners: ${sol}, ${astra}\ninterrogate reviewers: ${sol}, ${astra}\narena cross-judge pool: ${astra}\n`;
  state.profile("gpt", roles + `agent planner: ${sol}\n`);

  const apply = state.run("use", "gpt");

  expect(apply.stderr).toBe("");
  expect(apply.code).toBe(0);
  expect(readFileSync(state.config, "utf8")).toBe(headers + budget + roles);
  expect(JSON.parse(readFileSync(state.overrideFile, "utf8"))).toEqual({
    task: sol,
    sonic: astra,
    planner: sol,
    reviewer: astra,
    "pstack-runner-1": sol,
    "pstack-runner-2": astra,
    "pstack-judge-1": astra,
  });
});

test.each([
  `how explorer: ${sol}\n`,
  `arena runners: ${sol}, ${astra}, ${opus}, ${sol}\n`,
  `feature, refactoring: ${sol}\nbug-fix: ${astra}\n`,
  `feature, refactoring: ${sol}\nagent task: ${astra}\n`,
  `agent task: ${astra}\nfeature, refactoring: ${sol}\n`,
  `arena runners: ${sol}, ${astra}\narchitect runners: ${sol}, ${opus}\n`,
  "hardest tasks: openai-codex/gpt-6.2-sol\n",
  "hardest tasks: inherit-parent\n",
  "agent planner: auto\n",
])("use rejects invalid setup without changing either config: %s", (bad) => {
  const config = `feature, refactoring: ${sol}\n`;
  const overrides = `{"task":"${sol}"}\n`;
  const state = fixture(config, overrides);
  const profile = state.profile("bad", bad);

  const result = state.run("use", "bad");

  const line = bad.trimEnd().split("\n").length + 1;
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain(`${profile}:${line}:`);
  expect(readFileSync(state.config, "utf8")).toBe(headers + budget + config);
  expect(readFileSync(state.overrideFile, "utf8")).toBe(overrides);
});

test("save and use preserve both config files byte for byte", () => {
  const roles = `feature, refactoring: ${sol}\narena runners: ${sol}, ${astra}\n`;
  const overrides = `{
    "planner": "${opus}",
    "pstack-runner-2": "${astra}",
    "task": "${sol}",
    "pstack-runner-1": "${sol}"
}\n`;
  const state = fixture(roles, overrides);

  expect(state.run("save", "a").code).toBe(0);
  expect(readFileSync(state.profile("a"), "utf8")).toBe(budget + roles + `agent planner: ${opus}\n`);
  expect(state.run("use", "a").code).toBe(0);
  expect(readFileSync(state.config, "utf8")).toBe(headers + budget + roles);
  expect(readFileSync(state.overrideFile, "utf8")).toBe(overrides);
});

test("list marks only a profile matching both config and overrides", () => {
  const roles = `feature, refactoring: ${sol}\n`;
  const state = fixture(roles, JSON.stringify({ task: sol, planner: opus }));
  state.profile("a", roles + `agent planner: ${opus}\n`);
  state.profile("b", roles + `agent planner: ${astra}\n`);
  state.profile("c", `bug-fix: ${sol}\nagent planner: ${opus}\n`);

  const result = state.run("list");

  expect(result.code).toBe(0);
  const [a, b, c] = result.stdout.trim().split("\n");
  expect(a.startsWith("a ")).toBe(true);
  expect(b).toBe("b");
  expect(c).toBe("c");
});

test("diff previews changes and seat removals without writing", () => {
  const roles = `feature, refactoring: ${sol}\n`;
  const overrides = JSON.stringify({ task: sol, scout: opus, "pstack-runner-3": astra });
  const state = fixture(roles, overrides);
  state.profile("a", `feature, refactoring: ${astra}\n`);

  const result = state.run("diff", "a");

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("pstack-runner-3");
  expect(result.stdout).toContain("task");
  expect(result.stdout).toContain(sol);
  expect(result.stdout).toContain(astra);
  expect(result.stdout).not.toContain("scout");
  expect(readFileSync(state.config, "utf8")).toBe(headers + budget + roles);
  expect(readFileSync(state.overrideFile, "utf8")).toBe(overrides);
});

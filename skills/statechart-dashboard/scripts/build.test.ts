import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(60_000);

const corpus = join(import.meta.dir, "../../statechart/scripts/test/corpus");
const build = join(import.meta.dir, "build.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "statechart-dashboard-"));
  roots.push(root);
  return root;
}

function copyRun(root: string, name: string) {
  const spec = join(root, name);
  const out = join(spec, "out");
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(join(corpus, name))) {
    if (/\.(tla|cfg)$/.test(file) || file === "view.mjs") cpSync(join(corpus, name, file), join(spec, file));
    if (file === "chart.mmd" || file === "report.md") cpSync(join(corpus, name, file), join(out, file));
  }
  return out;
}

function run(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, build, "--no-open", ...args]);
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

type Embedded = {
  id: string;
  report: string;
  states: Record<string, { label: string; parent: boolean; classes: string[] }>;
  edges: { id: string; from: string; to: string; label: string }[];
  starts: string[];
  rules: { name: string; status: string; detail: string }[];
};

function charts(index: string): Embedded[] {
  const json = readFileSync(index, "utf8").match(/<script type="application\/json" id="dashboard-data">([\s\S]*?)<\/script>/)?.[1];
  return JSON.parse(json ?? "null").charts;
}

const verdicts = (chart: Embedded) => Object.fromEntries(chart.rules.map((r) => [r.name, r.status]));

test("embeds the states, arrows and verdicts of a flat chart and a regions chart", () => {
  const root = scratch();
  const flat = copyRun(root, "CounterRules");
  const regions = copyRun(root, "LoginParallel");
  const page = join(root, "page");

  const result = run("--out", page, flat, regions);

  expect(result.code).toBe(0);
  expect(result.stdout).toContain("Built");
  expect(existsSync(join(flat, "chart.svg"))).toBe(true);
  const [counter, login] = charts(join(page, "index.html"));
  expect(counter.id).toBe("CounterRules");
  expect(Object.fromEntries(Object.entries(counter.states).map(([id, s]) => [id, s.label]))).toEqual({
    s0: "0",
    s1: "1",
    s2: "3",
    s3: "2",
  });
  expect(counter.edges.map((e) => [e.id, e.from, e.to, e.label])).toEqual([
    ["edge1", "s0", "s1", "Step"],
    ["edge2", "s0", "s2", "M!Jump"],
    ["edge3", "s1", "s3", "Step"],
  ]);
  expect(verdicts(counter)).toEqual({ NotThree: "breaks", AtMostTwo: "breaks", NotTwo: "breaks", NoDeadlock: "holds" });
  expect(counter.rules[2].detail).toContain("2. Step: 2");

  expect(Object.keys(login.states)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
  expect(login.states.s6).toMatchObject({ label: "Locked out", parent: false, classes: ["mayBreak", "bugPath"] });
  expect(login.starts).toEqual(["s0", "s3"]);
  expect(login.edges.find((e) => e.from === "s3")).toEqual({ id: "edge6", from: "s3", to: "s4", label: "ThePasswordIsWrong" });
  expect(login.edges).toHaveLength(10);
  expect(verdicts(login)).toEqual({ SignedInWhileLocked: "breaks", TypeOK: "holds", NoDeadlock: "holds" });
});

test("reuses an unchanged page and rebuilds it after report.md changes", () => {
  const root = scratch();
  const folder = copyRun(root, "Login");
  const page = join(root, "page");
  const index = join(page, "index.html");
  expect(run("--out", page, folder).stdout).toContain("Built");
  const built = statSync(index).mtimeMs;

  const again = run("--out", page, folder);

  expect(again.code).toBe(0);
  expect(again.stdout).toContain(`Reused ${index}`);
  expect(statSync(index).mtimeMs).toBe(built);

  appendFileSync(join(folder, "report.md"), "\nEdited after the first build.\n");
  const rebuilt = run("--out", page, folder);

  expect(rebuilt.stdout).toContain(`Built ${index}`);
  expect(charts(index)[0].report).toContain("Edited after the first build.");
});

test("fails without touching the page when report.md is missing or dashboard.json is invalid", () => {
  const root = scratch();
  const folder = copyRun(root, "MediaPlayer");
  const page = join(root, "page");
  const index = join(page, "index.html");
  expect(run("--out", page, folder).code).toBe(0);
  const before = readFileSync(index, "utf8");

  const empty = join(root, "Empty", "out");
  mkdirSync(empty, { recursive: true });
  const missing = run("--out", page, folder, empty);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toStartWith("statechart-dashboard: ");
  expect(missing.stderr).toContain("report.md");
  expect(readFileSync(index, "utf8")).toBe(before);

  for (const [notes, key] of [
    [{ colour: "red" }, "colour"],
    [{ links: "Login" }, "links"],
  ] as const) {
    writeFileSync(join(root, "MediaPlayer", "dashboard.json"), JSON.stringify(notes));
    const invalid = run("--out", page, folder);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain(join(root, "MediaPlayer", "dashboard.json"));
    expect(invalid.stderr).toContain(`"${key}"`);
    expect(readFileSync(index, "utf8")).toBe(before);
  }
});

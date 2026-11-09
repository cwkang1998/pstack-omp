import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE =
  "usage: bun build.ts --out DIR [--title TEXT] [--repo DIR] [--overview FILE.mmd] [--no-open] [--force] FOLDER...";
const scripts = import.meta.dir;
const RENDER = { limit: 1_000_000, outputLimit: 8_000_000, maxEdges: 10_000, responsive: false };
const STYLE = `<style>
.pele {
  --pele-bg: #ffffff;
  --pele-fg: #1c1c1c;
  --pele-muted: #656565;
  --pele-line: #808080;
  --pele-surface: #fcfcfc;
  --pele-surface-alt: #f1f1f1;
  --pele-border: #c9c9c9;
}
.pele .blue rect { fill: #c3e0ff; }
.pele .orange rect { fill: #f0d3bf; }
.pele .purple rect { fill: #e3d5ff; }
.pele .yellow rect { fill: #f0dcbf; }
.pele .teal rect { fill: #bfe3df; }
.pele .tan rect { fill: #e5d9ce; }
.pele .pink rect { fill: #ffcbe6; }
.pele .breaks rect {
  fill: #ffecee !important;
  stroke: #e72e3b !important;
  stroke-width: 2.5px !important;
}
.pele .breaks text {
  fill: #cd2834 !important;
}
.pele .mayBreak rect {
  fill: #fff3e6 !important;
  stroke: #e8730c !important;
  stroke-width: 2.5px !important;
}
.pele .mayBreak text {
  fill: #b85a06 !important;
}
.pele .bugPath rect {
  stroke: #1680f3 !important;
  stroke-width: 2.5px !important;
}
.pele .repeats rect {
  stroke: #9b35d6 !important;
  stroke-width: 2.5px !important;
  stroke-dasharray: 6 3;
}
@media (prefers-color-scheme: dark) {
  .pele {
    --pele-bg: #1f1f1f;
    --pele-fg: #f5f5f5;
    --pele-muted: #acacac;
    --pele-line: #939393;
    --pele-surface: #121212;
    --pele-surface-alt: #2c2c2c;
    --pele-border: #4e4e4e;
  }
  .pele .blue rect { fill: #1b3857; }
  .pele .orange rect { fill: #573117; }
  .pele .purple rect { fill: #3c2e57; }
  .pele .yellow rect { fill: #573d17; }
  .pele .teal rect { fill: #174641; }
  .pele .tan rect { fill: #3d3127; }
  .pele .pink rect { fill: #57233e; }
  .pele .breaks rect {
    fill: #2e2021 !important;
    stroke: #cf2b35 !important;
  }
  .pele .breaks text {
    fill: #ff6463 !important;
  }
  .pele .mayBreak rect {
    fill: #2e2619 !important;
    stroke: #d0700f !important;
  }
  .pele .mayBreak text {
    fill: #ffa257 !important;
  }
  .pele .bugPath rect {
    stroke: #116dd2 !important;
  }
  .pele .repeats rect {
    stroke: #9a3fcf !important;
  }
}
</style>`;

type Status = "breaks" | "holds" | "not checked";
type Rule = { name: string; status: Status; detail: string };
type State = { label: string; parent: boolean; classes: string[]; within: string | null };
type Edge = { id: string; from: string; to: string; label: string };
type Source = { path: string; start: number; end: number; note: string; text: string };
type SourceNote = { path: string; start: number; end: number; note?: string };
type ArrowNote = { description: string; sources?: number[] };
type Notes = {
  id?: string;
  title?: string;
  group?: string;
  summary?: string;
  scope?: string;
  assumptions?: string[];
  omissions?: string[];
  links?: string[];
  stateNotes?: Record<string, string>;
  arrowNotes?: Record<string, ArrowNote>;
  sources?: SourceNote[];
};
type Chart = {
  id: string;
  title: string;
  group: string;
  summary: string;
  scope: string;
  assumptions: string[];
  omissions: string[];
  links: string[];
  states: Record<string, State>;
  edges: Edge[];
  starts: string[];
  legend: Record<string, string>;
  rules: Rule[];
  intro: string;
  folder: string;
  specDir: string;
  mmd: string | null;
  svg: string | null;
  report: string;
  tlc: string | null;
  spec: { name: string; text: string }[];
  stateNotes: Record<string, string>;
  arrowNotes: Record<string, ArrowNote>;
  sources: Source[];
  notesPath: string | null;
};

const inputs: [string, string][] = [];
const readInput = (path: string) => {
  const text = readFileSync(path, "utf8");
  inputs.push([path, text]);
  return text;
};
const isDirectory = (path: string) => existsSync(path) && statSync(path).isDirectory();
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isLine = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
const unescapeLabel = (s: string) => s.replace(/#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const quote = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`);

function parseNotes(file: string, text: string): Notes {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(raw)) throw new Error(`${file} must hold a JSON object`);
  const wrong = (key: string, want: string) => new Error(`${file}: "${key}" must be ${want}`);
  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case "id":
      case "title":
      case "group":
      case "summary":
      case "scope":
        if (typeof value !== "string") throw wrong(key, "a string");
        break;
      case "assumptions":
      case "omissions":
      case "links":
        if (!Array.isArray(value) || !value.every((x) => typeof x === "string"))
          throw wrong(key, "an array of strings");
        break;
      case "stateNotes":
        if (!isRecord(value) || !Object.values(value).every((v) => typeof v === "string"))
          throw wrong(key, "an object that maps state labels to strings");
        break;
      case "arrowNotes":
        if (!isRecord(value)) throw wrong(key, "an object that maps arrow labels to notes");
        for (const [label, note] of Object.entries(value)) {
          const at = `arrowNotes[${JSON.stringify(label)}]`;
          if (!isRecord(note) || typeof note.description !== "string")
            throw wrong(at, 'an object with a string "description"');
          for (const k of Object.keys(note))
            if (k !== "description" && k !== "sources") throw new Error(`${file}: unknown key "${at}.${k}"`);
          if (note.sources !== undefined && !(Array.isArray(note.sources) && note.sources.every(Number.isInteger)))
            throw wrong(`${at}.sources`, "an array of source indexes");
        }
        break;
      case "sources":
        if (!Array.isArray(value)) throw wrong(key, "an array");
        for (const [i, s] of value.entries()) {
          const at = `sources[${i}]`;
          if (!isRecord(s)) throw wrong(at, "an object");
          for (const k of Object.keys(s))
            if (!["path", "start", "end", "note"].includes(k)) throw new Error(`${file}: unknown key "${at}.${k}"`);
          if (typeof s.path !== "string") throw wrong(`${at}.path`, "a string");
          if (!isLine(s.start)) throw wrong(`${at}.start`, "a line number from 1");
          if (!isLine(s.end) || s.end < s.start) throw wrong(`${at}.end`, "a line number not before start");
          if (s.note !== undefined && typeof s.note !== "string") throw wrong(`${at}.note`, "a string");
        }
        break;
      default:
        throw new Error(`${file}: unknown key "${key}"`);
    }
  }
  const notes = raw as Notes;
  const count = notes.sources?.length ?? 0;
  for (const [label, note] of Object.entries(notes.arrowNotes ?? {}))
    for (const i of note.sources ?? [])
      if (i < 0 || i >= count)
        throw new Error(`${file}: "arrowNotes[${JSON.stringify(label)}].sources" names source ${i}, but there are ${count}`);
  return notes;
}

function parseChart(mmd: string) {
  const states: Record<string, State> = {};
  const edges: Edge[] = [];
  const starts: string[] = [];
  const legendText: Record<string, string> = {};
  const legend: Record<string, string> = {};
  const enclosing: (string | null)[] = [];
  const kept = (id: string) => id !== "legend" && id !== "all" && !/^(lg|r)\d+$/.test(id);
  const within = () => enclosing.findLast((id) => id !== null) ?? null;
  const lines = mmd.split("\n");
  let title: string | undefined;
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (i = 1; i < lines.length && lines[i].trim() !== "---"; i++) {
      const value = lines[i].match(/^title:\s*(.*)$/)?.[1];
      if (value !== undefined)
        title = (value.startsWith('"') ? JSON.parse(value) : value).replace(
          /ﬂ°°(\d+)¶ß/g,
          (_: string, n: string) => String.fromCodePoint(Number(n)),
        );
    }
    i++;
  }
  let arrows = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(\S+) --> (\S+?)(?:: (.*))?$/))) {
      const id = `edge${arrows++}`;
      if (m[1] === "[*]") starts.push(m[2]);
      else if (m[2] !== "[*]") edges.push({ id, from: m[1], to: m[2], label: unescapeLabel(m[3] ?? "") });
    } else if ((m = line.match(/^state "(.*)" as (\S+) \{$/))) {
      if (kept(m[2])) states[m[2]] = { label: unescapeLabel(m[1]), parent: true, classes: [], within: within() };
      enclosing.push(kept(m[2]) ? m[2] : null);
    } else if (line === "}") enclosing.pop();
    else if ((m = line.match(/^class (\S+) (\S+)$/))) {
      if (states[m[1]]) states[m[1]].classes.push(m[2]);
      else if (m[1] in legendText) legend[m[2]] = legendText[m[1]];
    } else if ((m = line.match(/^(\S+): (.*)$/))) {
      if (kept(m[1])) states[m[1]] = { label: unescapeLabel(m[2]), parent: false, classes: [], within: within() };
      else if (/^lg\d+$/.test(m[1])) legendText[m[1]] = unescapeLabel(m[2]);
    }
  }
  return { title, states, edges, starts, legend };
}

function parseReport(file: string, text: string) {
  const lines = text.split("\n");
  const name = lines[0]?.match(/^# (.+)$/)?.[1];
  if (name === undefined) throw new Error(`${file} does not start with "# Name", so it is not a statechart report`);
  const sections: { heading: string; body: string[] }[] = [];
  const intro: string[] = [];
  let fenced = false;
  for (const line of lines.slice(1)) {
    if (!fenced && line.startsWith("## ")) sections.push({ heading: line.slice(3).trim(), body: [] });
    else (sections.at(-1)?.body ?? intro).push(line);
    if (line.startsWith("```")) fenced = !fenced;
  }
  const rules: Rule[] = [];
  const trailing: { text: string; section: Rule[] }[] = [];
  for (const { heading, body } of sections) {
    const broken = heading.match(/^(.+) breaks$/)?.[1];
    if (broken !== undefined) {
      rules.push({ name: broken, status: "breaks", detail: body.join("\n").trim() });
      continue;
    }
    const status = heading === "Rules that hold" ? "holds" : heading === "Rules not checked" ? "not checked" : null;
    if (!status) continue;
    const [list = "", ...rest] = body;
    const section = list.split(",").map((n) => n.trim()).filter(Boolean).map((n) => ({ name: n, status, detail: "" }));
    rules.push(...section);
    let inFence = false;
    for (const line of rest) {
      const fence = line.startsWith("```");
      const last = trailing.at(-1);
      if ((inFence || fence) && last?.section === section) last.text += `\n${line}`;
      else trailing.push({ text: line, section });
      if (fence) inFence = !inFence;
    }
  }
  for (const { text, section } of trailing) {
    if (!text.trim()) continue;
    const first = text.split("\n", 1)[0];
    const named = rules.filter((r) => new RegExp(`\\b${RegExp.escape(r.name)}\\b`).test(first));
    for (const rule of named.length ? named : section) rule.detail = rule.detail ? `${rule.detail}\n${text}` : text;
  }
  return { name, intro: intro.join("\n").trim(), rules };
}

function excerpt(file: string, i: number, source: SourceNote, base: string): Source {
  const path = isAbsolute(source.path) ? source.path : join(base, source.path);
  if (!existsSync(path) || !statSync(path).isFile())
    throw new Error(`${file}: sources[${i}] names ${path}, which does not exist`);
  const lines = readFileSync(path, "utf8").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (source.start > lines.length)
    throw new Error(`${file}: sources[${i}] starts at line ${source.start}, but ${path} has ${lines.length} lines`);
  const end = Math.min(source.end, lines.length);
  const text = lines.slice(source.start - 1, end).join("\n");
  inputs.push([`${path}:${source.start}-${end}`, text]);
  return { path: source.path, start: source.start, end, note: source.note ?? "", text };
}

function load(folder: string, repo: string | null): Chart {
  if (!isDirectory(folder)) throw new Error(`${folder} is not a folder`);
  const specDir = readdirSync(folder).some((n) => n.endsWith(".tla")) ? folder : dirname(folder);
  const reportPath = join(folder, "report.md");
  if (!existsSync(reportPath)) throw new Error(`${folder} has no report.md, so it is not a statechart output folder`);
  const report = readInput(reportPath);
  const { name, intro, rules } = parseReport(reportPath, report);
  const mmdPath = join(folder, "chart.mmd");
  const mmd = existsSync(mmdPath) ? readInput(mmdPath) : null;
  const chart = mmd === null ? null : parseChart(mmd);
  const tlcPath = join(folder, "tlc.out");
  const tlc = existsSync(tlcPath) ? readInput(tlcPath) : null;
  const spec = readdirSync(specDir)
    .filter((n) => (/\.(tla|cfg)$/.test(n) || n === "view.mjs") && statSync(join(specDir, n)).isFile())
    .sort()
    .map((n) => ({ name: n, text: readInput(join(specDir, n)) }));
  const notesPath = join(specDir, "dashboard.json");
  const notes = existsSync(notesPath) ? parseNotes(notesPath, readInput(notesPath)) : {};
  const sources = (notes.sources ?? []).map((s, i) => excerpt(notesPath, i, s, repo ?? specDir));
  return {
    id: notes.id ?? basename(specDir),
    title: notes.title ?? chart?.title ?? name,
    group: notes.group ?? "Charts",
    summary: notes.summary ?? intro,
    scope: notes.scope ?? "",
    assumptions: notes.assumptions ?? [],
    omissions: notes.omissions ?? [],
    links: notes.links ?? [],
    states: chart?.states ?? {},
    edges: chart?.edges ?? [],
    starts: chart?.starts ?? [],
    legend: chart?.legend ?? {},
    rules,
    intro,
    folder,
    specDir,
    mmd,
    svg: null as string | null,
    report,
    tlc,
    spec,
    stateNotes: notes.stateNotes ?? {},
    arrowNotes: notes.arrowNotes ?? {},
    sources,
    notesPath: existsSync(notesPath) ? notesPath : null,
  };
}

// A static import would fail before the first `bun install`, so Pele loads after it.
async function loadPele() {
  const key = createHash("sha256")
    .update(readFileSync(join(scripts, "package.json")))
    .update("\0")
    .update(readFileSync(join(scripts, "bun.lock")))
    .digest("hex");
  const keyPath = join(scripts, "node_modules", ".statechart-dashboard-install-key");
  if (
    existsSync(join(scripts, "node_modules", "pele", "package.json")) &&
    existsSync(keyPath) &&
    readFileSync(keyPath, "utf8").trim() === key
  )
    return await import("pele");
  const result = Bun.spawnSync([process.execPath, "install", "--frozen-lockfile"], { cwd: scripts });
  if (result.exitCode !== 0)
    throw new Error(`bun install --frozen-lockfile failed in ${scripts}\n${result.stderr.toString().trim()}`);
  writeFileSync(keyPath, `${key}\n`);
  return await import("pele");
}

function openInChrome(path: string) {
  const command = process.platform === "darwin" ? ["open", "-a", "Google Chrome", path] : ["xdg-open", path];
  let exitCode: number | null;
  try {
    exitCode = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" }).exitCode;
  } catch (error) {
    throw new Error(`${command.join(" ")} failed: ${(error as Error).message}`);
  }
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited with status ${exitCode}`);
}

async function main(argv: string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string" },
        title: { type: "string" },
        repo: { type: "string" },
        overview: { type: "string" },
        "no-open": { type: "boolean" },
        force: { type: "boolean" },
      },
    });
  } catch (error) {
    throw new Error(`${(error as Error).message}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (!values.out || !positionals.length) throw new Error(USAGE);
  const out = resolve(values.out);
  const index = join(out, "index.html");
  const repo = values.repo === undefined ? null : resolve(values.repo);
  if (repo !== null && !isDirectory(repo)) throw new Error(`--repo ${repo} is not a folder`);
  const folders = positionals.map((f) => resolve(f));
  const charts: Chart[] = folders.map((f) => load(f, repo));

  const taken = new Set<string>();
  for (const chart of charts) {
    let id = chart.id;
    if (taken.has(id)) id = `${chart.id}-${basename(chart.folder)}`;
    for (let n = 2; taken.has(id); n++) id = `${chart.id}-${basename(chart.folder)}-${n}`;
    taken.add(id);
    chart.id = id;
  }
  for (const chart of charts)
    for (const link of chart.links)
      if (!taken.has(link))
        throw new Error(`${chart.notesPath}: "links" names ${JSON.stringify(link)}, which is not a chart on this page`);

  const overviewPath = values.overview === undefined ? null : resolve(values.overview);
  if (overviewPath !== null && !existsSync(overviewPath)) throw new Error(`--overview ${overviewPath} does not exist`);
  const overviewMmd = overviewPath === null ? null : readInput(overviewPath);

  const template = readFileSync(join(scripts, "template.html"), "utf8");
  const pele = JSON.parse(readFileSync(join(scripts, "package.json"), "utf8")).dependencies.pele;
  const pageArgs = argv.filter((arg) => arg !== "--no-open" && arg !== "--force");
  const command = `cd ${quote(process.cwd())} && bun ${quote(import.meta.path)} ${pageArgs.map(quote).join(" ")}`;
  const hasher = createHash("sha256")
    .update(readFileSync(import.meta.path))
    .update("\0")
    .update(template)
    .update("\0")
    .update(pele)
    .update("\0")
    .update(JSON.stringify({ title: values.title ?? null, repo, overview: overviewPath, folders, command }));
  for (const [path, text] of inputs) hasher.update("\0").update(path).update("\0").update(text);
  const hash = hasher.digest("hex");

  const existing = existsSync(index) ? readFileSync(index, "utf8") : "";
  if (!values.force && existing.includes(`<meta name="statechart-dashboard" content="${hash}">`)) {
    console.log(`Reused ${index}`);
  } else {
    const { render, PeleError } = await loadPele();
    const draw = (path: string, mmd: string) => {
      try {
        return render(mmd, RENDER).svg.replace(/^(<svg[^>]*>)/, (tag: string) => tag + STYLE);
      } catch (error) {
        if (error instanceof PeleError) throw new Error(`${path}: Pele failed: ${error.message}`);
        throw error;
      }
    };
    for (const chart of charts) {
      if (chart.mmd === null) continue;
      chart.svg = draw(join(chart.folder, "chart.mmd"), chart.mmd);
      writeFileSync(join(chart.folder, "chart.svg"), chart.svg);
    }
    let overview = null;
    if (overviewPath !== null && overviewMmd !== null) {
      const svg = draw(overviewPath, overviewMmd);
      writeFileSync(join(dirname(overviewPath), `${basename(overviewPath, extname(overviewPath))}.svg`), svg);
      overview = { mmd: overviewMmd, svg };
    }
    const title = values.title ?? "Statecharts";
    const data = {
      title,
      built: new Date().toISOString(),
      command,
      overview,
      charts: charts.map(({ notesPath, ...chart }) => chart),
    };
    const fills: Record<string, string> = {
      "{{hash}}": hash,
      "{{title}}": title.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
      "/*DATA*/": JSON.stringify(data).replaceAll("<", "\\u003c"),
    };
    const page = template.replace(/\{\{hash\}\}|\{\{title\}\}|\/\*DATA\*\//g, (placeholder) => fills[placeholder]);
    mkdirSync(out, { recursive: true });
    const temp = join(out, `.index.html.${process.pid}.tmp`);
    try {
      writeFileSync(temp, page);
      renameSync(temp, index);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
    console.log(`Built ${index}`);
  }
  if (!values["no-open"]) openInChrome(index);
}

try {
  await main(Bun.argv.slice(2));
} catch (error) {
  console.error(`statechart-dashboard: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

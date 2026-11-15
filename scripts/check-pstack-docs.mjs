#!/usr/bin/env node

// Lists the package's skills, playbooks, and agents from the tree and checks what README.md says about them: skill
// commands, relative links and anchors, counts, agent names, and that the README links each one. Ported
// from cursor/plugins scripts/check-pstack-docs.mjs. Exits 1 when the docs drift from the tree.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTER = join(ROOT, "skills", "pstack-omp", "SKILL.md");

const SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
// "The twenty-three playbooks" claims the whole set. "Three playbooks scale it up" names a subset, so it is not checked.
const CLAIM = /\b(?:(all|has|of|ships|the|with) )?(\d+|[a-z]+(?:-[a-z]+)?) (short )?(skills|principles|playbooks|agents)\b/gi;
// OMP runs a skill as /skill:<name>. Other harnesses' forms ($<name>, /<name>, /pstack:<name>) reach the model as plain
// text, so the skill never loads.
const COMMAND = /(?<=^|[\s`(|"'>])\/skill:([a-z][a-z0-9-]*)(?![\w/<-])/gm;
const FOREIGN_COMMAND = /(?<=^|[\s`(|"'>])(?:\$|\/(?:pstack:)?)([a-z][a-z0-9-]*)(?![\w/<-])/gm;
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
const AGENT = /agent: "([^"]+)"/g;

function names(dir, keep) {
  return existsSync(dir) ? readdirSync(dir).filter((name) => keep(join(dir, name))).sort() : [];
}
const isSkill = (path) => existsSync(join(path, "SKILL.md"));
const isMarkdown = (path) => path.endsWith(".md") && statSync(path).isFile();

const skills = names(join(ROOT, "skills"), isSkill);
const principles = skills.filter((name) => name.startsWith("principle-"));
const commands = skills.filter((name) => !name.startsWith("principle-"));
const playbooks = names(join(ROOT, "skills", "poteto-mode", "playbooks"), isMarkdown).map((name) => name.slice(0, -3));
const agents = names(join(ROOT, "agents"), isMarkdown).map((name) => name.slice(0, -3));
// The adapter's closed roster also holds the task agents OMP bundles.
const roster = readFileSync(ADAPTER, "utf8").match(/roster is closed:\n\n```text\n([\s\S]*?)\n```/)?.[1].split("\n") ?? [];
const docs = ["README.md"];
const text = new Map(docs.map((doc) => [doc, readFileSync(join(ROOT, doc), "utf8")]));

const problems = [];
const lineOf = (doc, index) => text.get(doc).slice(0, index).split("\n").length;
const fail = (doc, index, message) => problems.push(`${doc}:${lineOf(doc, index)} ${message}`);

function toNumber(word) {
  if (/^\d+$/.test(word)) return Number(word);
  const [tens, unit] = word.toLowerCase().split("-");
  if (unit === undefined && SMALL.includes(tens)) return SMALL.indexOf(tens);
  const ones = unit === undefined ? 0 : SMALL.indexOf(unit);
  return TENS.indexOf(tens) > 1 && ones >= 0 && ones < 10 ? TENS.indexOf(tens) * 10 + ones : undefined;
}

function anchors(path) {
  const seen = new Map();
  const found = new Set();
  let fenced = false;
  for (const line of readFileSync(join(ROOT, path), "utf8").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^#{1,6}\s+(.*?)\s*$/);
    if (!heading) continue;
    const plain = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "");
    const slug = plain.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const repeat = seen.get(slug) ?? 0;
    seen.set(slug, repeat + 1);
    found.add(repeat ? `${slug}-${repeat}` : slug);
  }
  return found;
}

const expected = {
  skills: [skills.length, commands.length],
  principles: [principles.length],
  playbooks: [playbooks.length],
  agents: [agents.length],
};
const named = new Set();
let mentions = 0;
let links = 0;

for (const [doc, body] of text) {
  for (const { 0: match, 1: whole, 2: word, 3: short, 4: noun, index } of body.matchAll(CLAIM)) {
    const claimed = toNumber(word);
    const kind = short ? "principles" : noun.toLowerCase();
    if ((whole || short) && claimed !== undefined && !expected[kind].includes(claimed)) {
      fail(doc, index, `says "${match}", but the tree has ${expected[kind].join(" or ")}`);
    }
  }
  for (const { 1: name, index } of body.matchAll(COMMAND)) {
    mentions++;
    if (skills.includes(name)) named.add(name);
    else fail(doc, index, `names /skill:${name}, which no skill in this package provides`);
  }
  for (const { 0: match, 1: name, index } of body.matchAll(FOREIGN_COMMAND)) {
    if (skills.includes(name)) fail(doc, index, `names ${match}, but OMP runs skills as /skill:${name}`);
  }
  for (const { 1: href, index } of body.matchAll(LINK)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    links++;
    const [target, anchor] = href.split("#");
    const path = target ? posix.normalize(posix.join(posix.dirname(doc), target)).replace(/\/$/, "") : doc;
    const skill = path.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (skill) named.add(skill[1]);
    if (!existsSync(join(ROOT, path))) fail(doc, index, `links to ${href}, which does not exist`);
    else if (anchor && path.endsWith(".md") && !anchors(path).has(anchor)) {
      fail(doc, index, `links to ${href}, but ${path} has no heading with that anchor`);
    }
  }
  for (const { 1: name, index } of body.matchAll(AGENT)) {
    if (!agents.includes(name) && !roster.includes(name)) {
      fail(doc, index, `names agent "${name}", which agents/ does not ship and the adapter's roster does not list`);
    }
  }
}

const readme = text.get("README.md");
for (const skill of skills) {
  if (!readme.includes(`(./skills/${skill}/SKILL.md)`)) problems.push(`README.md does not list skill ${skill}`);
}
for (const playbook of playbooks) {
  if (!readme.includes(`(./skills/poteto-mode/playbooks/${playbook}.md)`)) problems.push(`README.md does not list playbook ${playbook}`);
}
for (const agent of agents) {
  if (!readme.includes(`(./agents/${agent}.md)`)) problems.push(`README.md does not link agent ${agent}`);
}

console.log(
  `tree: ${skills.length} skills (${commands.length} commands, ${principles.length} principles), ` +
    `${playbooks.length} playbooks, ${agents.length} agents`,
);
console.log(
  `docs: ${docs.length} files, ${mentions} /skill: mentions, ${links} relative links, ` +
    `${commands.filter((name) => named.has(name)).length} of ${commands.length} commands named`,
);
for (const problem of problems) console.log(`FAIL ${problem}`);
console.log(`${problems.length} problems`);
if (problems.length > 0) process.exit(1);

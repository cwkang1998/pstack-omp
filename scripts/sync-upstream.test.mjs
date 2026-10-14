import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { normalizeContent } from "./sync-upstream.mjs";

test("normalization removes the supported Cursor runtime bindings", () => {
  const source = [
    "config: ~/.cursor/rules/pstack-models.mdc",
    "agent: Task subagent",
    "question: AskQuestion",
    "model: claude-fable-5-thinking-max",
  ].join("\n");

  const normalized = normalizeContent(source);

  assert.doesNotMatch(normalized, /~\/\.cursor\/|AskQuestion|claude-fable/u);
  assert.match(normalized, /\$PSTACK_CONFIG/u);
  assert.match(normalized, /host task runner/u);
});

test("apply updates an upstream-owned file and advances the lock", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-sync-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  try {
    await mkdir(join(source, "pstack/skills/blast-radius"), { recursive: true });
    await mkdir(
      join(source, "pstack/automations/benny/skills/setup-benny"),
      { recursive: true },
    );
    await mkdir(join(target, "skills"), { recursive: true });
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: source\n---\nagent: Task subagent\n",
    );
    await writeFile(
      join(source, "pstack/automations/benny/skills/setup-benny/SKILL.md"),
      "---\nname: setup-benny\ndescription: protected\n---\n",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: source });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: source });
    execFileSync("git", ["config", "user.name", "pstack test"], { cwd: source });
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: source });
    const baseline = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(source, "pstack/skills/blast-radius/SKILL.md"),
      "---\nname: blast-radius\ndescription: updated\n---\nagent: Task subagent\n",
    );
    execFileSync("git", ["add", "."], { cwd: source });
    execFileSync("git", ["commit", "-q", "-m", "update"], { cwd: source });
    await writeFile(
      join(target, "upstream.lock.json"),
      `${JSON.stringify({
        repository: "local",
        ref: "main",
        path: "pstack",
        commit: baseline,
        sourceRoots: [
          { source: "pstack/skills", destination: "skills" },
          { source: "pstack/automations/benny/skills", destination: "skills" },
        ],
      })}\n`,
    );

    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
      { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target } },
    );

    const synced = await readFile(
      join(target, "skills/blast-radius/SKILL.md"),
      "utf8",
    );
    assert.match(synced, /host task runner/u);
    const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
    assert.notEqual(lock.commit, "0".repeat(40));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

async function syncAdaptedFile({ pinned, latest, adapted, runs = 1 }) {
  const fixture = await mkdtemp(join(tmpdir(), "pstack-merge-test-"));
  const source = join(fixture, "source");
  const target = join(fixture, "target");
  const upstreamFile = join(source, "pstack/skills/poteto-mode/playbooks/feature.md");
  const git = (...args) => execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
  await mkdir(dirname(upstreamFile), { recursive: true });
  await mkdir(join(target, "skills/poteto-mode/playbooks"), { recursive: true });
  await writeFile(upstreamFile, pinned);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "pstack test");
  git("add", ".");
  git("commit", "-q", "-m", "pinned");
  const pinnedCommit = git("rev-parse", "HEAD");
  await writeFile(upstreamFile, latest);
  git("commit", "-qam", "latest");
  await writeFile(join(target, "skills/poteto-mode/playbooks/feature.md"), adapted);
  await writeFile(
    join(target, "upstream.lock.json"),
    `${JSON.stringify({
      repository: "local",
      ref: "main",
      path: "pstack",
      commit: pinnedCommit,
      sourceRoots: [{ source: "pstack/skills", destination: "skills" }],
    })}\n`,
  );
  const statuses = [];
  for (let run = 0; run < runs; run += 1) {
    try {
      execFileSync(
        process.execPath,
        [join(process.cwd(), "scripts/sync-upstream.mjs"), "--apply", "--source", source],
        { cwd: target, env: { ...process.env, PSTACK_SYNC_ROOT: target }, stdio: "pipe" },
      );
      statuses.push(0);
    } catch (error) {
      statuses.push(error.status);
    }
  }
  const result = await readFile(join(target, "skills/poteto-mode/playbooks/feature.md"), "utf8");
  const lock = JSON.parse(await readFile(join(target, "upstream.lock.json"), "utf8"));
  await rm(fixture, { recursive: true, force: true });
  return { statuses, result, lockAdvanced: lock.commit !== pinnedCommit };
}

test("apply merges upstream edits into a locally adapted file and keeps OMP edits", async () => {
  const { statuses, result, lockAdvanced } = await syncAdaptedFile({
    pinned: "1. how\n2. architect\n3. checkpoint\n4. delegate\n",
    latest: "1. how\n2. architect\n3. checkpoint\n4. delegate to one owner\n",
    adapted: "1. how\n2. architect via pstack-omp\n3. checkpoint\n4. delegate\n",
  });

  assert.deepEqual(statuses, [0]);
  assert.equal(result, "1. how\n2. architect via pstack-omp\n3. checkpoint\n4. delegate to one owner\n");
  assert.equal(lockAdvanced, true);
});

test("apply reports a conflict when upstream and OMP edit the same line, and keeps failing until it is resolved", async () => {
  const { statuses, result } = await syncAdaptedFile({
    pinned: "1. how\n2. architect\n",
    latest: "1. how\n2. arena\n",
    adapted: "1. how\n2. architect via pstack-omp\n",
    runs: 2,
  });

  assert.deepEqual(statuses, [2, 2]);
  assert.equal(
    result,
    "1. how\n<<<<<<< omp\n2. architect via pstack-omp\n=======\n2. arena\n>>>>>>> upstream-latest\n",
  );
});

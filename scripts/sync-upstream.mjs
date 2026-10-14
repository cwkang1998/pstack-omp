#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(
  process.env.PSTACK_SYNC_ROOT ?? dirname(fileURLToPath(import.meta.url)),
  process.env.PSTACK_SYNC_ROOT ? "." : "..",
);
const lockPath = join(root, "upstream.lock.json");
const boundaryLock = JSON.parse(readFileSync(lockPath, "utf8"));

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function normalizeContent(source) {
  return source
    .replaceAll("~/.cursor/rules/pstack-models.mdc", "$PSTACK_CONFIG (or .pstack/config.md)")
    .replaceAll(".cursor/skills/", "skills/")
    .replaceAll(".cursor/plugins/", "plugins/")
    .replaceAll("subagent_type:", "role:")
    .replaceAll("AskQuestion", "structured interaction tool")
    .replaceAll('environment: "cloud"', "environment: host-managed")
    .replaceAll("environment: 'cloud'", "environment: host-managed")
    .replaceAll("claude-fable-5-thinking-max", "host-configured role/model")
    .replaceAll("gpt-5.6-sol-max", "host-configured role/model")
    .replaceAll("grok-4.6-fast-xhigh", "host-configured role/model")
    .replaceAll("claude-opus-5-thinking-xhigh", "host-configured role/model")
    .replaceAll(/\bTask (?:subagent|tool)\b/g, "host task runner");
}

export function isProtectedPath(path) {
  return (
    boundaryLock.protectedPaths.includes(path) ||
    boundaryLock.protectedPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

async function filesUnder(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  }
  await walk(directory);
  return files;
}

function parseArgs(argv) {
  const sourceIndex = argv.indexOf("--source");
  return {
    mode: argv.includes("--check") ? "check" : argv.includes("--apply") ? "apply" : argv.includes("--dry-run") ? "apply" : null,
    dryRun: argv.includes("--dry-run"),
    source: sourceIndex === -1 ? null : argv[sourceIndex + 1],
  };
}

async function sourceRepository(lock, sourceArg) {
  if (sourceArg) return { path: resolve(sourceArg), cleanup: null };
  const path = await mkdtemp(join(tmpdir(), "pstack-upstream-"));
  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--branch", lock.ref, lock.repository, path],
      { stdio: "inherit" },
    );
    try {
      execFileSync(
        "git",
        ["fetch", "--quiet", "--depth", "1", "origin", lock.commit],
        { cwd: path },
      );
    } catch {
      // A missing baseline makes protected-file review fail closed.
    }
    return { path, cleanup: path };
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
}

function baselineAvailable(sourceRoot, commit) {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: sourceRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function baselineContent(sourceRoot, commit, sourcePath) {
  try {
    return normalizeContent(
      execFileSync("git", ["show", `${commit}:${sourcePath}`], {
        cwd: sourceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return "";
  }
}

async function mergeThreeWay(current, base, latest) {
  const directory = await mkdtemp(join(tmpdir(), "pstack-merge-"));
  try {
    const paths = ["ours", "base", "upstream"].map((name) => join(directory, name));
    await Promise.all([current, base, latest].map((text, index) => writeFile(paths[index], text)));
    try {
      const merged = execFileSync(
        "git",
        ["merge-file", "-p", "-L", "omp", "-L", "upstream-pinned", "-L", "upstream-latest", ...paths],
        { encoding: "utf8" },
      );
      return { text: merged, conflicted: false };
    } catch (error) {
      if (typeof error.status === "number" && error.status > 0) {
        return { text: error.stdout, conflicted: true };
      }
      throw error;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function applyUpdate(lock, sourceRoot, commit, dryRun) {
  if (!baselineAvailable(sourceRoot, lock.commit)) {
    console.error(`Pinned upstream commit ${lock.commit} is unavailable, so protected files cannot be merged.`);
    return 2;
  }

  const changed = [];
  const conflicts = [];
  for (const mapping of lock.sourceRoots) {
    const sourceDirectory = join(sourceRoot, mapping.source);
    for (const sourceFile of await filesUnder(sourceDirectory)) {
      const sourcePath = relative(sourceRoot, sourceFile);
      const destination = join(
        root,
        mapping.destination,
        relative(sourceDirectory, sourceFile),
      );
      const destinationKey = relative(root, destination);
      const latest = normalizeContent(await readFile(sourceFile, "utf8"));
      let current = null;
      try {
        current = await readFile(destination, "utf8");
      } catch {
        // New upstream file.
      }
      let next = latest;
      if (isProtectedPath(destinationKey) && current !== null) {
        const base = baselineContent(sourceRoot, lock.commit, sourcePath);
        if (base === latest) continue;
        const merged = await mergeThreeWay(current, base, latest);
        next = merged.text;
        if (merged.conflicted) conflicts.push(destinationKey);
      }
      if (current === next) continue;
      changed.push(destinationKey);
      if (!dryRun) {
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, next);
      }
    }
  }

  if (changed.length === 0) {
    console.log(`No skill changes for upstream ${commit}.`);
    return 0;
  }
  console.log(`${dryRun ? "Would update" : "Updated"} ${changed.length} files:`);
  for (const path of changed) console.log(`- ${path}`);
  if (!dryRun) {
    await writeFile(
      lockPath,
      `${JSON.stringify({ ...lock, commit }, null, 2)}\n`,
    );
  }
  if (conflicts.length > 0) {
    console.error(`${conflicts.length} protected OMP-adapted files have merge conflicts to resolve:`);
    for (const path of conflicts) console.error(`- ${path}`);
    return 2;
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.mode || (args.source !== null && !args.source)) {
    console.error("Usage: sync-upstream.mjs --check [--source DIR]");
    console.error("       sync-upstream.mjs --apply [--dry-run] [--source DIR]");
    return 64;
  }
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const source = await sourceRepository(lock, args.source);
  try {
    const commit = git(["rev-parse", "HEAD"], source.path);
    console.log(`pinned=${lock.commit}`);
    console.log(`latest=${commit}`);
    if (commit === lock.commit) {
      console.log("Upstream is already pinned at the latest checked revision.");
      return 0;
    }
    if (args.mode === "check") return 10;
    return await applyUpdate(lock, source.path, commit, args.dryRun);
  } finally {
    if (source.cleanup) await rm(source.cleanup, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

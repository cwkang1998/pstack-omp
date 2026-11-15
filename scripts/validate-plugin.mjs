#!/usr/bin/env node

// Checks the OMP plugin manifest in package.json. Ported from cursor/plugins scripts/validate-plugins.mjs. OMP
// publishes no manifest schema and its loader validates nothing, so this checks the fields the loader reads.

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The plugin name pattern from cursor/plugins schemas/plugin.schema.json.
const NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
// The semver.org regular expression.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors++;
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
} catch (error) {
  fail(`package.json does not parse: ${error.message}`);
  process.exit(1);
}

if (typeof manifest.name !== "string" || !NAME.test(manifest.name)) {
  fail(`package.json name "${manifest.name}" is not a kebab-case plugin identifier`);
}

// OMP records the installed version from package.json.
if (typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) {
  fail(`package.json version "${manifest.version}" is not a semantic version`);
}

// OMP's runtime plugin loading skips a package that has no omp (or legacy pi) manifest.
if (manifest.omp === null || typeof manifest.omp !== "object" || Array.isArray(manifest.omp)) {
  fail("package.json has no omp manifest, so OMP loads nothing from this package");
} else {
  // The manifest fields OMP resolves to files or directories, at the top level and in each optional feature.
  const PATH_FIELDS = ["extensions", "skills", "tools", "hooks", "commands"];
  const checkPaths = (fields, at) => {
    for (const field of PATH_FIELDS) {
      if (fields[field] === undefined) continue;
      const entries = Array.isArray(fields[field]) ? fields[field] : [fields[field]];
      entries.forEach((entry, index) => {
        const label = `${at}.${field}${Array.isArray(fields[field]) ? `[${index}]` : ""}`;
        if (typeof entry !== "string") return fail(`package.json ${label} is not a path`);
        const path = resolve(root, entry);
        if (relative(root, path).startsWith("..")) fail(`package.json ${label} "${entry}" points outside the package`);
        else if (!existsSync(path)) fail(`package.json ${label} "${entry}" does not exist`);
      });
    }
  };
  checkPaths(manifest.omp, "omp");
  for (const [name, feature] of Object.entries(manifest.omp.features ?? {})) {
    if (feature !== null && typeof feature === "object") checkPaths(feature, `omp.features.${name}`);
  }
}

if (errors > 0) {
  console.error(`\nValidation failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log("Plugin manifest validated successfully.");
}

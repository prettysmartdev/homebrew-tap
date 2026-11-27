#!/usr/bin/env node
// Refresh the tap only from a published, checksummed and attested awman release.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repo = "prettysmartdev/awman";
const formula = "Formula/awman.rb";
const assets = ["awman-macos-arm64", "awman-linux-amd64", "awman-linux-arm64"];
const allAssets = new Set([...assets, "awman-windows-amd64.exe"]);
const hex = /^[0-9a-f]{64}$/;

function gh(...args) {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function ghJson(path) {
  return JSON.parse(gh("api", path));
}

export function versionNumber(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Invalid release version: ${version}`);
  return match.slice(1).map(Number);
}

function compareVersions(a, b) {
  const left = versionNumber(a);
  const right = versionNumber(b);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return Math.sign(left[index] - right[index]);
  }
  return 0;
}

export function formulaVersion(text) {
  const matches = [...text.matchAll(/^  version "([^"]+)"$/gm)];
  if (matches.length !== 1) throw new Error("Formula must have exactly one version");
  return matches[0][1];
}

function assetPattern(asset) {
  return new RegExp(`(url "[^"\\n]+/${asset}"\\n\\s+sha256 ")([0-9a-f]{64})(")`, "g");
}

export function formulaDigest(text, asset) {
  const matches = [...text.matchAll(assetPattern(asset))];
  if (matches.length !== 1) throw new Error(`Formula must have exactly one URL and digest for ${asset}`);
  return matches[0][2];
}

export function renderFormula(text, version, digests) {
  const current = formulaVersion(text);
  let updated = text.replace(`  version "${current}"`, `  version "${version}"`);
  for (const asset of assets) {
    formulaDigest(updated, asset);
    updated = updated.replace(assetPattern(asset), (_, prefix, _old, suffix) =>
      `${prefix}${digests[asset]}${suffix}`);
  }
  return updated;
}

export function releaseDigests(release) {
  const byName = new Map(release.assets.map((asset) => [asset.name, asset]));
  if (byName.size !== release.assets.length || !byName.has("SHA256SUMS")) {
    throw new Error("Release has duplicate names or no SHA256SUMS");
  }
  const digests = {};
  for (const name of allAssets) {
    const value = byName.get(name)?.digest;
    if (typeof value !== "string" || !value.startsWith("sha256:") || !hex.test(value.slice(7))) {
      throw new Error(`Release has no valid API digest for ${name}`);
    }
    digests[name] = value.slice(7);
  }
  return digests;
}

export function parseSums(text) {
  const sums = {};
  for (const line of text.trimEnd().split("\n")) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9.-]+)$/.exec(line);
    if (!match || Object.hasOwn(sums, match[2])) {
      throw new Error("SHA256SUMS has a malformed or duplicate line");
    }
    sums[match[2]] = match[1];
  }
  if (Object.keys(sums).length !== allAssets.size ||
      [...allAssets].some((name) => !Object.hasOwn(sums, name))) {
    throw new Error("SHA256SUMS does not name exactly the four release binaries");
  }
  return sums;
}

function tagCommit(tag) {
  let object = ghJson(`repos/${repo}/git/ref/tags/${tag}`).object;
  for (let count = 0; count < 3; count++) {
    if (object.type === "commit") return object.sha;
    if (object.type !== "tag") break;
    object = ghJson(`repos/${repo}/git/tags/${object.sha}`).object;
  }
  throw new Error("Release tag does not resolve to a commit");
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function setChanged(changed) {
  const value = `changed=${changed}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, value);
  process.stdout.write(value);
}

function main() {
  const release = ghJson(`repos/${repo}/releases/latest`);
  const tag = release.tag_name;
  if (release.draft || release.prerelease || !tag?.startsWith("v")) {
    throw new Error("Latest release is not a published stable version");
  }
  const version = tag.slice(1);
  const current = readFileSync(formula, "utf8");
  const oldVersion = formulaVersion(current);
  if (compareVersions(version, oldVersion) < 0) throw new Error("Latest release would downgrade the tap");

  const apiDigests = releaseDigests(release);
  if (version === oldVersion) {
    if (assets.some((name) => formulaDigest(current, name) !== apiDigests[name])) {
      throw new Error("Published release changed without a version bump");
    }
    setChanged(false);
    return;
  }

  const commit = tagCommit(tag);
  const directory = mkdtempSync(join(tmpdir(), "awman-tap-"));
  try {
    const command = ["release", "download", tag, "--repo", repo, "--dir", directory];
    for (const name of [...assets, "SHA256SUMS"]) command.push("--pattern", name);
    gh(...command);
    const sums = parseSums(readFileSync(join(directory, "SHA256SUMS"), "utf8"));
    for (const name of allAssets) {
      if (sums[name] !== apiDigests[name]) throw new Error(`SHA256SUMS and API disagree for ${name}`);
    }
    for (const name of assets) {
      const path = join(directory, name);
      if (fileSha256(path) !== sums[name]) throw new Error(`Downloaded bytes differ for ${name}`);
      gh("attestation", "verify", path, "--repo", repo,
        "--signer-workflow", `${repo}/.github/workflows/release.yml`,
        "--source-digest", commit, "--deny-self-hosted-runners");
    }
    writeFileSync(formula, renderFormula(current, version, sums));
    writeFileSync("SHA256SUMS", readFileSync(join(directory, "SHA256SUMS")));
    setChanged(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`awman tap update failed: ${error.message}`);
    process.exitCode = 1;
  }
}

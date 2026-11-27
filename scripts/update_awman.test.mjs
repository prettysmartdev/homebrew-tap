import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formulaDigest,
  formulaVersion,
  parseSums,
  releaseDigests,
  renderFormula,
  versionNumber,
} from "./update_awman.mjs";

const assets = ["awman-macos-arm64", "awman-linux-amd64", "awman-linux-arm64"];
const windows = "awman-windows-amd64.exe";
const digest = (character) => character.repeat(64);

test("a new release changes the version and only the three platform digests", () => {
  const original = readFileSync("Formula/awman.rb", "utf8");
  const digests = Object.fromEntries(assets.map((name, index) => [name, digest(String(index + 1))]));
  const updated = renderFormula(original, "0.15.0", digests);
  assert.equal(formulaVersion(updated), "0.15.0");
  for (const name of assets) assert.equal(formulaDigest(updated, name), digests[name]);
  assert.equal(renderFormula(updated, "0.15.0", digests), updated);
  assert.equal(original.replaceAll(/sha256 "[0-9a-f]{64}"/g, "sha256 DIGEST")
    .replace(/version "0\.14\.0"/, "version VERSION"),
  updated.replaceAll(/sha256 "[0-9a-f]{64}"/g, "sha256 DIGEST")
    .replace(/version "0\.15\.0"/, "version VERSION"));
});

test("checksums reject duplicates, unknown files and missing platforms", () => {
  const lines = [...assets, windows].map((name) => `${digest("a")}  ${name}`);
  assert.equal(Object.keys(parseSums(`${lines.join("\n")}\n`)).length, 4);
  assert.throws(() => parseSums([...lines, lines[0]].join("\n")), /duplicate/);
  assert.throws(() => parseSums([...lines.slice(0, 3), `${digest("a")}  unexpected`].join("\n")), /exactly/);
  assert.throws(() => parseSums(lines.slice(0, 3).join("\n")), /exactly/);
});

test("release metadata requires complete SHA-256 digests and stable versions", () => {
  const release = { assets: [...assets, windows].map((name) => ({ name, digest: `sha256:${digest("b")}` })) };
  release.assets.push({ name: "SHA256SUMS" });
  assert.equal(Object.keys(releaseDigests(release)).length, 4);
  assert.deepEqual(versionNumber("v0.15.0"), [0, 15, 0]);
  assert.throws(() => versionNumber("v0.15.0-rc1"), /Invalid/);
  release.assets[0].digest = null;
  assert.throws(() => releaseDigests(release), /valid API digest/);
});

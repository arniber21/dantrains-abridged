// Runs as npm's "version" lifecycle script (see package.json), after npm has
// already bumped the version in package.json but before it commits and tags.
// Keeps manifest.json's version field -- the one the Registry actually reads --
// in lockstep so `npm version <bump>` is the single command that prepares a release.
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const { version } = require(path.join(REPO_ROOT, "package.json"));
const manifestPath = path.join(REPO_ROOT, "manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");

console.log(`Synced manifest.json version to ${version}`);

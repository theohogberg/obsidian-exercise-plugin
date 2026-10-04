// Runs during `npm version` (the "version" script in package.json), after npm has
// updated package.json. Obsidian reads the version from manifest.json, so copy it
// there, and record the minimum Obsidian version in versions.json when it changes.
import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, "\t") + "\n");

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeJson("manifest.json", manifest);

// versions.json maps plugin version → minimum Obsidian version. Obsidian uses it to
// offer users on an older app the newest release that still supports them, so a new
// entry is only needed when minAppVersion differs from every version listed so far.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (!Object.values(versions).includes(manifest.minAppVersion)) {
	versions[targetVersion] = manifest.minAppVersion;
	writeJson("versions.json", versions);
}

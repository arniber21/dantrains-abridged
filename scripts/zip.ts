import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const REPO_ROOT = path.resolve(__dirname, "..");
const ZIP_PATH = path.join(REPO_ROOT, "BasedGoatTrains-Abridged.zip");
const FILES_TO_PACKAGE = ["index.js", "manifest.json"];

function pack(): void {
	const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "basedgoat-trains-package-"));
	try {
		for (const file of FILES_TO_PACKAGE) {
			fs.copyFileSync(path.join(REPO_ROOT, file), path.join(stagingDir, file));
		}
		fs.rmSync(ZIP_PATH, { force: true });
		execFileSync("zip", ["-X", ZIP_PATH, ...FILES_TO_PACKAGE], { cwd: stagingDir, stdio: "inherit" });
		console.log(`Wrote ${path.relative(REPO_ROOT, ZIP_PATH)}`);
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

pack();

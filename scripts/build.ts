import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

const REPO_ROOT = path.resolve(__dirname, "..");
const TRAINS_YAML_PATH = path.join(REPO_ROOT, "trains.yaml");
const OUTPUT_PATH = path.join(REPO_ROOT, "index.js");

interface TrainStats {
	[key: string]: number;
}

interface ElevationMultipliers {
	DEEP_BORE: number;
	STANDARD_TUNNEL: number;
	CUT_AND_COVER: number;
	AT_GRADE: number;
	ELEVATED: number;
	TRENCHED: number;
	RAMP: number;
}

type GradeCrossingChoice = "none" | "heavyRail" | "lightRail";

interface TrainAppearance {
	color: string;
}

interface TrainDefinitionSource {
	id?: string;
	name: string;
	description?: string;
	stats: TrainStats;
	elevationMultipliers: ElevationMultipliers;
	compatibleTrackTypes?: string[];
	appearance: TrainAppearance;
	elevationTransitionCosts?: true;
	gradeCrossing?: GradeCrossingChoice;
}

interface ModifiedTrainTypeSource {
	baseId: string;
	definition: TrainDefinitionSource;
}

interface GradeCrossingTphLimit {
	highway: number | null;
	major: number;
	medium: number;
	minor: number;
}

interface GradeCrossingPreset {
	gradeCrossingBaseCost: number;
	gradeCrossingMaintenancePerYear: number;
	gradeCrossingTphLimit: GradeCrossingTphLimit;
}

interface ElevationTransitionCosts {
	portalCost: number;
	rampCost: number;
}

interface TrainsYaml {
	constants: {
		standardCrossoverSpeed: number;
		elevationTransitionCosts: ElevationTransitionCosts;
		gradeCrossingPresets: {
			heavyRail: GradeCrossingPreset;
			lightRail: GradeCrossingPreset;
		};
	};
	modifiedTrainTypes: ModifiedTrainTypeSource[];
	newTrainTypes: TrainDefinitionSource[];
}

const TAB = "\t";

function indent(level: number): string {
	return TAB.repeat(level);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : String(value);
}

/** Serializes a plain JS value as a JS object/array literal, one field per line. */
function serializeValue(value: unknown, level: number): string {
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") return formatNumber(value);
	if (typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
	}
	if (isPlainObject(value)) {
		const entries = Object.entries(value);
		const lines = entries.map(
			([key, val]) => `${indent(level + 1)}${key}: ${serializeValue(val, level + 1)},`
		);
		return ["{", ...lines, `${indent(level)}}`].join("\n");
	}
	throw new Error(`Cannot serialize value: ${JSON.stringify(value)}`);
}

/** Serializes `stats`, substituting the shared crossoverSpeed constant when the source omits it. */
function serializeStats(stats: TrainStats, level: number, standardCrossoverSpeed: number): string {
	const withCrossover: Record<string, unknown> = { ...stats };
	const crossoverIsDefault =
		withCrossover.crossoverSpeed === undefined || withCrossover.crossoverSpeed === standardCrossoverSpeed;

	const lines: string[] = [];
	for (const [key, val] of Object.entries(withCrossover)) {
		if (key === "crossoverSpeed") continue;
		lines.push(`${indent(level + 1)}${key}: ${serializeValue(val, level + 1)},`);
	}
	lines.push(`${indent(level + 1)}crossoverSpeed: ${crossoverIsDefault ? "STANDARD_CROSSOVER_SPEED" : formatNumber(withCrossover.crossoverSpeed as number)},`);

	return ["{", ...lines, `${indent(level)}}`].join("\n");
}

function gradeCrossingConstantName(choice: GradeCrossingChoice): string {
	switch (choice) {
		case "none":
			return "NO_GRADE_CROSSING";
		case "heavyRail":
			return "HEAVY_RAIL_GRADE_CROSSING";
		case "lightRail":
			return "LIGHT_RAIL_GRADE_CROSSING";
	}
}

/** Serializes a train definition object, using spreads for the shared constant blocks. */
function serializeDefinition(def: TrainDefinitionSource, level: number, standardCrossoverSpeed: number): string {
	const lines: string[] = [];
	const fieldOrder: (keyof TrainDefinitionSource)[] = [
		"id",
		"name",
		"description",
		"stats",
		"elevationMultipliers",
		"compatibleTrackTypes",
		"appearance",
	];

	for (const key of fieldOrder) {
		const val = def[key];
		if (val === undefined) continue;
		if (key === "stats") {
			lines.push(`${indent(level + 1)}stats: ${serializeStats(val as TrainStats, level + 1, standardCrossoverSpeed)},`);
		} else {
			lines.push(`${indent(level + 1)}${key}: ${serializeValue(val, level + 1)},`);
		}
	}

	if (def.elevationTransitionCosts) {
		lines.push(`${indent(level + 1)}...ELEVATION_TRANSITION_COSTS,`);
	}
	if (def.gradeCrossing) {
		lines.push(`${indent(level + 1)}...${gradeCrossingConstantName(def.gradeCrossing)},`);
	}

	return ["{", ...lines, `${indent(level)}}`].join("\n");
}

function serializeGradeCrossingPreset(name: string, preset: GradeCrossingPreset, level: number): string {
	const tph = preset.gradeCrossingTphLimit;
	return [
		`${indent(level)}const ${name} = {`,
		`${indent(level + 1)}allowGradeCrossing: true,`,
		`${indent(level + 1)}gradeCrossingBaseCost: ${formatNumber(preset.gradeCrossingBaseCost)},`,
		`${indent(level + 1)}gradeCrossingMaintenancePerYear: ${formatNumber(preset.gradeCrossingMaintenancePerYear)},`,
		`${indent(level + 1)}gradeCrossingTphLimit: {`,
		`${indent(level + 2)}highway: ${tph.highway === null ? "null" : formatNumber(tph.highway)},`,
		`${indent(level + 2)}major: ${formatNumber(tph.major)},`,
		`${indent(level + 2)}medium: ${formatNumber(tph.medium)},`,
		`${indent(level + 2)}minor: ${formatNumber(tph.minor)},`,
		`${indent(level + 1)}},`,
		`${indent(level)}};`,
	].join("\n");
}

function build(): void {
	const rawYaml = fs.readFileSync(TRAINS_YAML_PATH, "utf8");
	const data = yaml.load(rawYaml) as TrainsYaml;

	const { standardCrossoverSpeed, elevationTransitionCosts, gradeCrossingPresets } = data.constants;

	const out: string[] = [];
	out.push("// AUTO-GENERATED by scripts/build.ts from src/trains.yaml. Do not edit by hand.");
	out.push('"use strict";');
	out.push("");
	out.push("(function () {");
	out.push(`${TAB}const TAG = "[DanTrains Abridged]";`);
	out.push("");
	out.push(`${TAB}const api = window.SubwayBuilderAPI;`);
	out.push(`${TAB}if (!api) {`);
	out.push(`${TAB}${TAB}console.error(\`\${TAG} SubwayBuilderAPI not found.\`);`);
	out.push(`${TAB}${TAB}return;`);
	out.push(`${TAB}}`);
	out.push("");
	out.push(`${TAB}// All rolling stock in this mod shares the same scissors-crossover speed cap.`);
	out.push(`${TAB}const STANDARD_CROSSOVER_SPEED = ${formatNumber(standardCrossoverSpeed)}; // m/s (~15 mph)`);
	out.push("");
	out.push(`${TAB}// Cost of transitioning between elevation profiles (tunnel portals, elevated ramps);`);
	out.push(`${TAB}// identical across every train type in this pack.`);
	out.push(`${TAB}const ELEVATION_TRANSITION_COSTS = {`);
	out.push(`${TAB}${TAB}portalCost: ${formatNumber(elevationTransitionCosts.portalCost)}, // surcharge per at-grade <-> cut-and-cover portal`);
	out.push(`${TAB}${TAB}rampCost: ${formatNumber(elevationTransitionCosts.rampCost)},    // surcharge per at-grade <-> elevated ramp`);
	out.push(`${TAB}};`);
	out.push("");
	out.push(`${TAB}const NO_GRADE_CROSSING = { allowGradeCrossing: false };`);
	out.push("");
	out.push(`${TAB}// Heavy-rail (subway / commuter) grade crossing rules: lower combined-direction`);
	out.push(`${TAB}// TPH caps per road class, and highway crossings are always forbidden.`);
	out.push(serializeGradeCrossingPreset("HEAVY_RAIL_GRADE_CROSSING", gradeCrossingPresets.heavyRail, 1));
	out.push("");
	out.push(`${TAB}// Light-rail grade crossing rules: cheaper maintenance and higher TPH caps than`);
	out.push(`${TAB}// heavy rail, reflecting shorter, lighter, more frequent street-running consists.`);
	out.push(serializeGradeCrossingPreset("LIGHT_RAIL_GRADE_CROSSING", gradeCrossingPresets.lightRail, 1));
	out.push("");

	out.push(`${TAB}// Overrides applied to train types that ship with the base game.`);
	out.push(`${TAB}const MODIFIED_TRAIN_TYPES = [`);
	for (const { baseId, definition } of data.modifiedTrainTypes) {
		out.push(`${TAB}${TAB}{`);
		out.push(`${TAB}${TAB}${TAB}baseId: ${JSON.stringify(baseId)},`);
		out.push(`${TAB}${TAB}${TAB}definition: ${serializeDefinition(definition, 3, standardCrossoverSpeed)},`);
		out.push(`${TAB}${TAB}},`);
	}
	out.push(`${TAB}];`);
	out.push("");

	out.push(`${TAB}// Brand-new train types added by this mod.`);
	out.push(`${TAB}const NEW_TRAIN_TYPES = [`);
	for (const def of data.newTrainTypes) {
		out.push(`${TAB}${TAB}${serializeDefinition(def, 2, standardCrossoverSpeed)},`);
	}
	out.push(`${TAB}];`);
	out.push("");

	out.push(`${TAB}function registerTrains() {`);
	out.push(`${TAB}${TAB}for (const { baseId, definition } of MODIFIED_TRAIN_TYPES) {`);
	out.push(`${TAB}${TAB}${TAB}api.trains.modifyTrainType(baseId, definition);`);
	out.push(`${TAB}${TAB}}`);
	out.push(`${TAB}${TAB}for (const definition of NEW_TRAIN_TYPES) {`);
	out.push(`${TAB}${TAB}${TAB}api.trains.registerTrainType(definition);`);
	out.push(`${TAB}${TAB}}`);
	out.push(`${TAB}}`);
	out.push("");
	out.push(`${TAB}api.hooks.onMapReady(registerTrains);`);
	out.push("})();");
	out.push("");

	fs.writeFileSync(OUTPUT_PATH, out.join("\n"));
	console.log(
		`Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)} from ${path.relative(REPO_ROOT, TRAINS_YAML_PATH)} ` +
			`(${data.modifiedTrainTypes.length} modified, ${data.newTrainTypes.length} new train types).`
	);
}

build();

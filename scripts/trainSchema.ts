// What the game's registerTrainType actually accepts, as data.
//
// Kept separate from build.ts so the compiler, the build and the tests all
// check against one list. Sourced from the Train Types API reference:
// https://www.subwaybuilder.com/docs/api-reference/trains
//
// The docs are explicit that nothing here is forgiving: "registerTrainType
// stores your object as-is -- there are no defaults filled in for missing
// stats. Every field in stats below is required; leaving one out produces NaN
// costs or broken train physics rather than an error." A silent failure mode
// is exactly the thing worth having a build check for.

/** Required in the emitted JS. All but crossoverSpeed must be in the YAML. */
export const REQUIRED_STATS: readonly string[] = [
	// Performance
	"maxSpeed",
	"maxAcceleration",
	"maxDeceleration",
	"maxLateralAcceleration",
	"maxSlopePercentage",
	"maxSpeedLocalStation",
	"crossoverSpeed",
	"stopTimeSeconds",
	// Track geometry
	"minTurnRadius",
	"minStationTurnRadius",
	"parallelTrackSpacing",
	"trackClearance",
	// Rolling stock
	"minCars",
	"maxCars",
	"carsPerCarSet",
	"capacityPerCar",
	"carLength",
	"trainWidth",
	"minStationLength",
	"maxStationLength",
	// Costs
	"carCost",
	"baseTrackCost",
	"baseStationCost",
	"trainOperationalCostPerHour",
	"carOperationalCostPerHour",
	"trackMaintenanceCostPerMeter",
	"stationMaintenanceCostPerYear",
	// Capacity
	"tphLimit",
];

/** Supplied by the build from constants.standardCrossoverSpeed when omitted. */
export const BUILD_SUPPLIED_STATS: readonly string[] = ["crossoverSpeed"];

/** Stats the game no longer reads, mapped to why. Dead weight, so flagged. */
export const REMOVED_STATS: Readonly<Record<string, string>> = {
	scissorsCrossoverCost: 'the docs list this under "Removed: scissorsCrossoverCost is no longer a stat"',
};

/** Old spellings, mapped to what they are called now. */
export const RENAMED_FIELDS: Readonly<Record<string, string>> = {
	gradeCrossingMaintenancePerYear: "gradeCrossingMaintenancePerDay",
};

export const ELEVATION_KEYS: readonly string[] = [
	"DEEP_BORE",
	"STANDARD_TUNNEL",
	"CUT_AND_COVER",
	"AT_GRADE",
	"ELEVATED",
	"TRENCHED",
	"RAMP",
];

/** Pairs that the game reads as a range; a is not allowed to exceed b. */
const ORDERED_PAIRS: readonly [string, string][] = [
	["minCars", "maxCars"],
	["minStationLength", "maxStationLength"],
	["minTurnRadius", "minStationTurnRadius"],
	["maxSpeedLocalStation", "maxSpeed"],
	["crossoverSpeed", "maxSpeed"],
];

const WHOLE_NUMBER_STATS: readonly string[] = ["minCars", "maxCars", "carsPerCarSet", "capacityPerCar"];

/** Structurally loose on purpose: it has to accept both the YAML source
 *  shape and an already-emitted definition read back from JS. */
export interface TrainLike {
	id?: string;
	name?: string;
	stats?: Readonly<Record<string, unknown>>;
	elevationMultipliers?: Readonly<Record<string, unknown>> | object;
	appearance?: { color?: string };
}

/**
 * Checks one train against the schema.
 *
 * @param suppliedByBuild stats the build fills in, so their absence from the
 *   source is fine. Pass [] to check an already-emitted definition.
 */
export function validateTrain(
	label: string,
	train: TrainLike,
	suppliedByBuild: readonly string[] = BUILD_SUPPLIED_STATS
): string[] {
	const problems: string[] = [];
	const stats = train.stats ?? {};

	for (const key of REQUIRED_STATS) {
		if (suppliedByBuild.indexOf(key) !== -1) continue;
		if (!(key in stats)) {
			problems.push(`${label}: missing required stat "${key}"`);
		}
	}

	for (const [key, value] of Object.entries(stats)) {
		if (key in REMOVED_STATS) {
			problems.push(`${label}: stat "${key}" should be removed -- ${REMOVED_STATS[key]}`);
			continue;
		}
		if (key in RENAMED_FIELDS) {
			problems.push(`${label}: stat "${key}" was renamed to "${RENAMED_FIELDS[key]}"`);
			continue;
		}
		if (REQUIRED_STATS.indexOf(key) === -1) {
			problems.push(`${label}: unknown stat "${key}" -- the game will ignore it`);
			continue;
		}
		if (typeof value !== "number" || !Number.isFinite(value)) {
			problems.push(`${label}: stat "${key}" must be a finite number, got ${JSON.stringify(value)}`);
			continue;
		}
		if (WHOLE_NUMBER_STATS.indexOf(key) !== -1 && !Number.isInteger(value)) {
			problems.push(`${label}: stat "${key}" must be a whole number, got ${value}`);
		}
	}

	for (const [low, high] of ORDERED_PAIRS) {
		const a = stats[low];
		const b = stats[high];
		if (typeof a === "number" && typeof b === "number" && a > b) {
			problems.push(`${label}: ${low} (${a}) exceeds ${high} (${b})`);
		}
	}

	if (train.elevationMultipliers) {
		const multipliers = train.elevationMultipliers as Record<string, unknown>;
		for (const key of ELEVATION_KEYS) {
			if (!(key in multipliers)) {
				problems.push(`${label}: elevationMultipliers is missing "${key}"`);
			}
		}
	}

	const color = train.appearance?.color;
	if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) {
		problems.push(`${label}: appearance.color must be a 6-digit hex string, got ${JSON.stringify(color)}`);
	}

	if (train.id !== undefined && !/^[a-z0-9-]+$/.test(train.id)) {
		problems.push(`${label}: id "${train.id}" must be lowercase letters, numbers and dashes`);
	}

	return problems;
}

/** Checks the shared grade-crossing presets for stale field names. */
export function validateGradeCrossingPreset(label: string, preset: Record<string, unknown>): string[] {
	const problems: string[] = [];
	for (const key of Object.keys(preset)) {
		if (key in RENAMED_FIELDS) {
			problems.push(`${label}: "${key}" was renamed to "${RENAMED_FIELDS[key]}"`);
		}
	}
	return problems;
}

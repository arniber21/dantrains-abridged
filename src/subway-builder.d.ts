// Ambient typings for the slice of window.SubwayBuilderAPI this mod touches.
//
// Hand-written on purpose. The game ships no type package, and this file is a
// `declare`-only script (no imports/exports) so it applies globally to src/*.ts
// without any module plumbing.

/**
 * Every stat the game requires.
 *
 * All fields are mandatory. Per the API docs, registerTrainType "stores your
 * object as-is -- there are no defaults filled in for missing stats. Every
 * field in stats below is required; leaving one out produces NaN costs or
 * broken train physics rather than an error."
 *
 * That is why this interface has no optional members: TypeScript refuses to
 * build a stats object with a hole in it, which is the whole point.
 */
interface TrainStats {
	// Performance
	maxSpeed: number;                     // m/s
	maxAcceleration: number;              // m/s^2
	maxDeceleration: number;              // m/s^2
	maxLateralAcceleration: number;       // m/s^2, sets curve speed limits
	maxSlopePercentage: number;           // percent
	maxSpeedLocalStation: number;         // m/s through non-stopping stations
	crossoverSpeed: number;               // m/s over a scissors crossover
	stopTimeSeconds: number;              // dwell per station stop

	// Track geometry
	minTurnRadius: number;                // m
	minStationTurnRadius: number;         // m
	parallelTrackSpacing: number;         // m, edge to edge
	trackClearance: number;               // m, track edge to tunnel wall

	// Rolling stock
	minCars: number;
	maxCars: number;
	carsPerCarSet: number;
	capacityPerCar: number;
	carLength: number;                    // m
	trainWidth: number;                   // m
	minStationLength: number;             // m
	maxStationLength: number;             // m

	// Costs
	carCost: number;
	baseTrackCost: number;                // per m, cut-and-cover double track
	baseStationCost: number;              // cut-and-cover double-track station
	trainOperationalCostPerHour: number;
	carOperationalCostPerHour: number;
	trackMaintenanceCostPerMeter: number; // per year
	stationMaintenanceCostPerYear: number;

	// Capacity
	tphLimit: number;
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

interface GradeCrossingTphLimit {
	highway: number | null;
	major: number | null;
	medium: number | null;
	minor: number | null;
}

interface TrainDefinition {
	id: string;
	name: string;
	description?: string;
	stats: TrainStats;
	compatibleTrackTypes?: string[];
	appearance: { color: string };
	elevationMultipliers?: ElevationMultipliers;

	/** Surcharge per at-grade <-> cut-and-cover portal. */
	portalCost?: number;
	/** Surcharge per at-grade <-> elevated ramp. */
	rampCost?: number;
	/** Max clear span (m) when bridging over a building. */
	maxOverpassSpan?: number;

	allowGradeCrossing?: boolean;
	gradeCrossingBaseCost?: number;
	gradeCrossingMaintenancePerDay?: number;
	gradeCrossingTphLimit?: GradeCrossingTphLimit;
}

/** Opaque element handle -- we only ever hand these back to the game. */
type SbNode = unknown;

interface SbReact {
	createElement(
		type: unknown,
		props?: Record<string, unknown> | null,
		...children: SbNode[]
	): SbNode;
	useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void];
	useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
}

/**
 * Storage is scoped to the mod, but the game only knows which mod is calling
 * while your code runs synchronously. Call `scoped()` before the first `await`
 * and use the returned object thereafter.
 *
 * Desktop (Electron) only. In the browser every method is a safe no-op that
 * resolves to the default without persisting anything.
 */
interface SbScopedStorage {
	readonly modId?: string;
	get<T>(key: string, defaultValue: T, modId?: string): Promise<T>;
	set(key: string, value: unknown, modId?: string): Promise<void>;
	delete(key: string, modId?: string): Promise<void>;
	keys(modId?: string): Promise<string[]>;
}

interface SbStorage extends SbScopedStorage {
	/** Absent on older builds -- always feature-detect before calling. */
	scoped?(): SbScopedStorage;
}

interface SbToolbarPanel {
	id: string;
	icon: string;
	tooltip: string;
	title: string;
	width?: number;
	render: () => SbNode;
}

// Members are optional wherever a real build has been observed to lack them.
// The docs describe a newer API than some shipping versions expose, so the UI
// feature-detects rather than trusting this file.
interface SubwayBuilderApi {
	trains: {
		registerTrainType(definition: TrainDefinition): void;
		getTrainTypes?(): TrainDefinition[];
	};
	storage?: SbStorage;
	ui: {
		addToolbarPanel?(panel: SbToolbarPanel): void;
		showNotification?(
			message: string,
			kind?: "success" | "info" | "error" | "warning"
		): void;
	};
	hooks: {
		onMapReady(callback: () => void): void;
	};
	utils: {
		React: SbReact;
		components: Record<string, unknown>;
		icons: Record<string, unknown>;
	};
}

declare const window: { SubwayBuilderAPI?: SubwayBuilderApi };
declare const console: { log(...args: unknown[]): void; error(...args: unknown[]): void };

/**
 * The renderer's own storage. Unlike api.storage this has no notion of mod
 * context, so it works from event handlers on builds where the mod storage
 * API does not. Always guard with `typeof localStorage` -- it is not
 * guaranteed to exist, and a bare reference to a missing global throws.
 */
declare const localStorage:
	| {
			getItem(key: string): string | null;
			setItem(key: string, value: string): void;
			removeItem(key: string): void;
			key(index: number): string | null;
			readonly length: number;
	  }
	| undefined;

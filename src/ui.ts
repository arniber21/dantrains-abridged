// Custom-train editor: a toolbar panel for creating train types in-game.
//
// Compiled to plain JS and appended to index.js by scripts/build.ts. Mods are
// evaluated via `new Function()` with no import support, so this file is a
// script, not a module -- no imports, no exports, one self-contained IIFE.
//
// Types come from src/subway-builder.d.ts.

(function () {
	const TAG = "[BasedGoat Trains]";
	const STORAGE_KEY = "customTrains";
	const MOD_ID = "basedgoat-trains"; // must match manifest.json

	const maybeApi = window.SubwayBuilderAPI;
	if (!maybeApi) {
		console.error(`${TAG} SubwayBuilderAPI not found.`);
		return;
	}
	// Re-bind non-optional: narrowing from the guard above doesn't reach the
	// hoisted function declarations further down.
	const api: SubwayBuilderApi = maybeApi;

	function notify(message: string, kind: "success" | "info" | "error" | "warning"): void {
		if (typeof api.ui.showNotification === "function") api.ui.showNotification(message, kind);
		else console.log(`${TAG} ${kind}: ${message}`);
	}

	interface Store {
		get<T>(key: string, fallback: T): Promise<T>;
		set(key: string, value: unknown): Promise<void>;
		keys(): Promise<string[]>;
		/** False when writes go nowhere: no storage API, or a browser build. */
		readonly persistent: boolean;
	}

	/**
	 * The storage surface varies by game version. Newer builds expose
	 * `scoped()`; older ones only take an explicit modId; some expose nothing.
	 * Detect which, and fall back to session-only memory rather than throwing --
	 * a missing storage API should cost you persistence, not the whole mod.
	 */
	function makeStore(): Store {
		const raw = api.storage;

		if (raw && typeof raw.scoped === "function") {
			// Must be called before the first `await`: the game resolves the
			// calling mod from the synchronous call stack, and that context is
			// gone once a promise has been awaited.
			const scoped = raw.scoped();
			return {
				get: (key, fallback) => scoped.get(key, fallback),
				set: (key, value) => scoped.set(key, value),
				keys: () => scoped.keys(),
				persistent: true,
			};
		}

		if (raw && typeof raw.get === "function" && typeof raw.set === "function") {
			// No scoped(); pass the mod id explicitly so post-await calls still
			// resolve to our namespace. Builds that ignore the argument are
			// unaffected by it.
			return {
				get: (key, fallback) => raw.get(key, fallback, MOD_ID),
				set: (key, value) => raw.set(key, value, MOD_ID),
				keys: () => (typeof raw.keys === "function" ? raw.keys(MOD_ID) : Promise.resolve([])),
				persistent: true,
			};
		}

		console.log(`${TAG} no storage API on this build; custom trains will last this session only.`);
		const memory: Record<string, unknown> = {};
		return {
			get: async <T,>(key: string, fallback: T): Promise<T> =>
				key in memory ? (memory[key] as T) : fallback,
			set: async (key: string, value: unknown): Promise<void> => {
				memory[key] = value;
			},
			keys: async (): Promise<string[]> => Object.keys(memory),
			persistent: false,
		};
	}

	const store = makeStore();

	const h = api.utils.React.createElement;
	const { useState, useEffect } = api.utils.React;

	// Starting point for a new train: a generic heavy-rail metro. Every one of
	// the 28 required stats is present, so a half-filled form still produces a
	// valid train instead of NaN costs.
	const DEFAULT_STATS: TrainStats = {
		maxSpeed: 31.3,
		maxAcceleration: 1.25,
		maxDeceleration: 1.1,
		maxLateralAcceleration: 1.5,
		maxSlopePercentage: 4,
		maxSpeedLocalStation: 14,
		crossoverSpeed: 6.7,
		stopTimeSeconds: 30,
		minTurnRadius: 45,
		minStationTurnRadius: 900,
		parallelTrackSpacing: 3.76,
		trackClearance: 1.86,
		minCars: 4,
		maxCars: 8,
		carsPerCarSet: 2,
		capacityPerCar: 200,
		carLength: 22.86,
		trainWidth: 3.09,
		minStationLength: 100,
		maxStationLength: 200,
		carCost: 2500000,
		baseTrackCost: 35000,
		baseStationCost: 65000000,
		trainOperationalCostPerHour: 200,
		carOperationalCostPerHour: 20,
		trackMaintenanceCostPerMeter: 300,
		stationMaintenanceCostPerYear: 160000,
		tphLimit: 30,
	};

	const DEFAULT_ELEVATION: ElevationMultipliers = {
		DEEP_BORE: 4.9,
		STANDARD_TUNNEL: 2.09,
		CUT_AND_COVER: 1.04,
		AT_GRADE: 0.3,
		ELEVATED: 0.83,
		TRENCHED: 0.52,
		RAMP: 0.52,
	};

	// Drives the form layout. Adding a stat here is the only edit needed to
	// expose it -- the inputs are generated from this list.
	const STAT_GROUPS: { title: string; keys: (keyof TrainStats)[] }[] = [
		{
			title: "Performance",
			keys: [
				"maxSpeed",
				"maxAcceleration",
				"maxDeceleration",
				"maxLateralAcceleration",
				"maxSlopePercentage",
				"maxSpeedLocalStation",
				"crossoverSpeed",
				"stopTimeSeconds",
			],
		},
		{
			title: "Track geometry",
			keys: ["minTurnRadius", "minStationTurnRadius", "parallelTrackSpacing", "trackClearance"],
		},
		{
			title: "Rolling stock",
			keys: [
				"minCars",
				"maxCars",
				"carsPerCarSet",
				"capacityPerCar",
				"carLength",
				"trainWidth",
				"minStationLength",
				"maxStationLength",
			],
		},
		{
			title: "Costs",
			keys: [
				"carCost",
				"baseTrackCost",
				"baseStationCost",
				"trainOperationalCostPerHour",
				"carOperationalCostPerHour",
				"trackMaintenanceCostPerMeter",
				"stationMaintenanceCostPerYear",
				"tphLimit",
			],
		},
	];

	interface Draft {
		id: string;
		name: string;
		description: string;
		color: string;
		trackTypes: string;
		stats: TrainStats;
	}

	function newDraft(): Draft {
		return {
			id: "",
			name: "",
			description: "",
			color: "#60fb87",
			trackTypes: "",
			stats: { ...DEFAULT_STATS },
		};
	}

	function toDefinition(draft: Draft): TrainDefinition {
		const trackTypes = draft.trackTypes
			.split(",")
			.map((t) => t.trim())
			.filter((t) => t.length > 0);

		return {
			id: draft.id,
			name: draft.name.trim(),
			description: draft.description,
			stats: { ...draft.stats },
			compatibleTrackTypes: trackTypes.length > 0 ? trackTypes : [draft.id],
			appearance: { color: draft.color },
			elevationMultipliers: { ...DEFAULT_ELEVATION },
		};
	}

	// ---------------------------------------------------------------------
	// Validation
	// ---------------------------------------------------------------------

	// Zero here means a divide-by-zero or a physically impossible train.
	// Costs and dwell time are deliberately absent: free and instant are legal.
	const MUST_BE_POSITIVE: (keyof TrainStats)[] = [
		"maxSpeed",
		"maxAcceleration",
		"maxDeceleration",
		"maxLateralAcceleration",
		"maxSlopePercentage",
		"maxSpeedLocalStation",
		"crossoverSpeed",
		"minTurnRadius",
		"minStationTurnRadius",
		"parallelTrackSpacing",
		"trackClearance",
		"minCars",
		"maxCars",
		"carsPerCarSet",
		"capacityPerCar",
		"carLength",
		"trainWidth",
		"minStationLength",
		"maxStationLength",
		"tphLimit",
	];

	const MUST_BE_WHOLE: (keyof TrainStats)[] = ["minCars", "maxCars", "carsPerCarSet", "capacityPerCar"];

	interface Validation {
		/** Keyed by draft field name or stat key, for rendering inline. */
		fieldErrors: Record<string, string>;
		/** Legal values that are probably a mistake. These never block a save. */
		warnings: string[];
	}

	function errorCount(v: Validation): number {
		return Object.keys(v.fieldErrors).length;
	}

	/** Ids already registered, so we can warn before replacing one wholesale. */
	function takenIds(): string[] {
		if (typeof api.trains.getTrainTypes !== "function") return [];
		try {
			const types = api.trains.getTrainTypes();
			return Array.isArray(types) ? types.map((t) => t.id) : [];
		} catch {
			return [];
		}
	}

	function round(value: number): string {
		return (Math.round(value * 10) / 10).toString();
	}

	function validate(draft: Draft, existingIds: string[]): Validation {
		const fieldErrors: Record<string, string> = {};
		const warnings: string[] = [];
		const s = draft.stats;

		// --- Identity ---
		if (draft.id.trim().length === 0) {
			fieldErrors.id = "Required.";
		} else if (!/^[a-z0-9-]+$/.test(draft.id)) {
			fieldErrors.id = "Lowercase letters, numbers and dashes only.";
		} else if (existingIds.indexOf(draft.id) !== -1) {
			warnings.push(`"${draft.id}" already exists — saving replaces that train type wholesale.`);
		}

		if (draft.name.trim().length === 0) fieldErrors.name = "Required.";
		if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) fieldErrors.color = "Needs a 6-digit hex colour, e.g. #60fb87.";

		for (const type of draft.trackTypes.split(",")) {
			const t = type.trim();
			if (t.length > 0 && !/^[a-z0-9-]+$/.test(t)) {
				fieldErrors.trackTypes = `"${t}" is not a valid track type id.`;
				break;
			}
		}

		// --- Per-stat ---
		for (const key of Object.keys(s) as (keyof TrainStats)[]) {
			const value = s[key];
			if (!Number.isFinite(value)) {
				fieldErrors[key] = "Must be a number.";
			} else if (value < 0) {
				fieldErrors[key] = "Cannot be negative.";
			} else if (value === 0 && MUST_BE_POSITIVE.indexOf(key) !== -1) {
				fieldErrors[key] = "Must be greater than 0.";
			} else if (MUST_BE_WHOLE.indexOf(key) !== -1 && !Number.isInteger(value)) {
				fieldErrors[key] = "Must be a whole number.";
			}
		}

		// --- Cross-field, only where both sides are individually sound ---
		const ok = (...keys: (keyof TrainStats)[]): boolean =>
			keys.every((k) => fieldErrors[k] === undefined);

		if (ok("minCars", "maxCars") && s.minCars > s.maxCars) {
			fieldErrors.maxCars = "Cannot be below minCars.";
		}
		if (ok("minStationLength", "maxStationLength") && s.minStationLength > s.maxStationLength) {
			fieldErrors.maxStationLength = "Cannot be below minStationLength.";
		}
		if (ok("minTurnRadius", "minStationTurnRadius") && s.minTurnRadius > s.minStationTurnRadius) {
			fieldErrors.minStationTurnRadius = "Cannot be below minTurnRadius.";
		}
		if (ok("maxSpeed", "maxSpeedLocalStation") && s.maxSpeedLocalStation > s.maxSpeed) {
			fieldErrors.maxSpeedLocalStation = "Cannot exceed maxSpeed.";
		}
		if (ok("maxSpeed", "crossoverSpeed") && s.crossoverSpeed > s.maxSpeed) {
			fieldErrors.crossoverSpeed = "Cannot exceed maxSpeed.";
		}

		// --- Warnings: legal, but usually a slip ---
		if (ok("minCars", "carsPerCarSet") && s.minCars % s.carsPerCarSet !== 0) {
			warnings.push(`minCars (${s.minCars}) is not a multiple of carsPerCarSet (${s.carsPerCarSet}).`);
		}
		if (ok("maxCars", "carsPerCarSet") && s.maxCars % s.carsPerCarSet !== 0) {
			warnings.push(`maxCars (${s.maxCars}) is not a multiple of carsPerCarSet (${s.carsPerCarSet}).`);
		}
		if (ok("minStationLength", "carLength", "minCars") && s.minStationLength < s.carLength * s.minCars) {
			warnings.push(
				`minStationLength is under carLength x minCars (${round(s.carLength * s.minCars)} m) — the shortest train won't fit.`
			);
		}
		if (ok("maxStationLength", "carLength", "maxCars") && s.maxStationLength < s.carLength * s.maxCars) {
			warnings.push(
				`maxStationLength is under carLength x maxCars (${round(s.carLength * s.maxCars)} m) — the longest train won't fit.`
			);
		}
		if (ok("maxSpeed") && s.maxSpeed > 90) {
			warnings.push(`maxSpeed is metres per second — ${round(s.maxSpeed)} m/s is ${round(s.maxSpeed * 3.6)} km/h.`);
		}
		if (ok("maxSlopePercentage") && s.maxSlopePercentage > 12) {
			warnings.push(`maxSlopePercentage of ${round(s.maxSlopePercentage)}% is steeper than any real adhesion railway.`);
		}
		if (ok("trainWidth", "parallelTrackSpacing") && s.parallelTrackSpacing < s.trainWidth) {
			warnings.push("parallelTrackSpacing is narrower than trainWidth — check clearances.");
		}

		return { fieldErrors, warnings };
	}

	// ---------------------------------------------------------------------
	// Persistence
	// ---------------------------------------------------------------------

	async function loadSaved(): Promise<TrainDefinition[]> {
		return await store.get<TrainDefinition[]>(STORAGE_KEY, []);
	}

	/** Persists and reports whether the write actually stuck. */
	async function persist(trains: TrainDefinition[]): Promise<boolean> {
		await store.set(STORAGE_KEY, trains);
		if (!store.persistent) return false;
		// Browser builds make every storage call a silent no-op, so confirm the
		// key exists rather than trusting set() to have done something.
		const keys = await store.keys();
		return keys.indexOf(STORAGE_KEY) !== -1;
	}

	function register(definition: TrainDefinition): void {
		api.trains.registerTrainType(definition);
	}

	// Re-register saved trains on every load. registerTrainType replaces an
	// existing id wholesale, so this is safe to run repeatedly.
	api.hooks.onMapReady(() => {
		void loadSaved().then((trains) => {
			for (const train of trains) register(train);
			if (trains.length > 0) console.log(`${TAG} restored ${trains.length} custom train(s).`);
		});
	});

	// ---------------------------------------------------------------------
	// UI
	// ---------------------------------------------------------------------

	function readNumber(event: unknown): number {
		const value = (event as { target: { value: string } }).target.value;
		return value.trim() === "" ? NaN : Number(value);
	}

	function readText(event: unknown): string {
		return (event as { target: { value: string } }).target.value;
	}

	const INPUT_BASE = "w-full rounded border bg-background px-2 py-1 text-sm ";
	const INPUT_OK = INPUT_BASE + "border-input";
	const INPUT_BAD = INPUT_BASE + "border-destructive";

	/** Label + control + inline error, the shape every field in the form uses. */
	function field(key: string, label: string, error: string | undefined, control: SbNode): SbNode {
		return h("label", { key, className: "block space-y-1" }, [
			h("span", { key: "l", className: "text-xs text-muted-foreground" }, label),
			control,
			error === undefined ? null : h("span", { key: "e", className: "block text-xs text-destructive" }, error),
		]);
	}

	function textField(
		key: string,
		label: string,
		value: string,
		error: string | undefined,
		onChange: (next: string) => void,
		placeholder?: string
	): SbNode {
		return field(
			key,
			label,
			error,
			h("input", {
				key: "i",
				type: "text",
				className: error === undefined ? INPUT_OK : INPUT_BAD,
				value,
				placeholder: placeholder ?? "",
				onChange: (e: unknown) => onChange(readText(e)),
			})
		);
	}

	function TrainEditorPanel(): SbNode {
		const [saved, setSaved] = useState<TrainDefinition[]>([]);
		const [draft, setDraft] = useState<Draft>(newDraft);
		// Blank id/name are errors, but nagging about them before the first save
		// attempt is obnoxious. Stat errors always show -- those fields start
		// prefilled, so anything wrong with them is something you typed.
		const [attempted, setAttempted] = useState<boolean>(false);

		useEffect(() => {
			void loadSaved().then(setSaved);
		}, []);

		const v = validate(draft, takenIds());
		const blocked = errorCount(v) > 0;

		/** Suppresses "Required." on untouched identity fields. */
		function identityError(key: "id" | "name" | "color" | "trackTypes", value: string): string | undefined {
			if (!attempted && value.trim().length === 0) return undefined;
			return v.fieldErrors[key];
		}

		function setStat(key: keyof TrainStats, value: number): void {
			setDraft((prev) => ({ ...prev, stats: { ...prev.stats, [key]: value } }));
		}

		async function onSave(): Promise<void> {
			setAttempted(true);
			if (blocked) {
			notify(
					`Cannot save: ${errorCount(v)} field${errorCount(v) === 1 ? "" : "s"} need fixing.`,
					"error"
				);
				return;
			}

			const definition = toDefinition(draft);
			const next = saved.filter((t) => t.id !== definition.id).concat(definition);

			register(definition);
			const stuck = await persist(next);

			setSaved(next);
			setDraft(newDraft());
			setAttempted(false);
			notify(
				stuck
					? `Saved "${definition.name}".`
					: `Registered "${definition.name}", but storage is unavailable — it will be gone after a reload.`,
				stuck ? "success" : "warning"
			);
		}

		async function onDelete(id: string): Promise<void> {
			const next = saved.filter((t) => t.id !== id);
			await persist(next);
			setSaved(next);
			// There is no unregisterTrainType, so the type stays live this session.
			notify("Deleted. Reload the game to clear it from the picker.", "info");
		}

		const savedList: SbNode[] =
			saved.length === 0
				? [h("p", { key: "none", className: "text-xs text-muted-foreground" }, "No custom trains yet.")]
				: saved.map((train) =>
						h("div", { key: train.id, className: "flex items-center justify-between gap-2" }, [
							h("span", { key: "n", className: "flex items-center gap-2 text-sm" }, [
								h("span", {
									key: "dot",
									className: "inline-block h-3 w-3 rounded-full",
									style: { backgroundColor: train.appearance.color },
								}),
								train.name,
							]),
							h(
								"button",
								{
									key: "d",
									className: "text-xs text-destructive underline",
									onClick: () => void onDelete(train.id),
								},
								"Delete"
							),
						])
					);

		const statInputs: SbNode[] = STAT_GROUPS.map((group) =>
			h("div", { key: group.title, className: "space-y-2" }, [
				h("h4", { key: "t", className: "text-xs font-semibold uppercase text-muted-foreground" }, group.title),
				h(
					"div",
					{ key: "g", className: "grid grid-cols-2 gap-2" },
					group.keys.map((key) => {
						const error = v.fieldErrors[key];
						return field(
							key,
							key,
							error,
							h("input", {
								key: "i",
								type: "number",
								step: "any",
								className: error === undefined ? INPUT_OK : INPUT_BAD,
								value: Number.isFinite(draft.stats[key]) ? String(draft.stats[key]) : "",
								onChange: (e: unknown) => setStat(key, readNumber(e)),
							})
						);
					})
				),
			])
		);

		const notices: SbNode[] = [];
		if (blocked && attempted) {
			notices.push(
				h(
					"p",
					{ key: "errs", className: "text-xs text-destructive" },
					`${errorCount(v)} field${errorCount(v) === 1 ? "" : "s"} need fixing before this can be saved.`
				)
			);
		}
		for (const warning of v.warnings) {
			notices.push(h("p", { key: warning, className: "text-xs text-yellow-600" }, `Warning: ${warning}`));
		}

		return h("div", { className: "space-y-4 p-4" }, [
			h("section", { key: "saved", className: "space-y-2" }, [
				h("h3", { key: "t", className: "text-sm font-semibold" }, "Custom trains"),
				...savedList,
			]),

			h("hr", { key: "sep", className: "border-border" }),

			h("section", { key: "form", className: "space-y-3" }, [
				h("h3", { key: "t", className: "text-sm font-semibold" }, "Add a train"),

				textField("id", "ID (lowercase, no spaces)", draft.id, identityError("id", draft.id), (val) =>
					setDraft((p) => ({ ...p, id: val })), "my-train"),
				textField("name", "Name", draft.name, identityError("name", draft.name), (val) =>
					setDraft((p) => ({ ...p, name: val })), "My Train"),
				textField("desc", "Description", draft.description, undefined, (val) =>
					setDraft((p) => ({ ...p, description: val }))),
				textField("color", "Colour (hex)", draft.color, identityError("color", draft.color), (val) =>
					setDraft((p) => ({ ...p, color: val })), "#60fb87"),
				textField(
					"tracks",
					"Compatible track types (comma separated, blank = its own)",
					draft.trackTypes,
					identityError("trackTypes", draft.trackTypes),
					(val) => setDraft((p) => ({ ...p, trackTypes: val })),
					"bart, caltrain"
				),

				...statInputs,
				...notices,

				h(
					"button",
					{
						key: "save",
						// Deliberately never disabled: a dead button doesn't explain
						// itself. Clicking reveals what's wrong instead.
						className: "w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground",
						onClick: () => void onSave(),
					},
					"Save train"
				),
			]),
		]);
	}

	if (typeof api.ui.addToolbarPanel !== "function") {
		console.error(`${TAG} api.ui.addToolbarPanel is unavailable; skipping the train editor.`);
		return;
	}

	api.ui.addToolbarPanel({
		id: "basedgoat-train-editor",
		icon: "Train",
		tooltip: "Custom Trains",
		title: "Custom Trains",
		width: 420,
		// Passing the component rather than calling it: hooks are only legal
		// inside a component React itself renders.
		render: () => h(TrainEditorPanel),
	});
})();

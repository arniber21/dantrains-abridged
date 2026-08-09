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

	const maybeApi = window.SubwayBuilderAPI;
	if (!maybeApi) {
		console.error(`${TAG} SubwayBuilderAPI not found.`);
		return;
	}
	// Re-bind non-optional: narrowing from the guard above doesn't reach the
	// hoisted function declarations further down.
	const api: SubwayBuilderApi = maybeApi;

	// MUST run before the first `await`. The game resolves which mod is calling
	// from the synchronous call stack; after an await that context is gone and
	// storage calls would land in the wrong namespace (or nowhere).
	const store = api.storage.scoped();

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
			name: draft.name,
			description: draft.description,
			stats: { ...draft.stats },
			compatibleTrackTypes: trackTypes.length > 0 ? trackTypes : [draft.id],
			appearance: { color: draft.color },
			elevationMultipliers: { ...DEFAULT_ELEVATION },
		};
	}

	/** Returns an error message, or null when the draft is good. */
	function validate(draft: Draft): string | null {
		if (!/^[a-z0-9-]+$/.test(draft.id)) {
			return "ID must be lowercase letters, numbers and dashes only.";
		}
		if (draft.name.trim().length === 0) return "Name is required.";
		for (const [key, value] of Object.entries(draft.stats)) {
			if (!Number.isFinite(value)) return `${key} must be a number.`;
		}
		return null;
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
		return value === "" ? NaN : Number(value);
	}

	function readText(event: unknown): string {
		return (event as { target: { value: string } }).target.value;
	}

	const INPUT_CLASS =
		"w-full rounded border border-input bg-background px-2 py-1 text-sm";

	function textField(
		key: string,
		label: string,
		value: string,
		onChange: (next: string) => void,
		placeholder?: string
	): SbNode {
		return h("label", { key, className: "block space-y-1" }, [
			h("span", { key: "l", className: "text-xs text-muted-foreground" }, label),
			h("input", {
				key: "i",
				type: "text",
				className: INPUT_CLASS,
				value,
				placeholder: placeholder ?? "",
				onChange: (e: unknown) => onChange(readText(e)),
			}),
		]);
	}

	function TrainEditorPanel(): SbNode {
		const [saved, setSaved] = useState<TrainDefinition[]>([]);
		const [draft, setDraft] = useState<Draft>(newDraft);
		const [status, setStatus] = useState<string>("");

		useEffect(() => {
			void loadSaved().then(setSaved);
		}, []);

		function setStat(key: keyof TrainStats, value: number): void {
			setDraft((prev) => ({ ...prev, stats: { ...prev.stats, [key]: value } }));
		}

		async function onSave(): Promise<void> {
			const error = validate(draft);
			if (error) {
				setStatus(error);
				return;
			}

			const definition = toDefinition(draft);
			const next = saved.filter((t) => t.id !== definition.id).concat(definition);

			register(definition);
			const stuck = await persist(next);

			setSaved(next);
			setDraft(newDraft());
			setStatus("");
			api.ui.showNotification(
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
			api.ui.showNotification("Deleted. Reload the game to clear it from the picker.", "info");
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
					group.keys.map((key) =>
						h("label", { key, className: "block space-y-1" }, [
							h("span", { key: "l", className: "text-xs text-muted-foreground" }, key),
							h("input", {
								key: "i",
								type: "number",
								step: "any",
								className: INPUT_CLASS,
								value: String(draft.stats[key]),
								onChange: (e: unknown) => setStat(key, readNumber(e)),
							}),
						])
					)
				),
			])
		);

		return h("div", { className: "space-y-4 p-4" }, [
			h("section", { key: "saved", className: "space-y-2" }, [
				h("h3", { key: "t", className: "text-sm font-semibold" }, "Custom trains"),
				...savedList,
			]),

			h("hr", { key: "sep", className: "border-border" }),

			h("section", { key: "form", className: "space-y-3" }, [
				h("h3", { key: "t", className: "text-sm font-semibold" }, "Add a train"),

				textField("id", "ID (lowercase, no spaces)", draft.id, (v) => setDraft((p) => ({ ...p, id: v })), "my-train"),
				textField("name", "Name", draft.name, (v) => setDraft((p) => ({ ...p, name: v })), "My Train"),
				textField("desc", "Description", draft.description, (v) => setDraft((p) => ({ ...p, description: v }))),
				textField("color", "Colour (hex)", draft.color, (v) => setDraft((p) => ({ ...p, color: v })), "#60fb87"),
				textField(
					"tracks",
					"Compatible track types (comma separated, blank = its own)",
					draft.trackTypes,
					(v) => setDraft((p) => ({ ...p, trackTypes: v })),
					"bart, caltrain"
				),

				...statInputs,

				status.length > 0
					? h("p", { key: "err", className: "text-xs text-destructive" }, status)
					: null,

				h(
					"button",
					{
						key: "save",
						className: "w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground",
						onClick: () => void onSave(),
					},
					"Save train"
				),
			]),
		]);
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

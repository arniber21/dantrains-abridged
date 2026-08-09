# BasedGoat Trains

A [Subway Builder Modded](https://subwaybuildermodded.com/) mod adding a roster of real-world-inspired heavy rail metro rolling stock.

This is built around a YAML-driven compiler workflow instead of hand-written JS.

## How it works

The mod ships as `index.js` + `manifest.json`, loaded by the game via `window.SubwayBuilderAPI`. Neither of those is hand-edited directly:

- **`trains.yaml`** is the source of truth for every train's stats, elevation multipliers, appearance, and grade-crossing behavior, plus the shared constants they draw from.
- **`scripts/build.ts`** compiles `trains.yaml` into `index.js`.
- **`scripts/zip.ts`** packages `index.js` + `manifest.json` into `BasedGoatTrains-Abridged.zip` for distribution.

## Adding or editing a train

1. **Edit `trains.yaml`**:
   - New train type → add an entry under `newTrainTypes`. Required fields: `id`, `name`, `stats`, `elevationMultipliers`, `appearance.color`. Optional: `description`, `compatibleTrackTypes`, `elevationTransitionCosts: true` (applies the shared portal/ramp surcharge), `gradeCrossing: none|heavyRail|lightRail`.
   - Override an existing base-game train → add an entry under `modifiedTrainTypes` instead, with `baseId` + `definition` (same shape, no `id`).
   - `stats.crossoverSpeed` can be omitted; it defaults to `constants.standardCrossoverSpeed`.

2. **Run `npm run build`** to regenerate `index.js` from the YAML. Do not hand-edit `index.js` — it's auto-generated and will be overwritten.

3. **Test in-game.**

4. **Commit both `trains.yaml` and the regenerated `index.js` together.** CI fails the build if the committed `index.js` doesn't match what `trains.yaml` compiles to, so they always move as a pair.

## In-game train editor

`index.js` also carries a toolbar panel ("Custom Trains", train icon) for creating
train types without touching the repo. Source is TypeScript:

- **`src/subway-builder.d.ts`** — hand-written ambient types for the slice of
  `window.SubwayBuilderAPI` this mod uses. `TrainStats` has no optional members
  on purpose: the game fills in no defaults, so a missing stat yields NaN costs
  rather than an error, and this way the compiler catches it first.
- **`src/ui.ts`** — the panel. A single IIFE with no imports, since mods are
  evaluated through `new Function()`.
- **`tsconfig.mod.json`** compiles `src/` → `dist-mod/ui.js`, which
  `scripts/build.ts` appends to the generated `index.js`.

New trains start from a full 28-stat default, are validated before saving, and
persist via `api.storage`.

Three limits worth knowing:

- **`api.storage` is unusable from the UI on some builds.** Mod context exists
  only while the mod script runs synchronously, so a click handler is never in
  it. `scoped()` is the documented fix, but game 1.6.0 has neither `scoped()`
  nor a working `modId` argument — every call is dropped with a "called outside
  of mod context" warning. `makeStore()` therefore tries, in order: `scoped()`,
  then `localStorage` (no context requirement, so it works from anywhere), then
  the mod API with an explicit `modId`, then session-only memory. Each tier is
  probed, not assumed.
- **Storage is desktop-only.** In the browser build every `api.storage` call is
  a silent no-op, so trains made there vanish on reload. The panel round-trips
  a probe and counts sessions, and reports what it actually found instead of
  pretending the save worked.
- **There is no `unregisterTrainType`.** Deleting drops the train from storage,
  but it stays in the picker until the game reloads.

The editor is wrapped in `try`/`catch` by `scripts/build.ts`. The entire mod is
one `new Function()` evaluation, so an exception anywhere aborts the rest of the
file — without the wrapper, a UI bug takes the train roster down with it.

Trains added this way live in save data, not in `trains.yaml` — to ship one with
the mod, copy its numbers into the YAML.

## Scripts

| Command | Effect |
| --- | --- |
| `npm run build` | Compile `trains.yaml` + `src/ui.ts` → `index.js` |
| `npm run package` | Build, then zip `index.js` + `manifest.json` → `BasedGoatTrains-Abridged.zip` |
| `npm version <patch\|minor\|major>` | Bump `package.json`'s version and sync it into `manifest.json` in the same commit/tag |

## Releasing

1. `npm version patch` (or `minor`/`major`) — bumps and commits the version, syncs `manifest.json`, and tags the commit.
2. `git push --follow-tags` — pushes the commit and tag.
3. The `release.yml` GitHub Actions workflow picks up the tag, rebuilds and packages the mod, verifies the tag matches `manifest.json`'s version, and publishes a GitHub Release with `BasedGoatTrains-Abridged.zip` and `manifest.json` attached as separate assets — the format the [Registry](https://subwaybuildermodded.com/registry/docs/publishing-content) expects.

`ci.yml` runs on every push/PR to catch a stale `index.js` before it merges.

## License

MIT

# BasedGoat Trains

A [Subway Builder Modded](https://subwaybuildermodded.com/) mod adding a roster of real-world-inspired rolling stock, and overriding several base-game train types with more detailed stats.

This is a fork of [DanielD1909/danTrains-Abridged](https://github.com/DanielD1909/danTrains-Abridged), rebuilt around a YAML-driven compiler workflow instead of hand-written JS.

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

## Scripts

| Command | Effect |
| --- | --- |
| `npm run build` | Compile `trains.yaml` → `index.js` |
| `npm run package` | Build, then zip `index.js` + `manifest.json` → `BasedGoatTrains-Abridged.zip` |
| `npm version <patch\|minor\|major>` | Bump `package.json`'s version and sync it into `manifest.json` in the same commit/tag |

## Releasing

1. `npm version patch` (or `minor`/`major`) — bumps and commits the version, syncs `manifest.json`, and tags the commit.
2. `git push --follow-tags` — pushes the commit and tag.
3. The `release.yml` GitHub Actions workflow picks up the tag, rebuilds and packages the mod, verifies the tag matches `manifest.json`'s version, and publishes a GitHub Release with `BasedGoatTrains-Abridged.zip` and `manifest.json` attached as separate assets — the format the [Registry](https://subwaybuildermodded.com/registry/docs/publishing-content) expects.

`ci.yml` runs on every push/PR to catch a stale `index.js` before it merges.

## License

MIT

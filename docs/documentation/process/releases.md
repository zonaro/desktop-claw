# Releases

Desktop Claw is built and published by the [CI workflow](../../../.github/workflows/ci.yml). There is
one distribution channel — **GitHub Releases** — and one way in: the workflow builds every platform
and uploads the artifacts itself.

## Versioning

Versions are stamped from the build's **UTC date and time** rather than bumped by hand:

```
{YY}.{dayOfYear}.{HHMM}
```

| Build time (UTC)      | Version       | Tag              |
| --------------------- | ------------- | ---------------- |
| 2026-08-13 19:42      | `26.225.1942` | `v26.225.1942`   |
| 2026-01-05 09:05      | `26.5.905`    | `v26.5.905`      |
| 2026-01-01 00:00      | `26.1.0`      | `v26.1.0`        |

Each component is a plain number with **no zero padding**. Semver forbids leading zeroes in numeric
identifiers, and Squirrel, electron-builder and npm all reject a version that isn't valid semver — so
09:05 on day 5 is `26.5.905`, not `26.005.0905`. Versions still sort in build order, because the
numbers only grow as the year, day and time advance.

The format lives in [`script/calendar-version.ts`](../../../script/calendar-version.ts), which is the
single source of truth, and is covered by
[unit tests](../../../script/calendar-version/test/calendar-version-test.ts). Print the version for
right now with:

```sh
yarn version:calendar
```

The `version` field in `app/package.json` is **not** the release version. It is a placeholder kept in
sync with upstream to avoid merge conflicts, and it is ignored at build time.

### How the version reaches the build

The `compute_version` job stamps the version once and passes it to every other job through the
`APP_VERSION` environment variable, so all platforms in a release share a single version. Because
that job runs `node script/calendar-version.ts` directly — Node strips the types itself and the file
has no imports — it does not need to install dependencies first.

When `APP_VERSION` is not set, `getVersion()` stamps the current time and reuses it for the rest of
the process. Note that `yarn build:prod` and `yarn package` are **separate processes**: export
`APP_VERSION` when packaging a release locally, otherwise each step stamps its own time and they will
disagree if the minute rolls over in between.

```sh
export APP_VERSION=$(yarn --silent version:calendar)
yarn build:prod
yarn package
```

## What gets published

Every release carries Windows, macOS and Linux builds, each for `x86_64` and `arm64`:

| Platform | Artifacts                                       |
| -------- | ----------------------------------------------- |
| Windows  | `.exe` installer, `.msi` (enterprise)           |
| macOS    | `.zip`                                          |
| Linux    | `.deb`, `.rpm`, `.AppImage`                     |

Desktop Claw is **not** published to Winget, Homebrew, APT, DNF, the AUR, or Flathub, and there is no
auto-updater — `getUpdatesURL()` returns an empty string on purpose, so the app never phones home for
updates. Instead, the app offers a manual **Help > Check for Updates** action that queries the GitHub
Releases API (`app/src/lib/github-releases.ts`) and opens the release page when a newer version is
available.

## Triggering a release

The `release_github` job runs when:

 - a commit is **pushed to `main`**, or
 - the workflow is started manually via **workflow_dispatch**.

It creates the tag (`v{version}`) on the commit being built, so there is no need to tag anything
beforehand. Pull requests and pushes to other branches build and test, but publish nothing.

The release title is generated from the version. The body is read verbatim from
[`.github/desktop-claw-release-notes.md`](../../../.github/desktop-claw-release-notes.md) — update
that file in the same commit you want released. See
[Writing Release Notes](writing-release-notes.md).

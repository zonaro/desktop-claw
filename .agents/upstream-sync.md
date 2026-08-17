# Syncing with the original repository (desktop-plus)

## Context

- This repo (**desktop-claw**) is a fork of **desktop-plus** (`https://github.com/desktop-plus/desktop-plus`), which is itself a fork of GitHub Desktop
- Remotes already configured:

| Remote | URL | Role |
| --- | --- | --- |
| `origin` | `https://github.com/zonaro/desktop-claw.git` | personal fork (branch `main`) |
| `upstream` | `https://github.com/desktop-plus/desktop-plus.git` | original repo |

- Both use a full refspec (`+refs/heads/*:refs/remotes/*`), i.e. `upstream/main` is the local mirror of the original main
- **Important note (verified in history)**: this fork publishes its commits **directly to upstream** (`upstream/main` contains the fork's commits, e.g. `f8b2fb76d3`, `0901cca2b1`). In practice the flow is: develop here → push to `upstream` (when the change should become upstream) → `origin` keeps the mirror. There is no permanent divergence between fork and upstream
- Typical current state: `main` == `origin/main`, and `main` is N commits behind `upstream/main` (upstream advances with releases/betas; today the dev version is e.g. `3.6.4-beta2`)

## When to do it

- Whenever you need to pull new commits from desktop-plus (releases, fixes, upstream features)
- Suggestion: after each upstream release (beta or stable)

## Sync procedure (merge — historical pattern)

History uses **merge commits** (`Merge branch 'upstream-development'`), not rebase. Follow the same pattern.

```sh
# 1. Ensure a clean working tree and an up-to-date main branch
git status
git checkout main
git pull origin main

# 2. Fetch upstream commits
git fetch upstream

# 3. See how far behind we are and what's coming
git log --oneline main..upstream/main

# 4. Merge upstream main into our main
git merge upstream/main
# (uses the default commit editor for the merge message;
#  the historical pattern is "Merge branch 'upstream-development'" — you can use that title)

# 5. Resolve conflicts, if any (see section below)

# 6. Submodules — if .gitmodules/pointers changed
git submodule update --init --recursive

# 7. Dependencies — if package.json/yarn.lock changed
yarn install

# 8. Verify nothing broke
yarn lint:src
yarn test        # or yarn test:docker
yarn build:dev

# 9. Publish
git push origin main
```

## Typical conflicts and how to resolve them

| File | Resolution |
| --- | --- |
| `app/package.json` (`version`) | **Never edit `version`** — keep the upstream value (the version comes from `env.APP_VERSION` at build). For the rest, accept upstream + reapply fork changes if any |
| `yarn.lock` | Accept upstream's and run `yarn install` to reconcile |
| `changelog.json` | Keep both parts (upstream release notes + fork entries), then `yarn validate-changelog` |
| Code touched by the fork (`ftp*`, `opencode*`, worktree) | Reapply the fork changes on top of the new upstream code — see `.agents/fork-features.md` for the feature map |

General rule: the fork doesn't keep large structural divergence; most merges are clean or fast-forward.

## Variant with a local branch (alternative historical pattern)

History shows merges from a local branch called `upstream-development`. If you prefer:

```sh
git fetch upstream
git checkout -B upstream-development upstream/main
git checkout main
git merge upstream-development
```

(Equivalent to the main procedure; the branch name is free.)

## Publishing changes upstream

Since the fork's commits are pushed directly to desktop-plus (the fork author is a collaborator):

```sh
git push upstream main
```

> Caution: this publishes whatever is in `main` to the official repository. Do it only when the change really should go upstream, and after verifying build/tests.

## Verification cheat sheet

```sh
git remote -v                       # configured remotes
git fetch upstream && git status    # behind? ("Your branch is behind")
git rev-list --count main..upstream/main   # how many commits behind
git log --oneline main..upstream/main      # which commits will come
git log --oneline upstream/main..main      # fork commits not yet published upstream
```
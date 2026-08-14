# GH Desktop Claw

This is an **up-to-date** fork of [GitHub Desktop](https://desktop.github.com) with additional features and improvements.

> [!IMPORTANT]
> This is a community-maintained project. It **is not** an official GitHub product. 

## Highlights 👀
| <h4>Search commits by title, message, tag, or hash</h4> | <h4>Rich integration with all major Git platforms [^1]</h4> |
| :---: | :---: |
| <img src="docs/documentation/assets/desktop-claw-demo-search.webp" alt="Commit search" width="450"> | <img src="docs/documentation/assets/desktop-claw-demo-multiaccount.webp" alt="Multiple accounts" width="450"> |
| <h4>Create multiple stashes per branch</h4> | <h4>Visualize the Commit Graph</h4> |
| <img src="docs/documentation/assets/desktop-claw-demo-stashes.webp" alt="Multiple stashes" width="450"> | <img src="docs/documentation/assets/desktop-claw-demo-commit-graph.webp" alt="Commit Graph" width="450"> |
| <h4>Buttons optimized for visual recognition</h4> | <h4>Quickly find unpushed branches</h4> |
| <img src="docs/documentation/assets/desktop-claw-demo-stash-header.webp" alt="Stash header" width="450"> | <img src="docs/documentation/assets/desktop-claw-demo-push-indicator.webp" alt="Branch push indicator" width="450"> |

[^1]: Rich integration with GitHub, GitHub Enterprise, Bitbucket Cloud, GitLab Cloud, self-hosted GitLab, Codeberg Cloud, self-hosted Forgejo, Gitea Cloud, and self-hosted Gitea. Multi-account support is available for all of them (e.g., sign in to multiple GitHub accounts at the same time).

## Additional Features in Desktop Claw ✨

**See the [full list of features here](https://desktop-plus.org/#feature-list).**

<details>
<summary>See demo video</summary>

<video src="https://github.com/user-attachments/assets/a1be6c03-8773-4608-be13-152b5e12c5a9"></video>

</details>

## Download and Installation 📦

Desktop Claw is distributed exclusively through
**[GitHub Releases](https://github.com/zonaro/desktop-claw/releases/latest)**. It is not published to
Winget, Homebrew, APT, DNF, the AUR, or Flathub.

Download the file for your platform from the latest release and install it:

| Platform | File | Notes |
| --- | --- | --- |
| **Windows** (x86) | `-windows-x64.exe` | Recommended for most PCs. No admin rights needed. |
| **Windows** (ARM) | `-windows-arm64.exe` | For Snapdragon / ARM devices. |
| **Windows** (enterprise) | `-windows-*.msi` | ⚠️ Registers a hook that installs the app at next login, so it needs a reboot. Not recommended for regular users. |
| **macOS** (Apple Silicon) | `-macOS-arm64.zip` | M1 and newer. Unzip and drag into Applications. |
| **macOS** (Intel) | `-macOS-x64.zip` | Unzip and drag into Applications. |
| **Linux** (Debian family) | `.deb` | Debian, Ubuntu, Mint, Pop!_OS, Zorin, elementary OS. |
| **Linux** (RPM family) | `.rpm` | Fedora, RHEL, CentOS Stream, Rocky, AlmaLinux, openSUSE. |
| **Linux** (any distro) | `.AppImage` | Portable. Mark it executable before running. |

Each file is built for both `x86_64` and `arm64`.

> **macOS:** if the system reports it can't verify the app, open "System Settings" > "Privacy &
> Security", scroll to "Security" and click "Open Anyway" on Desktop Claw.

> **Linux:** `gnome-keyring` is required to store credentials, and its daemon must be running at
> login. For the AppImage specifically, sign-in also needs a `desktop-claw.desktop` entry with the
> `x-scheme-handler/x-github-desktop-auth` MIME type pointed at it — prefer the `.deb` or `.rpm`
> when your distro supports them.

### Updating 🔄

The app does **not** update itself. Watch the repository on GitHub, or check the
[releases page](https://github.com/zonaro/desktop-claw/releases/latest) now and then, and install the
newer file over your current version.

### Versioning 🔢

Releases are stamped from the build's UTC date and time rather than bumped by hand:

```
{YY}.{dayOfYear}.{HHMM}
```

For example, a build made on 13 August 2026 at 19:42 UTC is version `26.225.1942`, released under the
tag `v26.225.1942`. Each component is written without padding so the result is valid
[semver](https://semver.org), which Squirrel and electron-builder require: a build on 5 January at
09:05 UTC is `26.5.905`, not `26.005.0905`. Versions still sort in build order.

The format lives in [`script/calendar-version.ts`](script/calendar-version.ts), and you can print the
current one with `yarn version:calendar`.

## Common issues 🛠️

Before opening a new issue, please check the [Known Issues](docs/documentation/known-issues.md) document for common issues and their workarounds.

## Command Line Interface 💻

Desktop Claw includes a CLI (`desktop-claw-cli`) for opening and cloning repositories from the terminal. See the [CLI documentation](docs/documentation/cli.md) for usage details and instructions on creating a shorter alias.

## Running the app locally 🏗️

### From the terminal

```bash
corepack enable  # Install yarn if needed
yarn             # Install dependencies
yarn build:dev   # Initial build
yarn start       # Start the app for development and watch for changes
```

- It's normal for the app to take a while to start up, especially the first time.

- While starting up, this error is normal: `UnhandledPromiseRejectionWarning: Error: Invalid header: Does not start with Cr24`

- You don't need to restart the app to apply changes. Just reload the window (`Ctrl + Alt + R` / `Cmd + Alt + R`).

- Changes to the code inside `main-process` do require a full rebuild. Stop the app and run `yarn build:dev` again.

- [Read this document](docs/documentation/contributing/setup.md) for more information on how to set up your development environment.

### From VSCode

The first time you open the project, install the dependencies by running:
```bash
corepack enable
yarn
```

Then, you can simply build and run the app by pressing `F5`.  
Breakpoints should be set in the developer tools, not the VSCode editor.

### Running tests

I recommend running the tests in a Docker container for reproducibility and to avoid conflicts with your git configuration.  
After installing the dependencies with `yarn`, make sure you have Docker installed and run:

```bash
yarn test:docker
```

## Why this fork?

First, because [shiftkey's fork](https://github.com/shiftkey/desktop) is currently unmaintained (the last commit was in February 2025), so all Linux users are no longer getting the latest features and fixes from the official GitHub Desktop repository.

Secondly, I think the official GitHub Desktop app is very slow in terms of updates and lacks some advanced features that I'd like. This fork has low code quality requirements compared to the official repo, so I (and hopefully you as well) can add features and improvements quickly.  
This fork also focuses on integrating nicely with Bitbucket, since I use it for work and haven't found a good Linux GUI client for it.

Keep in mind that this version is not endorsed by GitHub, and it's aimed at power users with technical knowledge. If you're looking for a polished and stable product, I recommend using the official GitHub Desktop app instead.



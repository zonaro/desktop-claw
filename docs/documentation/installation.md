# Installing Desktop Claw

Desktop Claw is distributed exclusively through
[GitHub Releases](https://github.com/zonaro/desktop-claw/releases/latest). It is not published to
Winget, Homebrew, APT, DNF, the AUR, or Flathub, and it does not update itself — install a newer
release over the current one when you want to upgrade.

Every platform is built for both `x86_64` and `arm64`. Releases are versioned from the build's UTC
date and time (`{YY}.{dayOfYear}.{HHMM}`); see [Releases](process/releases.md) for details.

### macOS

Download `-macOS-arm64.zip` (Apple Silicon) or `-macOS-x64.zip` (Intel), unpack it, and drag the app
into your Applications folder.

If macOS reports that it can't verify the app, open "System Settings" > "Privacy & Security", scroll
down to "Security" and click "Open Anyway".

### Windows

 - Download `-windows-x64.exe` (or `-windows-arm64.exe`) and run it to install for the current user.
   No admin rights are required.
 - The `-windows-*.msi` build is meant for enterprise deployment. It only registers a hook that
   installs the app at next login, so it requires a reboot to finish. Regular users should prefer the
   `.exe`.

### Linux

Three package formats are available, depending on your distribution:

 - Debian (`.deb`) — Debian, Ubuntu, Mint, Pop!_OS, Zorin, elementary OS
 - RPM (`.rpm`) — Fedora, RHEL, CentOS Stream, Rocky, AlmaLinux, openSUSE
 - AppImage (`.AppImage`) — any distro, portable

`gnome-keyring` is required to store credentials, and its daemon must be running at login.

The AppImage must be marked executable before it will run. Signing in from an AppImage also needs a
`desktop-claw.desktop` entry with the `x-scheme-handler/x-github-desktop-auth` MIME type pointed at
it, so prefer the `.deb` or `.rpm` when your distribution supports them.

## Data Directories

Desktop Claw creates directories to manage the files and data it needs to function. If you manage a
network of computers and want to install Desktop Claw, here is more information about how things
work.

On first launch the app migrates an existing profile from a previous name (`Desktop Plus`,
`GitHub Desktop Plus`, or `GitHub Desktop`) if one is present.

### macOS
 - `~/Library/Application Support/Desktop Claw/` - this directory contains user-specific data which the application requires to run, and is created on launch if it doesn't exist. Log files are also stored in this location.

### Windows

 - `%LOCALAPPDATA%\DesktopClaw\` - contains the latest versions of the app, and some older versions if the user has updated from a previous version.
 - `%APPDATA%\Desktop Claw\` - this directory contains user-specific data which the application requires to run, and is created on launch if it doesn't exist. Log files are also stored in this location.

### Linux

 - `~/.config/Desktop Claw/` - for all three package formats.

## Log Files

Desktop Claw generates logs as part of its normal usage, to assist with troubleshooting. They are located in the data directory that Desktop Claw uses (see above) under a `logs` subdirectory, organized by date using the format `YYYY-MM-DD.desktop.production.log`, where `YYYY-MM-DD` is the day the log was created.

## Installer Logs

Problems with installing Desktop Claw on Windows are tracked in a separate file which is managed by the installer framework used by the app.

 - `%LOCALAPPDATA%\DesktopClaw\SquirrelSetup.log` - this file will contain details about install attempts after Desktop Claw has been successfully installed.
 - `%LOCALAPPDATA%\SquirrelSetup.log` - information about the initial installation may be found here. As this framework is used by different apps, it may also contain details about other apps. Ensure that you focus on mentions of `DesktopClaw.exe` in the log.

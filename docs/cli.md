# Command Line Interface

Desktop Claw includes a CLI that lets you open repositories and clone them directly from the terminal.

## Usage

```
desktop-claw-cli                           Open the current directory
desktop-claw-cli open [path]               Open the provided path
desktop-claw-cli clone [-b branch] <url>   Clone a repository by URL or name/owner (e.g. torvalds/linux)
```

## Creating a shorter alias

If you find `desktop-claw-cli` too long to type, you can create a shorter alias in your shell (e.g. `github-plus`, or even just `github` to match the upstream CLI name).

Examples below create an alias called `dp-cli` for the CLI. You can replace `dp-cli` with your preferred alias.

### Windows (PowerShell)

Add this line to your PowerShell profile (open it with `notepad $PROFILE`):

```powershell
Set-Alias dp-cli desktop-claw-cli
```

### macOS / Linux (Bash or Zsh)

Add this line to your `~/.bashrc` or `~/.zshrc`:

```bash
alias dp-cli='desktop-claw-cli'
```

### macOS / Linux (Fish)

Run once:

```fish
alias --save dp-cli desktop-claw-cli
```

cask "desktop-claw" do
  arch arm: "arm64", intel: "x64"

  version "[[VERSION]]"
  sha256 arm:   "[[SHA256_ARM64]]",
         intel: "[[SHA256_X64]]"

  url "https://github.com/desktop-plus/desktop-plus/releases/download/v#{version}/DesktopClaw-v#{version}-macOS-#{arch}.zip"
  name "Desktop Claw"
  desc "GitHub Desktop fork with extra features and improvements"
  homepage "https://desktop-plus.org/"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :monterey

  app "Desktop Claw.app"
  binary "#{appdir}/Desktop Claw.app/Contents/Resources/app/static/desktop-claw-cli.sh",
         target: "desktop-claw-cli"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Desktop Claw.app"]
  end

  zap trash: [
    "~/Library/Application Support/Desktop Claw",
    "~/Library/Logs/Desktop Claw",
  ]
end

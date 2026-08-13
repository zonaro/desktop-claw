#!/bin/bash

INSTALL_DIR="/usr/lib/desktop-claw"
CLI_DIR="$INSTALL_DIR/resources/app/static"
CLI_INSTALL_TARGET="/usr/bin/desktop-claw-cli"

# add executable permissions for CLI interface
chmod +x "$CLI_DIR"/desktop-claw-cli || :

# create symbolic links to /usr/bin directory
ln -f -s "$CLI_DIR"/desktop-claw-cli "$CLI_INSTALL_TARGET" || :

exit 0

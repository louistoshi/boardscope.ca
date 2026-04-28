#!/bin/bash

# Backup original JS files
mkdir -p .backup-js
cp electron-main.js preload.js server.js sw.js .backup-js/

# Copy obfuscated files over
cp dist-obfuscated/*.js ./

# Run electron-builder with any passed arguments
npx electron-builder "$@"
BUILD_EXIT_CODE=$?

# Restore original files
cp .backup-js/*.js ./
rm -rf .backup-js

exit $BUILD_EXIT_CODE

#!/bin/bash

# ShellPoint — Build Script for Linux
# Author: Alexandro Michel Davide

echo "============================================="
echo " ShellPoint — Build Linux Packages"
echo "============================================="
echo ""

# Check for npm
if ! command -v npm &> /dev/null
then
    echo "[ERROR] npm could not be found. Please install Node.js."
    exit 1
fi

echo "[1/2] Installing dependencies..."
npm install --prefer-offline

echo ""
echo "[2/2] Building with electron-builder..."
echo ""
npm run dist

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Build failed! Check the messages above."
    exit 1
fi

echo ""
echo "Build complete!"
echo "Output files in dist/:"
ls -1 dist/*.AppImage dist/*.deb dist/*.rpm 2>/dev/null
echo ""

#!/bin/bash

# ShellPoint — Startup Script for Linux
# Author: Alexandro Michel Davide

echo "Starting ShellPoint..."

# Check for npm
if ! command -v npm &> /dev/null
then
    echo "[ERROR] npm could not be found. Please install Node.js."
    exit 1
fi

npm start

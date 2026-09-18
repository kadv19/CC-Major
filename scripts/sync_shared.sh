#!/bin/bash
# Sync the canonical sibling-module to the app folders.
# Each app folder is self-contained so Vercel (root directory = the app folder)
# bundles everything it needs without "include files outside root directory".
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cp "$DIR/database.py" "$DIR/patient_app/database.py"
cp "$DIR/database.py" "$DIR/caregiver_app/database.py"
echo "Synced database.py -> patient_app/ and caregiver_app/"
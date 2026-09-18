#!/bin/bash
# Sync canonical shared modules into the app folders.
# Each app folder is self-contained so Vercel (root directory = the app folder)
# bundles everything it needs without "include files outside root directory".
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
for f in database.py slm.py; do
  cp "$DIR/$f" "$DIR/patient_app/$f"
  cp "$DIR/$f" "$DIR/caregiver_app/$f"
done
echo "Synced database.py & slm.py -> patient_app/ and caregiver_app/"
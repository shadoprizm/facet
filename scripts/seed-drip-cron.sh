#!/bin/zsh
# Cron wrapper for the seed drip drainer. Installed to run every ~20 min so the
# materialized drip queue in scripts/seed/.state.json publishes on its schedule.
# Logs to scripts/seed/.drip-cron.log (gitignored). Remove with: crontab -e
# (delete the seed-drip-cron line) to stop the drip.
export PATH="/Users/jratelle/.local/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/jratelle/Coding Projects/Facet Social" || exit 1
echo "=== $(date) ===" >> scripts/seed/.drip-cron.log
npx tsx scripts/seed-drip-run.ts >> scripts/seed/.drip-cron.log 2>&1

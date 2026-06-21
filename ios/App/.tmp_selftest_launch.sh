#!/bin/bash
set -uo pipefail
SIM="iPhone 17 Pro"
LOGDIR="$HOME/Library/Logs/DiagnosticReports"
xcrun simctl terminate "$SIM" com.bytspot.app >/dev/null 2>&1 || true
BEFORE=$(ls -1 "$LOGDIR" 2>/dev/null | grep -i "^App-" | wc -l | tr -d ' ')
echo "=== launching with BYT_NATIVE_ROOT=1 (non-blocking) ==="
OUT=$(SIMCTL_CHILD_BYT_NATIVE_ROOT=1 xcrun simctl launch "$SIM" com.bytspot.app 2>&1)
echo "$OUT"
PID=$(echo "$OUT" | awk -F': ' '/com.bytspot.app/ {print $2}' | tr -d ' ')
echo "PID=$PID"
sleep 5
echo "=== liveness check ==="
if [ -n "$PID" ] && ps -p "$PID" >/dev/null 2>&1; then
  echo "ALIVE: process $PID still running -> no precondition crash at launch"
else
  echo "NOT_ALIVE: process $PID gone -> possible crash"
fi
echo "=== crash report check ==="
AFTER=$(ls -1 "$LOGDIR" 2>/dev/null | grep -i "^App-" | wc -l | tr -d ' ')
echo "crash_reports_before=$BEFORE crash_reports_after=$AFTER"
ls -1t "$LOGDIR" 2>/dev/null | grep -i "^App-" | head -3

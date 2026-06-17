#!/bin/bash
set -u
DEVICE="054C674B-01A4-428F-A036-68A4899B9BAC"
APP_PATH="/Users/bytspotapp/Library/Developer/Xcode/DerivedData/App-euimiodwveomjkdnlccaiswvhubd/Build/Products/Debug-iphonesimulator/App.app"
xcrun simctl terminate "$DEVICE" com.bytspot.app 2>/dev/null
xcrun simctl install "$DEVICE" "$APP_PATH"
xcrun simctl launch --console-pty "$DEVICE" com.bytspot.app BYT_NATIVE_ROOT 1 > /tmp/byt-selftest.log 2>&1 &
LPID=$!
sleep 8
kill $LPID 2>/dev/null
echo "--- self-test output ---"
grep -iE "selftest|precondition|fatal|drift|assert" /tmp/byt-selftest.log | head -40
echo "--- end ---"
echo "log size: $(wc -l < /tmp/byt-selftest.log)"

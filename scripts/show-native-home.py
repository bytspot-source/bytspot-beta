#!/usr/bin/env python3
import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "ios/App/build/NativeHomeLiveFix/Build/Products/Debug-iphonesimulator/App.app"
SHOT = ROOT / ".dev-screenshots/native-home-user-visible.png"
BUNDLE_ID = "com.bytspot.app"


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def booted_iphone():
    data = json.loads(run(["xcrun", "simctl", "list", "devices", "booted", "-j"], capture_output=True).stdout)
    for devices in data.get("devices", {}).values():
        for device in devices:
            if device.get("state") == "Booted" and "iPhone" in device.get("name", ""):
                return device["udid"], device["name"]
    data = json.loads(run(["xcrun", "simctl", "list", "devices", "available", "-j"], capture_output=True).stdout)
    for devices in data.get("devices", {}).values():
        for device in devices:
            if device.get("isAvailable") and "iPhone" in device.get("name", ""):
                run(["xcrun", "simctl", "boot", device["udid"]])
                run(["xcrun", "simctl", "bootstatus", device["udid"], "-b"])
                return device["udid"], device["name"]
    raise SystemExit("No available iPhone simulator found")


def main():
    if not APP.is_dir():
        raise SystemExit(f"App build missing: {APP}")
    udid, name = booted_iphone()
    subprocess.run(["open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", udid])
    subprocess.run(["osascript", "-e", 'tell application "Simulator" to activate'])
    subprocess.run(["xcrun", "simctl", "terminate", udid, BUNDLE_ID], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["xcrun", "simctl", "uninstall", udid, BUNDLE_ID], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    run(["xcrun", "simctl", "install", udid, str(APP)])
    run(["xcrun", "simctl", "spawn", udid, "defaults", "write", BUNDLE_ID, "bytspot_native_root_enabled", "-bool", "YES"])
    env = os.environ.copy()
    env["SIMCTL_CHILD_BYT_NATIVE_ROOT"] = "1"
    env["SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER"] = "platinum"
    env["SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SESSION"] = "guest"
    launch = run(["xcrun", "simctl", "launch", "--terminate-running-process", udid, BUNDLE_ID], env=env, capture_output=True)
    time.sleep(4)
    SHOT.parent.mkdir(parents=True, exist_ok=True)
    run(["xcrun", "simctl", "io", udid, "screenshot", str(SHOT)], stdout=subprocess.DEVNULL)
    subprocess.run(["open", str(SHOT)])
    print(f"device={name} {udid}")
    print(launch.stdout.strip())
    print(f"screenshot={SHOT}")


if __name__ == "__main__":
    main()

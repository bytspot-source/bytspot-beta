#!/usr/bin/env python3
import argparse
import os
import shutil
import subprocess
import time
from pathlib import Path


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def quiet(args):
    return run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def terminate():
    subprocess.run(
        ["xcrun", "simctl", "terminate", "booted", "com.bytspot.app"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def launch_native(session, token=None):
    terminate()
    env = os.environ.copy()
    env["SIMCTL_CHILD_BYT_NATIVE_ROOT"] = "1"
    env["SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TIER"] = "platinum"
    if token:
        env["SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TOKEN"] = token
        env.pop("SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SESSION", None)
    else:
        env["SIMCTL_CHILD_BYT_NATIVE_PREVIEW_SESSION"] = session
        env.pop("SIMCTL_CHILD_BYT_NATIVE_PREVIEW_TOKEN", None)
    with open("/tmp/bytspot-native-final-walkthrough-launch.log", "w") as handle:
        run(
            ["xcrun", "simctl", "launch", "--terminate-running-process", "booted", "com.bytspot.app"],
            env=env,
            stdout=handle,
            stderr=subprocess.STDOUT,
        )
    time.sleep(3)


def screenshot(out_dir, name):
    path = out_dir / f"{name}.png"
    run(["xcrun", "simctl", "io", "booted", "screenshot", str(path)], stdout=subprocess.DEVNULL)
    if not path.is_file() or path.stat().st_size <= 0:
        raise SystemExit(f"Screenshot failed: {path}")


def open_url_and_shot(out_dir, url, name):
    run(["xcrun", "simctl", "openurl", "booted", url])
    time.sleep(3)
    screenshot(out_dir, name)


def main():
    parser = argparse.ArgumentParser(description="Run opt-in native SwiftUI frontend simulator walkthrough.")
    parser.add_argument("--app", required=True, help="Path to built App.app")
    parser.add_argument("--out", default=".dev-screenshots/native-final-integration")
    args = parser.parse_args()

    app = Path(args.app).resolve()
    out_dir = Path(args.out).resolve()
    if not app.is_dir():
        raise SystemExit(f"App build missing: {app}")
    booted = run(["xcrun", "simctl", "list", "devices", "booted"], text=True, capture_output=True).stdout
    if "Booted" not in booted:
        raise SystemExit("No booted simulator available")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run(["xcrun", "simctl", "install", "booted", str(app)])

    launch_native("signed_out")
    screenshot(out_dir, "01-session-signed-out-home")
    launch_native("guest")
    screenshot(out_dir, "02-session-guest-home")
    launch_native("token", token="final_native_walkthrough_token")
    screenshot(out_dir, "03-session-token-bearer-home")

    open_url_and_shot(out_dir, "bytspot://discover", "04-tab-discover")
    open_url_and_shot(out_dir, "bytspot://map", "05-tab-map")
    open_url_and_shot(out_dir, "bytspot://concierge", "06-tab-concierge")

    token = "final_native_walkthrough_token"
    launch_native("token", token=token)
    open_url_and_shot(out_dir, "bytspot://profile", "07-deeplink-profile-sheet")
    launch_native("token", token=token)
    open_url_and_shot(out_dir, "bytspot://access", "08-deeplink-access-wallet-sheet")
    launch_native("token", token=token)
    open_url_and_shot(
        out_dir,
        "bytspot://access/BYT-BRONI-P?tier=platinum&service=platinum-dining&venue=Broni%20Home%20Taste&use=event&intent=guest&party=2",
        "09-deeplink-broni-access-checkout",
    )
    launch_native("token", token=token)
    open_url_and_shot(
        out_dir,
        "bytspot://p/gh-akwaaba-fifa-ghana?tier=platinum&service=gh-akwaaba-fifa&venue=GH%20Akwaaba%20Pass",
        "10-deeplink-gh-akwaaba-pass",
    )
    launch_native("token", token=token)
    open_url_and_shot(out_dir, "bytspot://booking/success?patch=BYT424-0301-P&tier=platinum", "11-deeplink-booking-success")

    terminate()
    shots = sorted(out_dir.glob("*.png"))
    (out_dir / "manifest.txt").write_text("\n".join(str(p) for p in shots) + "\n")
    if len(shots) != 11:
        raise SystemExit(f"Expected 11 screenshots, got {len(shots)}")
    print(f"native-final-integration-walkthrough=PASS screenshots={len(shots)} dir={out_dir}")


if __name__ == "__main__":
    main()

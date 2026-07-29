#!/usr/bin/env python3
"""Fail fast when TestFlight signing profiles do not match production targets."""
import os
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path

CHECKS = [
    {
        "label": "App",
        "env": "PROVISIONING_PROFILE_PATH",
        "bundle_id": "com.bytspot.app",
        "entitlements": Path("ios/App/App/App.entitlements"),
        "app_clip": False,
    },
    {
        "label": "App Clip",
        "env": "APP_CLIP_PROVISIONING_PROFILE_PATH",
        "bundle_id": "com.bytspot.app.Clip",
        "entitlements": Path("ios/App/Clip/Clip.entitlements"),
        "app_clip": True,
    },
]


def fail(message: str) -> None:
    print(f"::error::{message}")
    sys.exit(1)


def decode_profile(path: Path) -> dict:
    if not path.exists():
        fail(f"Provisioning profile path is missing: {path}")
    with tempfile.NamedTemporaryFile(suffix=".plist") as out:
        result = subprocess.run(
            ["security", "cms", "-D", "-i", str(path), "-o", out.name],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0:
            fail("Unable to decode provisioning profile metadata")
        return plistlib.loads(Path(out.name).read_bytes())


def load_plist(path: Path) -> dict:
    if not path.exists():
        fail(f"Entitlements file is missing: {path}")
    return plistlib.loads(path.read_bytes())


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def check_profile(spec: dict, team_id: str) -> None:
    label = spec["label"]
    bundle_id = spec["bundle_id"]
    profile_path = Path(os.environ.get(spec["env"], "").strip())
    profile = decode_profile(profile_path)
    profile_entitlements = profile.get("Entitlements", {})
    app_entitlements = load_plist(spec["entitlements"])

    teams = profile.get("TeamIdentifier") or []
    require(team_id in teams, f"{label} profile TeamIdentifier does not match APPLE_TEAM_ID")
    require(not profile.get("ProvisionedDevices"), f"{label} profile is not an App Store distribution profile")
    require(profile_entitlements.get("get-task-allow") is False, f"{label} profile allows debugging; expected distribution get-task-allow=false")

    application_id = profile_entitlements.get("application-identifier", "")
    expected_application_id = f"{team_id}.{bundle_id}"
    require(application_id == expected_application_id, f"{label} profile application identifier does not match {expected_application_id}")

    required_domains = set(app_entitlements.get("com.apple.developer.associated-domains", []))
    profile_domains = set(profile_entitlements.get("com.apple.developer.associated-domains", []))
    require(required_domains.issubset(profile_domains), f"{label} profile is missing associated-domain entitlements")

    required_groups = set(app_entitlements.get("com.apple.security.application-groups", []))
    profile_groups = set(profile_entitlements.get("com.apple.security.application-groups", []))
    require(required_groups.issubset(profile_groups), f"{label} profile is missing application-group entitlements")

    if spec["app_clip"]:
        require(profile_entitlements.get("com.apple.developer.on-demand-install-capable") is True, "App Clip profile is missing on-demand-install-capable")
        parents = profile_entitlements.get("com.apple.developer.parent-application-identifiers", [])
        expected_parent_id = f"{team_id}.com.bytspot.app"
        require(expected_parent_id in parents, f"App Clip profile parent app identifier does not match {expected_parent_id}")

    print(f"{label} signing profile preflight passed for {bundle_id}")


def main() -> None:
    team_id = os.environ.get("APPLE_TEAM_ID", "").strip()
    if not team_id:
        fail("APPLE_TEAM_ID is required")
    for spec in CHECKS:
        check_profile(spec, team_id)


if __name__ == "__main__":
    main()

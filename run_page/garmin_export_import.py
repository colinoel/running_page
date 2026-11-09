#!/usr/bin/env python3
"""Import a Garmin account data export (.zip) into running_page.

Only FIT files not seen before are processed. FIT files that are not activities
(wellness and monitoring data, usually the vast majority) are removed after the
run and remembered, so later exports stay fast.

Usage: python run_page/garmin_export_import.py path/to/export.zip
The last line printed to stdout is a JSON result.
"""

import collections
import io
import json
import os
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath

from config import FIT_FOLDER, JSON_FILE, SYNCED_FILE

SEEN_FILE = os.path.join(FIT_FOLDER, ".garmin_seen.json")
WORKOUTS_FILE = os.path.join(os.path.dirname(JSON_FILE), "workouts.json")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
SYNC_SCRIPT = os.path.join(SCRIPT_DIR, "fit_sync.py")
PUBLISH_SCRIPT = os.path.join(SCRIPT_DIR, "publish_data.py")
UPLOADS_DIR = "DI-Connect-Uploaded-Files/"
LIVE_REMOTE = "live"
LIVE_BRANCH = "live"


class ImportFailed(Exception):
    pass


def load_json_list(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def activity_count_and_latest():
    activities = load_json_list(JSON_FILE)
    latest = max((a["start_date_local"] for a in activities), default=None)
    return len(activities), latest


def extract_new_fit_files(zip_path, known):
    """Copy FIT files whose name is not in `known` to FIT_FOLDER; return their count."""
    try:
        outer = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as e:
        raise ImportFailed("The file is not a valid ZIP archive.") from e

    with outer:
        archives = [
            n for n in outer.namelist() if UPLOADS_DIR in n and n.endswith(".zip")
        ]
        if not archives:
            raise ImportFailed(
                "No Garmin activities found. Is this a Garmin account data export?"
            )
        extracted = 0
        for archive in archives:
            with zipfile.ZipFile(io.BytesIO(outer.read(archive))) as inner:
                for info in inner.infolist():
                    # Basename only, so archive paths can never leave FIT_FOLDER.
                    name = PurePosixPath(info.filename.replace("\\", "/")).name
                    if not name.lower().endswith(".fit") or name in known:
                        continue
                    with open(os.path.join(FIT_FOLDER, name), "wb") as f:
                        f.write(inner.read(info))
                    known.add(name)
                    extracted += 1
    return extracted


def workout_category(activity_type):
    """Run and walk sessions come from FIT files; everything else is a workout."""
    if activity_type == "walking" or activity_type.endswith("running"):
        return None
    return "Strength" if activity_type == "strength_training" else "Other"


def read_workouts(zip_path):
    """Date, category and minutes only: this file is published."""
    workouts = []
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if not name.endswith("summarizedActivities.json"):
                continue
            for group in json.loads(archive.read(name)):
                for activity in group.get("summarizedActivitiesExport", []):
                    category = workout_category(activity.get("activityType", ""))
                    if not category or not activity.get("startTimeLocal"):
                        continue
                    # startTimeLocal is wall-clock time stored as if it were UTC.
                    local = datetime.fromtimestamp(
                        activity["startTimeLocal"] / 1000, timezone.utc
                    )
                    workouts.append(
                        {
                            "date": local.strftime("%Y-%m-%d"),
                            "category": category,
                            "minutes": round(activity.get("duration", 0) / 60000),
                        }
                    )
    return sorted(workouts, key=lambda w: (w["date"], w["category"], w["minutes"]))


def merge_workouts(zip_path):
    """Add this export's workouts; older exports may lack newer entries and vice versa."""
    known = load_json_list(WORKOUTS_FILE)
    seen = collections.Counter(json.dumps(w, sort_keys=True) for w in known)
    new = []
    for workout in read_workouts(zip_path):
        key = json.dumps(workout, sort_keys=True)
        if seen[key]:
            seen[key] -= 1
        else:
            new.append(workout)
    if new:
        merged = sorted(
            known + new, key=lambda w: (w["date"], w["category"], w["minutes"])
        )
        with open(WORKOUTS_FILE, "w", encoding="utf-8") as f:
            json.dump(merged, f)
    return len(new), len(known) + len(new)


def pending_fit_files(synced):
    return [
        n
        for n in os.listdir(FIT_FOLDER)
        if n.lower().endswith(".fit") and n not in synced
    ]


def run_sync():
    env = {**os.environ, "PYTHONUTF8": "1"}
    result = subprocess.run(
        [sys.executable, SYNC_SCRIPT],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout).strip().splitlines()[-1:]
        raise ImportFailed(f"Import failed: {' '.join(tail) or 'unknown error'}")


def filter_for_publishing():
    subprocess.run(
        [sys.executable, PUBLISH_SCRIPT],
        check=True,
        capture_output=True,
        env={**os.environ, "PYTHONUTF8": "1"},
    )


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, encoding="utf-8", errors="replace"
    )


def publish_online():
    """Upload the filtered activities; the site then rebuilds itself."""
    if git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() != LIVE_BRANCH:
        return False
    data = [os.path.relpath(p, ROOT) for p in (JSON_FILE, WORKOUTS_FILE)]
    git("add", "--", *data)
    if git("diff", "--cached", "--quiet", "--", *data).returncode == 0:
        return True
    committed = git("commit", "-m", "Update activities", "--", *data)
    if committed.returncode != 0:
        return False
    return git("push", LIVE_REMOTE, f"{LIVE_BRANCH}:main").returncode == 0


def import_export(zip_path):
    seen = set(load_json_list(SEEN_FILE))
    synced = set(load_json_list(SYNCED_FILE))
    before, _ = activity_count_and_latest()

    known = seen | synced
    new_files = extract_new_fit_files(zip_path, known)

    if pending_fit_files(synced):
        run_sync()
        filter_for_publishing()
        synced = set(load_json_list(SYNCED_FILE))
        for name in pending_fit_files(synced):
            os.remove(os.path.join(FIT_FOLDER, name))
            seen.add(name)
        with open(SEEN_FILE, "w", encoding="utf-8") as f:
            json.dump(sorted(seen), f)

    new_workouts, workout_total = merge_workouts(zip_path)
    total, latest = activity_count_and_latest()
    added = total - before + new_workouts
    return {
        "ok": True,
        "added": added,
        "total": total + workout_total,
        "newFiles": new_files,
        "latest": latest,
        "published": publish_online() if added else None,
    }


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: garmin_export_import.py path/to/export.zip")
    try:
        result = import_export(sys.argv[1])
    except ImportFailed as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Write src/static/activities.json in the privacy-filtered form used by the site.

The full data stays in run_page/data.db (never committed). The written file has
no street addresses, and routes lose their first and last 500 m plus everything
within 1 km of places where activities often start or end.
"""

import collections
import json
import os
import sqlite3

import polyline

from config import JSON_FILE, SQL_FILE

START_END_METERS = 500
FREQUENT_PLACE_METERS = 1000
FREQUENT_PLACE_MIN_VISITS = 3
# About 1 km; every run starting from the same place lands in one or two cells.
GRID_DEGREES = 0.01


def frequent_places():
    """Centres of the places where activities start or end at least a few times."""
    connection = sqlite3.connect(f"file:{SQL_FILE}?mode=ro", uri=True)
    rows = connection.execute(
        "select summary_polyline from activities where summary_polyline != ''"
    ).fetchall()
    connection.close()

    cells = collections.defaultdict(list)
    for (encoded,) in rows:
        points = polyline.decode(encoded)
        for lat, lng in points[:1] + points[-1:]:
            cells[(round(lat / GRID_DEGREES), round(lng / GRID_DEGREES))].append(
                (lat, lng)
            )
    return [
        (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        for pts in cells.values()
        if len(pts) >= FREQUENT_PLACE_MIN_VISITS
    ]


def country_only(location):
    """Keep the last part of a geocoded address, which is the country."""
    if not location or "," not in location:
        return ""
    return location.rsplit(",", 1)[1].strip()


def main():
    places = frequent_places()
    # polyline_processor reads these when it is first imported.
    os.environ["IGNORE_START_END_RANGE"] = str(START_END_METERS)
    os.environ["IGNORE_RANGE"] = str(FREQUENT_PLACE_METERS)
    os.environ["IGNORE_POLYLINE"] = polyline.encode(places) if places else ""

    from generator import Generator

    activities = Generator(SQL_FILE).load()
    for activity in activities:
        activity["location_country"] = country_only(activity.get("location_country"))
    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(activities, f)
    print(f"filtered {len(activities)} activities, {len(places)} places hidden")


if __name__ == "__main__":
    main()

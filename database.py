"""
Medication Reminder System - Database Operations
Phase 8: Integration & Demo-Ready Polish (Final)

Handles SQLite persistence for medicines, doses, upload history, and stats.
All operations are offline, file-based, no cloud.
Polished for Phase 8: demo reset helpers, no console errors, Phase 8 docs.

Tables:
- medicines: id, name, dosage, times (JSON), language, date_added
- doses: id, medicine_id, time, date, taken, taken_at
- upload_history: id, filename, upload_date, extracted_medicines (JSON), thumbnail
"""

import sqlite3
import json
import os
from datetime import datetime, date

# Database file path - next to this module
DB_PATH = os.path.join(os.path.dirname(__file__), "medication.db")


def get_db_connection():
    """Returns a SQLite connection with row factory and foreign keys enabled."""
    # Check same thread false allows Flask threaded use
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys for cascade deletes
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Creates tables if they do not exist. Idempotent."""
    conn = get_db_connection()
    try:
        # Use executescript for multiple statements
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS medicines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                dosage TEXT NOT NULL,
                times TEXT NOT NULL,
                language TEXT NOT NULL,
                date_added DATE NOT NULL
            );

            CREATE TABLE IF NOT EXISTS doses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                medicine_id INTEGER NOT NULL,
                time TEXT NOT NULL,
                date DATE NOT NULL,
                taken BOOLEAN DEFAULT 0,
                taken_at DATETIME,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
                UNIQUE(medicine_id, time, date)
            );

            CREATE TABLE IF NOT EXISTS upload_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                extracted_medicines TEXT,
                thumbnail TEXT
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def _today_str():
    """Returns today's date as YYYY-MM-DD."""
    return date.today().isoformat()


def _ensure_doses_for_today(conn, medicine_id, times, today=None):
    """Ensures doses rows exist for a medicine for today for each time."""
    if today is None:
        today = _today_str()
    for t in times:
        # Insert or ignore if already exists (unique constraint)
        conn.execute(
            "INSERT OR IGNORE INTO doses (medicine_id, time, date, taken) VALUES (?, ?, ?, 0)",
            (medicine_id, t, today),
        )


def add_medicine(data):
    """
    Inserts a new medicine and creates doses for today.
    data: dict with name, dosage, times (list), language, date_added (optional)
    Returns: inserted medicine dict with id and takenToday map for today
    """
    name = data.get("name", "").strip()
    dosage = data.get("dosage", "").strip()
    times = data.get("times", [])
    language = data.get("language", "en-US")
    date_added = data.get("date_added") or _today_str()

    if not name:
        raise ValueError("Medicine name required")
    if not dosage:
        raise ValueError("Dosage required")
    if not times or not isinstance(times, list) or len(times) == 0:
        raise ValueError("At least one time required")
    # Normalize times
    times = sorted(set([str(t).strip() for t in times if str(t).strip()]))
    for t in times:
        if not __import__("re").match(r"^\d{2}:\d{2}$", t):
            raise ValueError(f"Invalid time format: {t}")

    times_json = json.dumps(times)
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO medicines (name, dosage, times, language, date_added) VALUES (?, ?, ?, ?, ?)",
            (name, dosage, times_json, language, date_added),
        )
        medicine_id = cur.lastrowid
        _ensure_doses_for_today(conn, medicine_id, times, _today_str())
        conn.commit()

        # Build response with takenToday for today
        # Query doses for this medicine today
        rows = conn.execute(
            "SELECT time, taken FROM doses WHERE medicine_id = ? AND date = ?", (medicine_id, _today_str())
        ).fetchall()
        taken_today = {row["time"]: bool(row["taken"]) for row in rows}
        # Ensure all times have an entry (in case of race)
        for t in times:
            if t not in taken_today:
                taken_today[t] = False

        return {
            "id": medicine_id,
            "name": name,
            "dosage": dosage,
            "times": times,
            "language": language,
            "date_added": date_added,
            "takenToday": taken_today,
        }
    finally:
        conn.close()


def get_medicines():
    """
    Retrieves all medicines with today's takenToday map.
    Ensures doses exist for today for each medicine (in case date changed).
    Returns: list of medicine dicts
    """
    conn = get_db_connection()
    try:
        # Ensure doses for today for all medicines (handles daily new date)
        today = _today_str()
        meds = conn.execute("SELECT * FROM medicines ORDER BY id").fetchall()
        result = []
        for med in meds:
            times = json.loads(med["times"]) if med["times"] else []
            # Ensure doses exist for today
            _ensure_doses_for_today(conn, med["id"], times, today)
            # Need to commit after ensuring
            conn.commit()
            rows = conn.execute(
                "SELECT time, taken FROM doses WHERE medicine_id = ? AND date = ?", (med["id"], today)
            ).fetchall()
            taken_today = {row["time"]: bool(row["taken"]) for row in rows}
            for t in times:
                if t not in taken_today:
                    taken_today[t] = False
            result.append(
                {
                    "id": med["id"],
                    "name": med["name"],
                    "dosage": med["dosage"],
                    "times": times,
                    "language": med["language"],
                    "date_added": med["date_added"],
                    "takenToday": taken_today,
                }
            )
        conn.commit()
        return result
    finally:
        conn.close()


def update_medicine(medicine_id, data):
    """
    Updates a medicine's fields and reconciles doses for today.
    data may contain name, dosage, times (list), language
    Returns: updated medicine dict or None if not found
    """
    conn = get_db_connection()
    try:
        cur = conn.execute("SELECT * FROM medicines WHERE id = ?", (medicine_id,))
        row = cur.fetchone()
        if not row:
            return None

        # Use existing values as fallback
        name = data.get("name", row["name"])
        dosage = data.get("dosage", row["dosage"])
        language = data.get("language", row["language"])
        times = data.get("times", None)
        if times is not None:
            if not isinstance(times, list):
                raise ValueError("times must be a list")
            times = sorted(set([str(t).strip() for t in times if str(t).strip()]))
            if len(times) == 0:
                raise ValueError("At least one time required")
            for t in times:
                if not __import__("re").match(r"^\d{2}:\d{2}$", t):
                    raise ValueError(f"Invalid time format: {t}")
            times_json = json.dumps(times)
        else:
            times = json.loads(row["times"]) if row["times"] else []
            times_json = row["times"]

        if isinstance(name, str):
            name = name.strip()
        if isinstance(dosage, str):
            dosage = dosage.strip()
        if not name:
            raise ValueError("Medicine name required")
        if not dosage:
            raise ValueError("Dosage required")

        conn.execute(
            "UPDATE medicines SET name = ?, dosage = ?, times = ?, language = ? WHERE id = ?",
            (name, dosage, times_json, language, medicine_id),
        )

        # Reconcile doses for today: add new times, remove old times not in new list
        today = _today_str()
        if data.get("times") is not None:
            # Get existing doses for today
            existing = conn.execute(
                "SELECT time FROM doses WHERE medicine_id = ? AND date = ?", (medicine_id, today)
            ).fetchall()
            existing_times = set([r["time"] for r in existing])
            new_times = set(times)
            # Remove doses for times that no longer exist (only for today, keep historical? For simplicity delete)
            to_remove = existing_times - new_times
            for t in to_remove:
                conn.execute("DELETE FROM doses WHERE medicine_id = ? AND time = ? AND date = ?", (medicine_id, t, today))
            # Add new times
            to_add = new_times - existing_times
            for t in to_add:
                conn.execute(
                    "INSERT OR IGNORE INTO doses (medicine_id, time, date, taken) VALUES (?, ?, ?, 0)",
                    (medicine_id, t, today),
                )

        conn.commit()

        # Return updated medicine with takenToday
        return get_medicine_by_id(medicine_id)
    finally:
        conn.close()


def get_medicine_by_id(medicine_id):
    """Helper to fetch single medicine with takenToday for today."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM medicines WHERE id = ?", (medicine_id,)).fetchone()
        if not row:
            return None
        times = json.loads(row["times"]) if row["times"] else []
        today = _today_str()
        _ensure_doses_for_today(conn, medicine_id, times, today)
        conn.commit()
        dose_rows = conn.execute(
            "SELECT time, taken FROM doses WHERE medicine_id = ? AND date = ?", (medicine_id, today)
        ).fetchall()
        taken_today = {r["time"]: bool(r["taken"]) for r in dose_rows}
        for t in times:
            if t not in taken_today:
                taken_today[t] = False
        return {
            "id": row["id"],
            "name": row["name"],
            "dosage": row["dosage"],
            "times": times,
            "language": row["language"],
            "date_added": row["date_added"],
            "takenToday": taken_today,
        }
    finally:
        conn.close()


def delete_medicine(medicine_id):
    """Deletes a medicine and its doses (via cascade). Returns True if deleted."""
    conn = get_db_connection()
    try:
        cur = conn.execute("DELETE FROM medicines WHERE id = ?", (medicine_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def confirm_dose(medicine_id, time, dose_date=None):
    """
    Marks a dose as taken for a given medicine, time, and date.
    If dose row doesn't exist, creates it as taken.
    Returns: dose dict or None if medicine not found
    """
    if dose_date is None:
        dose_date = _today_str()
    # Validate time format
    if not __import__("re").match(r"^\d{2}:\d{2}$", time):
        raise ValueError(f"Invalid time format: {time}")

    conn = get_db_connection()
    try:
        # Check medicine exists
        med = conn.execute("SELECT id FROM medicines WHERE id = ?", (medicine_id,)).fetchone()
        if not med:
            return None
        # Ensure dose exists
        conn.execute(
            "INSERT OR IGNORE INTO doses (medicine_id, time, date, taken) VALUES (?, ?, ?, 0)",
            (medicine_id, time, dose_date),
        )
        # Mark as taken
        conn.execute(
            "UPDATE doses SET taken = 1, taken_at = ? WHERE medicine_id = ? AND time = ? AND date = ?",
            (datetime.now().isoformat(), medicine_id, time, dose_date),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM doses WHERE medicine_id = ? AND time = ? AND date = ?", (medicine_id, time, dose_date)
        ).fetchone()
        if row:
            return {
                "id": row["id"],
                "medicine_id": row["medicine_id"],
                "time": row["time"],
                "date": row["date"],
                "taken": bool(row["taken"]),
                "taken_at": row["taken_at"],
            }
        return None
    finally:
        conn.close()


def get_todays_doses():
    """
    Returns today's doses with medicine info and status.
    Each entry: {medicine_id, medicine_name, dosage, language, time, date, taken}
    """
    conn = get_db_connection()
    try:
        today = _today_str()
        # Ensure all medicines have doses for today
        meds = conn.execute("SELECT id, times FROM medicines").fetchall()
        for med in meds:
            times = json.loads(med["times"]) if med["times"] else []
            _ensure_doses_for_today(conn, med["id"], times, today)
        conn.commit()

        rows = conn.execute(
            """
            SELECT d.id, d.medicine_id, d.time, d.date, d.taken, d.taken_at,
                   m.name, m.dosage, m.language
            FROM doses d
            JOIN medicines m ON d.medicine_id = m.id
            WHERE d.date = ?
            ORDER BY d.time, m.name
            """,
            (today,),
        ).fetchall()
        result = []
        for r in rows:
            result.append(
                {
                    "id": r["id"],
                    "medicine_id": r["medicine_id"],
                    "medicine_name": r["name"],
                    "dosage": r["dosage"],
                    "language": r["language"],
                    "time": r["time"],
                    "date": r["date"],
                    "taken": bool(r["taken"]),
                    "taken_at": r["taken_at"],
                }
            )
        return result
    finally:
        conn.close()


def add_upload_record(data):
    """
    Saves an upload record.
    data: dict with filename, extracted_medicines (list), thumbnail (base64 string)
    Returns: inserted record dict
    """
    filename = data.get("filename", "prescription.jpg")
    extracted = data.get("extracted_medicines", [])
    thumbnail = data.get("thumbnail", "")
    # Ensure extracted is JSON-serializable
    extracted_json = json.dumps(extracted)

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO upload_history (filename, extracted_medicines, thumbnail) VALUES (?, ?, ?)",
            (filename, extracted_json, thumbnail),
        )
        upload_id = cur.lastrowid
        conn.commit()
        row = conn.execute("SELECT * FROM upload_history WHERE id = ?", (upload_id,)).fetchone()
        return {
            "id": row["id"],
            "filename": row["filename"],
            "upload_date": row["upload_date"],
            "extracted_medicines": json.loads(row["extracted_medicines"]) if row["extracted_medicines"] else [],
            "thumbnail": row["thumbnail"],
        }
    finally:
        conn.close()


def get_upload_history(limit=10):
    """Returns upload history, most recent first."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM upload_history ORDER BY upload_date DESC LIMIT ?", (limit,)
        ).fetchall()
        result = []
        for r in rows:
            result.append(
                {
                    "id": r["id"],
                    "filename": r["filename"],
                    "upload_date": r["upload_date"],
                    # For frontend compatibility, also provide date field
                    "date": r["upload_date"],
                    "extracted_medicines": json.loads(r["extracted_medicines"]) if r["extracted_medicines"] else [],
                    "medicines": json.loads(r["extracted_medicines"]) if r["extracted_medicines"] else [],
                    "thumbnail": r["thumbnail"],
                }
            )
        return result
    finally:
        conn.close()


def get_stats():
    """
    Returns compliance statistics for today.
    Computes taken, pending, missed based on doses table and current time.
    """
    from datetime import datetime as dt

    conn = get_db_connection()
    try:
        today = _today_str()
        # Ensure doses exist
        meds = conn.execute("SELECT id, times FROM medicines").fetchall()
        for med in meds:
            times = json.loads(med["times"]) if med["times"] else []
            _ensure_doses_for_today(conn, med["id"], times, today)
        conn.commit()

        rows = conn.execute("SELECT time, taken FROM doses WHERE date = ?", (today,)).fetchall()
        # Need current time for pending vs missed
        now = dt.now()
        now_minutes = now.hour * 60 + now.minute

        taken = 0
        pending = 0
        missed = 0
        for r in rows:
            if r["taken"]:
                taken += 1
            else:
                # Not taken: check if time is in past -> missed else pending
                try:
                    h, m = map(int, r["time"].split(":"))
                    slot_minutes = h * 60 + m
                    if slot_minutes < now_minutes:
                        missed += 1
                    else:
                        pending += 1
                except Exception:
                    pending += 1

        total = taken + pending + missed
        compliance = round((taken / total) * 100) if total > 0 else 0
        upcoming = pending
        overdue = missed

        return {
            "taken": taken,
            "pending": pending,
            "missed": missed,
            "upcoming": upcoming,
            "overdue": overdue,
            "total": total,
            "compliance": compliance,
        }
    finally:
        conn.close()


# Initialize DB on import
if __name__ != "__main__":
    # Ensure tables exist when module is imported (for Flask)
    try:
        init_db()
    except Exception as e:
        print(f"Failed to init DB: {e}")

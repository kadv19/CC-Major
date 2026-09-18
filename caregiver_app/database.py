"""
Medication Reminder System - Database Operations
Refactored for shared data layer: patient/caregiver shared DB with patient_id scoping.

Tables:
- users: id, username, password_hash, role, name, language, created_at
- medicines: id, patient_id, name, dosage, times (JSON), language, date_added
- doses: id, patient_id, medicine_id, time, date, taken, taken_at
- upload_history: id, patient_id, filename, upload_date, extracted_medicines (JSON), thumbnail
"""

import sqlite3
import json
import re
import os
import tempfile
from datetime import datetime, date

from werkzeug.security import generate_password_hash, check_password_hash


def _resolve_db_path():
    """Pick a writable SQLite location.

    Precedence:
      1. MEDREMIND_DB env var (explicit override, e.g. /tmp/medication.db on Vercel)
      2. Next to this module (normal local dev)
      3. Fall back to the system temp dir if that location is read-only
         (serverless platforms mount the project read-only, so writing fails there)
    """
    env = os.environ.get("MEDREMIND_DB")
    if env:
        if os.path.isabs(env) or os.path.basename(env):
            return env
    default = os.path.join(os.path.dirname(os.path.abspath(__file__)), "medication.db")
    try:
        probe = default + ".wtest"
        with open(probe, "w") as fh:
            fh.write("x")
        os.remove(probe)
        return default
    except (OSError, PermissionError):
        return os.path.join(tempfile.gettempdir(), "medication.db")


# Database file path
DB_PATH = _resolve_db_path()


def get_db_connection():
    """Returns a SQLite connection with row factory and foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 20000")
    return conn


def init_db():
    """Creates tables if they do not exist. Idempotent. Enables WAL."""
    conn = get_db_connection()
    try:
        # Enable WAL mode (best-effort; some serverless filesystems don't support it)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
        except sqlite3.Error:
            pass
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('patient','caregiver')),
                name TEXT,
                language TEXT DEFAULT 'kn-IN',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS medicines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                dosage TEXT NOT NULL,
                times TEXT NOT NULL,
                language TEXT NOT NULL,
                date_added DATE NOT NULL
            );

            CREATE TABLE IF NOT EXISTS slm_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                question TEXT,
                answer TEXT,
                outcome TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS doses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
                time TEXT NOT NULL,
                date DATE NOT NULL,
                taken BOOLEAN DEFAULT 0,
                taken_at DATETIME,
                FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
                UNIQUE(medicine_id, time, date)
            );

            CREATE TABLE IF NOT EXISTS upload_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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


def _ensure_doses_for_today(conn, medicine_id, times, patient_id, today=None):
    """Ensures doses rows exist for a medicine for today for each time."""
    if today is None:
        today = _today_str()
    for t in times:
        conn.execute(
            "INSERT OR IGNORE INTO doses (medicine_id, patient_id, time, date, taken) VALUES (?, ?, ?, ?, 0)",
            (medicine_id, patient_id, t, today),
        )


def add_medicine(data, patient_id):
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
    times = sorted(set([str(t).strip() for t in times if str(t).strip()]))
    for t in times:
        if not re.match(r"^\d{2}:\d{2}$", t):
            raise ValueError(f"Invalid time format: {t}")

    times_json = json.dumps(times)
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO medicines (patient_id, name, dosage, times, language, date_added) VALUES (?, ?, ?, ?, ?, ?)",
            (patient_id, name, dosage, times_json, language, date_added),
        )
        medicine_id = cur.lastrowid
        _ensure_doses_for_today(conn, medicine_id, times, patient_id, _today_str())
        conn.commit()

        rows = conn.execute(
            "SELECT time, taken FROM doses WHERE medicine_id = ? AND patient_id = ? AND date = ?",
            (medicine_id, patient_id, _today_str()),
        ).fetchall()
        taken_today = {row["time"]: bool(row["taken"]) for row in rows}
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


def get_medicines(patient_id):
    """
    Retrieves all medicines for a patient with today's takenToday map.
    Ensures doses exist for today for each medicine.
    Returns: list of medicine dicts
    """
    conn = get_db_connection()
    try:
        today = _today_str()
        meds = conn.execute("SELECT * FROM medicines WHERE patient_id = ? ORDER BY id", (patient_id,)).fetchall()
        result = []
        for med in meds:
            times = json.loads(med["times"]) if med["times"] else []
            _ensure_doses_for_today(conn, med["id"], times, patient_id, today)
            conn.commit()
            rows = conn.execute(
                "SELECT time, taken FROM doses WHERE medicine_id = ? AND patient_id = ? AND date = ?",
                (med["id"], patient_id, today),
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


def update_medicine(medicine_id, data, patient_id):
    """
    Updates a medicine's fields and reconciles doses for today.
    data may contain name, dosage, times (list), language
    Returns: updated medicine dict or None if not found
    """
    conn = get_db_connection()
    try:
        cur = conn.execute("SELECT * FROM medicines WHERE id = ? AND patient_id = ?", (medicine_id, patient_id))
        row = cur.fetchone()
        if not row:
            return None

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
                if not re.match(r"^\d{2}:\d{2}$", t):
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
            "UPDATE medicines SET name = ?, dosage = ?, times = ?, language = ? WHERE id = ? AND patient_id = ?",
            (name, dosage, times_json, language, medicine_id, patient_id),
        )

        today = _today_str()
        if data.get("times") is not None:
            existing = conn.execute(
                "SELECT time FROM doses WHERE medicine_id = ? AND patient_id = ? AND date = ?",
                (medicine_id, patient_id, today),
            ).fetchall()
            existing_times = set([r["time"] for r in existing])
            new_times = set(times)
            to_remove = existing_times - new_times
            for t in to_remove:
                conn.execute(
                    "DELETE FROM doses WHERE medicine_id = ? AND patient_id = ? AND time = ? AND date = ?",
                    (medicine_id, patient_id, t, today),
                )
            to_add = new_times - existing_times
            for t in to_add:
                conn.execute(
                    "INSERT OR IGNORE INTO doses (medicine_id, patient_id, time, date, taken) VALUES (?, ?, ?, ?, 0)",
                    (medicine_id, patient_id, t, today),
                )

        conn.commit()
        conn.close()
        # Fetch updated medicine (new connection to avoid nested handling)
        return get_medicine_by_id(medicine_id, patient_id)
    finally:
        try:
            conn.close()
        except Exception:
            pass


def get_medicine_by_id(medicine_id, patient_id):
    """Helper to fetch single medicine with takenToday for today."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT * FROM medicines WHERE id = ? AND patient_id = ?", (medicine_id, patient_id)
        ).fetchone()
        if not row:
            return None
        times = json.loads(row["times"]) if row["times"] else []
        today = _today_str()
        _ensure_doses_for_today(conn, medicine_id, times, patient_id, today)
        conn.commit()
        dose_rows = conn.execute(
            "SELECT time, taken FROM doses WHERE medicine_id = ? AND patient_id = ? AND date = ?",
            (medicine_id, patient_id, today),
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


def delete_medicine(medicine_id, patient_id):
    """Deletes a medicine and its doses (via cascade). Returns True if deleted."""
    conn = get_db_connection()
    try:
        cur = conn.execute("DELETE FROM medicines WHERE id = ? AND patient_id = ?", (medicine_id, patient_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def confirm_dose(medicine_id, time, dose_date=None, patient_id=None):
    """
    Marks a dose as taken for a given medicine, time, and date.
    If dose row doesn't exist, creates it as taken.
    Returns: dose dict or None if medicine not found
    Note: signature supports both confirm_dose(medicine_id, time, dose_date, patient_id)
          and legacy positional usage. patient_id is required for scoping.
    """
    # Handle case where dose_date is actually patient_id if called as (id, time, patient_id)
    # We detect: if dose_date is int and patient_id is None, treat as patient_id
    # But spec says signature is (medicine_id, time, dose_date, patient_id)
    # So caller should pass explicitly. For backward compat, handle overload.
    if patient_id is None and dose_date is not None:
        # Check if dose_date looks like a patient_id (int) not a date string
        # Date string is YYYY-MM-DD, contains '-'
        if isinstance(dose_date, int) or (isinstance(dose_date, str) and re.match(r"^\d+$", str(dose_date))):
            # Could be patient_id without date
            patient_id = int(dose_date)
            dose_date = None

    if dose_date is None:
        dose_date = _today_str()

    if patient_id is None:
        raise ValueError("patient_id is required")

    if not re.match(r"^\d{2}:\d{2}$", time):
        raise ValueError(f"Invalid time format: {time}")

    conn = get_db_connection()
    try:
        med = conn.execute(
            "SELECT id FROM medicines WHERE id = ? AND patient_id = ?", (medicine_id, patient_id)
        ).fetchone()
        if not med:
            return None
        conn.execute(
            "INSERT OR IGNORE INTO doses (medicine_id, patient_id, time, date, taken) VALUES (?, ?, ?, ?, 0)",
            (medicine_id, patient_id, time, dose_date),
        )
        conn.execute(
            "UPDATE doses SET taken = 1, taken_at = ? WHERE medicine_id = ? AND patient_id = ? AND time = ? AND date = ?",
            (datetime.now().isoformat(), medicine_id, patient_id, time, dose_date),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM doses WHERE medicine_id = ? AND patient_id = ? AND time = ? AND date = ?",
            (medicine_id, patient_id, time, dose_date),
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


def get_todays_doses(patient_id):
    """
    Returns today's doses for a patient with medicine info and status.
    Each entry: {medicine_id, medicine_name, dosage, language, time, date, taken}
    """
    conn = get_db_connection()
    try:
        today = _today_str()
        meds = conn.execute("SELECT id, times FROM medicines WHERE patient_id = ?", (patient_id,)).fetchall()
        for med in meds:
            times = json.loads(med["times"]) if med["times"] else []
            _ensure_doses_for_today(conn, med["id"], times, patient_id, today)
        conn.commit()

        rows = conn.execute(
            """
            SELECT d.id, d.medicine_id, d.time, d.date, d.taken, d.taken_at,
                   m.name, m.dosage, m.language
            FROM doses d
            JOIN medicines m ON d.medicine_id = m.id
            WHERE d.date = ? AND d.patient_id = ? AND m.patient_id = ?
            ORDER BY d.time, m.name
            """,
            (today, patient_id, patient_id),
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


def add_upload_record(data, patient_id):
    """
    Saves an upload record for a patient.
    data: dict with filename, extracted_medicines (list), thumbnail (base64 string)
    Returns: inserted record dict
    """
    filename = data.get("filename", "prescription.jpg")
    extracted = data.get("extracted_medicines", [])
    # Support alternative key
    if not extracted and "medicines" in data:
        extracted = data.get("medicines", [])
    thumbnail = data.get("thumbnail", "")
    extracted_json = json.dumps(extracted)

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO upload_history (patient_id, filename, extracted_medicines, thumbnail) VALUES (?, ?, ?, ?)",
            (patient_id, filename, extracted_json, thumbnail),
        )
        upload_id = cur.lastrowid
        conn.commit()
        row = conn.execute("SELECT * FROM upload_history WHERE id = ? AND patient_id = ?", (upload_id, patient_id)).fetchone()
        return {
            "id": row["id"],
            "filename": row["filename"],
            "upload_date": row["upload_date"],
            "extracted_medicines": json.loads(row["extracted_medicines"]) if row["extracted_medicines"] else [],
            "thumbnail": row["thumbnail"],
        }
    finally:
        conn.close()


def get_upload_history(patient_id, limit=10):
    """Returns upload history for a patient, most recent first."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM upload_history WHERE patient_id = ? ORDER BY upload_date DESC LIMIT ?",
            (patient_id, limit),
        ).fetchall()
        result = []
        for r in rows:
            result.append(
                {
                    "id": r["id"],
                    "filename": r["filename"],
                    "upload_date": r["upload_date"],
                    "date": r["upload_date"],
                    "extracted_medicines": json.loads(r["extracted_medicines"]) if r["extracted_medicines"] else [],
                    "medicines": json.loads(r["extracted_medicines"]) if r["extracted_medicines"] else [],
                    "thumbnail": r["thumbnail"],
                }
            )
        return result
    finally:
        conn.close()


def record_slm_interaction(patient_id, question, answer_text, outcome):
    """Log a voice-agent session. outcome: answered | accepted | declined | unavailable."""
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO slm_interactions (patient_id, question, answer, outcome) "
            "VALUES (?, ?, ?, ?)",
            (patient_id, question, answer_text, outcome),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def get_slm_interactions(patient_id, limit=50):
    """Returns the patient's voice-agent interactions, most recent first."""
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM slm_interactions WHERE patient_id = ? ORDER BY id DESC LIMIT ?",
            (patient_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_stats(patient_id):
    """
    Returns compliance statistics for today for a patient.
    Computes taken, pending, missed based on doses table and current time.
    """
    from datetime import datetime as dt

    conn = get_db_connection()
    try:
        today = _today_str()
        meds = conn.execute("SELECT id, times FROM medicines WHERE patient_id = ?", (patient_id,)).fetchall()
        for med in meds:
            times = json.loads(med["times"]) if med["times"] else []
            _ensure_doses_for_today(conn, med["id"], times, patient_id, today)
        conn.commit()

        rows = conn.execute("SELECT time, taken FROM doses WHERE date = ? AND patient_id = ?", (today, patient_id)).fetchall()
        now = dt.now()
        now_minutes = now.hour * 60 + now.minute

        taken = 0
        pending = 0
        missed = 0
        for r in rows:
            if r["taken"]:
                taken += 1
            else:
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


def clear_uploads(patient_id):
    """Clears upload history for a patient."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM upload_history WHERE patient_id = ?", (patient_id,))
        conn.commit()
    finally:
        conn.close()


def load_demo_data(patient_id):
    """Adds 3 demo medicines for a patient, deleting that patient's existing meds first."""
    conn = get_db_connection()
    try:
        # Delete existing meds for this patient (doses cascade)
        conn.execute("DELETE FROM medicines WHERE patient_id = ?", (patient_id,))
        conn.commit()
    finally:
        conn.close()

    samples = [
        {"name": "Metformin", "dosage": "1 tablet", "times": ["08:00", "20:00"], "language": "en-US"},
        {"name": "Dolo 650", "dosage": "1 tablet", "times": ["14:00"], "language": "kn-IN"},
        {"name": "Vitamin D3", "dosage": "1 capsule", "times": ["09:00"], "language": "hi-IN"},
    ]
    created = []
    for s in samples:
        med = add_medicine(s, patient_id)
        created.append(med)
    return created


def reset_patient_data(patient_id):
    """Deletes that patient's uploads, doses, and medicines."""
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM upload_history WHERE patient_id = ?", (patient_id,))
        conn.execute("DELETE FROM doses WHERE patient_id = ?", (patient_id,))
        conn.execute("DELETE FROM medicines WHERE patient_id = ?", (patient_id,))
        conn.commit()
    finally:
        conn.close()


# ==================== AUTH FUNCTIONS ====================

def create_user(username, password, role, name=None, language='kn-IN'):
    """Creates a new user. Raises ValueError if username taken or role invalid."""
    if role not in ('patient', 'caregiver'):
        raise ValueError("Invalid role: must be 'patient' or 'caregiver'")
    if not username or not username.strip():
        raise ValueError("Username required")
    if not password:
        raise ValueError("Password required")
    username = username.strip()
    password_hash = generate_password_hash(password)
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            raise ValueError(f"Username '{username}' already taken")
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, password_hash, role, name, language) VALUES (?, ?, ?, ?, ?)",
            (username, password_hash, role, name, language),
        )
        conn.commit()
        user_id = cur.lastrowid
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_username(username):
    """Returns user dict or None."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id):
    """Returns user dict or None."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def verify_login(username, password):
    """Verifies login. Returns public user dict or None."""
    user = get_user_by_username(username)
    if not user:
        return None
    if not check_password_hash(user["password_hash"], password):
        return None
    return {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "language": user["language"],
    }


def list_patients():
    """Returns list of patient user dicts ordered by id."""
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM users WHERE role = 'patient' ORDER BY id").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def seed_default_users():
    """Idempotent, seed-on-empty: populate the 6 default users ONLY when the users table is empty.
    This keeps a fresh demo experience on first run, while preserving deleted/created patients."""
    conn = get_db_connection()
    try:
        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if count and int(count) > 0:
            return  # users already exist (seeded, added, or partially deleted) -> do not touch
    finally:
        conn.close()

    defaults = [
        ("patient1", "1234", "patient", "Amma", "kn-IN"),
        ("patient2", "1234", "patient", "Thatha", "hi-IN"),
        ("patient3", "1234", "patient", "Ravi", "en-US"),
        ("patient4", "1234", "patient", "Meera", "kn-IN"),
        ("patient5", "1234", "patient", "Anil", "hi-IN"),
        ("caregiver", "1234", "caregiver", "Son", "en-US"),
    ]
    for username, password, role, name, language in defaults:
        try:
            create_user(username, password, role, name, language)
        except ValueError as e:
            # Username taken -> skip (idempotent)
            if "already taken" in str(e):
                continue
            else:
                raise
        except Exception:
            # In case of race or other, ignore if exists
            existing = get_user_by_username(username)
            if existing:
                continue
            raise


def delete_patient(patient_id):
    """Deletes a patient user and all their data (medicines, doses, uploads cascade).
    Returns True if a patient with that id was deleted, False otherwise.
    Refuses to delete non-patient users (e.g. the caregiver)."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (patient_id,)).fetchone()
        if not row:
            return False
        if row["role"] != "patient":
            raise ValueError("Only patient accounts can be deleted through this function")
        cur = conn.execute("DELETE FROM users WHERE id = ?", (patient_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# Initialize DB on import
if __name__ != "__main__":
    try:
        init_db()
    except Exception as e:
        print(f"Failed to init DB: {e}")
    try:
        seed_default_users()
    except Exception as e:
        print(f"Failed to seed users: {e}")

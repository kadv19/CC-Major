# Medication Reminder — Patient & Caregiver Websites

## Overview

Two Flask websites share **one SQLite database file** (`medication.db` in WAL mode via `database.py`):

- **Patient website (port 5001)** — elderly-friendly, low-literacy. Big buttons (48px+), large text, colors, simple language support (Kannada `kn-IN`, Hindi `hi-IN`, English `en-US`). Centerpiece is the **SPEAKER model** (TTS voice reminders via Web Speech API) — the patient hears their schedule spoken in their own language and confirms with a big **“✅ I took it”** button. LED and buzzer are simulated in the UI.
- **Caregiver website (port 5002)** — manages schedules and compliance for **many patients** from one dashboard. Select any patient, add/edit/delete medicines, upload prescriptions (mock OCR), view today’s schedule (filters + 24h timeline), see compliance/progress, history, and use a Voice Agent.

Both apps import the same `database.py`; patient data is always scoped by `patient_id` so one patient never sees another’s data.

## Architecture

```
                    ┌─────────────────────┐
                    │   SQLite (WAL mode) │
                    │   medication.db     │
                    │  busy_timeout=20000 │
                    └──────┬──┬───────────┘
                           │  │
              ┌────────────┘  └─────────────┐
              │                             │
     ┌────────▼────────┐           ┌────────▼────────┐
     │  database.py    │           │  database.py    │
     │  - users        │           │  (same file)    │
     │  - medicines    │           │                 │
     │  - doses        │           │                 │
     │  - upload_history│          │                 │
     └────────┬────────┘           └────────┬────────┘
              │                             │
     ┌────────▼────────┐           ┌────────▼────────┐
     │ patient_app     │           │ caregiver_app   │
     │  Flask :5001    │           │  Flask :5002    │
     │  patient login  │           │ caregiver login │
     │  speaker/TTS    │           │ patient selector│
     └─────────────────┘           └─────────────────┘
        http://localhost:5001         http://localhost:5002
```

Single DB file is shared safely: `check_same_thread=False`, `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=20000`, `PRAGMA journal_mode=WAL` in `database.py`.

## Setup

Prerequisites: Python 3.10+, Chrome 90+ (best Web Speech API).

```bash
cd /home/advaith/Desktop/CC-MAJOR/medication_reminder

# 1) create venv
python3 -m venv .venv

# 2) install
.venv/bin/pip install -r requirements.txt
# Flask==3.0.0, Flask-Cors==4.0.0 (sqlite3 is built-in)

# 3) run BOTH apps in two terminals
.venv/bin/python patient_app/app.py
# → Patient app running on http://localhost:5001

.venv/bin/python caregiver_app/app.py
# → Caregiver app running on http://localhost:5002

# 4) visit
# http://localhost:5001  (patient)
# http://localhost:5002  (caregiver)
# http://localhost:5001/health  and  http://localhost:5002/health  → {"status":"ok"}
```

No other install steps. `medication.db` and the `users` table are created automatically on first import.

## Credentials

All six accounts use password **`1234`**.

| Username     | Password | Role      | Name   | Language | Website |
|--------------|----------|-----------|--------|----------|---------|
| `caregiver`  | `1234`   | caregiver | Son    | `en-US`  | **5002 only** |
| `patient1`   | `1234`   | patient   | Amma   | `kn-IN`  | **5001 only** |
| `patient2`   | `1234`   | patient   | Thatha | `hi-IN`  | **5001 only** |
| `patient3`   | `1234`   | patient   | Ravi   | `en-US`  | **5001 only** |
| `patient4`   | `1234`   | patient   | Meera  | `kn-IN`  | **5001 only** |
| `patient5`   | `1234`   | patient   | Anil   | `hi-IN`  | **5001 only** |

> **Caregiver logs in on 5002 only; patients log in on 5001 only — each site rejects the wrong role with a 403.**
> e.g. `POST /login` as `caregiver` on 5001 → `403 Wrong portal. Caregivers use the caregiver website.` and `patient1` on 5002 → `403 Wrong portal. Patients use the patient website.` Invalid password → `401 Invalid credentials.`

Seeding is **automatic and idempotent** (`database.seed_default_users()` on import). Patients seed with **ids 1-5**, caregiver **id 6**. To reset everything:

```bash
rm medication.db   # also removes -wal/-shm if present
# next app start recreates DB with WAL and reseeds
```

There is only **one** users population path: `seed_default_users()` in `database.py`.

## API Highlights

All `/api/*` endpoints require a login session (cookie). Patient app derives `patient_id` from session; caregiver app requires explicit `patient_id` (query `?patient_id=` or JSON body).

### Patient App (5001) — session patient
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/login` | no | login page (redirects to `/` if already patient) |
| POST | `/login` | no | `{username,password}` → sets `session['user_id']` + `role='patient'` |
| GET | `/logout` | no | clears session |
| GET | `/` | patient | dashboard |
| GET | `/api/me` | patient | current patient `{id,username,name,role,language}` |
| GET | `/api/medicines` | patient | `get_medicines(patient_id)` |
| GET | `/api/doses/today` | patient | `get_todays_doses(patient_id)` |
| POST | `/api/doses/confirm` | patient | `{medicine_id,time}` → `confirm_dose(...,patient_id)` |
| GET | `/api/stats` | patient | `get_stats(patient_id)` |
| GET | `/health` | no | `{status:'ok',app:'patient',version,user}` |

### Caregiver App (5002) — explicit `patient_id`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/login` | no | login page |
| POST | `/login` | no | caregiver only, 403 if patient |
| GET | `/logout` | no | clears session |
| GET | `/` | caregiver | dashboard |
| GET | `/api/me` | caregiver | current caregiver |
| GET | `/api/patients` | caregiver | `list_patients()` — dynamic selector source (new patients appear automatically) |
| GET | `/api/medicines?patient_id=N` | caregiver | `get_medicines(N)` |
| POST | `/api/medicines` | caregiver | `{patient_id,name,dosage,times[],language}` |
| PUT | `/api/medicines/<id>` | caregiver | `{patient_id,...fields}` |
| DELETE | `/api/medicines/<id>?patient_id=N` | caregiver | |
| GET | `/api/doses/today?patient_id=N` | caregiver | |
| POST | `/api/doses/confirm` | caregiver | `{patient_id,medicine_id,time}` |
| GET | `/api/stats?patient_id=N` | caregiver | |
| POST | `/api/uploads` | caregiver | `{patient_id,filename,extracted_medicines[],thumbnail}` |
| GET | `/api/uploads?patient_id=N&limit=10` | caregiver | |
| DELETE | `/api/uploads/clear?patient_id=N` | caregiver | |
| POST | `/api/demo/load` | caregiver | `{patient_id}` → `load_demo_data` (3 meds: Metformin en-US, Dolo 650 kn-IN, Vitamin D3 hi-IN) |
| POST | `/api/demo/reset` | caregiver | `{patient_id}` → `reset_patient_data` |
| GET | `/health` | no | `{status:'ok',app:'caregiver',version,user}` |

## Demo Script (3–5 min)

1. **Caregiver logs in on :5002** → `caregiver / 1234` → dashboard shows **Total patients: 5**.
2. **Select Amma** → selector (large buttons with flag+name) sets active patient; all cards reload.
3. **Load Demo Data** → click **🚀 Load Demo** → `POST /api/demo/load {"patient_id":1}` → toast, 3 meds appear (`Metformin en-US 08:00/20:00`, `Dolo 650 kn-IN 14:00`, `Vitamin D3 hi-IN 09:00`); check **📊 Compliance** bar and **24h timeline**.
4. **Patient logs in on :5001** → `patient1 / 1234` → greeting `👋 ನಮಸ್ಕಾರ, Amma`, dashboard shows **same 3 meds** (shared DB proof); `📅 Today's Doses` grouped Morning/Afternoon/Evening.
5. **Speak** → in **🔊 Speaker** card press **🔊 Speak All Pending** → hears Kannada/Hindi/English via Web Speech (volume/speed sliders, waveform). Or press **▶️ Play Reminder**.
6. **Confirm** → press **✅ I took it** on one dose → card turns green, buzzer/LED update, toast.
7. **Caregiver sees live update** → switch back to :5002 (or refresh) → **📊 Compliance** now `Taken ≥1` and **📜 Dose History** shows taken; `patient2` still `[]` (isolation).
8. **Voice Agent (caregiver)** → in **🎤 Voice Agent** press **🎤 Start Listening** (or example `What is due next?`) → transcription + response mentioning patient by name, spoken in patient’s language.

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `SQLite database is locked` | Two Flask processes sharing one file. Mitigated by `WAL` + `busy_timeout=20000`. If still seen, stop both apps (`Ctrl+C`), delete `medication.db*`, restart. Never use system `python3`, always `.venv/bin/python`. |
| `403 Wrong portal. …` | You logged in on the wrong site. Caregiver → 5002, patient → 5001. Check `curl -v` status. |
| `401 Invalid credentials` | Wrong password (all are `1234`) or empty username/password. |
| TTS silent | Use **Chrome**; allow sound; check `speechSynthesis.getVoices().length` in console; voice availability shown as `✅ N voices ready`. Kannada/Hindi fallback chain: `kn → hi → en-IN → en-US`. |
| Ports in use (`5001`/`5002`) | `ss -tlnp | grep 5001` then `kill $(pgrep -f "[p]atient_app")` / `kill $(pgrep -f "[c]aregiver_app")` or `fuser -k 5001/tcp`. Restart with `.venv/bin/python patient_app/app.py` etc. |
| `404` on `/static/...` | Run via Flask (not `file://`); ensure `patient_app/static/css/style.css` and `caregiver_app/static/css/style.css` exist. |
| Need fresh data | `rm medication.db` → next start reseeds patients 1-5 / caregiver 6. Or per-patient `POST /api/demo/reset {"patient_id":N}` and `POST /api/demo/load`. |

## Version

**v1.0.0** — Patient & Caregiver split, shared WAL SQLite, SPEAKER TTS model.

File tree (excluding `.venv`, `__pycache__`, `*.db`):

```
medication_reminder/
├── database.py            # shared DB, WAL, patient_id scoping, seed patients 1-5 / caregiver 6
├── requirements.txt       # Flask==3.0.0, Flask-Cors==4.0.0
├── patient_app/
│   ├── app.py             # :5001, patient session, speaker/LED/buzzer
│   ├── templates/login.html
│   ├── templates/index.html
│   └── static/css/style.css, static/js/main.js
├── caregiver_app/
│   ├── app.py             # :5002, caregiver session, patient selector, CRUD, OCR, voice agent
│   ├── templates/login.html
│   ├── templates/index.html
│   └── static/css/style.css, static/js/main.js
└── README.md
```

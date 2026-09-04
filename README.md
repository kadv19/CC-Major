# 💊 Medication Reminder System — Elderly / Low-Literacy Care

> **Phase 8: Integration & Demo-Ready Polish (Final)** — Offline-first, Chrome-optimized, Flask + SQLite, Web Speech API (Kannada/Hindi/English), Mock OCR, LED/Buzzer IoT simulation.
> **Demo in 3–5 minutes with one click.**

---

## 📋 Table of Contents
- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Hard Constraints](#hard-constraints)
- [Core Features](#core-features)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [API Reference](#api-reference)
- [Data Model](#data-model)
- [Architecture](#architecture)
- [Demo Script (3–5 min)](#demo-script-35-min)
- [Feature Guide](#feature-guide)
- [Offline & Error Handling](#offline--error-handling)
- [Responsive & Accessibility](#responsive--accessibility)
- [Troubleshooting](#troubleshooting)
- [Version](#version)

---

## Overview
Two-part system:
- **Web Dashboard (Son/Caregiver)** — Flask + vanilla JS, sets schedule, monitors compliance, triggers speaker.
- **IoT Device Simulation (Mother’s Home)** — Browser simulation of ESP32/Arduino hardware: LED circles + buzzer pulsing + speaker (Web Speech API). All visual, no physical hardware required.

**Goal:** Help elderly patients take medicines on time with visual/audio reminders in **Kannada (kn-IN), Hindi (hi-IN), English (en-US)**. Low-literacy friendly, big buttons, colors, voice.

> Demo tomorrow: Show speaker functionality via website (simulating IoT device) — all offline, no API keys.

---

## Tech Stack
| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | HTML/CSS/JavaScript (vanilla, no frameworks) | Single-file simplicity, offline, Chrome best |
| Backend | Flask (Python 3.10+) | Lightweight, serves UI + REST API |
| Database | SQLite (`medication.db`, file-based) | Offline, no cloud, zero-config |
| TTS | Web Speech API (browser) | Free, no key, works offline in Chrome, kn-IN/hi-IN/en-US |
| OCR | Mock keyword matching (client-side) | No cloud, deterministic 1–3 meds, offline |
| Buzzer | Web Audio API (440 Hz sine, 880 Hz due-now) | No hardware, offline beep |
| Fonts | Noto Sans Kannada/Devanagari + Poppins via Google Fonts (fallback system) | Kannada/Hindi rendering |

**Works offline:** Core features (CRUD, schedule, LEDs, buzzer, TTS) work without internet after first load. SQLite + localStorage fallback.

---

## Hard Constraints
- ✅ All code works offline (no cloud dependencies for core features) — SQLite file + `localStorage` fallback + `navigator.onLine` detection.
- ✅ Supports Kannada (`kn-IN`), Hindi (`hi-IN`), English (`en-US`) via `SpeechSynthesisUtterance.lang`.
- ✅ No external API keys required (Web Speech API, Web Audio API, Mock OCR).
- ✅ Single-file HTML approach where possible (inline SVG favicon, single `main.js`).
- ✅ Must work on Chrome browser (best TTS support — `onvoiceschanged` handling).

---

## Core Features
1. **Upload prescription image** (OCR optional) — drag & drop, preview, `Analyze` → mock 1–3 meds, editable, `Add All`.
2. **Set medication schedule** — name + dosage + times (primary + comma additional) + language.
3. **Display today’s doses** — status `Pending/Taken/Missed`, grouped by Morning/Afternoon/Evening/Night, relative time (`in 2h`, `5 min ago`), filters (`Today/All/Pending/Taken/Missed`), 24h timeline.
4. **Speaker test (Web Speech API)** — per-medicine `🔊 Test Speaker`, `🔊 Speak All Pending` sequential, volume (0–100%) + speed (0.5–2.0) sliders, waveform visual, voice status.
5. **LED simulation** — colored circles per dose: yellow slow blink = pending, fast yellow = Due Now (≤5 min), green = taken, red = missed.
6. **Buzzer simulation** — pulsing + vibration when pending, faster when overdue/due-now, Web Audio beep, mute persists.
7. **Confirmation button** — `✅ Mark as Taken` per dose / `✅ Confirm Dose Taken (IoT button)` for next pending, updates compliance.
8. **Caregiver dashboard** — taken/pending/missed, upcoming/overdue, next dose, compliance %, bar, refresh.

**Phase 8 Polish Added:**
- 🚀 Demo mode: one-click `Load Demo Data` (3 meds, all languages) via `POST /api/demo/load` + `Reset` via `POST /api/demo/reset` + `Auto Demo Flow` with highlights & TTS.
- 📱 Responsive: mobile (1 col), tablet, desktop (3 col), touch 48px+.
- 🔔 Toasts for all actions, loading spinner, offline indicator, `API: Online/Offline` badge.
- 📊 Quick actions grid, compliance summary, next dose.
- 📋 Demo instructions modal (`❓ Demo Help`), highlight (`demo-highlight` pulse), smooth scroll, favicon, dark mode (`🌙 Dark`).

---

## Project Structure
```
medication_reminder/
├── app.py                 # Flask backend — Phase 8 polished (health, demo/load/reset, stats)
├── database.py            # SQLite ops — medicines, doses, upload_history, stats
├── medication.db          # SQLite file (auto-created, offline)
├── requirements.txt       # Flask==3.0.0, Flask-Cors==4.0.0
├── templates/
│   └── index.html         # Single HTML — Phase 8 (ARIA, skip link, modal, no duplicate includes)
├── static/
│   ├── css/
│   │   └── style.css      # Phase 8 CSS — responsive, 48px touch, dark mode, animations
│   ├── js/
│   │   └── main.js        # Phase 8 JS — CRUD + TTS + IoT + OCR + offline + demo (3400+ lines)
│   ├── favicon.ico        # Green square PNG as ICO (offline, 99 bytes)
│   └── images/
│       └── favicon.ico    # Copy for fallback
└── README.md              # This file — setup, demo script, architecture
```

**File roles:**
- `app.py:1` — Flask entry, CORS, 10+ endpoints.
- `database.py:1` — `init_db()`, `add_medicine()`, `get_medicines()`, `confirm_dose()`, `get_stats()`.
- `templates/index.html:1` — Entire UI, vanilla JS/CSS, ARIA.
- `static/js/main.js:1` — All business logic, offline-first, Chrome optimized.

---

## Setup Instructions

### Prerequisites
- Python 3.10+ (check `python3 --version`)
- Chrome 90+ (best Web Speech API)
- `pip` (Python package manager)

### 1) Clone / Copy
```bash
# If using git (this folder is not git, but example):
# git clone <repo-url>
# cd medication_reminder

# Or just use the existing folder:
cd /path/to/medication_reminder
ls -la
# Should see: app.py  database.py  requirements.txt  templates/  static/
```

### 2) Install dependencies (offline friendly)
```bash
pip install -r requirements.txt
# Expected:
# Flask==3.0.0
# Flask-Cors==4.0.0
# sqlite3 is built-in, no install needed
```

### 3) Run Flask backend
```bash
python app.py
# Output:
# Database initialized at .../medication.db
# Medication Reminder v8.0.0 Phase 8 starting...
#  * Running on all addresses (0.0.0.0)
#  * Running on http://127.0.0.1:5000
#  * Running on http://192.168.0.108:5000  # LAN for IoT demo
```

### 4) Open in Chrome
- Visit `http://127.0.0.1:5000` (or `http://localhost:5000`)
- Alternative LAN: `http://<your-ip>:5000` (phone/tablet on same Wi-Fi)
- Check `/health` → `{"status":"ok","phase":8,"version":"8.0.0",...}`

### 5) Verify offline
- DevTools → Application → Local Storage → `medication_reminder_*`
- Turn off Wi-Fi → `📡 Offline - using local cache` toast + `● Offline` badge, but CRUD still works via `localStorage` fallback.

### 6) Quick test (console)
```js
loadSampleMedicines()   // One-click via JS fallback
autoDemoFlow()          // Auto 5-step demo
speakCustomMessage("Time to take Dolo", "kn-IN")
setMockTime("08:00")    // Test due-now
testTime("14:00")
setMockTime(null)       // Back to real time
```

### 7) Stop & Reset
```bash
# Ctrl+C to stop Flask
# To reset DB:
rm medication.db
python app.py  # recreates fresh DB
# Or via API:
curl -X POST http://127.0.0.1:5000/api/demo/reset
```

---

## API Reference

### Base: `http://127.0.0.1:5000`

| Method | Path | Body | Success | Notes |
|--------|------|------|---------|-------|
| GET | `/` | — | `text/html` (index) | Dashboard UI |
| GET | `/health` , `/api/health` | — | `{status, phase:8, version:"8.0.0", medicines, stats}` | Quick check |
| GET | `/api/medicines` | — | `[{id, name, dosage, times, language, takenToday, date_added}]` | Ensures doses for today |
| POST | `/api/medicines` | `{name, dosage, times:[], language}` | `201 {medicine}` | Validates `times` `HH:MM` |
| PUT | `/api/medicines/:id` | `{name?, dosage?, times?, language?}` | `{medicine}` | Reconciles doses |
| DELETE | `/api/medicines/:id` | — | `{message}` | Cascade deletes doses |
| POST | `/api/doses/confirm` | `{medicine_id, time:"HH:MM", date?"YYYY-MM-DD"}` | `{dose}` | Marks `taken=1` |
| GET | `/api/doses/today` | — | `[{medicine_id, medicine_name, time, taken}]` | Today joined |
| POST | `/api/uploads` | `{filename, extracted_medicines[], thumbnail}` | `{record}` | Persists history |
| GET | `/api/uploads?limit=10` | — | `[{filename, upload_date, extracted_medicines}]` | Recent first |
| DELETE | `/api/uploads/clear` | — | `{message}` | **Phase 8** |
| GET | `/api/stats` | — | `{taken, pending, missed, upcoming, overdue, total, compliance}` | Uses current time |
| POST | `/api/demo/load` | — | `{count:3, medicines:[]}` | **Phase 8 one-click** |
| POST | `/api/demo/reset` | — | `{cleared:true}` | **Phase 8 one-click** |

**cURL examples:**
```bash
# Health
curl http://127.0.0.1:5000/health | jq

# Add medicine (Kannada)
curl -X POST http://127.0.0.1:5000/api/medicines \
  -H "Content-Type: application/json" \
  -d '{"name":"Dolo 650","dosage":"1 tablet","times":["14:00"],"language":"kn-IN"}'

# Confirm taken
curl -X POST http://127.0.0.1:5000/api/doses/confirm \
  -H "Content-Type: application/json" \
  -d '{"medicine_id":2,"time":"14:00"}'

# Demo load (one click)
curl -X POST http://127.0.0.1:5000/api/demo/load

# Stats
curl http://127.0.0.1:5000/api/stats
```

---

## Data Model
```js
Medicine = {
  id: int,                         // SQLite AUTOINCREMENT
  name: string,                    // e.g., "Metformin" / "Dolo 650"
  dosage: string,                  // e.g., "1 tablet" / "5 ml"
  times: [string],                 // ["08:00","20:00"] sorted, deduped
  language: string,                // "kn-IN" | "hi-IN" | "en-US"
  takenToday: { "08:00": bool },   // Map per time, today only
  date_added: "YYYY-MM-DD"
}
Dose = {
  id: int,
  medicine_id: int,                // FK → medicines.id
  time: "HH:MM",
  date: "YYYY-MM-DD",
  taken: bool,
  taken_at: "ISO datetime" | null
}
UploadHistory = {
  id: int,
  filename: string,
  upload_date: "ISO datetime",
  extracted_medicines: [{name, dosage, times, language}],
  thumbnail: "data:image/...;base64,..." // ~220px preview
}
Stats = {
  taken: int, pending: int, missed: int,
  upcoming: int, overdue: int, total: int,
  compliance: int // 0–100
}
```

---

## Architecture

### High-Level (Offline-First)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                           │
│  ┌──────────────┐  fetch (CORS)  ┌──────────────────────────┐    │
│  │  index.html  │ ────────────► │   Flask (app.py:1)       │    │
│  │  + CSS/JS    │ ◄──────────── │  /api/medicines, /doses, │    │
│  │  (vanilla)   │   JSON/HTML   │  /uploads, /stats,       │    │
│  └──────┬───────┘               │  /api/demo/load|reset    │    │
│         │                       └──────────┬───────────────┘    │
│         │  localStorage fallback  ┌────────▼────────┐            │
│         ├────────────────────────►│ database.py:1   │            │
│         │  (filter, tts_*, mute, │ SQLite file     │            │
│         │   upload_history)      │ medication.db   │            │
│         │                        │ medicines, doses│            │
│  ┌──────▼──────┐  Web APIs       │ upload_history  │            │
│  │ Web Speech  │◄──T T S (kn/hi/en)──┘            │
│  │ Web Audio   │◄──Beep 440/880 Hz                │
│  │ FileReader  │◄──Image preview (Mock OCR)       │
│  └─────────────┘                                  │
│  LED circles (yellow/green/red)  Buzzer (pulse)  │
└─────────────────────────────────────────────────────────────────┘
         ▲  LAN 0.0.0.0:5000 (IoT demo)   file-based, no cloud
```

### Request Flow (Happy Path)

```
[User adds Metformin 08:00 en-US]
   │
   ├─► form submit → handleAddMedicine() → apiRequest POST /api/medicines
   │                                   └─► database.add_medicine() → INSERT medicines + INSERT doses → return {takenToday}
   │                                   └─► fallback to local addMedicine() if offline
   ├─► medicines.push() → save filter → renderAll()
   │         ├─► renderSchedule() (grouped, filtered, relative time)
   │         ├─► updateLEDs() (yellow blink)
   │         ├─► updateBuzzer() (pulse + beep if due-now)
   │         ├─► updateStats()/compliance bar
   │         └─► updateNextDose() + updateBrowserTitle() (💊 (1))
   │
[Time 08:00 → user clicks ✅ Mark as Taken]
   │
   ├─► confirmTaken(1, "08:00") → POST /api/doses/confirm → UPDATE doses taken=1
   ├─► showToast("✅ Metformin at 8:00 AM marked as Taken")
   └─► renderAll() → LED green, buzzer idle if no pending, compliance 25%→...
```

### Offline Strategy
```
navigator.onLine ?
  Yes → fetch /api/* with showLoading() → updateApiStatus(true) → SQLite
  No  → throw "Offline" → catch → use localStorage fallback → showToast offline → updateApiStatus(false)
localStorage keys: medication_reminder_medicines (legacy), filter, tts_volume, buzzer_muted, iot_connected, upload_history
Migration: On first backend load, if DB empty but local has meds, POST each to backend then clear local.
```

### Tech Highlights (to mention in presentation)
- Offline-first (SQLite file + localStorage, no cloud)
- Web Speech API free (kn-IN/hi-IN/en-US), Chrome best, `onvoiceschanged`
- Web Audio 440Hz (880Hz due-now), `AudioContext`
- Flask + SQLite, vanilla JS, single HTML, no `npm`
- Responsive 48px touch, dark mode `data-theme="dark"`, ARIA, smooth scroll

---

## Demo Script (3–5 min)

### Pre-Check (1 min before)
```bash
python app.py
# Open http://127.0.0.1:5000 in Chrome
# Check /health shows phase 8, 0 medicines
# Test volume slider, ensure speakers on
```

### Live Script (Follow ❓ Demo Help modal)

**Step 1 — Load Demo (10s)**
- Click **🚀 Load Demo Data (3 meds)** at top (calls `POST /api/demo/load`).
- **Say:** "One click, 3 medicines in all 3 languages — Metformin English, Dolo Kannada, Vitamin D3 Hindi — persisted in SQLite."
- **Show:** Cards appear, `Today • Sep 4, 2026` + `4 Doses`, timeline dots, LED yellow blinks, buzzer pulsing.

**Step 2 — Speaker Test Kannada (30s)**
- Scroll to **Today's Schedule** → find **Dolo 650 (kn-IN)** → click **🔊 Test Speaker (Phase 4)**.
- **Hear:** “ಅಮ್ಮ, Dolo 650 ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. 1 tablet ತೆಗೆದುಕೊಳ್ಳಿ.” (Kannada)
- **Say:** "Browser TTS, no API key, offline, Chrome. Volume/speed sliders — let’s slow to 0.7x and replay."
- Adjust **🔊 Volume** and **⚡ Speed** → click **▶️ Play Reminder (Test Speaker)** with `kn-IN` selected.
- **Show:** Waveform animates (`speakerVisual.speaking`), `voiceStatus: ✅ 20 voices ready`.

**Step 3 — Hindi Test (20s)**
- Click **Test Speaker** on **Vitamin D3 (hi-IN)** → hear Hindi: “अम्मा, Vitamin D3 लेने का समय...”
- Go to **Speaker Test** section → select **hi-IN** → click **▶️ Play Reminder** → hear Hindi.
- **Say:** "Same flow, different language — Kannada, Hindi, English all free."

**Step 4 — Upload Mock OCR (40s)**
- Drag **any JPG/PNG** (e.g., `prescription.jpg`) to **📄 Prescription Upload** drop zone.
- Click **🔍 Analyze Prescription (Mock OCR)** → 1.2s spinner → **📋 Extracted Medicines** shows 1–3 editable meds.
- **Say:** "Mock OCR offline, keyword matching, no cloud. We can edit name/dosage/time/language."
- Click **➕ Add All to Schedule** → toast `✅ Added 2 medicine(s)` → new cards appear, history updates with thumbnail.

**Step 5 — Due Now & Buzzer (20s)**
- Click **⏰ Simulate Due Now (5 min)** in IoT controls → medicine `Test DueNow 08:02` appears.
- **Show:** LED fast blinking (`led-due-now` 0.4s), buzzer fast pulsing + **beep 880Hz**, `⚡ DUE NOW - BUZZING FAST!`
- Click **✅ Mark as Taken** on that dose → LED green, buzzer idle, compliance bar animates `25% → 50%`.

**Step 6 — Filters & Compliance (20s)**
- Click **⏳ Pending** → only pending cards, **✅ Taken** → taken, **24-Hour Timeline** dots update.
- Scroll to **👨‍👩‍👧 Caregiver Dashboard** → show `Taken/Pending/Missed`, `Upcoming/Overdue`, `Next Dose`, compliance `%`.
- **Say:** "Son remotely monitors Mother’s compliance."
- Click **✅ Mark All Taken** in **⚡ Quick Actions** → all green, `100%`, browser title `💊 Medication Reminder` (no badge).

**Step 7 — Reset (5s)**
- Click **🔄 Reset Demo** → confirm → `POST /api/demo/reset` → DB cleared, empty states with `💊 No medicines scheduled`.
- **Say:** "One click reset, ready for next presenter."

**Optional Highlights (if time):**
- **Mute:** Click **🔇 Mute Buzzer** → `🔇 Buzzer Muted` persists in localStorage, no beep.
- **Dark mode:** Click **🌙 Dark** → `data-theme="dark"`, persists.
- **Offline:** Turn off Wi-Fi → `📡 Offline` badge, add medicine still works via `localStorage`.
- **Touch:** Show mobile responsive (Chrome DevTools → 375px), all buttons 48px.
- **Auto Demo:** Click **▶️ Auto Demo Flow** → scripted 5-step auto with highlights.

**Closing (5s):**
> "Offline-first, Flask + SQLite, Web Speech API Kannada/Hindi/English, Mock OCR, LED/Buzzer simulation — vanilla JS, no API keys, Chrome-optimized, demo-ready in 3 minutes."

---

## Feature Guide

### Medicine Management (CRUD)
- **Add:** Form → `addMedicine()` → `POST /api/medicines` → `renderAll()`.
- **Delete:** Card `🗑️ Delete` → `DELETE /api/medicines/:id`.
- **Validate:** `name`, `dosage`, `times` `HH:MM` required; times deduped/sorted.
- **Daily reset:** New date → `takenToday` all `false` (backend ensures doses for today).

### Schedule Display & Status
- **Status logic:** `taken → taken`, else `slot < now ? missed : pending`.
- **Relative time:** `in 5 min`, `2h ago`, `now`, styled `upcoming/now/overdue`.
- **Grouping:** Morning (6–11), Afternoon (12–16), Evening (17–20), Night (21–5) with dividers.
- **Timeline:** `timelineBar` dots at `left = minutes/1440 *100%`, `now` blue line.
- **Browser title:** `💊 (2)` pending or `⚠️ (1 missed)`.

### TTS Speaker (Phase 4)
- **Per-medicine:** `speakReminder(med, time)` → `getReminderText()` → `speakCustomMessage(text, lang)` → `SpeechSynthesisUtterance`.
- **All pending:** `speakAllPending()` sequential with 2s pause.
- **Sliders:** `volumeSlider` (0–100% → `0.0–1.0`), `speedSlider` (0.5–2.0 → `rate`), persisted `localStorage tts_volume/rate`.
- **Visual:** `speakerVisual.speaking` waveform `wavePulse`, icon `speakerPulse`, status `🔊 Speaking: ...`.

### LED & Buzzer (Phase 5)
- **LED per dose:** `led-pending` slow blink 1.2s, `led-due-now` fast 0.4s (≤5 min), `led-taken` green, `led-missed` red.
- **Buzzer:** `buzzer-active` pulse 0.8s, `buzzer-overdue` fast 0.35s, `buzzer-muted` grayscale, `playBuzzerBeep(freq, duration)` via `AudioContext`.
- **IoT toggle:** `iotConnected` persists, disconnect shows `🔌 IoT Disconnected`.
- **Test buttons:** `Trigger LED Test` (flash), `Trigger Buzzer` (3 beeps), `Simulate Due Now` (add med +880Hz).

### Upload & Mock OCR (Phase 6)
- **Drop zone:** `dragover`→`dragover` class, `drop`→`handleFile()` → `validateFile()` → `showPreview()` (FileReader `dataURL`).
- **Mock OCR:** `mockOCRExtract(filename)` → keyword match or random 1–3 from `MOCK_PRESETS` (10 presets).
- **Results:** `renderExtractedList()` editable fields + `Remove`, `Add All` → `POST /api/medicines` each → `saveUploadHistory()` → `POST /api/uploads`.
- **History:** `uploadHistory` (10 max), thumbnails `dataURL`, persisted SQLite + local fallback.

### Demo & Polish (Phase 8)
- **Load:** `POST /api/demo/load` (server clears + inserts 3) else `loadSampleMedicines()` fallback.
- **Reset:** `POST /api/demo/reset` + `DELETE /api/uploads/clear` else per-medicine delete.
- **Auto flow:** `autoDemoFlow()` 5 steps with `highlightDemo()` (`demo-highlight` outline pulse) + `scrollIntoView`.
- **Quick actions:** `Mark All Taken`, `Speak All`, `Buzzer`, `Stats`.
- **Offline:** `navigator.onLine` → `offlineBadge`, `apiStatusBadge`, `offlineIndicator` toast.
- **Dark mode:** `data-theme="dark"` on `html`, persists `localStorage theme`.
- **Mock time:** `setMockTime("09:00")` for testing due-now, `setMockTime(null)` to reset.

---

## Offline & Error Handling
- **Graceful fallbacks:** Every `apiRequest` has `try/catch` → if fails, use `localStorage` logic and `showToast("Backend unavailable, saved locally", "info")`.
- **User-friendly messages:** `Invalid time format: 25:00` → toast error, not raw stack.
- **Offline detection:** `window.addEventListener('online/offline', updateOffline)` → badge + indicator + `showToast`.
- **Validation:** File `5MB`, `image/jpeg|png` only; times `HH:MM` regex; medicines require `name/dosage/times`.
- **No console errors:** Single `url_for('static', ...)` includes (no fallback 404), `onvoiceschanged` guard, `AudioContext` suspend resume, mock time regex guard.

---

## Responsive & Accessibility
- **Breakpoints:** `320px` mobile (1 col), `640px` tablet (2 col, form row), `900px` desktop (`dashboard-grid:1fr 1fr`, `iot-grid:1fr 1fr 1fr`, `schedule-grid:3 col`), `1200px` extra padding.
- **Touch:** All `.btn` `min-height:48px` on mobile, `filter-btn` `44px`, `demo/ quick` `48px`; `input` `16px` prevents iOS zoom; `scroll-behavior: smooth`.
- **Animations:** `ledBlink`, `buzzerPulse`, `wavePulse`, `demoPulse` — reduced to `none` if `prefers-reduced-motion`.
- **ARIA:** `role="banner/contentinfo"`, `aria-label` on all buttons/selects, `aria-live="polite"` on schedule/history, `aria-pressed` on filters, `progressbar` on compliance bar, `skip-link` to main, keyboard `Enter/Space` on drop zone.
- **Favicon:** Data URI pill + file `/static/favicon.ico` (offline), `smooth scroll`, `::-webkit-scrollbar` styled.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Flask not running` | `pip install -r requirements.txt` then `python app.py` → `http://127.0.0.1:5000` |
| `SQLite locked` | Stop previous Flask (`Ctrl+C`), `rm medication.db` to reset, restart |
| `TTS not speaking` | Use **Chrome**, check `chrome://settings/content/sound` allow, DevTools console `speechSynthesis.getVoices().length` should be >0 |
| `Kannada voice not found` | Chrome often lacks `kn-IN` — falls back to `hi-IN` then `en-IN` then `en-US`; check `voiceStatus` badge |
| `404 /static/...` | Ensure running via `http://127.0.0.1:5000` not `file://`; single `url_for` include avoids 404 |
| `Upload not showing` | File must be JPG/PNG <5MB; drag & drop needs Chrome; check `console` for `validateFile` error |
| `Demo buttons do nothing` | Hard refresh `Ctrl+Shift+R`, check console for `initDemoMode` logs; ensure `http://127.0.0.1:5000/health` returns `phase:8` |
| `Buzzer no beep` | Check `buzzerMuted` (click `Unmute`), `iotConnected` toggle, Chrome `AudioContext` suspended → click any button to resume |
| `Compliance 0%` | Need `Taken` doses — click `✅ Mark as Taken` per dose or `Mark All Taken` |
| `Dark mode stuck` | `localStorage.removeItem('theme')` then refresh |

---

## Version
- **v8.0.0** • **2026-09-04** • Phase 8 Final — Demo-Ready Polish.
- Previous: Phase 0 setup → Phase 7 Flask + SQLite → Phase 8 polish.
- Favicon: 99-byte PNG as ICO, offline.

**Run & Demo:**
```bash
pip install -r requirements.txt
python app.py
# Chrome → http://127.0.0.1:5000 → 🚀 Load Demo Data → 🔊 Test Speaker → 📚 Upload → ⏰ Due Now → 📊 Stats → 🔄 Reset
```

**Enjoy the demo!** For issues, open `DevTools Console` → try `loadSampleMedicines()` or `autoDemoFlow()`. 🎉

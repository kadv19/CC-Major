"""
Medication Reminder System - Flask Backend
Phase 8: Integration & Demo-Ready Polish (Final)

- Works offline (SQLite file-based, no cloud, no API keys)
- Supports Chrome browser (Web Speech API best)
- Serves dashboard UI and provides REST API for medicines, doses, uploads, stats
- Uses database.py for SQLite operations
- Added demo helpers: /api/demo/load, /api/demo/reset for one-click demo
- Polished error handling, health, CORS, offline-friendly

API Endpoints:
- GET /api/medicines
- POST /api/medicines
- PUT /api/medicines/<id>
- DELETE /api/medicines/<id>
- POST /api/doses/confirm
- GET /api/doses/today
- POST /api/uploads
- GET /api/uploads
- DELETE /api/uploads/clear
- GET /api/stats
- POST /api/demo/load   (Phase 8 - one click demo data)
- POST /api/demo/reset  (Phase 8 - reset demo)
- GET /health
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import database
import os

# Initialize Flask app - Phase 8 polished
app = Flask(__name__)
# Enable CORS for all routes (needed for fetch from frontend, offline demo)
CORS(app, resources={r"/api/*": {"origins": "*"}})
# JSON pretty for debug readability
app.config["JSON_SORT_KEYS"] = False

# Ensure DB tables exist on startup
try:
    database.init_db()
    print("Database initialized at", database.DB_PATH)
except Exception as e:
    print(f"Failed to initialize database: {e}")

# Phase 8: version constant for footer and health
APP_VERSION = "8.0.0"
APP_PHASE = 8


# ==================== Frontend Routes ====================

@app.route("/")
def home():
    """Home route - Renders the full dashboard UI (Phase 8 polished)."""
    return render_template("index.html")


@app.route("/health")
def health():
    """Health check endpoint - Returns JSON status (Phase 8)."""
    try:
        # Quick DB check
        stats = database.get_stats()
        meds = database.get_medicines()
        db_status = "ok"
        med_count = len(meds)
    except Exception as e:
        db_status = f"error: {e}"
        stats = {}
        med_count = -1
    return jsonify({
        "status": "ok",
        "message": "Flask server running",
        "phase": APP_PHASE,
        "version": APP_VERSION,
        "db": database.DB_PATH,
        "db_status": db_status,
        "medicines": med_count,
        "stats": stats
    })


@app.route("/api/health")
def api_health():
    """Alias for /health under /api prefix (Phase 8 convenience)."""
    return health()


@app.route("/hello")
def hello():
    """Legacy Hello World verification from Phase 0 - kept for testing."""
    return """
    <html>
        <head><title>Medication Reminder - Phase 0</title></head>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h1>Medication Reminder System - Phase 0</h1>
            <h2>Hello World - Flask Server is Running!</h2>
            <p>Visit <code>/</code> for Dashboard UI</p>
            <p>API: <code>/api/medicines</code> | <code>/api/stats</code></p>
        </body>
    </html>
    """


# ==================== API: Medicines ====================

@app.route("/api/medicines", methods=["GET"])
def api_get_medicines():
    """GET /api/medicines - Returns all medicines with today's doses (takenToday map)."""
    try:
        medicines = database.get_medicines()
        return jsonify(medicines), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/medicines", methods=["POST"])
def api_add_medicine():
    """POST /api/medicines - Adds a new medicine. Body: {name, dosage, times, language}."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400
        medicine = database.add_medicine(data)
        return jsonify(medicine), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/medicines/<int:medicine_id>", methods=["PUT"])
def api_update_medicine(medicine_id):
    """PUT /api/medicines/<id> - Updates a medicine."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400
        updated = database.update_medicine(medicine_id, data)
        if updated is None:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify(updated), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/medicines/<int:medicine_id>", methods=["DELETE"])
def api_delete_medicine(medicine_id):
    """DELETE /api/medicines/<id> - Deletes a medicine."""
    try:
        deleted = database.delete_medicine(medicine_id)
        if not deleted:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify({"message": f"Medicine {medicine_id} deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== API: Doses ====================

@app.route("/api/doses/confirm", methods=["POST"])
def api_confirm_dose():
    """
    POST /api/doses/confirm - Confirms a dose as taken.
    Body: {medicine_id, time, date (optional YYYY-MM-DD)}
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400
        medicine_id = data.get("medicine_id") or data.get("medicineId") or data.get("id")
        time = data.get("time")
        dose_date = data.get("date")  # optional, defaults to today in DB
        if medicine_id is None or time is None:
            return jsonify({"error": "medicine_id and time required"}), 400
        try:
            medicine_id = int(medicine_id)
        except ValueError:
            return jsonify({"error": "medicine_id must be integer"}), 400

        result = database.confirm_dose(medicine_id, time, dose_date)
        if result is None:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify(result), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/doses/today", methods=["GET"])
def api_get_todays_doses():
    """GET /api/doses/today - Returns today's doses with medicine info."""
    try:
        doses = database.get_todays_doses()
        return jsonify(doses), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== API: Uploads ====================

@app.route("/api/uploads", methods=["POST"])
def api_add_upload():
    """
    POST /api/uploads - Saves upload record.
    Body: {filename, extracted_medicines (list), thumbnail (base64 string)}
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON body"}), 400
        # Support both extracted_medicines and medicines keys for flexibility
        if "extracted_medicines" not in data and "medicines" in data:
            data["extracted_medicines"] = data["medicines"]
        record = database.add_upload_record(data)
        return jsonify(record), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/uploads", methods=["GET"])
def api_get_uploads():
    """GET /api/uploads - Returns upload history (most recent first)."""
    try:
        # Optional limit param
        limit = request.args.get("limit", default=10, type=int)
        history = database.get_upload_history(limit=limit)
        return jsonify(history), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== API: Stats ====================

@app.route("/api/stats", methods=["GET"])
def api_get_stats():
    """GET /api/stats - Returns compliance statistics for today."""
    try:
        stats = database.get_stats()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== API: Demo Helpers - Phase 8 ====================
# One-click demo for 3-5 min presentation (offline, no API key)

@app.route("/api/demo/load", methods=["POST"])
def api_demo_load():
    """
    POST /api/demo/load - Loads 3 demo medicines (one per language) for instant demo.
    Clears existing first for clean demo (idempotent).
    Returns list of created medicines.
    """
    try:
        # Clear existing medicines for clean demo (optional but polished)
        # Use get_medicines to find ids then delete
        existing = database.get_medicines()
        for m in existing:
            try:
                database.delete_medicine(m["id"])
            except Exception:
                pass

        samples = [
            {"name": "Metformin", "dosage": "1 tablet", "times": ["08:00", "20:00"], "language": "en-US"},
            {"name": "Dolo 650", "dosage": "1 tablet", "times": ["14:00"], "language": "kn-IN"},
            {"name": "Vitamin D3", "dosage": "1 capsule", "times": ["09:00"], "language": "hi-IN"},
        ]
        created = []
        for s in samples:
            try:
                med = database.add_medicine(s)
                created.append(med)
            except Exception as e:
                return jsonify({"error": f"Failed to add {s['name']}: {e}"}), 500
        return jsonify({"message": "Demo data loaded", "medicines": created, "count": len(created)}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/demo/reset", methods=["POST"])
def api_demo_reset():
    """
    POST /api/demo/reset - Clears all demo data (medicines + doses + upload history).
    For one-click reset button.
    """
    try:
        conn = database.get_db_connection()
        try:
            conn.execute("DELETE FROM doses")
            conn.execute("DELETE FROM medicines")
            conn.execute("DELETE FROM upload_history")
            # Reset autoincrement for clean ids (optional)
            conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('medicines','doses','upload_history')")
            conn.commit()
        finally:
            conn.close()
        return jsonify({"message": "Demo reset complete", "cleared": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/uploads/clear", methods=["DELETE"])
def api_clear_uploads():
    """DELETE /api/uploads/clear - Clears upload history (Phase 8)."""
    try:
        conn = database.get_db_connection()
        try:
            conn.execute("DELETE FROM upload_history")
            conn.commit()
        finally:
            conn.close()
        return jsonify({"message": "Upload history cleared"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==================== Error Handlers - Phase 8 Polish ====================

@app.errorhandler(404)
def not_found(e):
    # For API routes, return JSON with helpful message
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found", "path": request.path, "hint": "Check /health for available endpoints"}), 404
    # For frontend unknown routes, serve index (SPA-like) for smooth demo
    try:
        return render_template("index.html"), 404
    except Exception:
        return jsonify({"error": "Not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed", "path": request.path, "method": request.method}), 405
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def internal_error(e):
    # Generic 500 with JSON for API routes
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500
    return jsonify({"error": "Internal server error"}), 500

# Favicon route - serve data URI fallback if static file missing (offline)
@app.route("/favicon.ico")
def favicon():
    # Try static favicon, else return 204
    static_dir = os.path.join(app.root_path, "static")
    fav_path = os.path.join(static_dir, "favicon.ico")
    if os.path.exists(fav_path):
        return send_from_directory(static_dir, "favicon.ico", mimetype="image/vnd.microsoft.icon")
    # Also try images folder
    img_fav = os.path.join(static_dir, "images", "favicon.ico")
    if os.path.exists(img_fav):
        return send_from_directory(os.path.join(static_dir, "images"), "favicon.ico")
    return "", 204


# Run the Flask development server - Phase 8 polished
if __name__ == "__main__":
    print(f"Medication Reminder v{APP_VERSION} Phase {APP_PHASE} starting...")
    print("Features: Offline SQLite, Web Speech API, Mock OCR, LED/Buzzer simulation")
    print("Demo: POST /api/demo/load for instant 3-meds demo, POST /api/demo/reset to clear")
    # debug=True for auto-reload during development, host 0.0.0.0 for IoT demo on LAN
    app.run(debug=True, host="0.0.0.0", port=5000)

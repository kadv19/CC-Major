import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import database

from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_cors import CORS
from functools import wraps

app = Flask(__name__)
app.secret_key = 'caregiver-app-demo-secret-key'
CORS(app, resources={r"/api/*": {"origins": "*"}})

APP_VERSION = '1.0.0'
APP_NAME = 'Caregiver Dashboard'

try:
    database.init_db()
except Exception as e:
    print(f"Failed to init DB: {e}")

def login_required_caregiver(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = session.get('user_id')
        role = session.get('role')
        if not user_id or role != 'caregiver':
            if request.path.startswith('/api/'):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for('caregiver_login'))
        user = database.get_user_by_id(user_id)
        if not user or user['role'] != 'caregiver':
            session.clear()
            if request.path.startswith('/api/'):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for('caregiver_login'))
        return f(*args, **kwargs)
    return decorated

def _get_and_validate_patient_id():
    """Extract patient_id from query param or JSON body, validate exists and is patient. Returns (patient_id, error_response)."""
    pid = None
    # try query param
    pid_q = request.args.get('patient_id')
    if pid_q is not None:
        pid = pid_q
    # try JSON body if not found in query or for POST
    if pid is None and request.is_json:
        data = request.get_json(silent=True) or {}
        if 'patient_id' in data:
            pid = data.get('patient_id')
        elif 'patientId' in data:
            pid = data.get('patientId')
    # also for form?
    if pid is None:
        pid_f = request.form.get('patient_id')
        if pid_f:
            pid = pid_f

    if pid is None or (isinstance(pid, str) and pid.strip() == ''):
        return None, (jsonify({"error": "patient_id required"}), 400)
    try:
        pid_int = int(pid)
    except (ValueError, TypeError):
        return None, (jsonify({"error": "patient_id must be integer"}), 400)

    user = database.get_user_by_id(pid_int)
    if not user:
        return None, (jsonify({"error": f"Patient {pid_int} not found"}), 404)
    if user['role'] != 'patient':
        return None, (jsonify({"error": f"User {pid_int} is not a patient"}), 400)
    return pid_int, None

@app.route('/login', methods=['GET'])
def caregiver_login():
    if session.get('user_id') and session.get('role') == 'caregiver':
        user = database.get_user_by_id(session['user_id'])
        if user and user['role'] == 'caregiver':
            return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def caregiver_login_post():
    username = None
    password = None
    if request.is_json:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip() if isinstance(data.get('username'), str) else data.get('username', '')
        password = data.get('password', '') if isinstance(data.get('password'), str) else ''
        if username is None:
            username = ''
        if password is None:
            password = ''
        if isinstance(username, str):
            username = username.strip()
    else:
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

    if not username or not password:
        msg = "Please enter both username and password."
        if request.is_json:
            return jsonify({"error": msg}), 401
        return render_template('login.html', error=msg), 401

    user = database.verify_login(username, password)
    if not user:
        msg = "Invalid credentials. Please try again."
        if request.is_json:
            return jsonify({"error": msg}), 401
        return render_template('login.html', error=msg), 401

    if user['role'] != 'caregiver':
        msg = "Wrong portal. Patients use the patient website."
        if request.is_json:
            return jsonify({"error": msg}), 403
        return render_template('login.html', error=msg), 403

    session['user_id'] = user['id']
    session['role'] = 'caregiver'
    session.permanent = False

    if request.is_json:
        return jsonify({"message": "Login successful", "user": user, "redirect": "/"}), 200
    return redirect(url_for('index'))

@app.route('/logout', methods=['GET'])
def logout():
    session.clear()
    return redirect(url_for('caregiver_login'))

@app.route('/', methods=['GET'])
@login_required_caregiver
def index():
    user = database.get_user_by_id(session['user_id'])
    return render_template('index.html', user=user, app_version=APP_VERSION, app_name=APP_NAME)

@app.route('/api/me', methods=['GET'])
@login_required_caregiver
def api_me():
    user = database.get_user_by_id(session['user_id'])
    if not user:
        return jsonify({"error": "User not found"}), 404
    public = {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "language": user["language"]
    }
    return jsonify(public), 200

@app.route('/api/patients', methods=['GET'])
@login_required_caregiver
def api_patients():
    try:
        patients = database.list_patients()
        # return list of public dicts
        result = []
        for p in patients:
            result.append({
                "id": p["id"],
                "username": p["username"],
                "name": p["name"],
                "role": p["role"],
                "language": p["language"]
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/patients', methods=['POST'])
@login_required_caregiver
def api_patients_post():
    """POST /api/patients - Caregiver-only: create a new patient account.
    Body: {username, password, name, language}. These credentials then work on the patient website (port 5001)."""
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or '').strip()
        password = data.get('password') or ''
        name = (data.get('name') or '').strip()
        language = data.get('language') or 'kn-IN'

        if not username:
            return jsonify({"error": "Username is required"}), 400
        if not password:
            return jsonify({"error": "Password is required"}), 400
        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters"}), 400
        if language not in ('en-US', 'hi-IN', 'kn-IN'):
            return jsonify({"error": "Language must be en-US, hi-IN or kn-IN"}), 400

        user = database.create_user(username, password, 'patient', name or username, language)
        public = {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "language": user["language"],
        }
        return jsonify(public), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/patients/<int:patient_id>', methods=['DELETE'])
@login_required_caregiver
def api_patients_delete(patient_id):
    """DELETE /api/patients/<id> - Caregiver-only: remove a patient and all their data.
    Permanently deletes medicines, doses and upload history (DB cascade)."""
    try:
        deleted = database.delete_patient(patient_id)
        if not deleted:
            return jsonify({"error": f"Patient {patient_id} not found"}), 404
        return jsonify({"message": f"Patient {patient_id} deleted"}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Medicines
@app.route('/api/medicines', methods=['GET'])
@login_required_caregiver
def api_medicines_get():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        meds = database.get_medicines(pid)
        return jsonify(meds), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/medicines', methods=['POST'])
@login_required_caregiver
def api_medicines_post():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        data = request.get_json(silent=True) or {}
        # remove patient_id from data for add_medicine
        name = data.get('name')
        dosage = data.get('dosage')
        times = data.get('times')
        language = data.get('language', 'en-US')
        # Support comma separated times? frontend will send list
        if isinstance(times, str):
            times = [t.strip() for t in times.split(',') if t.strip()]
        payload = {"name": name, "dosage": dosage, "times": times, "language": language}
        if 'date_added' in data:
            payload['date_added'] = data.get('date_added')
        med = database.add_medicine(payload, pid)
        return jsonify(med), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/medicines/<int:medicine_id>', methods=['PUT'])
@login_required_caregiver
def api_medicines_put(medicine_id):
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        data = request.get_json(silent=True) or {}
        # Allow partial fields: name, dosage, times, language
        update_data = {}
        if 'name' in data:
            update_data['name'] = data.get('name')
        if 'dosage' in data:
            update_data['dosage'] = data.get('dosage')
        if 'language' in data:
            update_data['language'] = data.get('language')
        if 'times' in data:
            times = data.get('times')
            if isinstance(times, str):
                times = [t.strip() for t in times.split(',') if t.strip()]
            update_data['times'] = times
        updated = database.update_medicine(medicine_id, update_data, pid)
        if updated is None:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify(updated), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/medicines/<int:medicine_id>', methods=['DELETE'])
@login_required_caregiver
def api_medicines_delete(medicine_id):
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        deleted = database.delete_medicine(medicine_id, pid)
        if not deleted:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify({"message": f"Medicine {medicine_id} deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/doses/today', methods=['GET'])
@login_required_caregiver
def api_doses_today():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        doses = database.get_todays_doses(pid)
        return jsonify(doses), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/doses/confirm', methods=['POST'])
@login_required_caregiver
def api_doses_confirm():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        data = request.get_json(silent=True) or {}
        medicine_id = data.get('medicine_id') or data.get('medicineId') or data.get('id')
        time = data.get('time')
        if medicine_id is None or time is None:
            return jsonify({"error": "medicine_id and time required"}), 400
        try:
            medicine_id = int(medicine_id)
        except ValueError:
            return jsonify({"error": "medicine_id must be integer"}), 400
        result = database.confirm_dose(medicine_id, time, None, pid)
        if result is None:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify(result), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats', methods=['GET'])
@login_required_caregiver
def api_stats():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        stats = database.get_stats(pid)
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/uploads', methods=['POST'])
@login_required_caregiver
def api_uploads_post():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        data = request.get_json(silent=True) or {}
        filename = data.get('filename', 'prescription.jpg')
        extracted = data.get('extracted_medicines') or data.get('medicines') or []
        thumbnail = data.get('thumbnail', '')
        payload = {"filename": filename, "extracted_medicines": extracted, "thumbnail": thumbnail}
        rec = database.add_upload_record(payload, pid)
        return jsonify(rec), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/uploads', methods=['GET'])
@login_required_caregiver
def api_uploads_get():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        limit = request.args.get('limit', default=10, type=int)
        history = database.get_upload_history(pid, limit=limit)
        return jsonify(history), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/uploads/clear', methods=['DELETE'])
@login_required_caregiver
def api_uploads_clear():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        database.clear_uploads(pid)
        return jsonify({"message": "Upload history cleared"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/demo/load', methods=['POST'])
@login_required_caregiver
def api_demo_load():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        created = database.load_demo_data(pid)
        return jsonify({"message": "Demo data loaded", "medicines": created, "count": len(created)}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/demo/reset', methods=['POST'])
@login_required_caregiver
def api_demo_reset():
    pid, err = _get_and_validate_patient_id()
    if err:
        return err
    try:
        database.reset_patient_data(pid)
        return jsonify({"message": "Demo reset complete", "cleared": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    user_name = None
    uid = session.get('user_id')
    if uid:
        u = database.get_user_by_id(uid)
        if u:
            user_name = u['username']
    return jsonify({
        "status": "ok",
        "app": "caregiver",
        "version": APP_VERSION,
        "user": user_name
    }), 200

@app.route('/api/health', methods=['GET'])
def api_health():
    return health()

if __name__ == '__main__':
    print("Caregiver app running on http://localhost:5002")
    app.run(debug=True, host='0.0.0.0', port=5002)

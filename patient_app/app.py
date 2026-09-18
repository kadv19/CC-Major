import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import database
import slm

from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_cors import CORS
from functools import wraps

app = Flask(__name__)
app.secret_key = 'patient-app-demo-secret-key'
CORS(app, resources={r"/api/*": {"origins": "*"}})

APP_VERSION = '1.0.0'
APP_NAME = 'Patient Reminder'

# Ensure DB
try:
    database.init_db()
except Exception as e:
    print(f"Failed to init DB: {e}")

def login_required_patient(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = session.get('user_id')
        role = session.get('role')
        if not user_id or role != 'patient':
            if request.path.startswith('/api/'):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for('patient_login'))
        # verify user still exists and is patient
        user = database.get_user_by_id(user_id)
        if not user or user['role'] != 'patient':
            session.clear()
            if request.path.startswith('/api/'):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for('patient_login'))
        return f(*args, **kwargs)
    return decorated

@app.route('/login', methods=['GET'])
def patient_login():
    # if already logged in as patient, redirect /
    if session.get('user_id') and session.get('role') == 'patient':
        user = database.get_user_by_id(session['user_id'])
        if user and user['role'] == 'patient':
            return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def patient_login_post():
    # accept form or JSON
    username = None
    password = None
    if request.is_json:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '').strip() if isinstance(data.get('username'), str) else data.get('username', '')
        password = data.get('password', '') if isinstance(data.get('password'), str) else ''
        # handle None
        if username is None:
            username = ''
        if password is None:
            password = ''
        # ensure strip
        if isinstance(username, str):
            username = username.strip()
    else:
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

    # empty fields
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

    if user['role'] != 'patient':
        msg = "Wrong portal. Caregivers use the caregiver website."
        if request.is_json:
            return jsonify({"error": msg}), 403
        return render_template('login.html', error=msg), 403

    session['user_id'] = user['id']
    session['role'] = 'patient'
    session.permanent = False

    if request.is_json:
        return jsonify({"message": "Login successful", "user": user, "redirect": "/"}), 200
    return redirect(url_for('index'))

@app.route('/logout', methods=['GET'])
def logout():
    session.clear()
    return redirect(url_for('patient_login'))

@app.route('/', methods=['GET'])
@login_required_patient
def index():
    user = database.get_user_by_id(session['user_id'])
    return render_template('index.html', user=user, app_version=APP_VERSION, app_name=APP_NAME)

@app.route('/api/me', methods=['GET'])
@login_required_patient
def api_me():
    user = database.get_user_by_id(session['user_id'])
    if not user:
        return jsonify({"error": "User not found"}), 404
    # return public dict
    public = {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "language": user["language"]
    }
    return jsonify(public), 200

@app.route('/api/medicines', methods=['GET'])
@login_required_patient
def api_medicines():
    try:
        patient_id = session['user_id']
        meds = database.get_medicines(patient_id)
        return jsonify(meds), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/doses/today', methods=['GET'])
@login_required_patient
def api_doses_today():
    try:
        patient_id = session['user_id']
        doses = database.get_todays_doses(patient_id)
        return jsonify(doses), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/doses/confirm', methods=['POST'])
@login_required_patient
def api_doses_confirm():
    try:
        patient_id = session['user_id']
        data = request.get_json(silent=True) or {}
        medicine_id = data.get('medicine_id') or data.get('medicineId') or data.get('id')
        time = data.get('time')
        if medicine_id is None or time is None:
            return jsonify({"error": "medicine_id and time required"}), 400
        try:
            medicine_id = int(medicine_id)
        except ValueError:
            return jsonify({"error": "medicine_id must be integer"}), 400
        result = database.confirm_dose(medicine_id, time, None, patient_id)
        if result is None:
            return jsonify({"error": f"Medicine {medicine_id} not found"}), 404
        return jsonify(result), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats', methods=['GET'])
@login_required_patient
def api_stats():
    try:
        patient_id = session['user_id']
        stats = database.get_stats(patient_id)
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/voice-agent', methods=['POST'])
@login_required_patient
def api_voice_agent():
    """Patient asks the SLM assistant. Answers are grounded in their schedule."""
    try:
        patient_id = session['user_id']
        data = request.get_json(silent=True) or {}
        text = (data.get('text') or data.get('query') or '').strip()
        if not text:
            return jsonify({"error": "text required"}), 400
        answer, source = slm.ask(text, patient_id, tone='patient')
        if answer is None:
            answer = slm.fallback(text, patient_id)
            source = 'rule'
        database.record_slm_interaction(patient_id, text, answer, 'unavailable' if source == 'unavailable' else 'answered')
        return jsonify({"answer": answer, "source": source}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/slm/respond', methods=['POST'])
@login_required_patient
def api_slm_respond():
    """Patient accepts or declines an SLM-proposed dose.

    outcome 'accepted' -> confirm the dose (records as taken, feeds compliance).
    outcome 'declined' -> log the decline only.
    """
    try:
        patient_id = session['user_id']
        data = request.get_json(silent=True) or {}
        outcome = (data.get('outcome') or '').strip().lower()
        question = (data.get('question') or '').strip()
        answer_text = (data.get('answer') or '').strip()
        if outcome not in ('accepted', 'declined'):
            return jsonify({"error": "outcome must be accepted or declined"}), 400
        if outcome == 'accepted':
            medicine_id = data.get('medicine_id')
            time = data.get('time')
            if medicine_id is None or time is None:
                return jsonify({"error": "medicine_id and time required to accept"}), 400
            result = database.confirm_dose(int(medicine_id), time, None, patient_id)
            if result is None:
                return jsonify({"error": "Dose not found for this patient"}), 404
            database.record_slm_interaction(patient_id, question, answer_text, 'accepted')
            return jsonify({"status": "accepted", "dose": result}), 200
        database.record_slm_interaction(patient_id, question, answer_text, 'declined')
        return jsonify({"status": "declined"}), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
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
        "app": "patient",
        "version": APP_VERSION,
        "user": user_name
    }), 200

@app.route('/api/health', methods=['GET'])
def api_health():
    return health()

if __name__ == '__main__':
    print("Patient app running on http://localhost:5001")
    app.run(debug=True, host='0.0.0.0', port=5001)

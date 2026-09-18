"""
Voice agent SLM helper — shared by patient_app and caregiver_app.

Talks to a real small language model when one is reachable:
  1. MEDREMIND_SLM_URL set          -> hosted OpenAI-compatible /chat/completions
  2. otherwise                      -> local Ollama at http://localhost:11434

Every call is best-effort: if the model is unreachable, `ask()` returns
(None, 'unavailable') and the caller may use a rule-based fallback.
"""

import os
import json
import urllib.request
import urllib.error
from datetime import datetime

import database

DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "llama3.2"


def _resolve_endpoint_config():
    url = os.environ.get("MEDREMIND_SLM_URL", DEFAULT_OLLAMA_URL)
    api_key = os.environ.get("MEDREMIND_SLM_API_KEY", "")
    model = os.environ.get("MEDREMIND_SLM_MODEL", DEFAULT_MODEL)
    openai_style = bool(api_key) or "chat/completions" in url
    return url, api_key, model, openai_style


def build_schedule(patient_id):
    """Return (name, language, multiline schedule with per-dose status)."""
    user = database.get_user_by_id(patient_id)
    name = (user.get("name") or user["username"]) if user else "the patient"
    lang = (user or {}).get("language", "en-US")
    now = datetime.now()
    try:
        doses = database.get_todays_doses(patient_id)
    except Exception:
        doses = []
    lines = []
    for d in doses:
        time_txt = d["time"]
        if d.get("taken"):
            status = "taken"
        else:
            try:
                hour, minute = int(time_txt.split(":")[0]), int(time_txt.split(":")[1])
            except (ValueError, IndexError):
                hour, minute = 0, 0
            status = "missed" if (now.hour, now.minute) > (hour, minute) else "pending"
        lines.append(
            "- {name} ({dosage}) at {time} — {status}".format(
                name=d.get("medicine_name", "medicine"),
                dosage=d.get("dosage", ""),
                time=time_txt,
                status=status,
            )
        )
    schedule = "\n".join(lines) if lines else "- (no medicines scheduled today)"
    return name, lang, schedule


def _call_slm(url, api_key, model, openai_style, prompt, timeout=25):
    if openai_style:
        payload = json.dumps(
            {"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False}
        ).encode()
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = "Bearer " + api_key
    else:
        payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
        headers = {"Content-Type": "application/json"}

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if openai_style:
        return data["choices"][0]["message"]["content"].strip()
    return data.get("response", "").strip()


def ask(text, patient_id, tone="caregiver", timeout=25):
    """Ask the SLM about this patient's schedule.

    Returns (answer_string | None, source) where source is 'slm' or 'unavailable'.
    """
    try:
        name, lang, schedule = build_schedule(patient_id)
        if tone == "patient":
            system = (
                "You are a friendly, very simple health assistant speaking to an elderly patient. "
                "Answer in 1 short sentence in plain language, no markdown, no emoji. "
                "Use only the facts below."
            )
        else:
            system = (
                "You are the voice assistant on a caregiver's medication dashboard. "
                "Answer in 1-3 short sentences in plain text, no markdown, no emoji. "
                "Use only the facts below; if asked something you don't know, say so briefly."
            )
        prompt = (
            f"{system}\n"
            f"Patient: {name} (language: {lang})\n"
            "Today's schedule:\n"
            f"{schedule}\n"
            f"Their question: \"{text}\"\n"
            "Answer:"
        )
        url, api_key, model, openai_style = _resolve_endpoint_config()
        answer = _call_slm(url, api_key, model, openai_style, prompt=prompt, timeout=timeout)
        if not answer:
            return None, "unavailable"
        return answer, "slm"
    except Exception as exc:
        print(f"SLM unavailable ({exc}); caller should fall back")
        return None, "unavailable"


def fallback(text, patient_id):
    """Deterministic rule answer (used when no SLM is reachable)."""
    name, lang, schedule = build_schedule(patient_id)
    now = datetime.now()
    doses = []
    try:
        doses = database.get_todays_doses(patient_id)
    except Exception:
        doses = []
    pending = [d for d in doses if not d.get("taken") and (d.get("time", "99:99") > now.strftime("%H:%M"))]
    missed = [d for d in doses if not d.get("taken") and (d.get("time", "99:99") <= now.strftime("%H:%M"))]
    taken = [d for d in doses if d.get("taken")]
    pending.sort(key=lambda d: d.get("time", ""))
    missed.sort(key=lambda d: d.get("time", ""))
    q = (text or "").lower()
    if ("next" in q or "due" in q) and pending:
        d = pending[0]
        return f"Next is {d['medicine_name']} ({d['dosage']}) at {d['time']}."
    if "miss" in q and missed:
        return (f"{name} missed: "
                + ", ".join(f"{d['medicine_name']} at {d['time']}" for d in missed)
                + ".")
    if "miss" in q and not missed:
        return f"{name} has not missed any medicine today."
    if not doses:
        return "No medicines are scheduled for today."
    return (f"Today for {name}: taken {len(taken)}, pending {len(pending)}, "
            f"missed {len(missed)}.")
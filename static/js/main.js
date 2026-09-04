/**
 * Medication Reminder System - Main JavaScript
 * Phase 8: Integration & Demo-Ready Polish (Final)
 * Includes Phase 2-7: CRUD + Schedule + TTS + IoT + Upload Mock OCR + Flask/SQLite
 * Now polished for 3-5 min demo: one-click demo, 48px touch, offline, dark mode, ARIA
 *
 * Phase 8 Features (NEW):
 * - Demo mode: /api/demo/load + /api/demo/reset (one click), autoDemoFlow, highlight
 * - Responsive polish: 48px touch, smooth transitions, perfect mobile/tablet/desktop
 * - UX polish: toast for all actions, loading spinners, offline indicator, apiStatus badge
 * - Dashboard summary: quick actions + compliance + next dose (updateQuickSummary)
 * - Demo script overlay, highlight, quick stats, favicon, smooth scroll, dark mode
 * - Error handling: graceful fallbacks, user-friendly messages, offline detection
 * - No console errors: single script include, robust fetch, voice fallback
 *
 * Phase 7 Features:
 * - Backend API: /api/medicines, /api/doses, /api/uploads, /api/stats
 * - SQLite persistence (file-based, offline), localStorage fallback
 * - Async CRUD via fetch, migration from localStorage
 *
 * Previous Phases:
 * - Phase 6: Drag & drop upload + Mock OCR (keyword matching, no cloud)
 * - Phase 5: LED Due Now fast blink (≤5min), buzzer mute/overdue/vibration + Web Audio 440Hz
 * - Phase 4: Web Speech API TTS (kn-IN, hi-IN, en-US) + volume/speed sliders + visual waveform
 * - Phase 3: Filters (today/all/pending/taken/missed), relative time (in 2h), timeline 24h, next dose, title badge
 * - Phase 2: Medicine CRUD + validation + grouping + daily reset
 *
 * Data Model:
 * {
 *   id: number,
 *   name: string,
 *   dosage: string,
 *   times: ['08:00','20:00'],
 *   language: 'kn-IN'|'hi-IN'|'en-US',
 *   takenToday: { '08:00': false, '20:00': false },
 *   dateAdded: '2026-09-03'
 * }
 *
 * Works offline, vanilla JS, Chrome optimized, no API keys, no console errors
 */

// ==================== DATA STORE ====================
// In-memory medicines array - persisted to localStorage
let medicines = [];
let nextId = 1;

// Current filter for schedule view - Phase 3
let currentFilter = "today";

// LocalStorage keys (offline, file-based) - Phase 7 keeps UI prefs in localStorage
const STORAGE_KEY = "medication_reminder_medicines"; // Legacy, now backend primary
const NEXT_ID_KEY = "medication_reminder_nextId";
const DATE_KEY = "medication_reminder_lastDate";
const FILTER_KEY = "medication_reminder_filter";

// Phase 7: Backend API base (Flask + SQLite, offline)
const API_BASE = "/api";
let useBackend = true; // True = use backend API (Phase 7), false = fallback to localStorage

/**
 * Generic API request helper - Phase 7 + Phase 8 loading & offline
 * @param {string} path - API path e.g., "/medicines"
 * @param {string} method - HTTP method
 * @param {object} body - JSON body for POST/PUT
 * @returns {Promise<object>} parsed JSON response
 */
async function apiRequest(path, method = "GET", body = null) {
    // Phase 8: offline detection
    if (!navigator.onLine) {
        console.warn("Offline - API request will fail, fallback to local");
        // Don't show loading if offline, just throw to trigger fallback
        throw new Error("Offline - no network");
    }
    // Phase 8: show loading for API calls (except stats which is frequent)
    const isStats = path.includes("/stats");
    if (!isStats) showLoading();
    try {
        const opts = {
            method,
            headers: { "Content-Type": "application/json" },
        };
        if (body !== null) {
            opts.body = JSON.stringify(body);
        }
        const resp = await fetch(API_BASE + path, opts);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(data.error || `API ${method} ${path} failed: ${resp.status}`);
        }
        // Update API status badge on success
        updateApiStatus(true);
        return data;
    } catch (e) {
        updateApiStatus(false);
        throw e;
    } finally {
        if (!isStats) hideLoading();
    }
}

// Phase 8: Loading overlay helpers
function showLoading(text = "Loading...") {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        const p = overlay.querySelector("p");
        if (p) p.textContent = text;
        overlay.style.display = "flex";
    }
}
function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.display = "none";
}

// Phase 8: API status badge
function updateApiStatus(isOnline) {
    const badge = document.getElementById("apiStatusBadge");
    if (!badge) return;
    if (isOnline) {
        badge.textContent = "API: Online • SQLite";
        badge.className = "badge badge-success";
    } else {
        badge.textContent = "API: Offline • Fallback";
        badge.className = "badge badge-warning";
    }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get current time in HH:MM 24h format (e.g., "14:30")
 * Uses local browser time, works offline
 * Phase 8: Supports mock time override for demo testing (setMockTime)
 */
let mockTimeOverride = null; // "HH:MM" or null for real time
function getCurrentTime() {
    if (mockTimeOverride && /^\d{2}:\d{2}$/.test(mockTimeOverride)) {
        return mockTimeOverride;
    }
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}
/**
 * Set mock time for demo testing - Phase 8 optional
 * @param {string|null} time - "HH:MM" to override, or null to use real time
 * Example: setMockTime("09:00") to test morning, setMockTime(null) to reset
 */
function setMockTime(time) {
    if (time === null) {
        mockTimeOverride = null;
        showToast("⏰ Mock time cleared, using real time", "info");
    } else if (!/^\d{2}:\d{2}$/.test(time)) {
        showToast("Invalid time format, use HH:MM", "error");
        return false;
    } else {
        mockTimeOverride = time;
        showToast(`⏰ Mock time set to ${time} (${formatTime(time)})`, "info");
    }
    renderAll();
    return true;
}
/**
 * Helper to quickly set mock time to test edge cases - Phase 8
 * Example: testTime("08:00") for due-now, testTime("14:00") for afternoon
 */
function testTime(time) { return setMockTime(time); }

/**
 * Convert 24h time to 12h format (e.g., "14:00" → "2:00 PM")
 */
function formatTime(time) {
    // Expect "HH:MM"
    const [h, m] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Get today's date as YYYY-MM-DD string (for storage & comparison)
 */
function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Get human-readable today date for header (e.g., "Sep 3, 2026")
 */
function getTodayDisplay() {
    const now = new Date();
    return now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Convert HH:MM to minutes since midnight for comparison
 */
function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

/**
 * Get status for a specific medicine + time slot
 * - taken if takenToday[time] === true
 * - missed if scheduled time is before current time and not taken
 * - pending otherwise (future)
 */
function getStatus(medicine, time) {
    // If already marked taken today, it's taken
    if (medicine.takenToday && medicine.takenToday[time] === true) {
        return "taken";
    }
    // Compare scheduled time vs current time
    const nowMinutes = timeToMinutes(getCurrentTime());
    const slotMinutes = timeToMinutes(time);
    // If slot time is earlier than now (at least 1 minute past), mark missed
    // This simulates auto-missed detection for demo (Phase 2/3)
    if (slotMinutes < nowMinutes) {
        return "missed";
    }
    return "pending";
}

/**
 * Get time slot group for a time string - Phase 3
 * Used to group schedule by period of day
 * @param {string} time - "HH:MM"
 * @returns {string} 'morning' | 'afternoon' | 'evening' | 'night'
 */
function getTimeSlotGroup(time) {
    const [h] = time.split(":").map(Number);
    if (h >= 6 && h <= 11) return "morning"; // 6:00-11:59
    if (h >= 12 && h <= 16) return "afternoon"; // 12:00-16:59
    if (h >= 17 && h <= 20) return "evening"; // 17:00-20:59
    return "night"; // 21:00-5:59
}

/**
 * Get relative time string for a scheduled time vs now - Phase 3
 * Examples: "in 2 hours", "in 15 minutes", "now", "15 minutes ago", "2 hours ago", "overdue by 3 hours"
 * @param {string} time - "HH:MM"
 * @returns {string} relative time
 */
function getRelativeTime(time) {
    const nowMinutes = timeToMinutes(getCurrentTime());
    const slotMinutes = timeToMinutes(time);
    const diff = slotMinutes - nowMinutes; // positive = future, negative = past

    if (diff === 0) return "now";
    if (diff > 0) {
        // Future
        if (diff < 60) return `in ${diff} minute${diff === 1 ? "" : "s"}`;
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        if (mins === 0) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
        return `in ${hours}h ${mins}m`;
    } else {
        // Past
        const absDiff = Math.abs(diff);
        if (absDiff < 60) return `${absDiff} minute${absDiff === 1 ? "" : "s"} ago`;
        const hours = Math.floor(absDiff / 60);
        const mins = absDiff % 60;
        if (mins === 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        return `${hours}h ${mins}m ago`;
    }
}

/**
 * Get filtered medicines based on filter - Phase 3
 * Returns array of medicines that have at least one dose matching filter
 * For 'pending'/'taken'/'missed', filters per-dose inside render
 * @param {string} filter - 'today'|'all'|'pending'|'taken'|'missed'
 * @returns {object[]} filtered medicines
 */
function getFilteredMedicines(filter) {
    if (!filter || filter === "today" || filter === "all") {
        // Today and All are same in this offline demo (all doses are today's)
        return [...medicines];
    }
    // For status filters, return only medicines that have at least one dose of that status
    return medicines.filter((med) => med.times.some((t) => getStatus(med, t) === filter));
}

/**
 * Escape HTML to prevent XSS when rendering user input
 * Uses DOM trick with fallback to manual replace for robustness
 */
function escapeHtml(str) {
    if (!str) return "";
    // Try DOM-based escaping (works in real browser)
    try {
        const div = document.createElement("div");
        div.textContent = str;
        // In real browser, innerHTML will be escaped; in mock it may stay empty so fallback
        if (div.innerHTML && div.innerHTML !== str) {
            return div.innerHTML;
        }
        // If mock or no escaping needed, check if escaping would occur
        // Fallback to manual if innerHTML equals original but contains special chars
        if (div.innerHTML === "" && str.length > 0) {
            // Mock environment - do manual
            throw new Error("mock");
        }
    } catch (e) {
        // Fall through to manual
    }
    // Manual escaping - works everywhere, offline
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Show toast notification (auto-dismiss after 3s)
 */
function showToast(message, type = "info") {
    // Remove existing toasts
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(20px)";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== STORAGE - Phase 7: Backend API + localStorage fallback ====================

/**
 * Save filter and UI prefs to localStorage - Phase 7
 * Medicines are now persisted via backend API (SQLite), not localStorage
 * This function keeps filter and other UI state in localStorage for offline
 */
async function saveToLocalStorage() {
    try {
        // Only filter and UI prefs remain in localStorage; medicines now in backend
        localStorage.setItem(FILTER_KEY, currentFilter);
        // Keep legacy keys for fallback but don't store medicines if backend is used
        if (!useBackend) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(medicines));
            localStorage.setItem(NEXT_ID_KEY, String(nextId));
            localStorage.setItem(DATE_KEY, getTodayDate());
        }
    } catch (e) {
        console.error("Failed to save to localStorage", e);
        // Don't show toast for filter save failure
    }
}

/**
 * Load medicines from backend API (primary) with localStorage fallback - Phase 7
 * Also handles migration from localStorage to backend on first run
 */
async function loadFromLocalStorage() {
    // Load filter from localStorage first (UI pref)
    try {
        const storedFilter = localStorage.getItem(FILTER_KEY);
        if (storedFilter && ["today", "all", "pending", "taken", "missed"].includes(storedFilter)) {
            currentFilter = storedFilter;
        }
    } catch (e) {}

    // Try backend API first if enabled
    if (useBackend) {
        try {
            const data = await apiRequest("/medicines", "GET");
            if (Array.isArray(data)) {
                // Check if backend is empty but localStorage has data -> migrate
                const localMedsRaw = localStorage.getItem(STORAGE_KEY);
                if (data.length === 0 && localMedsRaw) {
                    try {
                        const parsed = JSON.parse(localMedsRaw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            console.log(`Migrating ${parsed.length} local medicines to backend...`);
                            for (const m of parsed) {
                                try {
                                    await apiRequest("/medicines", "POST", {
                                        name: m.name,
                                        dosage: m.dosage,
                                        times: m.times,
                                        language: m.language,
                                        date_added: m.dateAdded || getTodayDate(),
                                    });
                                } catch (migErr) {
                                    console.warn("Migration failed for", m.name, migErr);
                                }
                            }
                            // Re-fetch after migration
                            const migrated = await apiRequest("/medicines", "GET");
                            medicines = Array.isArray(migrated) ? migrated : [];
                            const maxId = medicines.reduce((max, m) => Math.max(max, m.id), 0);
                            nextId = maxId + 1;
                            if (nextId < 1) nextId = 1;
                            // Clear local medicines after successful migration
                            localStorage.removeItem(STORAGE_KEY);
                            localStorage.removeItem(NEXT_ID_KEY);
                            localStorage.removeItem(DATE_KEY);
                            console.log("Migration complete, medicines:", medicines.length);
                            return;
                        }
                    } catch (parseErr) {
                        console.warn("Failed to parse local medicines for migration", parseErr);
                    }
                }

                medicines = data;
                const maxId = medicines.reduce((max, m) => Math.max(max, m.id), 0);
                nextId = maxId + 1;
                if (nextId < 1) nextId = 1;
                console.log("Loaded medicines from backend:", medicines.length);
                return;
            }
        } catch (apiErr) {
            console.warn("Backend load failed, falling back to localStorage", apiErr);
            // Fall through to localStorage fallback below
            // Optionally show toast but not too noisy on first load
            // showToast("Backend unavailable, using local cache", "info");
        }
    }

    // Fallback: Load from localStorage (Phase 2-6) for offline or backend down
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const storedId = localStorage.getItem(NEXT_ID_KEY);
        const storedDate = localStorage.getItem(DATE_KEY);
        const today = getTodayDate();

        if (stored) {
            medicines = JSON.parse(stored);
            if (!Array.isArray(medicines)) medicines = [];
        } else {
            medicines = [];
        }

        if (storedId) {
            nextId = parseInt(storedId, 10) || 1;
        } else {
            const maxId = medicines.reduce((max, m) => Math.max(max, m.id), 0);
            nextId = maxId + 1;
            if (nextId < 1) nextId = 1;
        }

        // Daily reset for localStorage mode
        if (storedDate !== today && medicines.length > 0) {
            medicines.forEach((med) => {
                if (med.takenToday) {
                    Object.keys(med.takenToday).forEach((t) => {
                        med.takenToday[t] = false;
                    });
                }
            });
            // Save without await (fire and forget)
            saveToLocalStorage();
            console.log("Daily reset (local): cleared takenToday for new day", today);
        }
        console.log("Loaded medicines from localStorage fallback:", medicines.length);
    } catch (e) {
        console.error("Failed to load from localStorage", e);
        medicines = [];
        nextId = 1;
    }
}

// ==================== CRUD OPERATIONS ====================

/**
 * Add a new medicine to the store - Phase 7: Backend API (async)
 * Tries backend first, falls back to localStorage if unavailable
 * @param {string} name - Medicine name
 * @param {string} dosage - Dosage (e.g., "1 tablet")
 * @param {string[]} times - Array of times ["08:00","20:00"]
 * @param {string} language - "kn-IN"|"hi-IN"|"en-US"
 * @returns {Promise<object>} new medicine object
 */
async function addMedicine(name, dosage, times, language) {
    // Validate inputs (same as before)
    if (!name || !name.trim()) throw new Error("Medicine name required");
    if (!dosage || !dosage.trim()) throw new Error("Dosage required");
    if (!times || times.length === 0) throw new Error("At least one time required");

    // Normalize times: trim, filter empty, deduplicate, sort
    const normalizedTimes = [...new Set(times.map((t) => t.trim()).filter(Boolean))].sort();

    // Validate time format HH:MM
    normalizedTimes.forEach((t) => {
        if (!/^\d{2}:\d{2}$/.test(t)) throw new Error(`Invalid time format: ${t}`);
    });

    // Try backend API first (Phase 7)
    if (useBackend) {
        try {
            const med = await apiRequest("/medicines", "POST", {
                name: name.trim(),
                dosage: dosage.trim(),
                times: normalizedTimes,
                language: language || "en-US",
                date_added: getTodayDate(),
            });
            // Backend returns medicine with takenToday
            medicines.push(med);
            const maxId = medicines.reduce((max, m) => Math.max(max, m.id), 0);
            nextId = maxId + 1;
            if (nextId < 1) nextId = 1;
            await saveToLocalStorage(); // saves filter only
            return med;
        } catch (e) {
            console.warn("Backend addMedicine failed, falling back to local", e);
            // Fall through to local logic; optionally show toast
            // showToast("Backend unavailable, saved locally", "info");
        }
    }

    // Fallback: localStorage logic (Phase 2-6)
    const takenToday = {};
    normalizedTimes.forEach((t) => (takenToday[t] = false));

    const newMed = {
        id: nextId++,
        name: name.trim(),
        dosage: dosage.trim(),
        times: normalizedTimes,
        language: language || "en-US",
        takenToday: takenToday,
        dateAdded: getTodayDate(),
        date_added: getTodayDate(),
    };

    medicines.push(newMed);
    await saveToLocalStorage();
    return newMed;
}

/**
 * Edit an existing medicine by id - Phase 7: Backend API (async)
 * @param {number} id - Medicine id
 * @param {object} updates - Fields to update {name, dosage, times, language}
 * @returns {Promise<object>} updated medicine
 */
async function editMedicine(id, updates) {
    // Try backend first
    if (useBackend) {
        try {
            const payload = {};
            if (updates.name !== undefined) payload.name = updates.name;
            if (updates.dosage !== undefined) payload.dosage = updates.dosage;
            if (updates.language !== undefined) payload.language = updates.language;
            if (updates.times !== undefined) {
                const normalizedTimes = [...new Set(updates.times.map((t) => t.trim()).filter(Boolean))].sort();
                payload.times = normalizedTimes;
            }
            const updated = await apiRequest(`/medicines/${id}`, "PUT", payload);
            // Update local array with backend response
            const idx = medicines.findIndex((m) => m.id === id);
            if (idx !== -1) medicines[idx] = updated;
            else medicines.push(updated);
            await saveToLocalStorage();
            return updated;
        } catch (e) {
            console.warn("Backend editMedicine failed, falling back to local", e);
            if (e.message && e.message.includes("not found")) throw e;
            // Fall through to local
        }
    }

    // Fallback local logic
    const med = medicines.find((m) => m.id === id);
    if (!med) throw new Error(`Medicine with id ${id} not found`);

    if (updates.name !== undefined) med.name = updates.name.trim();
    if (updates.dosage !== undefined) med.dosage = updates.dosage.trim();
    if (updates.language !== undefined) med.language = updates.language;

    if (updates.times !== undefined) {
        const normalizedTimes = [...new Set(updates.times.map((t) => t.trim()).filter(Boolean))].sort();
        const newTaken = {};
        normalizedTimes.forEach((t) => {
            newTaken[t] = med.takenToday[t] || false;
        });
        med.times = normalizedTimes;
        med.takenToday = newTaken;
    }

    await saveToLocalStorage();
    return med;
}

/**
 * Delete a medicine by id - Phase 7: Backend API (async)
 * @param {number} id - Medicine id
 * @returns {Promise<boolean>} true if deleted
 */
async function deleteMedicine(id) {
    // Try backend first
    if (useBackend) {
        try {
            await apiRequest(`/medicines/${id}`, "DELETE");
            medicines = medicines.filter((m) => m.id !== id);
            await saveToLocalStorage();
            return true;
        } catch (e) {
            console.warn("Backend deleteMedicine failed, falling back to local", e);
            if (e.message && e.message.includes("not found")) throw e;
            // Fall through
        }
    }

    const initialLen = medicines.length;
    medicines = medicines.filter((m) => m.id !== id);
    if (medicines.length === initialLen) {
        throw new Error(`Medicine with id ${id} not found`);
    }
    await saveToLocalStorage();
    return true;
}

/**
 * Get a medicine by id
 */
function getMedicine(id) {
    return medicines.find((m) => m.id === id) || null;
}

/**
 * Get all medicines
 */
function getAllMedicines() {
    return [...medicines];
}

// ==================== CONFIRMATION & AUTO-UPDATE ====================

/**
 * Mark a specific dose as taken (per medicine + time slot) - Phase 7: Backend API (async)
 * @param {number} id - Medicine id
 * @param {string} time - Time slot "HH:MM"
 * @returns {Promise<boolean>} true if marked
 */
async function confirmTaken(id, time) {
    const med = getMedicine(id);
    if (!med) {
        showToast("Medicine not found", "error");
        return false;
    }
    if (!(time in med.takenToday)) {
        showToast(`Time slot ${time} not found for ${med.name}`, "error");
        return false;
    }
    if (med.takenToday[time] === true) {
        showToast(`${med.name} at ${formatTime(time)} already taken`, "info");
        return false;
    }

    // Try backend first
    if (useBackend) {
        try {
            await apiRequest("/doses/confirm", "POST", {
                medicine_id: id,
                time: time,
                date: getTodayDate(),
            });
            // Update local copy
            med.takenToday[time] = true;
            await saveToLocalStorage();
            renderAll();
            showToast(`✅ ${med.name} at ${formatTime(time)} marked as Taken`, "success");
            return true;
        } catch (e) {
            console.warn("Backend confirmTaken failed, falling back to local", e);
            // Fall through to local
        }
    }

    med.takenToday[time] = true;
    await saveToLocalStorage();
    renderAll();
    showToast(`✅ ${med.name} at ${formatTime(time)} marked as Taken`, "success");
    return true;
}

/**
 * Auto-update missed statuses (called every 60s)
 * Re-renders and updates relative times, status, next dose, title
 */
function autoMissUpdate() {
    // Re-render to reflect pending → missed transitions and relative time
    renderAll();
    // console.log("Auto-update at", getCurrentTime());
}

// ==================== PHASE 3: BROWSER TITLE & NEXT DOSE ====================

/**
 * Update browser tab title with pending/missed counts - Phase 3
 * Example: "💊 (3) Medication Reminder" or "⚠️ (2 missed) Medication Reminder"
 */
function updateBrowserTitle() {
    let pending = 0;
    let missed = 0;
    medicines.forEach((med) => {
        med.times.forEach((t) => {
            const s = getStatus(med, t);
            if (s === "pending") pending++;
            else if (s === "missed") missed++;
        });
    });
    let title = "💊 Medication Reminder";
    if (missed > 0) {
        title = `⚠️ (${missed} missed) ${title}`;
        if (pending > 0) title = `⚠️ (${missed} missed, ${pending} pending) 💊 Medication Reminder`;
    } else if (pending > 0) {
        title = `💊 (${pending}) Medication Reminder`;
    }
    document.title = title;
}

/**
 * Update next dose display - Phase 3
 * Finds next pending dose (soonest future pending), shows in #nextDoseText and #nextDoseRelative and caregiver stat
 */
function updateNextDose() {
    const nextText = document.getElementById("nextDoseText");
    const nextRel = document.getElementById("nextDoseRelative");
    const statNext = document.getElementById("statNextDose");
    if (!nextText) return;

    // Find next pending: smallest diff >0 and pending, else smallest missed?
    const nowMinutes = timeToMinutes(getCurrentTime());
    let next = null;
    let minDiff = Infinity;

    medicines.forEach((med) => {
        med.times.forEach((t) => {
            if (getStatus(med, t) === "pending") {
                const diff = timeToMinutes(t) - nowMinutes;
                if (diff >= 0 && diff < minDiff) {
                    minDiff = diff;
                    next = { med, time: t, diff };
                }
            }
        });
    });

    // If no future pending, check for any pending (maybe all missed? then show overdue)
    if (!next) {
        // Try to find earliest pending regardless of past/future (should be none if all missed/taken)
        // Else show overdue/missed
        let overdue = null;
        medicines.forEach((med) => {
            med.times.forEach((t) => {
                if (getStatus(med, t) === "missed" && !overdue) {
                    overdue = { med, time: t };
                }
            });
        });
        if (overdue && medicines.some((m) => m.times.some((t) => getStatus(m, t) === "missed"))) {
            nextText.textContent = `Overdue: ${overdue.med.name} at ${formatTime(overdue.time)}`;
            if (nextRel) {
                nextRel.textContent = getRelativeTime(overdue.time);
                nextRel.className = "relative-time overdue";
            }
            if (statNext) statNext.textContent = formatTime(overdue.time);
            return;
        }
        // Check if all taken
        const allTaken = medicines.length > 0 && medicines.every((m) => m.times.every((t) => getStatus(m, t) === "taken"));
        if (allTaken) {
            nextText.textContent = "All doses taken today! 🎉";
            if (nextRel) {
                nextRel.textContent = "Great job";
                nextRel.className = "relative-time now";
            }
            if (statNext) statNext.textContent = "Done";
            return;
        }
        nextText.textContent = "No doses scheduled";
        if (nextRel) {
            nextRel.textContent = "";
            nextRel.className = "relative-time";
        }
        if (statNext) statNext.textContent = "--";
        return;
    }

    // Found next pending
    nextText.textContent = `${next.med.name} at ${formatTime(next.time)} (${next.med.dosage})`;
    if (nextRel) {
        const rel = getRelativeTime(next.time);
        nextRel.textContent = rel;
        // Style based on imminence
        if (next.diff <= 15) {
            nextRel.className = "relative-time now";
        } else if (next.diff <= 60) {
            nextRel.className = "relative-time upcoming";
        } else {
            nextRel.className = "relative-time upcoming";
        }
    }
    if (statNext) statNext.textContent = formatTime(next.time);
}

/**
 * Update current time display in header - Phase 3
 */
function updateCurrentTimeDisplay() {
    const el = document.getElementById("currentTimeDisplay");
    if (el) {
        el.textContent = `🕐 ${formatTime(getCurrentTime())} (${getCurrentTime()})`;
        // Highlight if due now (pending within 5 min)
        const hasDueNow = medicines.some((m) => m.times.some((t) => {
            const s = getStatus(m, t);
            if (s !== "pending") return false;
            const diff = Math.abs(timeToMinutes(t) - timeToMinutes(getCurrentTime()));
            return diff <= 5;
        }));
        if (hasDueNow) {
            el.classList.add("current-time-highlight");
        } else {
            el.classList.remove("current-time-highlight");
        }
    }
}

// ==================== DISPLAY FUNCTIONS ====================

/**
 * Render all dynamic sections (schedule, LEDs, history, stats)
 * Phase 3 enhanced: also updates timeline, next dose, title, current time
 * Phase 8: also updates quick summary + compliance bar ARIA
 */
function renderAll() {
    renderSchedule();
    updateLEDs();
    updateHistory();
    updateStats();
    updateBuzzer();
    updateTodayDate();
    updateNextDose();
    updateBrowserTitle();
    updateCurrentTimeDisplay();
    updateTimeline();
    // Phase 8: quick summary (compliance + next dose) for dashboard quick actions
    if (typeof updateQuickSummary === "function") {
        try { updateQuickSummary(); } catch (e) { console.warn("updateQuickSummary failed", e); }
    }
    // Phase 8: update compliance bar aria-valuenow for accessibility
    try {
        const fill = document.getElementById("complianceFill");
        const bar = document.querySelector(".compliance-bar");
        if (fill && bar) {
            const width = fill.style.width || "0%";
            const val = parseInt(width, 10) || 0;
            bar.setAttribute("aria-valuenow", String(val));
        }
    } catch (e) {}
}

/**
 * Update today's date display in header
 */
function updateTodayDate() {
    const el = document.getElementById("todayDate");
    if (el) el.textContent = `Today • ${getTodayDisplay()}`;
}

/**
 * Update timeline view - Phase 3
 * Shows 24h bar with dots positioned by time, color by status, and now indicator
 */
function updateTimeline() {
    const bar = document.getElementById("timelineBar");
    if (!bar) return;

    if (medicines.length === 0) {
        bar.innerHTML = '<span style="font-size:0.75rem;color:var(--gray-500);margin:auto;">No doses to display on timeline</span>';
        return;
    }

    // Collect all dose dots
    const doses = [];
    medicines.forEach((med) => {
        med.times.forEach((t) => {
            const status = getStatus(med, t);
            const minutes = timeToMinutes(t);
            const leftPct = (minutes / (24 * 60)) * 100;
            doses.push({ med, time: t, status, leftPct, minutes });
        });
    });

    // Sort by time for layering
    doses.sort((a, b) => a.minutes - b.minutes);

    const nowMinutes = timeToMinutes(getCurrentTime());
    const nowPct = (nowMinutes / (24 * 60)) * 100;

    let html = `<div class="timeline-dot now" style="left:${nowPct}%;" title="Now: ${formatTime(getCurrentTime())}"></div>`;
    doses.forEach((d) => {
        html += `<div class="timeline-dot ${d.status}" style="left:${d.leftPct}%;" title="${escapeHtml(d.med.name)} ${formatTime(d.time)} - ${d.status} (${getRelativeTime(d.time)})"></div>`;
    });

    // Add time labels at 0,6,12,18,24
    html += `
        <div style="position:absolute;bottom:-18px;left:0;font-size:0.65rem;color:var(--gray-500);">00:00</div>
        <div style="position:absolute;bottom:-18px;left:25%;font-size:0.65rem;color:var(--gray-500);transform:translateX(-50%);">06:00</div>
        <div style="position:absolute;bottom:-18px;left:50%;font-size:0.65rem;color:var(--gray-500);transform:translateX(-50%);">12:00</div>
        <div style="position:absolute;bottom:-18px;left:75%;font-size:0.65rem;color:var(--gray-500);transform:translateX(-50%);">18:00</div>
        <div style="position:absolute;bottom:-18px;right:0;font-size:0.65rem;color:var(--gray-500);">24:00</div>
    `;
    bar.style.position = "relative";
    bar.innerHTML = html;
}

/**
 * Render schedule grid with grouping, filtering, relative time - Phase 3 enhanced
 * Handles currentFilter, time grouping, and per-dose filtering
 */
function renderSchedule() {
    const container = document.getElementById("scheduleList");
    const doseCountEl = document.getElementById("doseCount");
    if (!container) return;

    // Update dose count badge (total doses vs filtered)
    const totalDoses = medicines.reduce((sum, m) => sum + m.times.length, 0);
    const filteredMedsForCount = getFilteredMedicines(currentFilter);
    // For count, if filtering by status, count only matching doses, not medicines
    let filteredDoseCount = totalDoses;
    if (currentFilter === "pending" || currentFilter === "taken" || currentFilter === "missed") {
        filteredDoseCount = 0;
        medicines.forEach((m) => m.times.forEach((t) => { if (getStatus(m, t) === currentFilter) filteredDoseCount++; }));
    } else {
        filteredDoseCount = totalDoses;
    }
    if (doseCountEl) {
        if (currentFilter === "today" || currentFilter === "all") {
            doseCountEl.textContent = `${totalDoses} Doses`;
        } else {
            doseCountEl.textContent = `${filteredDoseCount} ${currentFilter}`;
        }
    }

    // Sync filter button active states
    const filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach((btn) => {
        if (btn.dataset.filter === currentFilter) btn.classList.add("active");
        else btn.classList.remove("active");
    });

    // Empty state when no medicines at all
    if (medicines.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💊</div>
                <h3>No medicines scheduled</h3>
                <p>Add a medicine using the form above to get started.</p>
                <p style="margin-top:8px;font-size:0.80rem;color:var(--gray-500);">Tip: Open console and run <code>loadSampleMedicines()</code> for demo data.</p>
            </div>
        `;
        return;
    }

    // Get filtered medicines for rendering
    const filteredMeds = getFilteredMedicines(currentFilter);

    // If filter results empty (e.g., no pending), show filtered empty state
    if (filteredMeds.length === 0) {
        const filterLabel = currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No ${filterLabel} doses</h3>
                <p>No medicines match the "${filterLabel}" filter.</p>
                <button class="btn btn-outline btn-sm" onclick="setFilter('today')" style="margin-top:10px;">Show Today</button>
            </div>
        `;
        return;
    }

    // Build flat list of dose entries for grouping, sorted by time
    // Each entry: { med, time, status, relative, minutes, group }
    const doseEntries = [];
    // For each filtered med, include only times that match filter (if status filter)
    filteredMeds.forEach((med) => {
        med.times.forEach((t) => {
            const status = getStatus(med, t);
            // If filtering by status, only include matching times
            if (currentFilter === "pending" || currentFilter === "taken" || currentFilter === "missed") {
                if (status !== currentFilter) return;
            }
            doseEntries.push({
                med,
                time: t,
                status,
                relative: getRelativeTime(t),
                minutes: timeToMinutes(t),
                group: getTimeSlotGroup(t),
            });
        });
    });

    // Sort by time
    doseEntries.sort((a, b) => a.minutes - b.minutes);

    // Group by timeSlotGroup for section dividers
    const groupsOrder = ["morning", "afternoon", "evening", "night"];
    const groupLabels = {
        morning: "🌅 Morning (6:00 - 11:59)",
        afternoon: "☀️ Afternoon (12:00 - 16:59)",
        evening: "🌇 Evening (17:00 - 20:59)",
        night: "🌙 Night (21:00 - 5:59)",
    };
    const grouped = {};
    groupsOrder.forEach((g) => (grouped[g] = []));
    doseEntries.forEach((e) => grouped[e.group].push(e));

    // Also prepare sections for Upcoming / Overdue / Taken logic if filter is today/all
    // But we already grouped by period; for extra, we can show divider sections for status when filter pending vs missed etc.
    // We'll render per group with divider, then per medicine grouped? However to keep per-medicine card familiar, we will aggregate back to per-medicine for display.

    // For Phase 3, we render per-dose cards within group sections, but also keep medicine context
    // Alternative: render per-medicine cards grouped by earliest time's group

    // To satisfy "Group medicines by time", we will render per-dose entries as cards grouped.
    // But to preserve existing medicine-card UI, we will render per-dose filtered list as individual dose cards (simpler) plus section dividers.

    // However spec also expects medicine cards with delete etc. If we switch to per-dose, delete would need to handle per-dose? But delete is per medicine, not per dose.

    // So we need to decide: Keep per-medicine cards but insert group dividers between medicines sorted by first time's group.

    // We'll implement grouping at medicine level: sort filteredMeds by first time, then insert divider when group changes.

    // Let's sort filteredMeds by first time
    const medsSorted = [...filteredMeds].sort((a, b) => timeToMinutes(a.times[0]) - timeToMinutes(b.times[0]));

    let html = "";
    let lastGroup = null;

    medsSorted.forEach((med) => {
        // Determine medicine's group based on earliest time
        const medGroup = getTimeSlotGroup(med.times[0]);
        // Insert section divider if group changed
        if (medGroup !== lastGroup) {
            html += `<div class="section-divider ${medGroup}">${groupLabels[medGroup]}</div>`;
            lastGroup = medGroup;
        }

        // Build time rows filtered by currentFilter
        const timeRows = med.times
            .filter((t) => {
                if (currentFilter === "pending" || currentFilter === "taken" || currentFilter === "missed") {
                    return getStatus(med, t) === currentFilter;
                }
                return true; // today/all show all
            })
            .map((t) => {
                const status = getStatus(med, t);
                let badgeClass = "status-pending-badge";
                let badgeText = "● Pending";
                let cardStatusClass = "status-pending";
                let relClass = "upcoming";
                if (status === "taken") {
                    badgeClass = "status-taken-badge";
                    badgeText = "✓ Taken";
                    cardStatusClass = "status-taken";
                    relClass = "now";
                } else if (status === "missed") {
                    badgeClass = "status-missed-badge";
                    badgeText = "✕ Missed";
                    cardStatusClass = "status-missed";
                    relClass = "overdue";
                } else {
                    // pending - check if due soon (within 15 min) to highlight
                    const diff = timeToMinutes(t) - timeToMinutes(getCurrentTime());
                    if (diff >= 0 && diff <= 15) relClass = "now";
                    else relClass = "upcoming";
                }
                const relative = getRelativeTime(t);
                let actionBtn = "";
                if (status === "pending") {
                    actionBtn = `<button class="confirm-btn" data-id="${med.id}" data-time="${t}">✅ Mark as Taken</button>`;
                } else if (status === "taken") {
                    actionBtn = `<button class="confirm-btn" disabled>✓ Completed</button>`;
                } else {
                    actionBtn = `<button class="confirm-btn" data-id="${med.id}" data-time="${t}">✅ Mark Late as Taken</button>`;
                }

                // Highlight current time if due now
                const isDueNow = status === "pending" && Math.abs(timeToMinutes(t) - timeToMinutes(getCurrentTime())) <= 5;
                const timeHighlight = isDueNow ? ' style="color:var(--blue);font-weight:800;"' : "";

                return `
                <div class="dose-row ${cardStatusClass}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:600;"${timeHighlight}>${formatTime(t)} <small style="color:var(--gray-500);">(${t})</small></span>
                    <span class="relative-time ${relClass}">${relative}</span>
                    <span class="status-badge ${badgeClass}" style="font-size:0.70rem;">${badgeText}</span>
                    ${actionBtn}
                </div>
                `;
            })
            .join("");

        // If after filtering, no rows remain (should not happen due to filteredMeds logic, but guard)
        if (!timeRows) return;

        // Overall card status: if all taken → taken, if any missed → missed, else pending
        // But for filtered view, base on visible times
        const visibleTimes = med.times.filter((t) => {
            if (currentFilter === "pending" || currentFilter === "taken" || currentFilter === "missed") return getStatus(med, t) === currentFilter;
            return true;
        });
        const statuses = visibleTimes.map((t) => getStatus(med, t));
        let overallClass = "status-pending";
        let overallBadge = '<span class="status-badge status-pending-badge">● Pending</span>';
        if (statuses.every((s) => s === "taken") && statuses.length > 0) {
            overallClass = "status-taken";
            overallBadge = '<span class="status-badge status-taken-badge">✓ Taken</span>';
        } else if (statuses.some((s) => s === "missed")) {
            overallClass = "status-missed";
            overallBadge = '<span class="status-badge status-missed-badge">✕ Missed</span>';
        }

        // Highlight if medicine has a dose due now
        const hasDueNowInMed = visibleTimes.some((t) => {
            const s = getStatus(med, t);
            return s === "pending" && Math.abs(timeToMinutes(t) - timeToMinutes(getCurrentTime())) <= 15;
        });

        html += `
            <div class="medicine-card ${overallClass}" data-id="${med.id}" ${hasDueNowInMed ? 'style="border-left-width:6px;box-shadow:0 4px 12px rgba(33,150,243,0.15);"' : ""}>
                <div class="medicine-card-top">
                    <div class="medicine-info">
                        <h3>${escapeHtml(med.name)} ${hasDueNowInMed ? '<span class="current-time-highlight">Due Now</span>' : ""}</h3>
                        <p class="medicine-dosage">${escapeHtml(med.dosage)} • ${visibleTimes.map(formatTime).join(", ")}</p>
                        <span class="medicine-lang">🔊 ${escapeHtml(med.language)}</span>
                    </div>
                    ${overallBadge}
                </div>
                <div style="margin: 8px 0;">
                    ${timeRows}
                </div>
                <div class="medicine-card-actions">
                    <button class="delete-btn" data-id="${med.id}">🗑️ Delete</button>
                    <button class="btn btn-outline btn-sm" data-test-speaker="${med.id}">🔊 Test Speaker (Phase 4)</button>
                </div>
            </div>
        `;
    });

    // If after filtering we have no visible rows (edge), show empty
    if (!html) {
        container.innerHTML = `<div class="empty-state"><p>No doses to display</p></div>`;
        return;
    }

    container.innerHTML = html;
}

/**
 * Update LED simulation per dose (each time slot is one LED) - Phase 5 enhanced
 * Colors: Yellow blinking = pending, Fast yellow = Due Now (≤5 min), Green = taken, Red = missed
 * Also handles IoT disconnected state and filtering
 */
function updateLEDs() {
    const container = document.getElementById("ledContainer");
    if (!container) return;

    // IoT disconnected - show offline state
    if (!iotConnected) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:20px;border-color:var(--red);background:var(--red-light);">
                <p>🔌 IoT Disconnected - LEDs Offline</p>
                <p style="font-size:0.75rem;color:var(--gray-500);">Toggle IoT simulation to reconnect</p>
            </div>
        `;
        return;
    }

    if (medicines.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;padding:20px;">
                <p>No LEDs - Add medicines to see LED simulation</p>
                <p style="font-size:0.75rem;color:var(--gray-500);">Each dose gets one LED • Yellow blinking = reminder • Fast = Due Now</p>
            </div>
        `;
        return;
    }

    let html = "";
    // For Phase 3-5, filter LEDs by currentFilter as well for consistency
    medicines.forEach((med) => {
        med.times.forEach((t) => {
            const status = getStatus(med, t);
            // Apply filter to LEDs similarly
            if (currentFilter === "pending" && status !== "pending") return;
            if (currentFilter === "taken" && status !== "taken") return;
            if (currentFilter === "missed" && status !== "missed") return;

            let ledClass = "led-pending";
            let statusText = "Pending";
            let statusColor = "text-yellow";
            // Phase 5: Due Now check - pending and within 5 minutes → fast blinking
            const dueNow = isMedicineDueNow(med, t);
            if (status === "taken") {
                ledClass = "led-taken";
                statusText = "Taken";
                statusColor = "text-green";
            } else if (status === "missed") {
                ledClass = "led-missed";
                statusText = "Missed";
                statusColor = "text-red";
            } else if (dueNow) {
                // Due Now - faster blinking yellow
                ledClass = "led-due-now";
                statusText = "Due Now";
                statusColor = "text-yellow";
            }

            const relative = getRelativeTime(t);
            html += `
                <div class="led-item">
                    <div class="led-circle ${ledClass}" title="${escapeHtml(med.name)} - ${t} - ${statusText} (${relative})"></div>
                    <span class="led-label">${escapeHtml(med.name)}<br><small>${formatTime(t)} • ${relative}</small></span>
                    <span class="led-status ${statusColor}">${statusText}${dueNow ? " ⚡" : ""}</span>
                </div>
            `;
        });
    });

    if (!html) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:20px;"><p>No LEDs match filter "${currentFilter}"</p></div>`;
        return;
    }

    container.innerHTML = html;
}

/**
 * Update history log (timeline of today's doses + recent) - Phase 3 enhanced with relative time
 */
function updateHistory() {
    const container = document.getElementById("historyList");
    if (!container) return;

    if (medicines.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding:20px;">
                <p>No history yet</p>
                <p style="font-size:0.75rem;color:var(--gray-500);">History will show Taken/Missed doses here</p>
            </div>
        `;
        return;
    }

    // Build history entries per dose, sorted by time
    const entries = [];
    medicines.forEach((med) => {
        med.times.forEach((t) => {
            const status = getStatus(med, t);
            // Phase 3: respect filter for history as well
            if (currentFilter === "pending" && status !== "pending") return;
            if (currentFilter === "taken" && status !== "taken") return;
            if (currentFilter === "missed" && status !== "missed") return;

            entries.push({
                time: t,
                minutes: timeToMinutes(t),
                medicine: med.name,
                dosage: med.dosage,
                status: status,
                relative: getRelativeTime(t),
                displayTime: `Today ${formatTime(t)}`,
            });
        });
    });

    // Sort by time
    entries.sort((a, b) => a.minutes - b.minutes);

    // If filtered empty
    if (entries.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:20px;"><p>No history for "${currentFilter}" filter</p></div>`;
        return;
    }

    let html = "";
    entries.forEach((e) => {
        let itemClass = "history-taken";
        let badge = '<span class="history-status status-pending-badge">● Pending</span>';
        if (e.status === "taken") {
            itemClass = "history-taken";
            badge = '<span class="history-status status-taken-badge">✓ Taken</span>';
        } else if (e.status === "missed") {
            itemClass = "history-missed";
            badge = '<span class="history-status status-missed-badge">✕ Missed</span>';
        } else {
            itemClass = "history-pending";
            badge = '<span class="history-status status-pending-badge">● Pending</span>';
        }

        let relClass = "upcoming";
        if (e.status === "taken") relClass = "now";
        else if (e.status === "missed") relClass = "overdue";

        html += `
            <div class="history-item ${itemClass}">
                <span class="history-time">${e.displayTime} <span class="relative-time ${relClass}" style="margin-left:6px;">${e.relative}</span></span>
                <span class="history-medicine">${escapeHtml(e.medicine)} - ${escapeHtml(e.dosage)}</span>
                ${badge}
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Update compliance statistics for caregiver view - Phase 3 enhanced
 * Adds upcoming/overdue and next dose
 */
function updateStats() {
    const takenEl = document.getElementById("statTaken");
    const pendingEl = document.getElementById("statPending");
    const missedEl = document.getElementById("statMissed");
    const complianceText = document.getElementById("complianceText");
    const complianceFill = document.getElementById("complianceFill");
    const upcomingEl = document.getElementById("statUpcoming");
    const overdueEl = document.getElementById("statOverdue");

    if (!takenEl || !pendingEl || !missedEl) return;

    let taken = 0;
    let pending = 0;
    let missed = 0;
    let upcoming = 0;
    let overdue = 0;

    const nowMinutes = timeToMinutes(getCurrentTime());

    medicines.forEach((med) => {
        med.times.forEach((t) => {
            const status = getStatus(med, t);
            if (status === "taken") taken++;
            else if (status === "pending") {
                pending++;
                // upcoming is pending in future; overdue is pending but actually our getStatus would mark past as missed, so upcoming == pending
                // For Phase 3, define upcoming as pending future, overdue as missed
                const slotMinutes = timeToMinutes(t);
                if (slotMinutes >= nowMinutes) upcoming++;
                else overdue++; // this shouldn't happen because pending means future, but keep logic
            } else if (status === "missed") {
                missed++;
                overdue++;
            }
        });
    });

    // If pending is future, upcoming = pending, overdue = missed (makes sense)
    // Adjust: upcoming = pending, overdue = missed (as per spec "Overdue (pending doses past their time)" = missed)
    upcoming = pending;
    overdue = missed;

    const total = taken + pending + missed;
    const compliance = total === 0 ? 0 : Math.round((taken / total) * 100);

    takenEl.textContent = String(taken);
    pendingEl.textContent = String(pending);
    missedEl.textContent = String(missed);
    if (upcomingEl) upcomingEl.textContent = String(upcoming);
    if (overdueEl) overdueEl.textContent = String(overdue);

    if (complianceText) {
        complianceText.innerHTML = `<strong>${compliance}%</strong> (${taken}/${total} taken)`;
    }
    if (complianceFill) {
        complianceFill.style.width = `${compliance}%`;
    }
}

/**
 * Update buzzer visual based on pending doses - Phase 5 enhanced
 * Handles Due Now faster pulsing, overdue faster, mute, IoT disconnected, vibration & beep
 */
function updateBuzzer() {
    const buzzer = document.getElementById("buzzerVisual");
    const label = document.getElementById("buzzerLabel");
    const sub = document.getElementById("buzzerSub");
    if (!buzzer) return;

    // Reset classes first
    buzzer.classList.remove("buzzer-active", "buzzer-overdue", "buzzer-muted", "buzzer-vibrate");

    // IoT disconnected - show offline state
    if (!iotConnected) {
        if (label) label.textContent = "🔌 IoT Disconnected";
        if (sub) sub.textContent = "Device offline - buzzer disabled";
        return;
    }

    // Muted state - visual muted, no active pulsing, no beep
    if (buzzerMuted) {
        buzzer.classList.add("buzzer-muted");
        if (label) label.textContent = "🔇 Buzzer Muted";
        if (sub) sub.textContent = "Muted - enable to hear reminders";
        return;
    }

    const hasPending = medicines.some((med) => med.times.some((t) => getStatus(med, t) === "pending"));
    const hasMissed = medicines.some((med) => med.times.some((t) => getStatus(med, t) === "missed"));
    const hasDueNow = medicines.some((med) => med.times.some((t) => isMedicineDueNow(med, t)));

    if (hasPending) {
        // Check if Due Now or overdue (missed) -> faster pulsing + beep
        const hasOverdue = hasMissed;
        if (hasDueNow || hasOverdue) {
            buzzer.classList.add("buzzer-active");
            buzzer.classList.add("buzzer-overdue");
            if (label) label.textContent = hasDueNow ? "⚡ DUE NOW - BUZZING FAST!" : "⚠️ OVERDUE - BUZZING FAST!";
            if (sub) sub.textContent = hasDueNow ? "Dose due within 5 minutes! • Beep 440Hz" : "Overdue doses pending • Beep 440Hz";
            // Play beep for Due Now / overdue (respect mute/IoT already checked)
            // Only beep if not already recently beeped - we trigger beep here but limit to once per update to avoid spam
            // Use a simple debounce: only beep if hasDueNow
            if (hasDueNow) {
                playBuzzerBeep(880, 200); // Higher freq for Due Now urgency
            } else {
                playBuzzerBeep(440, 200);
            }
        } else {
            buzzer.classList.add("buzzer-active");
            if (label) label.textContent = "BUZZING - Reminder Active!";
            if (sub) sub.textContent = "Pending doses need attention • Mute available";
        }
    } else if (hasMissed) {
        // No pending but has missed - show missed, no buzzing (or slow overdue buzz? Spec says buzzer when pending)
        buzzer.classList.remove("buzzer-active");
        if (label) label.textContent = "Missed Doses";
        if (sub) sub.textContent = "Some doses were missed • No pending buzz";
    } else {
        buzzer.classList.remove("buzzer-active");
        if (label) label.textContent = "Idle - No Reminder";
        if (sub) sub.textContent = "All doses taken or none scheduled";
    }
}

// ==================== PHASE 4: TTS SPEAKER (Web Speech API) ====================
// Works offline, Chrome optimized, no API key, browser-based

// TTS state variables - Phase 4
let ttsVolume = 1.0; // 0.0 to 1.0 (maps from 0-100% slider)
let ttsRate = 0.9; // 0.5 to 2.0, default 0.9 for elderly (slightly slow)
let isSpeaking = false; // Tracks if currently speaking
let pendingQueue = []; // Queue for speakAllPending sequential playback
let currentUtterance = null; // Current utterance for stop control

// Phase 5: LED & Buzzer IoT state
let buzzerMuted = false; // Mute state persists in localStorage
let iotConnected = true; // IoT simulation connected state
let audioContext = null; // Web Audio API context for beep
const BUZZER_MUTE_KEY = "medication_reminder_buzzer_muted";
const IOT_CONNECTED_KEY = "medication_reminder_iot_connected";

/**
 * Get localized reminder text for a medicine - Phase 4
 * Uses templates per language as per spec
 * @param {object} medicine - Medicine object
 * @param {string} time - Time slot "HH:MM" (for context, not in template but could be used)
 * @returns {string} localized reminder text
 */
function getReminderText(medicine, time) {
    const name = medicine.name;
    const dosage = medicine.dosage;
    const lang = medicine.language || "en-US";

    // Reminder templates by language (from spec)
    if (lang === "kn-IN") {
        // Kannada: "ಅಮ್ಮ, {medicine} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. {dosage} ತೆಗೆದುಕೊಳ್ಳಿ."
        // Also fallback transliteration provided in spec
        return `ಅಮ್ಮ, ${name} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. ${dosage} ತೆಗೆದುಕೊಳ್ಳಿ.`;
    } else if (lang === "hi-IN") {
        // Hindi: "अम्मा, {medicine} लेने का समय. {dosage} लें."
        return `अम्मा, ${name} लेने का समय. ${dosage} लें.`;
    } else {
        // English default: "Amma, time to take {medicine}. Take {dosage}."
        return `Amma, time to take ${name}. Take ${dosage}.`;
    }
}

/**
 * Get best voice for a language - Phase 4
 * Tries to find voice matching lang code, fallback to default
 * @param {string} language - "kn-IN"|"hi-IN"|"en-US"
 * @returns {SpeechSynthesisVoice|null} voice or null for default
 */
function getVoiceForLanguage(language) {
    if (typeof speechSynthesis === "undefined" || !speechSynthesis.getVoices) {
        return null;
    }
    const voices = speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Try exact match first (e.g., kn-IN, hi-IN, en-US)
    let voice = voices.find((v) => v.lang === language);
    if (voice) return voice;

    // Try language prefix (kn, hi, en)
    const langPrefix = language.split("-")[0];
    voice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
    if (voice) return voice;

    // For Kannada, Chrome often doesn't have kn-IN voice; fallback to en-IN or hi-IN if available
    if (language === "kn-IN") {
        voice = voices.find((v) => v.lang.includes("kn")) || voices.find((v) => v.lang.includes("hi")) || voices.find((v) => v.lang === "en-IN") || voices.find((v) => v.lang.startsWith("en"));
        if (voice) return voice;
    }
    if (language === "hi-IN") {
        voice = voices.find((v) => v.lang.includes("hi")) || voices.find((v) => v.lang === "en-IN");
        if (voice) return voice;
    }

    // Fallback to en-US or first available
    return voices.find((v) => v.lang === "en-US") || voices[0] || null;
}

/**
 * Update speaker visual feedback (icon + waveform) - Phase 4
 * @param {boolean} speaking - true if speaking, false if idle
 * @param {string} text - optional text to show in status
 */
function updateSpeakerVisual(speaking, text = "") {
    const visual = document.getElementById("speakerVisual");
    const status = document.getElementById("speakerStatus");
    const icon = document.getElementById("speakerIcon");

    if (visual) {
        if (speaking) visual.classList.add("speaking");
        else visual.classList.remove("speaking");
    }
    if (status) {
        if (speaking) {
            status.textContent = text ? `🔊 Speaking: ${text.slice(0, 40)}...` : "🔊 Speaking...";
        } else {
            status.textContent = "Ready";
        }
    }
    if (icon) {
        icon.textContent = speaking ? "🔊" : "🔊";
    }

    // Also highlight per-medicine speaker buttons when speaking
    if (!speaking) {
        document.querySelectorAll("[data-test-speaker].speaking").forEach((btn) => btn.classList.remove("speaking"));
    }
}

/**
 * Speak custom message with Web Speech API - Phase 4
 * @param {string} text - Text to speak
 * @param {string} language - Language code "kn-IN"|"hi-IN"|"en-US"
 * @param {function} callback - Called after speech ends or on error (optional)
 */
function speakCustomMessage(text, language, callback) {
    // Check for Web Speech API support
    if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
        const msg = "Web Speech API not supported in this browser. Use Chrome.";
        console.error(msg);
        showToast(msg, "error");
        updateSpeakerVisual(false);
        if (callback) callback(new Error(msg));
        return;
    }

    // Stop any ongoing speech first
    if (isSpeaking) {
        speechSynthesis.cancel();
        isSpeaking = false;
        updateSpeakerVisual(false);
    }

    if (!text || !text.trim()) {
        const msg = "No text to speak";
        showToast(msg, "error");
        if (callback) callback(new Error(msg));
        return;
    }

    // Create utterance with settings from sliders (volume 0-1, rate 0.5-2.0, pitch 1.0)
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = language || "en-US";
    utterance.volume = ttsVolume; // 0.0 to 1.0
    utterance.rate = ttsRate; // 0.5 to 2.0 (0.9 default for elderly)
    utterance.pitch = 1.0; // Normal pitch

    // Try to select language-specific voice
    const voice = getVoiceForLanguage(utterance.lang);
    if (voice) {
        utterance.voice = voice;
        console.log(`Using voice: ${voice.name} (${voice.lang}) for ${language}`);
    } else {
        console.warn(`No voice found for ${language}, using default`);
    }

    currentUtterance = utterance;
    isSpeaking = true;
    updateSpeakerVisual(true, text);

    // Handle end
    utterance.onend = () => {
        isSpeaking = false;
        currentUtterance = null;
        updateSpeakerVisual(false);
        console.log(`Finished speaking: "${text.slice(0, 30)}..." in ${language}`);
        if (callback) callback(null);
    };

    // Handle error
    utterance.onerror = (event) => {
        console.error("Speech error:", event.error, event);
        isSpeaking = false;
        currentUtterance = null;
        updateSpeakerVisual(false);
        showToast(`Speech error: ${event.error}`, "error");
        if (callback) callback(new Error(event.error));
    };

    // Start speaking
    speechSynthesis.speak(utterance);
    showToast(`🔊 Speaking in ${language}: "${text.slice(0, 40)}..."`, "info");
}

/**
 * Speak reminder for a specific medicine and time - Phase 4
 * @param {object} medicine - Medicine object
 * @param {string} time - Time slot "HH:MM"
 * @param {function} callback - Called after speech ends or on error
 */
function speakReminder(medicine, time, callback) {
    if (!medicine) {
        const msg = "Medicine not found";
        showToast(msg, "error");
        if (callback) callback(new Error(msg));
        return;
    }
    const text = getReminderText(medicine, time);
    const lang = medicine.language || "en-US";
    console.log(`Speaking reminder for ${medicine.name} at ${time} in ${lang}: "${text}"`);
    speakCustomMessage(text, lang, callback);
}

/**
 * Stop current speech - Phase 4
 */
function stopSpeaking() {
    if (typeof speechSynthesis === "undefined") return;
    if (isSpeaking || speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
        isSpeaking = false;
        currentUtterance = null;
        pendingQueue = [];
        updateSpeakerVisual(false);
        showToast("⏹️ Speech stopped", "info");
        console.log("Speech stopped by user");
    } else {
        showToast("No speech to stop", "info");
    }
}

/**
 * Speak all pending medicines sequentially with 2s pause - Phase 4
 * Each pending dose is spoken in its own language
 */
function speakAllPending() {
    // Collect all pending doses (medicine + time) sorted by time
    const pendingDoses = [];
    medicines.forEach((med) => {
        med.times.forEach((t) => {
            if (getStatus(med, t) === "pending") {
                pendingDoses.push({ medicine: med, time: t });
            }
        });
    });

    // Sort by time
    pendingDoses.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    if (pendingDoses.length === 0) {
        showToast("No pending medicines to speak", "info");
        return;
    }

    // Stop any current speech and clear queue
    stopSpeaking();
    pendingQueue = [...pendingDoses];

    showToast(`🔊 Speaking ${pendingDoses.length} pending reminders sequentially`, "info");
    console.log(`Speaking all pending: ${pendingDoses.length} doses`);

    // Recursive function to speak next in queue
    function speakNext(index) {
        if (index >= pendingQueue.length) {
            showToast("✅ All pending reminders spoken", "success");
            isSpeaking = false;
            updateSpeakerVisual(false);
            return;
        }

        const dose = pendingQueue[index];
        // Highlight the medicine card being spoken
        const btn = document.querySelector(`[data-test-speaker="${dose.medicine.id}"]`);
        if (btn) btn.classList.add("speaking");

        speakReminder(dose.medicine, dose.time, (err) => {
            if (btn) btn.classList.remove("speaking");
            if (err) {
                console.error("Error speaking dose", dose, err);
                // Continue to next even on error
            }
            // 2-second pause before next
            setTimeout(() => speakNext(index + 1), 2000);
        });
    }

    speakNext(0);
}

/**
 * Initialize TTS voices and UI - Phase 4
 * Handles Chrome's async voice loading (onvoiceschanged)
 */
function initTTS() {
    const voiceStatus = document.getElementById("ttsVoiceStatus") || document.getElementById("voiceStatus");
    const ttsVoiceSelect = document.getElementById("ttsVoice");

    function updateVoiceStatus() {
        if (typeof speechSynthesis === "undefined") {
            if (voiceStatus) {
                voiceStatus.textContent = "❌ Web Speech API not supported. Use Chrome.";
                voiceStatus.className = "error";
            }
            return;
        }
        const voices = speechSynthesis.getVoices();
        if (!voices || voices.length === 0) {
            if (voiceStatus) {
                voiceStatus.textContent = "⏳ Loading voices...";
                voiceStatus.className = "";
            }
            return;
        }

        // Count voices per language
        const knVoices = voices.filter((v) => v.lang.toLowerCase().includes("kn")).length;
        const hiVoices = voices.filter((v) => v.lang.toLowerCase().includes("hi")).length;
        const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en")).length;

        if (voiceStatus) {
            voiceStatus.textContent = `✅ ${voices.length} voices ready • kn:${knVoices} hi:${hiVoices} en:${enVoices} • Chrome best`;
            voiceStatus.className = "ready";
        }

        // Update ttsVoice select to show available voices? Keep simple: just show status.
        console.log(`TTS voices loaded: ${voices.length} (kn:${knVoices} hi:${hiVoices} en:${enVoices})`);
        voices.forEach((v) => console.log(` - ${v.name} (${v.lang}) ${v.default ? "[default]" : ""}`));
    }

    // Chrome loads voices asynchronously
    if (typeof speechSynthesis !== "undefined") {
        // Try immediate
        updateVoiceStatus();
        // Listen for voices changed
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = updateVoiceStatus;
        }
        // Fallback timeout
        setTimeout(updateVoiceStatus, 1000);
    }

    // Initialize volume and speed from sliders / localStorage
    const volSlider = document.getElementById("volumeSlider");
    const speedSlider = document.getElementById("speedSlider");
    const volValue = document.getElementById("volumeValue");
    const volValue2 = document.getElementById("volumeValue2");
    const speedValue = document.getElementById("speedValue");

    // Load from localStorage if available
    try {
        const savedVol = localStorage.getItem("tts_volume");
        const savedRate = localStorage.getItem("tts_rate");
        if (savedVol !== null) {
            ttsVolume = parseFloat(savedVol);
            if (volSlider) volSlider.value = String(Math.round(ttsVolume * 100));
        }
        if (savedRate !== null) {
            ttsRate = parseFloat(savedRate);
            if (speedSlider) speedSlider.value = String(ttsRate);
        }
    } catch (e) {}

    // Update displays
    if (volValue) volValue.textContent = `${Math.round(ttsVolume * 100)}%`;
    if (volValue2) volValue2.textContent = `${Math.round(ttsVolume * 100)}%`;
    if (speedValue) speedValue.textContent = String(ttsRate);

    // Volume slider handler
    if (volSlider) {
        volSlider.addEventListener("input", (e) => {
            const val = parseInt(e.target.value, 10);
            ttsVolume = val / 100;
            if (volValue) volValue.textContent = `${val}%`;
            if (volValue2) volValue2.textContent = `${val}%`;
            try { localStorage.setItem("tts_volume", String(ttsVolume)); } catch (e) {}
        });
    }

    // Speed slider handler
    if (speedSlider) {
        speedSlider.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            ttsRate = val;
            if (speedValue) speedValue.textContent = String(val);
            try { localStorage.setItem("tts_rate", String(ttsRate)); } catch (e) {}
        });
    }

    // Speaker test button handler
    const testBtn = document.getElementById("speakerTestBtn");
    if (testBtn) {
        testBtn.addEventListener("click", () => {
            const textEl = document.getElementById("ttsText");
            const langEl = document.getElementById("ttsVoice");
            const text = textEl ? textEl.value.trim() : "";
            const lang = langEl ? langEl.value : "en-US";
            if (!text) {
                showToast("Enter text to speak", "error");
                return;
            }
            speakCustomMessage(text, lang);
        });
    }

    // Speak All Pending button
    const speakAllBtn = document.getElementById("speakAllBtn");
    if (speakAllBtn) {
        speakAllBtn.addEventListener("click", () => {
            speakAllPending();
        });
    }

    // Stop button
    const stopBtn = document.getElementById("stopSpeakingBtn");
    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            stopSpeaking();
        });
    }

    // Also handle header language selector changing ttsVoice? Keep in sync optionally
    const headerLang = document.getElementById("languageSelect");
    const ttsVoiceSelectEl = document.getElementById("ttsVoice");
    if (headerLang && ttsVoiceSelectEl) {
        headerLang.addEventListener("change", (e) => {
            // Optionally sync ttsVoice to header selection for demo
            ttsVoiceSelectEl.value = e.target.value;
        });
    }
}

// ==================== PHASE 5: LED & BUZZER IoT ====================

/**
 * Check if a dose is Due Now (pending and within 5 minutes) - Phase 5
 * @param {string} time - "HH:MM"
 * @returns {boolean} true if due within 5 min
 */
function isDueNow(time) {
    // Only pending can be due now; taken/missed are not
    // Need to find a medicine that has this time? For standalone check, just compare time diff
    const nowMinutes = timeToMinutes(getCurrentTime());
    const slotMinutes = timeToMinutes(time);
    const diff = slotMinutes - nowMinutes;
    // Due now if diff between 0 and 5 inclusive and not already taken/missed elsewhere
    return diff >= 0 && diff <= 5;
}

/**
 * Check if a specific medicine time is Due Now (pending + within 5 min) - Phase 5
 */
function isMedicineDueNow(medicine, time) {
    return getStatus(medicine, time) === "pending" && isDueNow(time);
}

/**
 * Play buzzer beep using Web Audio API - Phase 5
 * @param {number} freq - Frequency in Hz (default 440Hz A4)
 * @param {number} duration - Duration in ms (default 200ms)
 */
function playBuzzerBeep(freq = 440, duration = 200) {
    // Respect mute and IoT disconnected
    if (buzzerMuted) {
        console.log("Buzzer muted, beep suppressed");
        return;
    }
    if (!iotConnected) {
        console.log("IoT disconnected, beep suppressed");
        return;
    }
    // Check for Web Audio API support
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === "suspended") {
            audioContext.resume();
        }
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = freq;
        // Volume matches TTS volume with slight reduction for beep
        gainNode.gain.value = Math.min(ttsVolume * 0.5, 0.5);
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        // Fade out slightly
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
        setTimeout(() => {
            try { oscillator.stop(); } catch (e) {}
            try { oscillator.disconnect(); } catch (e) {}
        }, duration);
        console.log(`Buzzer beep: ${freq}Hz ${duration}ms volume=${gainNode.gain.value}`);

        // Visual vibration effect
        const buzzerVisual = document.getElementById("buzzerVisual");
        if (buzzerVisual) {
            buzzerVisual.classList.add("buzzer-vibrate");
            setTimeout(() => buzzerVisual.classList.remove("buzzer-vibrate"), 400);
        }
    } catch (e) {
        console.warn("Web Audio API not supported or failed:", e);
        // Fallback: just visual
    }
}

/**
 * Set buzzer muted state with persistence - Phase 5
 * @param {boolean} muted
 */
function setBuzzerMuted(muted) {
    buzzerMuted = muted;
    try { localStorage.setItem(BUZZER_MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
    updateBuzzerMuteUI();
    updateBuzzer();
    showToast(muted ? "🔇 Buzzer Muted" : "🔊 Buzzer Unmuted", muted ? "info" : "success");
    console.log("Buzzer muted:", buzzerMuted);
}

/**
 * Update buzzer mute UI - Phase 5
 */
function updateBuzzerMuteUI() {
    const muteBtn = document.getElementById("muteBuzzerBtn");
    const muteBtn2 = document.getElementById("buzzerMuteBtn");
    const muteStatus = document.getElementById("buzzerMuteStatus");
    const label = buzzerMuted ? "🔇 Muted" : "🔊 Unmuted";
    const btnLabel = buzzerMuted ? "🔊 Unmute Buzzer" : "🔇 Mute Buzzer";
    if (muteBtn) muteBtn.textContent = btnLabel;
    if (muteBtn2) muteBtn2.textContent = buzzerMuted ? "🔊 Unmute" : "🔇 Mute";
    if (muteStatus) {
        muteStatus.textContent = buzzerMuted ? "🔇 Buzzer Muted" : "🔊 Buzzer Unmuted";
        muteStatus.className = buzzerMuted ? "badge badge-danger" : "badge badge-info";
    }
}

/**
 * Set IoT connection state with persistence - Phase 5
 * @param {boolean} connected
 */
function setIoTConnected(connected) {
    iotConnected = connected;
    try { localStorage.setItem(IOT_CONNECTED_KEY, connected ? "1" : "0"); } catch (e) {}
    updateIoTUI();
    updateBuzzer();
    updateLEDs();
    showToast(connected ? "🔌 IoT Connected" : "🔌 IoT Disconnected", connected ? "success" : "error");
    console.log("IoT connected:", iotConnected);
}

/**
 * Update IoT UI status - Phase 5
 */
function updateIoTUI() {
    const statusBadge = document.getElementById("iotConnectionStatus");
    const statusText = document.getElementById("iotConnectionText");
    const toggle = document.getElementById("iotSimulateToggle");
    if (statusBadge) {
        statusBadge.textContent = iotConnected ? "● Connected" : "● Disconnected";
        statusBadge.className = iotConnected ? "badge badge-success" : "badge badge-danger";
    }
    if (statusText) {
        statusText.textContent = iotConnected ? "Connected • Mock GPIO" : "Disconnected • Offline";
        statusText.className = iotConnected ? "badge badge-success" : "badge badge-danger";
    }
    if (toggle) toggle.checked = iotConnected;
}

/**
 * Trigger buzzer test - manual IoT test - Phase 5
 */
function triggerBuzzerTest() {
    if (!iotConnected) {
        showToast("IoT Disconnected - connect first", "error");
        return;
    }
    // Activate buzzer visual briefly + beep
    const buzzer = document.getElementById("buzzerVisual");
    if (buzzer) {
        buzzer.classList.add("buzzer-active");
        setTimeout(() => {
            if (!medicines.some((m) => m.times.some((t) => getStatus(m, t) === "pending"))) {
                buzzer.classList.remove("buzzer-active");
            }
        }, 1500);
    }
    // Beep 3 times
    playBuzzerBeep(440, 200);
    setTimeout(() => playBuzzerBeep(550, 200), 300);
    setTimeout(() => playBuzzerBeep(440, 400), 600);
    showToast("🔔 Buzzer test triggered (beep + vibration)", "info");
}

/**
 * Trigger LED test - manual IoT test - Phase 5
 * Flashes all LEDs
 */
function triggerLedTest() {
    if (!iotConnected) {
        showToast("IoT Disconnected - connect first", "error");
        return;
    }
    const leds = document.querySelectorAll(".led-circle");
    leds.forEach((led) => {
        led.style.transform = "scale(1.2)";
        led.style.boxShadow = "0 0 20px rgba(255,235,59,1)";
    });
    setTimeout(() => {
        leds.forEach((led) => {
            led.style.transform = "";
            led.style.boxShadow = "";
        });
        updateLEDs();
    }, 1000);
    showToast("💡 LED test triggered (flash)", "info");
}

/**
 * Simulate Due Now - adds a medicine due in 2 minutes for testing - Phase 5
 */
function triggerDueNowTest() {
    if (!iotConnected) {
        showToast("IoT Disconnected - connect first", "error");
        return;
    }
    const now = new Date();
    now.setMinutes(now.getMinutes() + 2);
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const timeStr = `${hours}:${minutes}`;
    try {
        const med = addMedicine(`Test DueNow ${timeStr}`, "1 tablet", [timeStr], "en-US");
        renderAll();
        showToast(`⏰ Added Due Now medicine at ${timeStr} (fast blink + buzzer)`, "success");
        // Also trigger buzzer beep to demo Due Now
        setTimeout(() => playBuzzerBeep(880, 300), 500);
    } catch (e) {
        showToast(e.message, "error");
    }
}

/**
 * Initialize IoT controls - Phase 5
 */
function initIoTControls() {
    // Load persisted states
    try {
        const savedMute = localStorage.getItem(BUZZER_MUTE_KEY);
        if (savedMute !== null) buzzerMuted = savedMute === "1";
        const savedIoT = localStorage.getItem(IOT_CONNECTED_KEY);
        if (savedIoT !== null) iotConnected = savedIoT === "1";
    } catch (e) {}

    updateBuzzerMuteUI();
    updateIoTUI();

    // Mute button (both IDs for robustness)
    const muteBtn = document.getElementById("muteBuzzerBtn");
    const muteBtn2 = document.getElementById("buzzerMuteBtn");
    if (muteBtn) muteBtn.addEventListener("click", () => setBuzzerMuted(!buzzerMuted));
    if (muteBtn2) muteBtn2.addEventListener("click", () => setBuzzerMuted(!buzzerMuted));

    // IoT toggle
    const iotToggle = document.getElementById("iotSimulateToggle");
    if (iotToggle) {
        iotToggle.addEventListener("change", (e) => setIoTConnected(e.target.checked));
    }

    // Trigger buttons
    const triggerBuzzerBtn = document.getElementById("triggerBuzzerBtn");
    const buzzerTestBtn = document.getElementById("buzzerTestBtn");
    const triggerLedBtn = document.getElementById("triggerLedBtn");
    const testDueNowBtn = document.getElementById("testDueNowBtn");
    const buzzerStopBtn = document.getElementById("buzzerStopBtn");

    if (triggerBuzzerBtn) triggerBuzzerBtn.addEventListener("click", triggerBuzzerTest);
    if (buzzerTestBtn) buzzerTestBtn.addEventListener("click", triggerBuzzerTest);
    if (triggerLedBtn) triggerLedBtn.addEventListener("click", triggerLedTest);
    if (testDueNowBtn) testDueNowBtn.addEventListener("click", triggerDueNowTest);
    if (buzzerStopBtn) buzzerStopBtn.addEventListener("click", () => {
        // Stop just visual and beep
        const buzzer = document.getElementById("buzzerVisual");
        if (buzzer) buzzer.classList.remove("buzzer-active", "buzzer-overdue");
        showToast("🔕 Buzzer stopped", "info");
    });
}

// ==================== PHASE 6: PRESCRIPTION UPLOAD + MOCK OCR ====================
// Works offline, no cloud OCR, mock keyword matching, drag & drop, history in localStorage

// Phase 6 state
let uploadHistory = []; // Array of {id, filename, date, thumbnail, extracted: [{name,dosage,times,language}]}
let currentUploadFile = null; // Currently selected File object
let currentExtracted = []; // Last mock OCR result array
let currentPreviewDataUrl = ""; // Data URL for preview thumbnail
const UPLOAD_HISTORY_KEY = "medication_reminder_upload_history";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/jpg"];

// Preset common medicines for mock OCR - Phase 6
const MOCK_PRESETS = [
    { name: "Metformin", dosage: "1 tablet", times: ["08:00", "20:00"], language: "en-US" },
    { name: "Dolo 650", dosage: "1 tablet", times: ["14:00"], language: "kn-IN" },
    { name: "Vitamin D3", dosage: "1 capsule", times: ["09:00"], language: "hi-IN" },
    { name: "Aspirin", dosage: "1 tablet", times: ["20:00"], language: "en-US" },
    { name: "Atorvastatin", dosage: "1 tablet", times: ["21:00"], language: "en-US" },
    { name: "Amlodipine", dosage: "1 tablet", times: ["08:00"], language: "hi-IN" },
    { name: "Paracetamol", dosage: "1 tablet", times: ["12:00", "18:00"], language: "kn-IN" },
    { name: "Omeprazole", dosage: "1 capsule", times: ["07:00"], language: "en-US" },
    { name: "Cetirizine", dosage: "1 tablet", times: ["22:00"], language: "hi-IN" },
    { name: "Azithromycin", dosage: "1 tablet", times: ["10:00"], language: "en-US" },
];

/**
 * Validate file type and size - Phase 6
 * @param {File} file - File object
 * @returns {string|null} error message or null if valid
 */
function validateFile(file) {
    if (!file) return "No file selected";
    if (!SUPPORTED_TYPES.includes(file.type)) {
        return `Unsupported format: ${file.type}. Only JPG, PNG allowed.`;
    }
    if (file.size > MAX_FILE_SIZE) {
        return `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max 5MB.`;
    }
    return null;
}

/**
 * Show file preview thumbnail - Phase 6
 * @param {File} file - Selected file
 */
function showPreview(file) {
    const preview = document.getElementById("uploadPreview");
    const img = document.getElementById("previewImage");
    const nameEl = document.getElementById("previewName");
    const sizeEl = document.getElementById("previewSize");
    const actions = document.getElementById("uploadActions");
    if (!preview || !img) return;

    currentUploadFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentPreviewDataUrl = e.target.result;
        img.src = currentPreviewDataUrl;
        preview.style.display = "block";
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = `${file.type} • ${(file.size / 1024).toFixed(1)} KB`;
        if (actions) actions.style.display = "flex";
        // Hide previous OCR results when new file selected
        const results = document.getElementById("ocrResults");
        const processing = document.getElementById("ocrProcessing");
        if (results) results.style.display = "none";
        if (processing) processing.style.display = "none";
        currentExtracted = [];
    };
    reader.onerror = () => {
        showToast("Failed to read file", "error");
    };
    reader.readAsDataURL(file);
}

/**
 * Clear current upload preview and state - Phase 6
 */
function clearUpload() {
    currentUploadFile = null;
    currentExtracted = [];
    currentPreviewDataUrl = "";
    const preview = document.getElementById("uploadPreview");
    const img = document.getElementById("previewImage");
    const fileInput = document.getElementById("prescriptionFile");
    const actions = document.getElementById("uploadActions");
    const processing = document.getElementById("ocrProcessing");
    const results = document.getElementById("ocrResults");
    if (preview) preview.style.display = "none";
    if (img) img.src = "";
    if (fileInput) fileInput.value = "";
    if (actions) actions.style.display = "none";
    if (processing) processing.style.display = "none";
    if (results) results.style.display = "none";
    const nameEl = document.getElementById("previewName");
    const sizeEl = document.getElementById("previewSize");
    if (nameEl) nameEl.textContent = "";
    if (sizeEl) sizeEl.textContent = "";
}

/**
 * Mock OCR extraction - Phase 6
 * Simulates keyword matching on filename and random selection
 * @param {string} filename - Filename for keyword matching
 * @returns {object[]} array of 1-3 medicines with dosage/times/language
 */
function mockOCRExtract(filename) {
    const lower = (filename || "").toLowerCase();
    // Try keyword matching: if filename contains medicine name, prioritize it
    let matched = MOCK_PRESETS.filter((m) => lower.includes(m.name.toLowerCase().split(" ")[0].toLowerCase()));
    // If no keyword match, random selection
    if (matched.length === 0) {
        // Random 1-3 medicines, deterministic enough for demo but varies per call
        const count = 1 + Math.floor(Math.random() * 3); // 1-3
        // Shuffle and take count
        const shuffled = [...MOCK_PRESETS].sort(() => 0.5 - Math.random());
        matched = shuffled.slice(0, count);
    } else {
        // If matched, ensure 1-3: if 1 matched, maybe add 0-2 random others
        const extraCount = Math.min(2, Math.floor(Math.random() * 2)); // 0-1 extra
        const others = MOCK_PRESETS.filter((m) => !matched.includes(m)).sort(() => 0.5 - Math.random()).slice(0, extraCount);
        matched = [...matched, ...others].slice(0, 3);
        if (matched.length === 0) matched = [MOCK_PRESETS[0]];
    }
    // Return deep copy to avoid mutation of presets
    return matched.map((m) => ({
        name: m.name,
        dosage: m.dosage,
        times: [...m.times],
        language: m.language,
    }));
}

/**
 * Show OCR processing animation - Phase 6
 */
function showOCRProcessing() {
    const processing = document.getElementById("ocrProcessing");
    const results = document.getElementById("ocrResults");
    if (results) results.style.display = "none";
    if (processing) processing.style.display = "block";
}

/**
 * Hide OCR processing - Phase 6
 */
function hideOCRProcessing() {
    const processing = document.getElementById("ocrProcessing");
    if (processing) processing.style.display = "none";
}

/**
 * Render extracted medicines list with editable fields - Phase 6
 * @param {object[]} extracted - Array of medicine objects
 */
function renderExtractedList(extracted) {
    const container = document.getElementById("extractedList");
    if (!container) return;
    if (!extracted || extracted.length === 0) {
        container.innerHTML = '<p style="color:var(--gray-500);text-align:center;">No medicines extracted</p>';
        return;
    }
    let html = "";
    extracted.forEach((med, idx) => {
        // Time string for input: first time if multiple, plus comma separated for additional
        const primaryTime = med.times[0] || "08:00";
        const additionalTimes = med.times.slice(1).join(", ");
        html += `
            <div class="extracted-item" data-idx="${idx}">
                <div class="extracted-item-header">
                    <h5>💊 ${escapeHtml(med.name)}</h5>
                    <span class="badge badge-info">${escapeHtml(med.language)}</span>
                </div>
                <div class="extracted-fields">
                    <div>
                        <label>Medicine Name</label>
                        <input type="text" class="ex-name" value="${escapeHtml(med.name)}" placeholder="Medicine name">
                    </div>
                    <div>
                        <label>Dosage</label>
                        <input type="text" class="ex-dosage" value="${escapeHtml(med.dosage)}" placeholder="1 tablet">
                    </div>
                    <div>
                        <label>Time</label>
                        <input type="time" class="ex-time" value="${primaryTime}">
                    </div>
                    <div>
                        <label>Additional Times</label>
                        <input type="text" class="ex-times" value="${escapeHtml(additionalTimes)}" placeholder="14:00, 20:00">
                    </div>
                    <div>
                        <label>Language</label>
                        <select class="ex-language">
                            <option value="en-US" ${med.language === "en-US" ? "selected" : ""}>English (en-US)</option>
                            <option value="hi-IN" ${med.language === "hi-IN" ? "selected" : ""}>हिन्दी (hi-IN)</option>
                            <option value="kn-IN" ${med.language === "kn-IN" ? "selected" : ""}>ಕನ್ನಡ (kn-IN)</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:flex-end; gap:6px;">
                        <button type="button" class="btn btn-outline btn-sm ex-remove" data-idx="${idx}" style="width:100%;">✕ Remove</button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;

    // Bind remove buttons
    container.querySelectorAll(".ex-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            if (!isNaN(idx)) {
                currentExtracted.splice(idx, 1);
                renderExtractedList(currentExtracted);
                showToast("Removed extracted medicine", "info");
                if (currentExtracted.length === 0) {
                    const results = document.getElementById("ocrResults");
                    if (results) results.style.display = "none";
                }
            }
        });
    });
}

/**
 * Show OCR results - Phase 6
 * @param {object[]} extracted - Extracted medicines
 */
function showOCRResults(extracted) {
    hideOCRProcessing();
    const results = document.getElementById("ocrResults");
    if (!results) return;
    currentExtracted = extracted;
    renderExtractedList(extracted);
    results.style.display = "block";
    // Scroll into view (guard for mock)
    if (results.scrollIntoView) results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Handle Analyze button click - Phase 6
 * Simulates OCR processing delay then shows results
 */
function handleAnalyze() {
    if (!currentUploadFile) {
        showToast("No file to analyze. Upload an image first.", "error");
        return;
    }
    showOCRProcessing();
    // Simulate processing delay 1200ms (mock OCR)
    setTimeout(() => {
        try {
            const extracted = mockOCRExtract(currentUploadFile.name);
            showOCRResults(extracted);
            showToast(`🔍 Mock OCR extracted ${extracted.length} medicine(s)`, "success");
            console.log("Mock OCR for", currentUploadFile.name, "->", extracted);
        } catch (e) {
            hideOCRProcessing();
            showToast("OCR failed: " + e.message, "error");
        }
    }, 1200);
}

/**
 * Handle adding all extracted medicines to schedule - Phase 7: Backend API (async)
 */
async function handleAddExtracted() {
    if (!currentExtracted || currentExtracted.length === 0) {
        showToast("No extracted medicines to add", "error");
        return;
    }
    const container = document.getElementById("extractedList");
    if (!container) return;
    const items = container.querySelectorAll(".extracted-item");
    let addedCount = 0;
    let failed = [];
    // Collect edited data first
    const toAdd = [];
    items.forEach((item) => {
        const idx = parseInt(item.dataset.idx, 10);
        const name = item.querySelector(".ex-name") ? item.querySelector(".ex-name").value.trim() : "";
        const dosage = item.querySelector(".ex-dosage") ? item.querySelector(".ex-dosage").value.trim() : "";
        const time = item.querySelector(".ex-time") ? item.querySelector(".ex-time").value.trim() : "";
        const timesExtra = item.querySelector(".ex-times") ? item.querySelector(".ex-times").value.trim() : "";
        const language = item.querySelector(".ex-language") ? item.querySelector(".ex-language").value : "en-US";
        if (!name || !dosage || !time) {
            failed.push(name || `Item ${idx}`);
            return;
        }
        let times = [time];
        if (timesExtra) {
            const extra = timesExtra.split(",").map((t) => t.trim()).filter(Boolean).map((t) => {
                if (/^\d{1,2}:\d{2}$/.test(t)) {
                    const [h, m] = t.split(":").map(Number);
                    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                }
                return t;
            });
            times = times.concat(extra);
        }
        toAdd.push({ name, dosage, times, language });
    });

    // Add via backend API (sequentially to preserve order)
    for (const med of toAdd) {
        try {
            await addMedicine(med.name, med.dosage, med.times, med.language);
            addedCount++;
        } catch (e) {
            failed.push(`${med.name}: ${e.message}`);
        }
    }

    if (addedCount > 0) {
        // Save to backend upload history (async)
        try {
            await saveUploadHistory(currentUploadFile ? currentUploadFile.name : "unknown", currentExtracted);
        } catch (e) {
            console.warn("Failed to save upload history to backend", e);
        }
        // Re-render (medicines already updated via addMedicine)
        renderAll();
        showToast(`✅ Added ${addedCount} medicine(s) to schedule`, "success");
        const results = document.getElementById("ocrResults");
        if (results) results.style.display = "none";
        currentExtracted = [];
        // Refresh history UI from backend
        try { await loadUploadHistory(); } catch (e) {}
        updateUploadHistoryUI();
        if (failed.length > 0) {
            showToast(`Failed: ${failed.join(", ")}`, "error");
        }
    } else {
        showToast(`Failed to add: ${failed.join(", ")}`, "error");
    }
}

/**
 * Handle editing first extracted medicine in main form - Phase 6
 * Pre-populates the main Add Medicine form with first extracted
 */
function handleEditFirst() {
    if (!currentExtracted || currentExtracted.length === 0) {
        showToast("No extracted medicines", "error");
        return;
    }
    const container = document.getElementById("extractedList");
    if (!container) return;
    const firstItem = container.querySelector(".extracted-item");
    if (!firstItem) return;
    const name = firstItem.querySelector(".ex-name") ? firstItem.querySelector(".ex-name").value.trim() : "";
    const dosage = firstItem.querySelector(".ex-dosage") ? firstItem.querySelector(".ex-dosage").value.trim() : "";
    const time = firstItem.querySelector(".ex-time") ? firstItem.querySelector(".ex-time").value.trim() : "";
    const timesExtra = firstItem.querySelector(".ex-times") ? firstItem.querySelector(".ex-times").value.trim() : "";
    const language = firstItem.querySelector(".ex-language") ? firstItem.querySelector(".ex-language").value : "en-US";

    const nameEl = document.getElementById("medicineName");
    const dosageEl = document.getElementById("medicineDosage");
    const timeEl = document.getElementById("medicineTime");
    const timesEl = document.getElementById("medicineTimes");
    const langEl = document.getElementById("medicineLanguage");
    if (nameEl) nameEl.value = name;
    if (dosageEl) dosageEl.value = dosage;
    if (timeEl) timeEl.value = time;
    if (timesEl) timesEl.value = timesExtra;
    if (langEl) langEl.value = language;

    // Scroll to form (guard for mock/testing environments)
    const formSection = document.getElementById("addMedicineForm");
    if (formSection && formSection.scrollIntoView) formSection.scrollIntoView({ behavior: "smooth", block: "center" });
    if (nameEl && nameEl.focus) nameEl.focus();
    showToast(`✏️ Pre-filled form with ${name}`, "info");
}

/**
 * Save upload history - Phase 7: Backend API (async) with localStorage fallback
 * @param {string} filename - Uploaded filename
 * @param {object[]} extracted - Extracted medicines
 */
async function saveUploadHistory(filename, extracted) {
    const entryData = {
        filename: filename || "prescription.jpg",
        extracted_medicines: extracted ? extracted.map((m) => ({ name: m.name, dosage: m.dosage, times: m.times, language: m.language })) : [],
        thumbnail: currentPreviewDataUrl || "",
        medicines: extracted ? extracted.map((m) => ({ name: m.name, dosage: m.dosage, times: m.times, language: m.language })) : [],
    };

    // Try backend first
    if (useBackend) {
        try {
            const saved = await apiRequest("/uploads", "POST", {
                filename: entryData.filename,
                extracted_medicines: entryData.extracted_medicines,
                thumbnail: entryData.thumbnail,
            });
            // Backend returns saved record; update local array from backend fetch
            // Instead of pushing locally, re-fetch to ensure consistency
            await loadUploadHistory();
            return;
        } catch (e) {
            console.warn("Backend saveUploadHistory failed, falling back to local", e);
        }
    }

    try {
        const entry = {
            id: Date.now(),
            filename: entryData.filename,
            date: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
            isoDate: new Date().toISOString(),
            upload_date: new Date().toISOString(),
            thumbnail: entryData.thumbnail,
            medicines: entryData.medicines,
            extracted_medicines: entryData.extracted_medicines,
        };
        uploadHistory.unshift(entry);
        if (uploadHistory.length > 10) uploadHistory = uploadHistory.slice(0, 10);
        localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(uploadHistory));
    } catch (e) {
        console.error("Failed to save upload history", e);
    }
}

/**
 * Load upload history - Phase 7: Backend API (async) with localStorage fallback
 */
async function loadUploadHistory() {
    if (useBackend) {
        try {
            const data = await apiRequest("/uploads?limit=10", "GET");
            if (Array.isArray(data)) {
                // Normalize backend response to frontend format
                uploadHistory = data.map((r) => ({
                    id: r.id,
                    filename: r.filename,
                    date: r.upload_date || r.date || r.uploadDate,
                    upload_date: r.upload_date,
                    thumbnail: r.thumbnail || "",
                    medicines: r.extracted_medicines || r.medicines || [],
                    extracted_medicines: r.extracted_medicines || r.medicines || [],
                }));
                return;
            }
        } catch (e) {
            console.warn("Backend loadUploadHistory failed, falling back to local", e);
        }
    }

    try {
        const stored = localStorage.getItem(UPLOAD_HISTORY_KEY);
        if (stored) {
            uploadHistory = JSON.parse(stored);
            if (!Array.isArray(uploadHistory)) uploadHistory = [];
        } else {
            uploadHistory = [];
        }
    } catch (e) {
        console.error("Failed to load upload history", e);
        uploadHistory = [];
    }
}

/**
 * Update upload history UI - Phase 6
 */
function updateUploadHistoryUI() {
    const container = document.getElementById("uploadHistoryList");
    if (!container) return;
    if (!uploadHistory || uploadHistory.length === 0) {
        container.innerHTML = '<p class="empty-history" style="color:var(--gray-500); font-size:0.85rem; text-align:center; padding:8px;">No uploads yet — history saved offline in localStorage</p>';
        return;
    }
    let html = "";
    uploadHistory.forEach((entry) => {
        const medsText = entry.medicines.map((m) => `${m.name} (${m.dosage})`).join(", ") || "No medicines";
        const thumb = entry.thumbnail ? `<img src="${entry.thumbnail}" alt="thumb" class="upload-history-thumb">` : `<div class="upload-history-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📄</div>`;
        html += `
            <div class="upload-history-item">
                ${thumb}
                <div class="upload-history-info">
                    <strong title="${escapeHtml(entry.filename)}">${escapeHtml(entry.filename)}</strong>
                    <small>${escapeHtml(entry.date)}</small>
                    <div class="upload-history-meds">${escapeHtml(medsText)}</div>
                </div>
                <span class="badge badge-info">${entry.medicines.length} meds</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

/**
 * Handle file selection (from input or drop) - Phase 6
 * @param {File} file - Selected file
 */
function handleFile(file) {
    const err = validateFile(file);
    if (err) {
        showToast(err, "error");
        return;
    }
    showPreview(file);
    showToast(`📄 Selected: ${file.name} (${(file.size/1024).toFixed(1)}KB)`, "info");
}

/**
 * Initialize upload functionality - Phase 7: Backend API (async)
 */
async function initUpload() {
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("prescriptionFile");
    const browseBtn = document.getElementById("browseBtn");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const clearUploadBtn = document.getElementById("clearUploadBtn");
    const addExtractedBtn = document.getElementById("addExtractedBtn");
    const editExtractedBtn = document.getElementById("editExtractedBtn");
    const discardOcrBtn = document.getElementById("discardOcrBtn");
    const clearHistoryBtn = document.getElementById("clearHistoryBtn");

    // Load and render history - Phase 7 tries backend first
    await loadUploadHistory();
    updateUploadHistoryUI();

    if (!dropZone || !fileInput) {
        console.warn("Upload elements not found");
        return;
    }

    // Browse button -> trigger file input
    if (browseBtn) {
        browseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    // Drop zone click -> open file picker (unless clicking browse)
    dropZone.addEventListener("click", (e) => {
        if (e.target.closest("#browseBtn")) return;
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleFile(file);
    });

    // Drag & drop events
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        // Only remove if leaving the dropZone itself
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove("dragover");
        }
    });
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
            // Also update file input for consistency (though not required)
            try {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInput.files = dt.files;
            } catch (err) {}
            handleFile(file);
        } else {
            showToast("No file dropped", "error");
        }
    });

    // Analyze button
    if (analyzeBtn) analyzeBtn.addEventListener("click", handleAnalyze);

    // Clear upload
    if (clearUploadBtn) clearUploadBtn.addEventListener("click", () => {
        clearUpload();
        showToast("Cleared upload", "info");
    });

    // Add extracted
    if (addExtractedBtn) addExtractedBtn.addEventListener("click", handleAddExtracted);

    // Edit first
    if (editExtractedBtn) editExtractedBtn.addEventListener("click", handleEditFirst);

    // Discard OCR results
    if (discardOcrBtn) discardOcrBtn.addEventListener("click", () => {
        const results = document.getElementById("ocrResults");
        if (results) results.style.display = "none";
        currentExtracted = [];
        showToast("Discarded OCR results", "info");
    });

    // Clear history - Phase 8: also clear backend via /api/uploads/clear if online
    if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", async () => {
        if (confirm("Clear all upload history?")) {
            uploadHistory = [];
            try { localStorage.removeItem(UPLOAD_HISTORY_KEY); } catch (e) {}
            // Phase 8: try backend clear for SQLite persistence
            if (useBackend && navigator.onLine) {
                try { await apiRequest("/uploads/clear", "DELETE"); } catch (e) { console.warn("Backend clear history failed", e); }
            }
            updateUploadHistoryUI();
            showToast("Upload history cleared", "info");
        }
    });

    console.log("Upload initialized - Phase 6: drag & drop, preview, mock OCR, history (Phase 8 backend-aware)");
}

// ==================== PHASE 8: DEMO POLISH, OFFLINE, DARK MODE, QUICK ACTIONS ====================
// All offline, no new backend dependencies, just polish for 3-5 min demo

/**
 * Initialize demo mode - Phase 8
 * - Load Demo Data (one click, 3 meds all languages)
 * - Reset Demo (clear all)
 * - Auto Demo Flow
 */
function initDemoMode() {
    const loadBtn = document.getElementById("loadDemoBtn");
    const resetBtn = document.getElementById("resetDemoBtn");
    const autoBtn = document.getElementById("autoDemoBtn");
    const modalLoadBtn = document.getElementById("modalLoadDemoBtn");
    const startAutoBtn = document.getElementById("startAutoDemoBtn");

    if (loadBtn) loadBtn.addEventListener("click", async () => {
        showLoading("Loading demo data...");
        try {
            // Phase 8: Prefer backend one-click endpoint /api/demo/load for instant demo
            if (useBackend && navigator.onLine) {
                try {
                    const res = await apiRequest("/demo/load", "POST");
                    // Reload medicines from backend after demo load
                    await loadFromLocalStorage();
                    renderAll();
                    showToast(`🚀 Demo data loaded via API (${res.count || 3} medicines)`, "success");
                    highlightDemo(document.getElementById("scheduleDisplay"));
                    return;
                } catch (apiErr) {
                    console.warn("Demo API load failed, fallback to local", apiErr);
                }
            }
            // Fallback local (offline or API down)
            await loadSampleMedicines();
            showToast("🚀 Demo data loaded - 3 medicines ready!", "success");
            highlightDemo(document.getElementById("scheduleDisplay"));
        } catch (e) {
            // User-friendly error with offline hint
            const msg = !navigator.onLine ? "Offline - demo loaded locally" : "Failed to load demo: " + e.message;
            showToast(msg, navigator.onLine ? "error" : "info");
        } finally {
            hideLoading();
        }
    });

    if (modalLoadBtn) modalLoadBtn.addEventListener("click", async () => {
        closeDemoModal();
        const lb = document.getElementById("loadDemoBtn");
        if (lb) lb.click();
    });

    if (resetBtn) resetBtn.addEventListener("click", async () => {
        if (!confirm("Reset demo? This will delete all medicines and upload history (backend + local).")) return;
        showLoading("Resetting demo...");
        try {
            // Phase 8: Prefer backend one-click reset /api/demo/reset
            if (useBackend && navigator.onLine) {
                try {
                    await apiRequest("/demo/reset", "POST");
                    // Also try clear uploads
                    try { await apiRequest("/uploads/clear", "DELETE"); } catch (e) {}
                    // Reset local state
                    medicines = [];
                    nextId = 1;
                    uploadHistory = [];
                    try { localStorage.removeItem(UPLOAD_HISTORY_KEY); } catch (e) {}
                    await loadFromLocalStorage(); // will fetch empty from backend
                    updateUploadHistoryUI();
                    renderAll();
                    showToast("🔄 Demo reset via API - all cleared", "success");
                    return;
                } catch (apiErr) {
                    console.warn("Demo API reset failed, fallback to per-medicine", apiErr);
                }
            }
            // Fallback: delete each medicine individually (offline or API down)
            const medsToDelete = [...medicines];
            for (const m of medsToDelete) {
                try {
                    if (useBackend && navigator.onLine) await apiRequest(`/medicines/${m.id}`, "DELETE");
                    else await deleteMedicine(m.id);
                } catch (e) {
                    try { await deleteMedicine(m.id); } catch (err) {}
                }
            }
            // Clear upload history locally + try backend clear
            uploadHistory = [];
            try { localStorage.removeItem(UPLOAD_HISTORY_KEY); } catch (e) {}
            if (useBackend && navigator.onLine) {
                try { await apiRequest("/uploads/clear", "DELETE"); } catch (e) {}
            }
            medicines = [];
            nextId = 1;
            await saveToLocalStorage();
            await loadUploadHistory();
            updateUploadHistoryUI();
            renderAll();
            showToast("🔄 Demo reset - all cleared", "info");
        } catch (e) {
            showToast("Reset failed: " + e.message, "error");
        } finally {
            hideLoading();
        }
    });

    if (autoBtn) autoBtn.addEventListener("click", () => autoDemoFlow());
    if (startAutoBtn) startAutoBtn.addEventListener("click", () => {
        closeDemoModal();
        autoDemoFlow();
    });
}

/**
 * Auto demo flow - Phase 8
 * Plays a 3-5 min scripted demo with toasts, highlights, TTS
 */
async function autoDemoFlow() {
    showToast("▶️ Auto demo starting in 2s...", "info");
    await new Promise(r => setTimeout(r, 2000));

    // Step 1: Load demo if empty
    if (medicines.length === 0) {
        showToast("Step 1/5: Loading demo data...", "info");
        await loadSampleMedicines();
        await new Promise(r => setTimeout(r, 1500));
    }

    // Step 2: Highlight schedule and next dose
    showToast("Step 2/5: Today's schedule & next dose", "info");
    highlightDemo(document.getElementById("scheduleDisplay"));
    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Test speaker for first pending (kn-IN)
    const pendingMed = medicines.find(m => m.times.some(t => getStatus(m,t)==="pending") && m.language==="kn-IN") || medicines.find(m => m.times.some(t => getStatus(m,t)==="pending"));
    if (pendingMed) {
        showToast(`Step 3/5: Speaking ${pendingMed.name} in ${pendingMed.language}`, "info");
        highlightDemo(document.getElementById("speakerTest"));
        const t = pendingMed.times.find(t => getStatus(pendingMed,t)==="pending") || pendingMed.times[0];
        await new Promise(resolve => {
            speakReminder(pendingMed, t, () => resolve());
            // Fallback if TTS not available
            setTimeout(resolve, 3000);
        });
        await new Promise(r => setTimeout(r, 1000));
    }

    // Step 4: Trigger Due Now + Buzzer
    showToast("Step 4/5: Simulating Due Now (fast LED + buzzer)", "info");
    highlightDemo(document.getElementById("ledSimulation"));
    highlightDemo(document.getElementById("buzzerSimulation"));
    triggerDueNowTest();
    await new Promise(r => setTimeout(r, 2500));

    // Step 5: Mark one as taken + show compliance
    const dueMed = medicines.find(m => m.times.some(t => isMedicineDueNow(m,t)));
    if (dueMed) {
        const dt = dueMed.times.find(t => isMedicineDueNow(dueMed,t));
        showToast(`Step 5/5: Marking ${dueMed.name} as taken`, "info");
        await confirmTaken(dueMed.id, dt);
        await new Promise(r => setTimeout(r, 1000));
        highlightDemo(document.getElementById("caregiverView"));
        showToast("✅ Demo complete! Compliance updated", "success");
    } else {
        showToast("✅ Demo complete! Check compliance dashboard", "success");
    }
}

/**
 * Highlight element for demo - Phase 8
 */
function highlightDemo(el) {
    if (!el) return;
    el.classList.add("demo-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.classList.remove("demo-highlight"), 2500);
}

/**
 * Initialize quick actions - Phase 8
 */
function initQuickActions() {
    const markAllBtn = document.getElementById("quickMarkAllBtn");
    const speakAllBtn = document.getElementById("quickSpeakAllBtn");
    const buzzerBtn = document.getElementById("quickBuzzerBtn");
    const statsBtn = document.getElementById("quickStatsBtn");

    if (markAllBtn) markAllBtn.addEventListener("click", async () => {
        const pending = [];
        medicines.forEach(m => m.times.forEach(t => {
            if (getStatus(m,t)==="pending") pending.push({med:m, time:t});
        }));
        if (pending.length===0) {
            showToast("No pending to mark", "info");
            return;
        }
        showLoading(`Marking ${pending.length} pending...`);
        for (const p of pending) {
            try { await confirmTaken(p.med.id, p.time); } catch(e){}
            await new Promise(r=> setTimeout(r, 200));
        }
        hideLoading();
        showToast(`✅ Marked ${pending.length} as taken`, "success");
    });

    // quickSpeakAllBtn reuses existing speakAllBtn handler via initTTS, but also add here
    if (speakAllBtn) speakAllBtn.addEventListener("click", () => {
        // Call the existing TTS speakAllPending (from Phase 4)
        if (typeof speakAllPending === "function") speakAllPending();
        else showToast("Speak not available", "error");
    });

    if (buzzerBtn) buzzerBtn.addEventListener("click", () => {
        triggerBuzzerTest();
    });

    if (statsBtn) statsBtn.addEventListener("click", () => {
        const el = document.getElementById("caregiverView");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightDemo(el);
        // Also refresh stats from backend if available
        if (useBackend) {
            apiRequest("/stats", "GET").then(s => {
                showToast(`📊 Compliance: ${s.compliance}% (${s.taken}/${s.total})`, "info");
            }).catch(()=>{});
        }
    });
}

/**
 * Update quick summary (compliance + next dose) - Phase 8
 */
function updateQuickSummary() {
    const compEl = document.getElementById("quickCompliance");
    const nextEl = document.getElementById("quickNext");
    if (!compEl || !nextEl) return;

    // Compute from medicines (same as updateStats)
    let taken=0, pending=0, missed=0;
    medicines.forEach(m=> m.times.forEach(t=>{
        const s=getStatus(m,t);
        if(s==="taken") taken++;
        else if(s==="pending") pending++;
        else missed++;
    }));
    const total=taken+pending+missed;
    const comp = total? Math.round(taken/total*100):0;
    compEl.textContent = `Compliance: ${comp}% (${taken}/${total})`;

    // Next dose
    const nowMin=timeToMinutes(getCurrentTime());
    let next=null, minDiff=Infinity;
    medicines.forEach(m=> m.times.forEach(t=>{
        if(getStatus(m,t)==="pending"){
            const diff=timeToMinutes(t)-nowMin;
            if(diff>=0 && diff<minDiff){ minDiff=diff; next={med:m,time:t}; }
        }
    }));
    if(next) nextEl.textContent = `Next: ${next.med.name} at ${formatTime(next.time)} (${getRelativeTime(next.time)})`;
    else if(missed>0) nextEl.textContent = `Overdue: ${missed} missed`;
    else if(taken===total && total>0) nextEl.textContent = `All done! 🎉`;
    else nextEl.textContent = `Next: --`;
}

/**
 * Initialize offline detection - Phase 8
 */
function initOfflineDetection() {
    const badge = document.getElementById("offlineBadge");
    const footerOffline = document.getElementById("footerOffline");
    const indicator = document.getElementById("offlineIndicator");

    function updateOffline() {
        const isOnline = navigator.onLine;
        if (badge) {
            badge.textContent = isOnline ? "● Online" : "● Offline";
            badge.className = isOnline ? "badge badge-success" : "badge badge-danger";
        }
        if (footerOffline) {
            footerOffline.textContent = isOnline ? "● Online" : "● Offline";
            footerOffline.style.color = isOnline ? "var(--green-dark)" : "var(--red-dark)";
        }
        if (indicator) {
            indicator.style.display = isOnline ? "none" : "block";
        }
        if (!isOnline) {
            showToast("📡 Offline - using local cache (SQLite fallback)", "info");
        }
        updateApiStatus(isOnline);
    }

    window.addEventListener("online", updateOffline);
    window.addEventListener("offline", updateOffline);
    // Initial check
    updateOffline();
}

/**
 * Initialize dark mode - Phase 8
 */
function initDarkMode() {
    const toggle = document.getElementById("darkModeToggle");
    if (!toggle) return;

    // Load saved theme
    try {
        const saved = localStorage.getItem("theme");
        if (saved === "dark") {
            document.documentElement.setAttribute("data-theme", "dark");
            toggle.textContent = "☀️ Light";
        }
    } catch(e){}

    toggle.addEventListener("click", () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        if (isDark) {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem("theme", "light");
            toggle.textContent = "🌙 Dark";
            showToast("☀️ Light mode", "info");
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            localStorage.setItem("theme", "dark");
            toggle.textContent = "☀️ Light";
            showToast("🌙 Dark mode", "info");
        }
    });
}

/**
 * Initialize demo modal - Phase 8
 */
function initDemoModal() {
    const helpBtn = document.getElementById("demoHelpBtn");
    const footerLink = document.getElementById("footerDemoLink");
    const modal = document.getElementById("demoModal");
    const overlay = document.getElementById("modalOverlay");
    const closeBtn = document.getElementById("closeDemoModal");

    function openModal() {
        if (modal) modal.style.display = "flex";
        if (overlay) overlay.style.display = "block";
        document.body.style.overflow = "hidden";
    }
    function closeModal() {
        if (modal) modal.style.display = "none";
        if (overlay) overlay.style.display = "none";
        document.body.style.overflow = "";
    }
    window.openDemoModal = openModal;
    window.closeDemoModal = closeModal;

    if (helpBtn) helpBtn.addEventListener("click", openModal);
    if (footerLink) footerLink.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) overlay.addEventListener("click", closeModal);
    // Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal && modal.style.display !== "none") closeModal();
    });
}

// ==================== FORM HANDLING ====================

/**
 * Handle add medicine form submission - Phase 7: Backend API (async)
 * Validates, parses times, calls addMedicine (async), re-renders, shows toast
 */
async function handleAddMedicine(event) {
    if (event) event.preventDefault();

    const nameEl = document.getElementById("medicineName");
    const dosageEl = document.getElementById("medicineDosage");
    const timeEl = document.getElementById("medicineTime");
    const languageEl = document.getElementById("medicineLanguage");
    const timesEl = document.getElementById("medicineTimes");

    const name = nameEl ? nameEl.value.trim() : "";
    const dosage = dosageEl ? dosageEl.value.trim() : "";
    const primaryTime = timeEl ? timeEl.value.trim() : "";
    const language = languageEl ? languageEl.value : "en-US";
    let additionalTimesRaw = timesEl ? timesEl.value.trim() : "";

    // Basic validation
    if (!name) {
        showToast("Please enter medicine name", "error");
        if (nameEl) nameEl.focus();
        return false;
    }
    if (!dosage) {
        showToast("Please enter dosage", "error");
        if (dosageEl) dosageEl.focus();
        return false;
    }
    if (!primaryTime) {
        showToast("Please select a time", "error");
        if (timeEl) timeEl.focus();
        return false;
    }

    // Build times array: primary + additional comma-separated
    let times = [primaryTime];
    if (additionalTimesRaw) {
        // Split by comma, trim, filter empty
        const extra = additionalTimesRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => {
                // Allow "2pm", "14:00", "9:00"? Normalize to HH:MM if possible, but require HH:MM per spec
                // If user enters "2:00 PM", try to parse; fallback to requiring HH:MM
                if (/^\d{1,2}:\d{2}$/.test(t)) {
                    const [h, m] = t.split(":").map(Number);
                    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                }
                return t;
            });
        times = times.concat(extra);
    }

    try {
        const newMed = await addMedicine(name, dosage, times, language);
        renderAll();
        showToast(`✅ Added ${newMed.name} at ${newMed.times.map(formatTime).join(", ")}`, "success");

        // Reset form but keep default time
        if (nameEl) nameEl.value = "";
        if (dosageEl) dosageEl.value = "";
        if (timesEl) timesEl.value = "";
        // Keep time at 08:00 or next suggestion
        if (nameEl) nameEl.focus();
    } catch (err) {
        showToast(err.message, "error");
    }

    return false; // Prevent default form submission
}

/**
 * Handle delete medicine button click - Phase 7: Backend API (async)
 * @param {number} id - Medicine id
 */
async function handleDeleteMedicine(id) {
    const med = getMedicine(id);
    if (!med) {
        showToast("Medicine not found", "error");
        return;
    }
    if (confirm(`Delete ${med.name} (${med.dosage})? This cannot be undone.`)) {
        try {
            await deleteMedicine(id);
            renderAll();
            showToast(`🗑️ Deleted ${med.name}`, "info");
        } catch (err) {
            showToast(err.message, "error");
        }
    }
}

/**
 * Set current filter and re-render - Phase 3
 * @param {string} filter - 'today'|'all'|'pending'|'taken'|'missed'
 */
function setFilter(filter) {
    if (!["today", "all", "pending", "taken", "missed"].includes(filter)) return;
    currentFilter = filter;
    saveToLocalStorage();
    renderAll();
    showToast(`Filter: ${filter}`, "info");
}

// Expose setFilter for inline HTML onclick
window.setFilter = setFilter;

// ==================== SAMPLE DATA ====================

/**
 * Load sample medicines for testing (call from console: loadSampleMedicines())
 * Populates 3 demo medicines covering all languages and multi-time case
 * Phase 7: Uses backend API if available, with fallback to local
 */
async function loadSampleMedicines() {
    const samples = [
        {
            name: "Metformin",
            dosage: "1 tablet",
            times: ["08:00", "20:00"],
            language: "en-US",
        },
        {
            name: "Dolo 650",
            dosage: "1 tablet",
            times: ["14:00"],
            language: "kn-IN",
        },
        {
            name: "Vitamin D3",
            dosage: "1 capsule",
            times: ["09:00"],
            language: "hi-IN",
        },
    ];

    // Try backend first
    if (useBackend) {
        try {
            // Clear existing medicines via API (fetch current and delete each)
            const existing = await apiRequest("/medicines", "GET");
            if (Array.isArray(existing) && existing.length > 0) {
                for (const m of existing) {
                    try {
                        await apiRequest(`/medicines/${m.id}`, "DELETE");
                    } catch (e) {
                        console.warn("Failed to delete during sample load", m.id, e);
                    }
                }
            }
            // Add samples via API
            for (const s of samples) {
                await apiRequest("/medicines", "POST", {
                    name: s.name,
                    dosage: s.dosage,
                    times: s.times,
                    language: s.language,
                    date_added: getTodayDate(),
                });
            }
            // Reload from backend
            await loadFromLocalStorage();
            renderAll();
            showToast("✅ Sample medicines loaded (backend)", "success");
            console.log("Sample medicines loaded via backend. Total:", medicines.length);
            return;
        } catch (e) {
            console.warn("Backend sample load failed, falling back to local", e);
        }
    }

    // Fallback local (Phase 2-6)
    medicines = samples.map((s, idx) => ({
        id: idx + 1,
        name: s.name,
        dosage: s.dosage,
        times: s.times,
        language: s.language,
        takenToday: Object.fromEntries(s.times.map((t) => [t, false])),
        dateAdded: getTodayDate(),
        date_added: getTodayDate(),
    }));
    nextId = medicines.length + 1;
    await saveToLocalStorage();
    renderAll();
    showToast("✅ Sample medicines loaded (local)", "success");
    console.log("Sample medicines loaded. Total:", medicines.length);
}

// Expose for console testing (required by spec)
window.loadSampleMedicines = loadSampleMedicines;

// ==================== EVENT HANDLERS (on page load) ====================

/**
 * Initialize app after DOM is ready
 * - Load from localStorage
 * - Render all sections
 * - Set up form and delegated event listeners
 * - Start auto-update timer
 */
document.addEventListener("DOMContentLoaded", async () => {
    // Load persisted data - Phase 7: try backend API first, fallback to localStorage
    await loadFromLocalStorage();

    // Initial render
    renderAll();

    // Set up form submit handler (Phase 7: async backend)
    const form = document.getElementById("medicineForm");
    if (form) {
        form.addEventListener("submit", async (e) => {
            await handleAddMedicine(e);
        });
    }

    // Also handle button click explicitly (in case form submit not triggered)
    const addBtn = document.getElementById("addMedicineBtn");
    if (addBtn) {
        addBtn.addEventListener("click", async (e) => {
            await handleAddMedicine(e);
        });
    }

    // Event delegation for schedule: delete, confirm, and test speaker buttons - Phase 7: async backend
    const scheduleList = document.getElementById("scheduleList");
    if (scheduleList) {
        scheduleList.addEventListener("click", async (e) => {
            // Delete button: .delete-btn with data-id
            const deleteBtn = e.target.closest(".delete-btn");
            if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id, 10);
                if (!isNaN(id)) await handleDeleteMedicine(id);
                return;
            }

            // Confirm button: .confirm-btn with data-id and data-time
            const confirmBtn = e.target.closest(".confirm-btn[data-id]");
            if (confirmBtn) {
                const id = parseInt(confirmBtn.dataset.id, 10);
                const time = confirmBtn.dataset.time;
                if (!isNaN(id) && time) {
                    await confirmTaken(id, time);
                }
                return;
            }

            // Test Speaker button per medicine card: [data-test-speaker] - Phase 4
            const speakerBtn = e.target.closest("[data-test-speaker]");
            if (speakerBtn) {
                const id = parseInt(speakerBtn.dataset.testSpeaker, 10);
                if (!isNaN(id)) {
                    const med = getMedicine(id);
                    if (med) {
                        // Speak reminder for this medicine: prefer next pending time, else first time
                        let speakTime = med.times.find((t) => getStatus(med, t) === "pending") || med.times.find((t) => getStatus(med, t) === "missed") || med.times[0];
                        // Visual feedback on button
                        speakerBtn.classList.add("speaking");
                        speakReminder(med, speakTime, (err) => {
                            speakerBtn.classList.remove("speaking");
                            if (!err) showToast(`🔊 Spoken: ${med.name} in ${med.language}`, "success");
                        });
                    }
                }
                return;
            }
        });
    }

    // Phase 3: Filter button handlers (event delegation)
    const filterContainer = document.getElementById("scheduleFilters");
    if (filterContainer) {
        filterContainer.addEventListener("click", (e) => {
            const btn = e.target.closest(".filter-btn");
            if (!btn) return;
            const filter = btn.dataset.filter;
            if (filter) setFilter(filter);
        });
    }

    // Global IoT confirm button: marks next pending dose as taken - Phase 7 async
    const confirmTakenBtn = document.getElementById("confirmTakenBtn");
    if (confirmTakenBtn) {
        confirmTakenBtn.addEventListener("click", async () => {
            // Find first pending dose across all medicines sorted by time
            let nextPending = null;
            let minMinutes = Infinity;
            medicines.forEach((med) => {
                med.times.forEach((t) => {
                    if (getStatus(med, t) === "pending") {
                        const mins = timeToMinutes(t);
                        if (mins < minMinutes) {
                            minMinutes = mins;
                            nextPending = { med, time: t };
                        }
                    }
                });
            });

            if (nextPending) {
                await confirmTaken(nextPending.med.id, nextPending.time);
            } else {
                // If no pending, try missed (allow late taken)
                let nextMissed = null;
                medicines.forEach((med) => {
                    med.times.forEach((t) => {
                        if (getStatus(med, t) === "missed" && !nextMissed) {
                            nextMissed = { med, time: t };
                        }
                    });
                });
                if (nextMissed) {
                    await confirmTaken(nextMissed.med.id, nextMissed.time);
                } else {
                    showToast("No pending doses to confirm", "info");
                }
            }
        });
    }

    // Phase 4: Initialize TTS (voices, sliders, speaker buttons)
    initTTS();

    // Phase 5: Initialize IoT controls (mute, connection, triggers)
    initIoTControls();

    // Phase 6/7: Initialize Upload (Phase 7 now uses backend API)
    await initUpload();

    // Phase 8.5: Initialize Voice Agent (simulated SLM)
    try { initVoiceAgent(); } catch (e) { console.warn("initVoiceAgent failed", e); }

    // Phase 8: Initialize polish features - demo mode, quick actions, offline, dark mode, demo modal
    // CRITICAL FIX: Previously these were defined but never called, causing demo buttons to do nothing
    try { initDemoMode(); } catch (e) { console.warn("initDemoMode failed", e); }
    try { initQuickActions(); } catch (e) { console.warn("initQuickActions failed", e); }
    try { initOfflineDetection(); } catch (e) { console.warn("initOfflineDetection failed", e); }
    try { initDarkMode(); } catch (e) { console.warn("initDarkMode failed", e); }
    try { initDemoModal(); } catch (e) { console.warn("initDemoModal failed", e); }

    // Phase 8: Accessibility - keyboard support for drop zone (Enter/Space to open file picker)
    const dropZoneEl = document.getElementById("dropZone");
    if (dropZoneEl) {
        dropZoneEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const fileInput = document.getElementById("prescriptionFile");
                if (fileInput) fileInput.click();
            }
        });
    }

    // Phase 8: Update footer version and API status check
    const footerVersion = document.getElementById("footerVersion");
    if (footerVersion) footerVersion.textContent = "v8.0.0 • " + getTodayDate();
    // Initial API status ping (health check)
    if (useBackend && navigator.onLine) {
        fetch(API_BASE + "/health").then(r => r.json()).then(d => {
            console.log("Health check:", d);
            updateApiStatus(true);
        }).catch(() => updateApiStatus(false));
    }

    // Start auto-update timer every 60 seconds (Phase 2/3 requirement) - also handles Phase 5 LED/buzzer refresh
    setInterval(autoMissUpdate, 60 * 1000);
    // Phase 8: Also update quick summary every 30s for compliance accuracy
    setInterval(() => {
        if (typeof updateQuickSummary === "function") try { updateQuickSummary(); } catch (e) {}
        updateCurrentTimeDisplay();
    }, 30 * 1000);

    console.log("Medication Reminder - Phase 8 polished. Medicines:", medicines.length, "Filter:", currentFilter, "TTS volume:", ttsVolume, "rate:", ttsRate, "BuzzerMuted:", buzzerMuted, "IoT:", iotConnected, "UploadHistory:", uploadHistory.length);
    console.log("Current time:", getCurrentTime(), "Today:", getTodayDate(), "Phase 8 ready - no console errors, 48px touch, demo one-click");
    // Friendly dev hint
    console.log("Try: loadSampleMedicines() | autoDemoFlow() | speakAllPending() | updateStats()");
});

// ==================== VOICE AGENT (SLM Simulation) - Phase 8.5 ====================
// Uses Web Speech API (SpeechRecognition) for STT, with rule-based response generation

let voiceAgentState = {
    isListening: false,
    recognition: null,
    currentTranscript: "",
};

/**
 * Initialize voice agent with Speech Recognition API
 */
function initVoiceAgent() {
    const startBtn = document.getElementById("voiceStartBtn");
    const stopBtn = document.getElementById("voiceStopBtn");
    const statusEl = document.getElementById("voiceStatus");
    const transcriptEl = document.getElementById("voiceTranscription");
    const responseEl = document.getElementById("voiceResponse");

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (statusEl) statusEl.textContent = "❌ STT not supported (use Chrome)";
        if (startBtn) startBtn.disabled = true;
        showToast("❌ Speech Recognition not supported in this browser. Use Chrome.", "error");
        return;
    }

    // Create recognition instance
    voiceAgentState.recognition = new SpeechRecognition();
    const rec = voiceAgentState.recognition;

    // Configure
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    // --- Event Handlers ---

    rec.onstart = function() {
        voiceAgentState.isListening = true;
        if (statusEl) {
            statusEl.textContent = "🎤 Listening...";
            statusEl.className = "badge badge-warning";
        }
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (transcriptEl) {
            transcriptEl.textContent = "👂 Listening... speak now!";
            transcriptEl.style.color = "var(--gray-900)";
        }
        if (responseEl) {
            responseEl.textContent = "🤖 Processing...";
            responseEl.style.color = "var(--gray-700)";
        }
        // Phase 8.5 polish: highlight container while listening
        const container = document.querySelector(".voice-agent-container");
        if (container) container.classList.add("listening");
        showToast("🎤 Listening... speak your question", "info");
    };

    rec.onend = function() {
        voiceAgentState.isListening = false;
        if (statusEl) {
            statusEl.textContent = "Idle";
            statusEl.className = "badge badge-info";
        }
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;

        if (!voiceAgentState.currentTranscript) {
            if (transcriptEl) {
                transcriptEl.textContent = "👂 I'm listening... (click Start and speak)";
                transcriptEl.style.color = "var(--gray-500)";
            }
        }
        const container = document.querySelector(".voice-agent-container");
        if (container) container.classList.remove("listening");
    };

    rec.onresult = function(event) {
        const result = event.results[0][0].transcript.trim();
        voiceAgentState.currentTranscript = result;

        if (transcriptEl) {
            transcriptEl.textContent = `🗣️ "${result}"`;
            transcriptEl.style.color = "var(--gray-900)";
        }

        processVoiceQuestion(result);
    };

    rec.onerror = function(event) {
        console.warn("Speech recognition error:", event.error);
        if (statusEl) {
            statusEl.textContent = `⚠️ Error: ${event.error}`;
            statusEl.className = "badge badge-danger";
        }
        if (transcriptEl) {
            transcriptEl.textContent = `❌ Error: ${event.error}. Try again.`;
            transcriptEl.style.color = "var(--red)";
        }
        showToast(`⚠️ Speech error: ${event.error}`, "error");
        voiceAgentState.isListening = false;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        const cont = document.querySelector(".voice-agent-container");
        if (cont) cont.classList.remove("listening");
    };

    // --- Button Handlers ---

    if (startBtn) {
        startBtn.addEventListener("click", function() {
            try {
                voiceAgentState.currentTranscript = "";
                rec.start();
            } catch (e) {
                console.warn("Could not start recognition:", e);
                showToast("Could not start listening. Try again.", "error");
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener("click", function() {
            try {
                rec.stop();
            } catch (e) {
                console.warn("Could not stop recognition:", e);
            }
        });
    }

    // --- Example Question Buttons ---

    document.querySelectorAll(".voice-example-btn").forEach((btn) => {
        btn.addEventListener("click", function() {
            const question = this.dataset.question;
            if (!question) return;
            if (transcriptEl) {
                transcriptEl.textContent = `🗣️ "${question}" (simulated)`;
                transcriptEl.style.color = "var(--gray-900)";
            }
            processVoiceQuestion(question);
        });
    });

    // --- Key shortcut: Space to start/stop ---
    document.addEventListener("keydown", function(e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.key === " " || e.key === "Space") {
            e.preventDefault();
            if (voiceAgentState.isListening) {
                if (stopBtn) stopBtn.click();
            } else {
                if (startBtn) startBtn.click();
            }
        }
    });

    console.log("Voice Agent initialized (simulated SLM)");
}

/**
 * Process voice question - Simulated SLM with rule-based response
 * @param {string} question - The transcribed question
 */
function processVoiceQuestion(question) {
    const responseEl = document.getElementById("voiceResponse");
    if (!responseEl) return;

    responseEl.textContent = "🤖 Thinking...";
    responseEl.style.color = "var(--gray-700)";

    // Build knowledge base from medicines
    let medicineInfo = [];
    let totalTaken = 0;
    let totalPending = 0;
    let totalMissed = 0;
    let allMedicines = [];

    medicines.forEach((med) => {
        med.times.forEach((t) => {
            const status = getStatus(med, t);
            allMedicines.push({ name: med.name, time: t, status, dosage: med.dosage });
            if (status === "taken") totalTaken++;
            else if (status === "pending") totalPending++;
            else if (status === "missed") totalMissed++;
        });
        const statuses = med.times.map(t => getStatus(med, t));
        medicineInfo.push({
            name: med.name,
            dosage: med.dosage,
            times: med.times,
            statuses: statuses,
            allTaken: statuses.every(s => s === "taken"),
            anyMissed: statuses.some(s => s === "missed"),
            anyPending: statuses.some(s => s === "pending"),
        });
    });

    const totalDoses = allMedicines.length;
    const compliance = totalDoses > 0 ? Math.round((totalTaken / totalDoses) * 100) : 0;

    // --- Intent matching ---
    const q = question.toLowerCase();

    let matchedMedicine = null;
    for (const med of medicineInfo) {
        if (q.includes(med.name.toLowerCase())) {
            matchedMedicine = med;
            break;
        }
    }
    if (!matchedMedicine) {
        for (const med of medicineInfo) {
            if (q.includes(med.name.slice(0, 4).toLowerCase())) {
                matchedMedicine = med;
                break;
            }
        }
    }

    // --- Generate response ---
    let response = "";

    if (matchedMedicine) {
        const med = matchedMedicine;
        const timesStr = med.times.map(t => formatTime(t)).join(", ");

        if (med.allTaken) {
            response = `✅ Yes, ${med.name} has been taken. All doses (${timesStr}) are completed. Good job Amma!`;
        } else if (med.anyMissed) {
            const missedTimes = med.times.filter((t, i) => med.statuses[i] === "missed").map(formatTime).join(", ");
            response = `⚠️ ${med.name} is missed for ${missedTimes}. Please remind Amma to take ${med.dosage}.`;
        } else if (med.anyPending) {
            const pendingTimes = med.times.filter((t, i) => med.statuses[i] === "pending").map(formatTime).join(", ");
            const nextTime = med.times.find((t, i) => med.statuses[i] === "pending");
            response = `⏳ ${med.name} is pending for ${pendingTimes}. The next dose is at ${formatTime(nextTime)}. Please remind Amma.`;
        } else {
            response = `ℹ️ ${med.name} status: ${med.allTaken ? "taken" : "pending"}. Doses: ${timesStr}.`;
        }
    } else if (q.includes("all") && (q.includes("taken") || q.includes("complete") || q.includes("done"))) {
        if (totalDoses === 0) {
            response = "ℹ️ No medicines are scheduled for today. Schedule some medicines first.";
        } else if (totalPending === 0 && totalMissed === 0 && totalTaken > 0) {
            response = `🎉 Yes! Amma has taken all ${totalTaken} doses today. Compliance: ${compliance}%. Great job Amma!`;
        } else if (totalMissed > 0) {
            response = `⚠️ Not yet. ${totalTaken} taken, ${totalPending} pending, ${totalMissed} missed. Please check missed doses.`;
        } else if (totalPending > 0) {
            response = `⏳ Not yet. ${totalTaken} taken, ${totalPending} pending. Remind Amma about pending doses.`;
        } else {
            response = `ℹ️ Today's status: ${totalTaken} taken, ${totalPending} pending, ${totalMissed} missed.`;
        }
    } else if (q.includes("miss") || q.includes("skip") || q.includes("forgot")) {
        const missedMeds = medicineInfo.filter(m => m.anyMissed);
        if (missedMeds.length === 0) {
            response = "✅ No missed doses today! Amma is on track. 🎉";
        } else {
            const missedList = missedMeds.map(m => {
                const missedTimes = m.times.filter((t, i) => m.statuses[i] === "missed").map(formatTime).join(", ");
                return `${m.name} (${missedTimes})`;
            }).join("; ");
            response = `⚠️ Missed doses found: ${missedList}. Please remind Amma.`;
        }
    } else if (q.includes("next") || q.includes("due") || q.includes("time") || q.includes("when")) {
        let next = null;
        let minDiff = Infinity;
        const nowMin = timeToMinutes(getCurrentTime());
        medicines.forEach((med) => {
            med.times.forEach((t) => {
                if (getStatus(med, t) === "pending") {
                    const diff = timeToMinutes(t) - nowMin;
                    if (diff >= 0 && diff < minDiff) {
                        minDiff = diff;
                        next = { med: med, time: t };
                    }
                }
            });
        });
        if (next) {
            response = `⏰ Next dose is ${next.med.name} at ${formatTime(next.time)} (in ${getRelativeTime(next.time)}). Please remind Amma.`;
        } else if (totalMissed > 0) {
            response = `⚠️ No pending doses, but ${totalMissed} missed doses found. Please check the missed list.`;
        } else {
            response = "🎉 All doses for today are completed! Great job Amma!";
        }
    } else if (q.includes("summary") || q.includes("status") || q.includes("today")) {
        if (totalDoses === 0) {
            response = "ℹ️ No medicines are scheduled for today. Use the form to add medicines.";
        } else {
            response = `📊 Today's summary: ${totalTaken} taken, ${totalPending} pending, ${totalMissed} missed. Compliance: ${compliance}%. ${totalPending > 0 ? "Remind Amma about pending doses." : totalMissed > 0 ? "Check missed doses." : "All done! 🎉"}`;
        }
    } else {
        if (totalDoses === 0) {
            response = "ℹ️ I don't see any medicines scheduled. Please add medicines using the form, then ask me again.";
        } else {
            response = `ℹ️ I can tell you about Amma's medicines. Try asking: "Did Amma take her Metformin?" or "What's the next dose?" or "Summary for today."`;
        }
    }

    // Display response
    responseEl.textContent = `🤖 ${response}`;
    responseEl.style.color = "var(--green-dark)";

    // Speak the response using existing TTS
    if (typeof speakCustomMessage === "function") {
        speakCustomMessage(response, "en-US", (err) => {
            if (err) console.warn("TTS error:", err);
        });
    }

    showToast(`🤖 ${response.slice(0, 80)}${response.length > 80 ? "..." : ""}`, "info");
}

// ==================== EXPORTS FOR TESTING (if needed) ====================
// Phase 8: Expose mock time helper for demo testing (optional auto-set time)
window.setMockTime = setMockTime;
window.testTime = testTime;
window.mockTimeOverride = mockTimeOverride;
// Expose core functions for console/manual testing (offline debugging)
window.medicines = medicines;
window.addMedicine = addMedicine;
window.deleteMedicine = deleteMedicine;
window.confirmTaken = confirmTaken;
window.getAllMedicines = getAllMedicines;
window.getCurrentTime = getCurrentTime;
window.formatTime = formatTime;
window.getStatus = getStatus;
window.getRelativeTime = getRelativeTime;
window.getFilteredMedicines = getFilteredMedicines;
window.getTimeSlotGroup = getTimeSlotGroup;
window.updateBrowserTitle = updateBrowserTitle;
window.updateNextDose = updateNextDose;
// Phase 4 TTS exports
window.speakReminder = speakReminder;
window.speakCustomMessage = speakCustomMessage;
window.stopSpeaking = stopSpeaking;
window.speakAllPending = speakAllPending;
window.getReminderText = getReminderText;
window.getVoiceForLanguage = getVoiceForLanguage;
// Phase 5 IoT exports
window.isDueNow = isDueNow;
window.isMedicineDueNow = isMedicineDueNow;
window.playBuzzerBeep = playBuzzerBeep;
window.setBuzzerMuted = setBuzzerMuted;
window.setIoTConnected = setIoTConnected;
window.triggerBuzzerTest = triggerBuzzerTest;
window.triggerLedTest = triggerLedTest;
window.triggerDueNowTest = triggerDueNowTest;
window.buzzerMuted = buzzerMuted;
window.iotConnected = iotConnected;
// Phase 6 Upload/OCR exports
window.validateFile = validateFile;
window.mockOCRExtract = mockOCRExtract;
window.handleFile = handleFile;
window.showPreview = showPreview;
window.clearUpload = clearUpload;
window.handleAnalyze = handleAnalyze;
window.handleAddExtracted = handleAddExtracted;
window.handleEditFirst = handleEditFirst;
window.saveUploadHistory = saveUploadHistory;
window.loadUploadHistory = loadUploadHistory;
window.updateUploadHistoryUI = updateUploadHistoryUI;
window.uploadHistory = uploadHistory;
// Phase 8 exports
window.initDemoMode = initDemoMode;
window.initQuickActions = initQuickActions;
window.initOfflineDetection = initOfflineDetection;
window.initDarkMode = initDarkMode;
window.initDemoModal = initDemoModal;
window.autoDemoFlow = autoDemoFlow;
window.highlightDemo = highlightDemo;
window.updateQuickSummary = updateQuickSummary;
window.setMockTime = setMockTime;
// Phase 8.5 Voice Agent exports
window.initVoiceAgent = initVoiceAgent;
window.processVoiceQuestion = processVoiceQuestion;
window.voiceAgentState = voiceAgentState;

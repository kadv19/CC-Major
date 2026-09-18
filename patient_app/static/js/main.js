/**
 * Patient App - Main JS
 * Vanilla JS only, handles schedule, TTS speaker, LED, buzzer, confirm, offline cache, dark mode, language
 */

let currentUser = window.__PATIENT_USER__ || null;
let medicines = [];
let dosesToday = [];

// Localized reminder templates
const REMINDER_TEMPLATES = {
    'en-US': "{name}, it is time to take {med}. Take {dos}.",
    'kn-IN': "{name}, {med} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. {dos} ತೆಗೆದುಕೊಳ್ಳಿ.",
    'hi-IN': "{name}, {med} लेने का समय है. {dos} लें."
};

const GREETINGS = {
    'en-US': 'Good day',
    'kn-IN': 'ನಮಸ್ಕಾರ',
    'hi-IN': 'नमस्ते'
};

// Helper: toast
function showToast(message, type='info'){
    const existing = document.querySelector('.toast');
    if(existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(()=>{
        toast.style.opacity='0';
        toast.style.transform='translateY(20px)';
        setTimeout(()=>toast.remove(),300);
    },3000);
}

function showLoading(text='Loading...'){
    const overlay = document.getElementById('loadingOverlay');
    if(overlay){
        const p = overlay.querySelector('p');
        if(p) p.textContent = text;
        overlay.style.display='flex';
    }
}
function hideLoading(){
    const overlay = document.getElementById('loadingOverlay');
    if(overlay) overlay.style.display='none';
}

function updateApiStatus(isOnline){
    const badge = document.getElementById('apiStatusBadge');
    if(!badge) return;
    if(isOnline){
        badge.textContent='API: Online • SQLite';
        badge.className='badge badge-success';
    } else {
        badge.textContent='API: Offline • Fallback';
        badge.className='badge badge-warning';
    }
}

// apiFetch with credentials same-origin, fallback to localStorage per patient
async function apiFetch(path, opts={}){
    const options = {credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...opts};
    // Ensure headers merge
    if(opts.headers){
        options.headers = {...options.headers, ...opts.headers};
    }
    if(options.body && typeof options.body !== 'string'){
        options.body = JSON.stringify(options.body);
    }
    try{
        const resp = await fetch(path, options);
        const data = await resp.json().catch(()=>({}));
        if(!resp.ok){
            const msg = data.error || `Request failed ${resp.status}`;
            // Do not toast for 401 here, just throw
            throw new Error(msg);
        }
        updateApiStatus(true);
        const offlineInd = document.getElementById('offlineIndicator');
        if(offlineInd) offlineInd.style.display='none';
        const offlineBadge = document.getElementById('offlineBadge');
        if(offlineBadge){ offlineBadge.textContent='● Online'; offlineBadge.className='badge badge-success';}
        return data;
    } catch(e){
        // Network error or non-2xx
        updateApiStatus(false);
        // Show toast
        showToast(e.message || 'Network error', 'error');
        // Handle offline fallback for GET medicines/doses
        if(path.includes('/api/medicines') || path.includes('/api/doses/today')){
            // Try localStorage cache
            const userId = currentUser ? currentUser.id : 'anon';
            const key = `patient_doses_${userId}`;
            try{
                const cached = localStorage.getItem(key);
                if(cached){
                    const parsed = JSON.parse(cached);
                    if(path.includes('/api/medicines') && parsed.medicines) return parsed.medicines;
                    if(path.includes('/api/doses/today') && parsed.doses) return parsed.doses;
                }
            }catch(_){}
        }
        // Show offline indicator
        const offlineInd = document.getElementById('offlineIndicator');
        if(offlineInd) offlineInd.style.display='block';
        const offlineBadge = document.getElementById('offlineBadge');
        if(offlineBadge){ offlineBadge.textContent='● Offline'; offlineBadge.className='badge badge-danger';}
        throw e;
    }
}

function cachePatientData(){
    if(!currentUser) return;
    const key = `patient_doses_${currentUser.id}`;
    try{
        localStorage.setItem(key, JSON.stringify({medicines, doses: dosesToday, ts: Date.now()}));
    }catch(e){}
}

// Time helpers
function getCurrentTime(){
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    return `${h}:${m}`;
}
function timeToMinutes(t){
    const [h,m]=t.split(':').map(Number);
    return h*60+m;
}
function formatTime(t){
    const [h,m]=t.split(':').map(Number);
    const ampm = h>=12?'PM':'AM';
    const h12 = h%12||12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function getRelativeTime(t){
    const now = timeToMinutes(getCurrentTime());
    const slot = timeToMinutes(t);
    const diff = slot - now;
    if(diff===0) return 'now';
    if(diff>0){
        if(diff<60) return `in ${diff} min`;
        const hr=Math.floor(diff/60), mn=diff%60;
        if(mn===0) return `in ${hr} hr`;
        return `in ${hr}h ${mn}m`;
    } else {
        const abs=Math.abs(diff);
        if(abs<60) return `${abs} min ago`;
        const hr=Math.floor(abs/60), mn=abs%60;
        if(mn===0) return `${hr} hr ago`;
        return `${hr}h ${mn}m ago`;
    }
}
function getTimeSlotGroup(t){
    const h = Number(t.split(':')[0]);
    if(h>=6 && h<=11) return 'morning';
    if(h>=12 && h<=16) return 'afternoon';
    if(h>=17 && h<=20) return 'evening';
    return 'night';
}
function getStatus(med, time){
    // Use takenToday if present, otherwise check dosesToday?
    // Prefer takenToday map from medicines
    if(med.takenToday && med.takenToday[time]===true) return 'taken';
    // Fallback to dosesToday
    const match = dosesToday.find(d=>d.medicine_id===med.id && d.time===time);
    if(match && match.taken) return 'taken';
    const now = timeToMinutes(getCurrentTime());
    const slot = timeToMinutes(time);
    if(slot < now) return 'missed';
    return 'pending';
}
function isDueNow(med, time){
    if(getStatus(med,time)!=='pending') return false;
    const diff = Math.abs(timeToMinutes(time)-timeToMinutes(getCurrentTime()));
    return diff<=5;
}

// Greeting update based on language
function updateGreeting(){
    const lang = localStorage.getItem('patient_lang') || (currentUser?currentUser.language:'en-US');
    const name = currentUser?currentUser.name:'';
    const greet = GREETINGS[lang] || GREETINGS['en-US'];
    const el = document.getElementById('greeting');
    if(el) el.textContent = `${greet}, ${name}`;
    const subtitle = document.getElementById('headerSubtitle');
    if(subtitle){
        const subs = {
            'en-US':'My Medicines • Patient App',
            'kn-IN':'ನನ್ನ ಔಷಧಿಗಳು • ರೋಗಿಯ ಅಪ್ಲಿಕೇಶನ್',
            'hi-IN':'मेरी दवाइयाँ • रोगी ऐप'
        };
        subtitle.textContent = subs[lang]||subs['en-US'];
    }
}

// Dark mode
function initDarkMode(){
    const toggle = document.getElementById('darkModeToggle');
    const label = document.getElementById('darkModeLabel');
    const setLabel = (text) => { if(label) label.textContent = text; else if(toggle) toggle.textContent = text; };
    const stored = localStorage.getItem('patient_darkMode');
    if(stored==='dark'){
        document.documentElement.setAttribute('data-theme','dark');
        setLabel('Light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        setLabel('Dark');
    }
    if(toggle){
        toggle.addEventListener('click', ()=>{
            const cur = document.documentElement.getAttribute('data-theme');
            if(cur==='dark'){
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('patient_darkMode','light');
                setLabel('Dark');
            } else {
                document.documentElement.setAttribute('data-theme','dark');
                localStorage.setItem('patient_darkMode','dark');
                setLabel('Light');
            }
        });
    }
}

// Language select
function initLanguage(){
    const sel = document.getElementById('languageSelect');
    if(!sel) return;
    const stored = localStorage.getItem('patient_lang') || (currentUser?currentUser.language:'en-US');
    sel.value = stored;
    updateGreeting();
    updateTTSTextPreview();
    sel.addEventListener('change', ()=>{
        localStorage.setItem('patient_lang', sel.value);
        updateGreeting();
        updateTTSTextPreview();
        // also update voice select to match?
        const voiceSel = document.getElementById('ttsVoice');
        if(voiceSel) voiceSel.value = sel.value;
        showToast(`Language set to ${sel.value}`, 'info');
    });
}

// TTS handling
let voices = [];
let isSpeaking = false;
let speakQueue = [];
let currentUtterance = null;

function updateVoiceStatus(){
    const el = document.getElementById('voiceStatus');
    if(!el) return;
    if(voices.length===0){
        el.textContent='No voices found yet';
        el.className='error';
        el.style.color='var(--red-dark)';
    } else {
        el.textContent = `${voices.length} voices ready`;
        el.className='ready';
        el.style.color='var(--green-dark)';
    }
}
function loadVoices(){
    voices = speechSynthesis.getVoices() || [];
    updateVoiceStatus();
}
if('speechSynthesis' in window){
    loadVoices();
    if(speechSynthesis.onvoiceschanged!==undefined){
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    // poll fallback
    setTimeout(loadVoices, 500);
    setTimeout(loadVoices, 1500);
}

function pickVoice(lang){
    if(voices.length===0) return null;
    // exact
    let v = voices.find(x=>x.lang===lang);
    if(v) return v;
    const prefix = lang.split('-')[0];
    v = voices.find(x=>x.lang.startsWith(prefix));
    if(v) return v;
    // fallback chain for kn-IN
    if(lang==='kn-IN'){
        v = voices.find(x=>x.lang.startsWith('kn')) || voices.find(x=>x.lang.startsWith('hi')) || voices.find(x=>x.lang==='en-IN') || voices.find(x=>x.lang==='en-US') || voices[0];
        return v;
    }
    if(lang==='hi-IN'){
        v = voices.find(x=>x.lang==='hi-IN') || voices.find(x=>x.lang.startsWith('hi')) || voices.find(x=>x.lang==='en-IN') || voices.find(x=>x.lang==='en-US') || voices[0];
        return v;
    }
    v = voices.find(x=>x.lang==='en-US') || voices[0];
    return v;
}

function speak(text, lang){
    if(!('speechSynthesis' in window)){
        showToast('Speech not supported in this browser', 'error');
        return;
    }
    const volume = (Number(document.getElementById('volumeSlider')?.value || 100))/100;
    const rate = Number(document.getElementById('speedSlider')?.value || 0.9);
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || 'en-US';
    utter.volume = volume;
    utter.rate = rate;
    const voice = pickVoice(utter.lang);
    if(voice) utter.voice = voice;
    utter.onstart = ()=>{
        isSpeaking=true;
        const visual = document.getElementById('speakerVisual');
        if(visual) visual.classList.add('speaking');
        const status = document.getElementById('speakerStatus');
        if(status) {status.textContent='Speaking...'; status.style.background='var(--green)'; status.style.color='white';}
    };
    utter.onend = ()=>{
        isSpeaking=false;
        currentUtterance=null;
        const visual = document.getElementById('speakerVisual');
        if(visual) visual.classList.remove('speaking');
        const status = document.getElementById('speakerStatus');
        if(status) {status.textContent='Ready'; status.style.background='white'; status.style.color='var(--gray-700)';}
        // handle queue for speak all
        if(speakQueue.length>0){
            const next = speakQueue.shift();
            setTimeout(()=>speak(next.text, next.lang), 2000);
        }
    };
    utter.onerror = (e)=>{
        isSpeaking=false;
        currentUtterance=null;
        const visual = document.getElementById('speakerVisual');
        if(visual) visual.classList.remove('speaking');
        const status = document.getElementById('speakerStatus');
        if(status) {status.textContent='Error';}
        console.error('TTS error', e);
        if(speakQueue.length>0){
            const next = speakQueue.shift();
            setTimeout(()=>speak(next.text, next.lang), 2000);
        }
    };
    currentUtterance = utter;
    speechSynthesis.speak(utter);
}

function stopSpeaking(){
    speakQueue=[];
    if('speechSynthesis' in window){
        speechSynthesis.cancel();
    }
    isSpeaking=false;
    currentUtterance=null;
    const visual = document.getElementById('speakerVisual');
    if(visual) visual.classList.remove('speaking');
    const status = document.getElementById('speakerStatus');
    if(status) {status.textContent='Ready'; status.style.background='white'; status.style.color='var(--gray-700)';}
}

function buildReminderText(med){
    const lang = document.getElementById('ttsVoice')?.value || localStorage.getItem('patient_lang') || (currentUser?currentUser.language:'en-US');
    const template = REMINDER_TEMPLATES[lang] || REMINDER_TEMPLATES['en-US'];
    const name = currentUser?currentUser.name:'';
    let text = template.replace('{name}', name).replace('{med}', med.name).replace('{dos}', med.dosage);
    return text;
}

function updateTTSTextPreview(){
    // default preview includes tri-lingual sample, keep as is or update with next pending?
    const ttsText = document.getElementById('ttsText');
    if(!ttsText) return;
    // If there is pending med, preview could be its reminder, but keep default if not overridden
    // We'll set to next pending reminder if exists
    const pendingMeds = [];
    medicines.forEach(m=>{
        m.times.forEach(t=>{
            if(getStatus(m,t)==='pending'){
                pendingMeds.push({med:m, time:t});
            }
        });
    });
    if(pendingMeds.length>0){
        const lang = localStorage.getItem('patient_lang') || (currentUser?currentUser.language:'en-US');
        const next = pendingMeds.sort((a,b)=>timeToMinutes(a.time)-timeToMinutes(b.time))[0];
        const txt = buildReminderText(next.med);
        // Only update if user hasn't manually edited? For simplicity, update preview to next reminder
        // But don't overwrite if user is currently editing? We'll just set if default.
        // We'll always sync preview to next pending for demo
        // Keep tri-sample as fallback when no pending
        // Actually spec says defaulting to tri-lingual sample, so keep sample when pending empty, otherwise show reminder
        // Let's set to next reminder
        ttsText.value = txt;
    } else {
        // keep tri sample if empty
        if(!ttsText.value || ttsText.value.trim().length===0){
            ttsText.value = "Time to take your medicine - Metformin 1 tablet. ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ! मेडिसिन लेने का समय!";
        }
    }
}

// LED rendering
function renderLEDs(){
    const container = document.getElementById('ledContainer');
    if(!container) return;
    if(medicines.length===0){
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1; padding:20px;"><p>No LEDs - add medicines</p></div>`;
        return;
    }
    let html='';
    medicines.forEach(med=>{
        med.times.forEach(t=>{
            const status = getStatus(med,t);
            let cls='led-pending', txt='Pending', color='text-yellow';
            const due = isDueNow(med,t);
            if(status==='taken'){ cls='led-taken'; txt='Taken'; color='text-green';}
            else if(status==='missed'){ cls='led-missed'; txt='Missed'; color='text-red';}
            else if(due){ cls='led-due-now'; txt='Due Now'; color='text-yellow';}
            const rel=getRelativeTime(t);
            html+=`<div class="led-item"><div class="led-circle ${cls}" title="${med.name} ${t} ${txt}"></div><span class="led-label">${escapeHtml(med.name)}<br><small>${formatTime(t)} • ${rel}</small></span><span class="led-status ${color}">${txt}</span></div>`;
        });
    });
    container.innerHTML = html;
}

// Buzzer handling
let buzzerMuted = localStorage.getItem('patient_buzzerMuted')==='true';
let audioCtx = null;

function getAudioCtx(){
    if(!audioCtx){
        try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    }
    return audioCtx;
}
function playBeep(freq=440, duration=200){
    if(buzzerMuted) return;
    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type='sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+duration/1000);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime+duration/1000);
    }catch(e){ console.warn('beep failed',e); }
}

function updateBuzzer(){
    const visual = document.getElementById('buzzerVisual');
    const label = document.getElementById('buzzerLabel');
    const sub = document.getElementById('buzzerSub');
    const muteBtn = document.getElementById('buzzerMuteBtn');
    if(!visual || !label) return;

    // Check if muted UI
    if(buzzerMuted){
        visual.className='buzzer-visual buzzer-muted';
        label.textContent='Muted';
        if(sub) sub.textContent='Buzzer muted — tap Unmute to enable';
        if(muteBtn) muteBtn.textContent='Unmute';
        return;
    } else {
        if(muteBtn) muteBtn.textContent='Mute';
    }

    let hasPending = false;
    let hasDueNow = false;
    medicines.forEach(med=>{
        med.times.forEach(t=>{
            const s=getStatus(med,t);
            if(s==='pending'){
                hasPending=true;
                if(isDueNow(med,t)) hasDueNow=true;
            }
        });
    });

    if(hasDueNow){
        visual.className='buzzer-visual buzzer-active buzzer-overdue';
        label.textContent='Due now — buzzing';
        if(sub) sub.textContent='Medicine is due right now';
        // auto beep? We will beep when updating if dueNow (but not spam). Use throttled?
        // For demo, beep once per update if dueNow and not muted - but we already call updateBuzzer each render which is frequent. So beep here would spam.
        // We'll not auto-beep continuously; only on Test or when newly due. For spec: on load if due-now -> buzzer-overdue fast pulse + beep 880Hz
        // We'll beep 880Hz once when dueNow detected and not already beeping? Let's beep if dueNow and we haven't beeped recently. Simple: play beep 880 on each update but throttled 5s.
        // Use timestamp cache
        const now = Date.now();
        if(!window._lastDueBeep || now - window._lastDueBeep > 5000){
            playBeep(880, 300);
            window._lastDueBeep = now;
        }
    } else if(hasPending){
        visual.className='buzzer-visual buzzer-active';
        label.textContent='Reminder active';
        if(sub) sub.textContent='A dose is coming up soon';
        // maybe soft beep on pending? Not required. Just visual pulse.
    } else {
        visual.className='buzzer-visual';
        label.textContent='Idle — no reminder';
        if(sub) sub.textContent='Sounds while doses are pending';
    }
}

function toggleMute(){
    buzzerMuted = !buzzerMuted;
    localStorage.setItem('patient_buzzerMuted', buzzerMuted?'true':'false');
    updateBuzzer();
    showToast(buzzerMuted?'Buzzer muted':'Buzzer unmuted', 'info');
}

// Schedule rendering
function escapeHtml(str){
    if(!str) return '';
    try{
        const div=document.createElement('div');
        div.textContent=str;
        if(div.innerHTML && div.innerHTML!==str) return div.innerHTML;
    }catch(e){}
    const map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'};
    return str.replace(/[&<>"']/g,m=>map[m]);
}

function renderSchedule(){
    const grid = document.getElementById('scheduleGrid');
    const empty = document.getElementById('scheduleEmpty');
    const doseCountBadge = document.getElementById('doseCountBadge');
    const nextText = document.getElementById('nextDoseText');
    const nextRel = document.getElementById('nextDoseRelative');
    const todayLabel = document.getElementById('todayLabel');
    if(!grid) return;

    if(todayLabel){
        const now = new Date();
        const display = now.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
        todayLabel.textContent = `Today, ${display}`;
    }

    const totalDoses = medicines.reduce((sum,m)=>sum+m.times.length,0);
    if(doseCountBadge) doseCountBadge.textContent = `${totalDoses} Doses`;

    if(medicines.length===0){
        grid.innerHTML='';
        if(empty) empty.style.display='block';
        if(nextText) nextText.textContent='No doses scheduled';
        if(nextRel){ nextRel.textContent=''; nextRel.className='relative-time';}
        document.title = 'My Medicines';
        return;
    }
    if(empty) empty.style.display='none';

    // Build grouped structure
    const groupsOrder=['morning','afternoon','evening','night'];
    const groupLabels={
        morning:'Morning (6:00 – 11:59)',
        afternoon:'Afternoon (12:00 – 16:59)',
        evening:'Evening (17:00 – 20:59)',
        night:'Night (21:00 – 5:59)'
    };
    const grouped={morning:[], afternoon:[], evening:[], night:[]};
    // We need per-medicine cards grouped by earliest time
    const medsSorted=[...medicines].sort((a,b)=>timeToMinutes(a.times[0])-timeToMinutes(b.times[0]));
    medsSorted.forEach(med=>{
        const grp = getTimeSlotGroup(med.times[0]);
        grouped[grp].push(med);
    });

    let html='';
    let pendingCount=0, missedCount=0;
    let nextPending=null, minDiff=Infinity;
    const nowMin=timeToMinutes(getCurrentTime());
    medicines.forEach(med=>med.times.forEach(t=>{
        const s=getStatus(med,t);
        if(s==='pending'){
            pendingCount++;
            const diff=timeToMinutes(t)-nowMin;
            if(diff>=0 && diff<minDiff){
                minDiff=diff;
                nextPending={med,time:t,diff};
            }
        } else if(s==='missed'){ missedCount++; }
    }));

    // Update next dose banner and title
    if(nextText){
        if(nextPending){
            nextText.textContent = `${nextPending.med.name} at ${formatTime(nextPending.time)} (${nextPending.med.dosage})`;
            if(nextRel){
                const rel=getRelativeTime(nextPending.time);
                nextRel.textContent=rel;
                if(nextPending.diff<=5) nextRel.className='relative-time now';
                else if(nextPending.diff<=15) nextRel.className='relative-time now';
                else nextRel.className='relative-time upcoming';
            }
        } else if(missedCount>0){
            // Show overdue
            let overdue=null;
            medicines.forEach(med=>med.times.forEach(t=>{
                if(getStatus(med,t)==='missed' && !overdue) overdue={med,time:t};
            }));
            if(overdue){
                nextText.textContent=`Overdue: ${overdue.med.name} at ${formatTime(overdue.time)}`;
                if(nextRel){ nextRel.textContent=getRelativeTime(overdue.time); nextRel.className='relative-time overdue';}
            }
        } else if(totalDoses>0 && pendingCount===0 && missedCount===0){
            nextText.textContent='All doses taken today — well done';
            if(nextRel){ nextRel.textContent='Great job'; nextRel.className='relative-time now';}
        } else {
            nextText.textContent='No pending doses';
            if(nextRel){ nextRel.textContent=''; nextRel.className='relative-time';}
        }
    }
    // Title badge
    if(pendingCount>0){
        document.title=`(${pendingCount}) My Medicines`;
    } else if(missedCount>0){
        document.title=`(${missedCount} missed) My Medicines`;
    } else {
        document.title='My Medicines';
    }

    groupsOrder.forEach(group=>{
        const meds = grouped[group];
        if(meds.length===0) return;
        html+=`<div class="section-divider ${group}">${groupLabels[group]}</div>`;
        meds.forEach(med=>{
            // Build per time row
            const timeRows = med.times.map(t=>{
                const status=getStatus(med,t);
                let badgeClass='status-pending-badge', badgeText='Pending', cardStatus='status-pending', relClass='upcoming';
                if(status==='taken'){ badgeClass='status-taken-badge'; badgeText='Taken'; cardStatus='status-taken'; relClass='now';}
                else if(status==='missed'){ badgeClass='status-missed-badge'; badgeText='Missed'; cardStatus='status-missed'; relClass='overdue';}
                else {
                    const diff=timeToMinutes(t)-nowMin;
                    if(diff>=0 && diff<=5) relClass='now';
                    else relClass='upcoming';
                }
                const rel=getRelativeTime(t);
                let btn='';
                if(status==='pending'){
                    btn=`<button class="confirm-btn btn btn-success btn-sm" data-id="${med.id}" data-time="${t}" style="min-height:48px; font-size:0.95rem; font-weight:700;">I took it</button>`;
                } else if(status==='taken'){
                    btn=`<button class="confirm-btn" disabled style="opacity:0.6; padding:6px 14px; border-radius:20px; background:var(--green); color:white; border:none; font-weight:600;">Completed</button>`;
                } else {
                    btn=`<button class="confirm-btn btn btn-warning btn-sm" data-id="${med.id}" data-time="${t}" style="min-height:48px;">Mark as taken</button>`;
                }
                const isDue = isDueNow(med,t);
                const timeStyle = isDue ? ' style="color:var(--blue);font-weight:800;"' : '';
                return `<div class="dose-row ${cardStatus}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:600;"${timeStyle}>${formatTime(t)} <small style="color:var(--gray-500);">(${t})</small></span>
                    <span class="relative-time ${relClass}">${rel}</span>
                    <span class="status-badge ${badgeClass}" style="font-size:0.70rem;">${badgeText}</span>
                    ${btn}
                </div>`;
            }).join('');

            const visibleTimes = med.times;
            const statuses = visibleTimes.map(t=>getStatus(med,t));
            let overallClass='status-pending', overallBadge='<span class="status-badge status-pending-badge">Pending</span>';
            if(statuses.every(s=>s==='taken')){ overallClass='status-taken'; overallBadge='<span class="status-badge status-taken-badge">Taken</span>';}
            else if(statuses.some(s=>s==='missed')){ overallClass='status-missed'; overallBadge='<span class="status-badge status-missed-badge">Missed</span>';}
            const hasDue = visibleTimes.some(t=>isDueNow(med,t));

            html+=`<div class="medicine-card ${overallClass}" data-id="${med.id}" ${hasDue?'style="border-left-width:6px; box-shadow:0 4px 12px rgba(33,150,243,0.15);"':''}>
                <div class="medicine-card-top">
                    <div class="medicine-info">
                        <h3 style="font-size:1.25rem;">${escapeHtml(med.name)} ${hasDue?'<span class="current-time-highlight">Due Now</span>':''}</h3>
                        <p class="medicine-dosage" style="font-size:1rem;">${escapeHtml(med.dosage)} • ${visibleTimes.map(formatTime).join(', ')}</p>
                        <span class="medicine-lang"><svg class="icon" style="width:0.85em;height:0.85em;" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"></path></svg> ${escapeHtml(med.language)}</span>
                    </div>
                    ${overallBadge}
                </div>
                <div style="margin:8px 0;">${timeRows}</div>
            </div>`;
        });
    });

    grid.innerHTML = html;

    // Attach confirm handlers
    grid.querySelectorAll('.confirm-btn[data-id]').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
            const id = parseInt(e.currentTarget.getAttribute('data-id'));
            const time = e.currentTarget.getAttribute('data-time');
            await confirmDose(id, time);
        });
    });
}

async function confirmDose(medicineId, time){
    try{
        showLoading('Confirming...');
        await apiFetch('/api/doses/confirm', {method:'POST', body: JSON.stringify({medicine_id: medicineId, time})});
        showToast(`Marked as taken at ${formatTime(time)}`, 'success');
        // Update local state
        const med = medicines.find(m=>m.id===medicineId);
        if(med && med.takenToday) med.takenToday[time]=true;
        // Also update dosesToday
        const dose = dosesToday.find(d=>d.medicine_id===medicineId && d.time===time);
        if(dose) dose.taken=true;
        // Re-fetch to sync
        await loadData(false);
        renderAll();
        // Beep success?
        playBeep(600,150);
    }catch(e){
        showToast(e.message || 'Failed to confirm', 'error');
    } finally {
        hideLoading();
    }
}

async function confirmNextPending(){
    // Find next pending
    let next=null, minDiff=Infinity;
    const nowMin=timeToMinutes(getCurrentTime());
    medicines.forEach(med=>{
        med.times.forEach(t=>{
            if(getStatus(med,t)==='pending'){
                const diff=timeToMinutes(t)-nowMin;
                if(diff>=0 && diff<minDiff){
                    minDiff=diff;
                    next={med,time:t};
                }
            }
        });
    });
    // If no future pending, pick any pending (maybe overdue missed would be missed not pending, so check pending only)
    if(!next){
        medicines.forEach(med=>med.times.forEach(t=>{
            if(getStatus(med,t)==='pending' && !next) next={med,time:t};
        }));
    }
    if(!next){
        showToast('No pending doses to confirm', 'info');
        return;
    }
    await confirmDose(next.med.id, next.time);
}

function renderAll(){
    renderSchedule();
    renderLEDs();
    updateBuzzer();
    updateTTSTextPreview();
}

// --- Patient voice agent (SLM) ---
let patientRecognition=null;
let patientListening=false;
let lastPrompt={question:'', answer:''};

async function askAssistant(question){
    const ansEl=document.getElementById('patientVoiceAnswer');
    const transEl=document.getElementById('patientTranscription');
    if(transEl) transEl.textContent=question;
    if(ansEl) ansEl.textContent='Thinking...';
    let answer='';
    try{
        const res=await fetch('/api/voice-agent', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({text: question})
        });
        const data=await res.json();
        answer=data.answer||'';
    }catch(e){
        const pend=[], taken=[], missed=[];
        medicines.forEach(m=>m.times.forEach(t=>{
            const s=getStatus(m,t);
            if(s==='pending') pend.push(m); else if(s==='taken') taken.push(m); else missed.push(m);
        }));
        answer=`Today for you: taken ${taken.length}, pending ${pend.length}, missed ${missed.length}.`;
    }
    if(ansEl) ansEl.textContent=answer;
    lastPrompt={question: question || '', answer};
    const lang = currentUser?currentUser.language:'en-US';
    speak(answer, lang);
    showAcceptancePrompt();
    return answer;
}

function showAcceptancePrompt(){
    const area=document.getElementById('voiceAcceptArea');
    if(!area) return;
    let target=null;
    medicines.forEach(med=>med.times.forEach(t=>{
        const s=getStatus(med,t);
        if(s==='pending' && (!target || timeToMinutes(t)<timeToMinutes(target.time))) target={med,time:t};
    }));
    if(!target){
        medicines.forEach(med=>med.times.forEach(t=>{
            if(getStatus(med,t)==='missed' && !target) target={med,time:t};
        }));
    }
    const promptEl=document.getElementById('voicePromptText');
    if(target){
        if(promptEl) promptEl.textContent=`${target.med.name} at ${formatTime(target.time)} — take it now?`;

        area.dataset.mid=target.med.id;
        area.dataset.time=target.time;
        area.style.display='block';
    } else {
        if(promptEl) promptEl.textContent='Nothing is due right now — all doses are done.';
        area.dataset.mid='';
        area.dataset.time='';
        area.style.display='none';
    }
}

function hideAcceptancePrompt(){
    const area=document.getElementById('voiceAcceptArea');
    if(area) area.style.display='none';
}

async function respondToPrompt(outcome){
    const area=document.getElementById('voiceAcceptArea');
    const mid=area?area.dataset.mid:null;
    const time=area?area.dataset.time:null;
    if(outcome==='accepted' && (!mid || !time)){
        showToast('Choose a dose to confirm first', 'error');
        return;
    }
    try{
        const body={outcome, question:lastPrompt.question||'', answer:lastPrompt.answer||''};
        if(outcome==='accepted'){ body.medicine_id=parseInt(mid,10); body.time=time; }
        const res=await fetch('/api/slm/respond', {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
        });
        const data=await res.json();
        if(res.ok && data.status==='accepted'){
            showToast(`Marked ${formatTime(time)} as taken`, 'success');
            await loadData(false);
            renderAll();
        } else if(res.ok && data.status==='declined'){
            showToast('Noted — you can take it a little later.', 'info');
        } else {
            showToast((data.error||'Could not record your answer'), 'error');
        }
    }catch(e){
        showToast('Could not reach the server', 'error');
    }
    hideAcceptancePrompt();
}

function initVoiceAgent(){
    const startBtn=document.getElementById('patientVoiceStartBtn');
    const stopBtn=document.getElementById('patientVoiceStopBtn');
    const statusEl=document.getElementById('voiceAgentStatus');
    const transEl=document.getElementById('patientTranscription');
    const acceptBtn=document.getElementById('voiceAcceptBtn');
    const declineBtn=document.getElementById('voiceDeclineBtn');
    const examples=document.querySelectorAll('.voice-example-btn');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SR){
        patientRecognition=new SR();
        patientRecognition.continuous=false;
        patientRecognition.interimResults=false;
        patientRecognition.lang = currentUser?currentUser.language:'en-US';
        patientRecognition.onstart=()=>{
            patientListening=true;
            if(statusEl) statusEl.textContent='Listening...';
            if(startBtn) startBtn.disabled=true;
            if(stopBtn) stopBtn.disabled=false;
        };
        patientRecognition.onend=()=>{
            patientListening=false;
            if(statusEl) statusEl.textContent='Idle';
            if(startBtn) startBtn.disabled=false;
            if(stopBtn) stopBtn.disabled=true;
        };
        patientRecognition.onerror=(e)=>{
            showToast('Voice error: '+e.error,'error');
            if(statusEl) statusEl.textContent='Error';
            patientListening=false;
        };
        patientRecognition.onresult=async (e)=>{
            const transcript=e.results[0][0].transcript;
            await askAssistant(transcript);
        };
    } else {
        if(statusEl) statusEl.textContent='Voice not supported — tap a question instead';
    }
    if(startBtn){
        startBtn.addEventListener('click', ()=>{
            if(patientRecognition){
                if(statusEl) statusEl.textContent='Listening...';
                if(transEl) transEl.textContent='Listening...';
                try{ patientRecognition.start(); }catch(err){ showToast(err.message,'error'); }
            } else {
                const q=prompt('Type your question:','What is due next?');
                if(q) askAssistant(q);
            }
        });
    }
    if(stopBtn){
        stopBtn.addEventListener('click', ()=>{
            if(patientRecognition && patientListening) patientRecognition.stop();
            if(statusEl) statusEl.textContent='Idle';
        });
    }
    if(acceptBtn) acceptBtn.addEventListener('click', ()=>respondToPrompt('accepted'));
    if(declineBtn) declineBtn.addEventListener('click', ()=>respondToPrompt('declined'));
    examples.forEach(btn=>{
        btn.addEventListener('click', ()=>{
            askAssistant(btn.getAttribute('data-q')||'What is due next?');
        });
    });
}

async function loadData(showLoad=true){
    if(showLoad) showLoading();
    try{
        // Ensure currentUser fresh
        try{
            const me = await apiFetch('/api/me');
            currentUser = me;
            window.__PATIENT_USER__ = me;
            // Update greeting
            updateGreeting();
        }catch(e){
            // if unauthorized, redirect to login
            if(e.message && e.message.includes('Unauthorized')){
                window.location.href='/login';
                return;
            }
        }
        // Parallel fetch medicines and doses
        let meds, doses;
        try{
            meds = await apiFetch('/api/medicines');
        }catch(e){
            // fallback already handled in apiFetch, but throw still
            // attempt to load from cache
            const key=`patient_doses_${currentUser?currentUser.id:'anon'}`;
            try{
                const cached=JSON.parse(localStorage.getItem(key));
                meds = cached.medicines || [];
            }catch(_){ meds=[]; }
        }
        try{
            doses = await apiFetch('/api/doses/today');
        }catch(e){
            const key=`patient_doses_${currentUser?currentUser.id:'anon'}`;
            try{
                const cached=JSON.parse(localStorage.getItem(key));
                doses = cached.doses || [];
            }catch(_){ doses=[]; }
        }
        medicines = Array.isArray(meds)?meds:[];
        dosesToday = Array.isArray(doses)?doses:[];
        cachePatientData();
        // Update stats maybe?
        try{
            const stats = await apiFetch('/api/stats');
            // Could display somewhere, but not required
        }catch(_){}
    }catch(e){
        console.error('loadData failed',e);
        showToast('Failed to load data', 'error');
    } finally {
        if(showLoad) hideLoading();
        renderAll();
        // Offline badge handling already done
        const offlineBadge=document.getElementById('offlineBadge');
        const offlineInd=document.getElementById('offlineIndicator');
        if(navigator.onLine){
            if(offlineInd) offlineInd.style.display='none';
            if(offlineBadge){ offlineBadge.textContent='● Online'; offlineBadge.className='badge badge-success';}
        } else {
            if(offlineInd) offlineInd.style.display='block';
            if(offlineBadge){ offlineBadge.textContent='● Offline'; offlineBadge.className='badge badge-danger';}
        }
    }
}

// Event wiring
document.addEventListener('DOMContentLoaded', async ()=>{
    initDarkMode();
    initLanguage();

    // Sliders
    const volSlider=document.getElementById('volumeSlider');
    const volValue=document.getElementById('volumeValue');
    if(volSlider && volValue){
        volSlider.addEventListener('input', ()=>{
            volValue.textContent = volSlider.value+'%';
            localStorage.setItem('patient_volume', volSlider.value);
        });
        const storedVol=localStorage.getItem('patient_volume');
        if(storedVol){ volSlider.value=storedVol; volValue.textContent=storedVol+'%';}
    }
    const speedSlider=document.getElementById('speedSlider');
    const speedValue=document.getElementById('speedValue');
    if(speedSlider && speedValue){
        speedSlider.addEventListener('input', ()=>{
            speedValue.textContent = speedSlider.value;
            localStorage.setItem('patient_speed', speedSlider.value);
        });
        const storedSpeed=localStorage.getItem('patient_speed');
        if(storedSpeed){ speedSlider.value=storedSpeed; speedValue.textContent=storedSpeed;}
    }

    // Voice select
    const ttsVoice=document.getElementById('ttsVoice');
    if(ttsVoice){
        // set to current lang by default
        const lang = localStorage.getItem('patient_lang') || (currentUser?currentUser.language:'en-US');
        ttsVoice.value = lang;
        ttsVoice.addEventListener('change', ()=>{
            localStorage.setItem('patient_ttsVoice', ttsVoice.value);
            updateTTSTextPreview();
        });
        const storedVoice=localStorage.getItem('patient_ttsVoice');
        if(storedVoice) ttsVoice.value=storedVoice;
    }

    // Speaker buttons
    const playBtn=document.getElementById('playBtn');
    if(playBtn){
        playBtn.addEventListener('click', ()=>{
            const text=document.getElementById('ttsText')?.value || '';
            const lang=document.getElementById('ttsVoice')?.value || 'en-US';
            if(!text.trim()){ showToast('Enter reminder text', 'error'); return; }
            stopSpeaking();
            speak(text, lang);
        });
    }
    const speakAllBtn=document.getElementById('speakAllBtn');
    if(speakAllBtn){
        speakAllBtn.addEventListener('click', ()=>{
            // Speak all pending one by one with 2s gap
            const pending=[];
            medicines.forEach(med=>{
                med.times.forEach(t=>{
                    if(getStatus(med,t)==='pending'){
                        pending.push({med,time:t});
                    }
                });
            });
            if(pending.length===0){ showToast('No pending doses to speak', 'info'); return; }
            pending.sort((a,b)=>timeToMinutes(a.time)-timeToMinutes(b.time));
            stopSpeaking();
            speakQueue=[];
            // Build texts
            const texts = pending.map(p=>({text: buildReminderText(p.med), lang: document.getElementById('ttsVoice')?.value || p.med.language || 'en-US'}));
            // Speak first, queue rest
            const first=texts.shift();
            speakQueue=texts;
            speak(first.text, first.lang);
            showToast(`Speaking ${pending.length} reminders`, 'info');
        });
    }
    const stopBtn=document.getElementById('stopBtn');
    if(stopBtn) stopBtn.addEventListener('click', ()=>{
        stopSpeaking();
        showToast('Stopped', 'info');
    });

    // Buzzer buttons
    const buzzerTestBtn=document.getElementById('buzzerTestBtn');
    if(buzzerTestBtn) buzzerTestBtn.addEventListener('click', ()=>{
        if(buzzerMuted){ showToast('Buzzer is muted', 'info'); return; }
        const hasDue = medicines.some(m=>m.times.some(t=>isDueNow(m,t)));
        playBeep(hasDue?880:440, 300);
        const visual=document.getElementById('buzzerVisual');
        if(visual){
            visual.classList.add('buzzer-vibrate');
            setTimeout(()=>visual.classList.remove('buzzer-vibrate'), 400);
        }
        showToast(hasDue?'Beeping — due now':'Beeping', 'info');
    });
    const buzzerStopBtn=document.getElementById('buzzerStopBtn');
    if(buzzerStopBtn) buzzerStopBtn.addEventListener('click', ()=>{
        stopSpeaking();
        const visual=document.getElementById('buzzerVisual');
        if(visual){
            visual.className='buzzer-visual';
            document.getElementById('buzzerLabel').textContent='Idle — stopped';
        }
        showToast('Buzzer stopped', 'info');
    });
    const buzzerMuteBtn=document.getElementById('buzzerMuteBtn');
    if(buzzerMuteBtn) buzzerMuteBtn.addEventListener('click', toggleMute);
    // Init mute state
    updateBuzzer();
    // ensure mute button reflects
    const muteBadge = document.getElementById('buzzerMuteBtn');
    // Global confirm
    const confirmGlobalBtn=document.getElementById('confirmGlobalBtn');
    if(confirmGlobalBtn) confirmGlobalBtn.addEventListener('click', confirmNextPending);

    // Voice agent button wiring
    initVoiceAgent();

    // Language select already init
    // Load data
    await loadData(true);

    // Auto-refresh every 60s
    setInterval(async ()=>{
        await loadData(false);
    }, 60000);

    // Offline listeners
    window.addEventListener('online', ()=>{
        const ind=document.getElementById('offlineIndicator');
        if(ind) ind.style.display='none';
        const badge=document.getElementById('offlineBadge');
        if(badge){ badge.textContent='Online'; badge.className='badge badge-success';}
        updateApiStatus(true);
        showToast('Back online', 'success');
        loadData(false);
    });
    window.addEventListener('offline', ()=>{
        const ind=document.getElementById('offlineIndicator');
        if(ind) ind.style.display='block';
        const badge=document.getElementById('offlineBadge');
        if(badge){ badge.textContent='Offline'; badge.className='badge badge-danger';}
        updateApiStatus(false);
        showToast('Offline — showing your last saved schedule', 'info');
    });

    // Update time-sensitive UI every 30s (status may change Pending->Missed)
    setInterval(()=>{ renderAll(); }, 30000);
});

// Expose for testing
window.apiFetch = apiFetch;
window.confirmDose = confirmDose;
window.speak = speak;
window.stopSpeaking = stopSpeaking;


/**
 * Caregiver App - Main JS
 * Manages patient selection, medicines, schedule, compliance, uploads mock OCR, voice agent
 */

let currentCaregiver = window.__CAREGIVER_USER__ || null;
let patients = [];
let activePatientId = null;
let activePatient = null;
let medicines = [];
let dosesToday = [];
let stats = null;
let currentFilter = "today";
let uploads = [];
let extractedMedicines = [];
let currentPreviewFile = null;

// Preset keyword bank for mock OCR
const MOCK_MEDICINES_BANK = [
    {name:"Metformin", dosage:"1 tablet", times:["08:00","20:00"], language:"en-US"},
    {name:"Dolo 650", dosage:"1 tablet", times:["14:00"], language:"kn-IN"},
    {name:"Vitamin D3", dosage:"1 capsule", times:["09:00"], language:"hi-IN"},
    {name:"Paracetamol", dosage:"500 mg", times:["08:00"], language:"en-US"},
    {name:"Atorvastatin", dosage:"10 mg", times:["21:00"], language:"en-US"},
    {name:"Aspirin", dosage:"75 mg", times:["08:00"], language:"hi-IN"},
    {name:"Amoxicillin", dosage:"1 capsule", times:["08:00","14:00","20:00"], language:"kn-IN"},
    {name:"Cetirizine", dosage:"1 tablet", times:["21:30"], language:"en-US"},
];

// Toast
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
async function apiFetch(path, opts={}){
    const options = {method:'GET', credentials:'same-origin', headers:{'Content-Type':'application/json'}, ...opts};
    if(opts.headers) options.headers = {...options.headers, ...opts.headers};
    if(options.body && typeof options.body !== 'string'){
        options.body = JSON.stringify(options.body);
    }
    // Show loading unless stats
    const isStats = path.includes('/stats');
    if(!isStats) showLoading();
    try{
        const resp = await fetch(path, options);
        const data = await resp.json().catch(()=>({}));
        if(!resp.ok){
            throw new Error(data.error || `API ${options.method} ${path} failed: ${resp.status}`);
        }
        updateApiStatus(true);
        const offlineInd = document.getElementById('offlineIndicator');
        if(offlineInd) offlineInd.style.display='none';
        const offlineBadge = document.getElementById('offlineBadge');
        if(offlineBadge){ offlineBadge.textContent='● Online'; offlineBadge.className='badge badge-success';}
        return data;
    } catch(e){
        updateApiStatus(false);
        showToast(e.message || 'Network error', 'error');
        const offlineInd = document.getElementById('offlineIndicator');
        if(offlineInd) offlineInd.style.display='block';
        const offlineBadge = document.getElementById('offlineBadge');
        if(offlineBadge){ offlineBadge.textContent='● Offline'; offlineBadge.className='badge badge-danger';}
        throw e;
    } finally {
        if(!isStats) hideLoading();
    }
}

// Time helpers
function getCurrentTime(){
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}
function timeToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function formatTime(t){ const [h,m]=t.split(':').map(Number); const ampm=h>=12?'PM':'AM'; const hr=h%12||12; return `${hr}:${String(m).padStart(2,'0')} ${ampm}`; }
function getRelativeTime(t){
    const now=timeToMinutes(getCurrentTime()); const slot=timeToMinutes(t); const diff=slot-now;
    if(diff===0) return 'now';
    if(diff>0){ if(diff<60) return `in ${diff} min`; const hr=Math.floor(diff/60), mn=diff%60; return mn===0?`in ${hr} hr`:`in ${hr}h ${mn}m`; }
    else { const abs=Math.abs(diff); if(abs<60) return `${abs} min ago`; const hr=Math.floor(abs/60), mn=abs%60; return mn===0?`${hr} hr ago`:`${hr}h ${mn}m ago`; }
}
function getTimeSlotGroup(t){ const h=Number(t.split(':')[0]); if(h>=6&&h<=11) return 'morning'; if(h>=12&&h<=16) return 'afternoon'; if(h>=17&&h<=20) return 'evening'; return 'night'; }
function getStatus(med, time){
    if(med.takenToday && med.takenToday[time]===true) return 'taken';
    const match = dosesToday.find(d=>d.medicine_id===med.id && d.time===time);
    if(match && match.taken) return 'taken';
    const now=timeToMinutes(getCurrentTime()); const slot=timeToMinutes(time);
    if(slot < now) return 'missed';
    return 'pending';
}
function isDueNow(med,time){ if(getStatus(med,time)!=='pending') return false; return Math.abs(timeToMinutes(time)-timeToMinutes(getCurrentTime()))<=5; }
function escapeHtml(str){ if(!str) return ''; try{const div=document.createElement('div'); div.textContent=str; if(div.innerHTML&&div.innerHTML!==str) return div.innerHTML;}catch(e){} const map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}; return str.replace(/[&<>"']/g,m=>map[m]); }

// Dark mode
function initDarkMode(){
    const toggle=document.getElementById('darkModeToggle');
    const label=document.getElementById('darkModeLabel');
    const setLabel=(text)=>{ if(label) label.textContent=text; else if(toggle) toggle.textContent=text; };
    const stored=localStorage.getItem('caregiver_darkMode');
    if(stored==='dark'){ document.documentElement.setAttribute('data-theme','dark'); setLabel('Light');}
    else { document.documentElement.removeAttribute('data-theme'); setLabel('Dark');}
    if(toggle){
        toggle.addEventListener('click', ()=>{
            const cur=document.documentElement.getAttribute('data-theme');
            if(cur==='dark'){ document.documentElement.removeAttribute('data-theme'); localStorage.setItem('caregiver_darkMode','light'); setLabel('Dark');}
            else { document.documentElement.setAttribute('data-theme','dark'); localStorage.setItem('caregiver_darkMode','dark'); setLabel('Light');}
        });
    }
}

// Patients
async function loadPatients(){
    try{
        const data = await apiFetch('/api/patients');
        patients = Array.isArray(data)?data:[];
        renderPatientSelector();
        // auto-select first if none active
        if(!activePatientId && patients.length>0){
            setActivePatient(patients[0].id);
        } else if(activePatientId){
            // refresh if still exists
            const still = patients.find(p=>p.id===activePatientId);
            if(!still && patients.length>0) setActivePatient(patients[0].id);
            else renderPatientSelector();
        }
    }catch(e){
        console.error('loadPatients failed',e);
        showToast('Failed to load patients','error');
    }
}
function langLabel(lang){
    if(lang==='kn-IN') return 'KN';
    if(lang==='hi-IN') return 'HI';
    return 'EN';
}
function renderPatientSelector(){
    const sel=document.getElementById('patientSelector');
    const tot=document.getElementById('totalPatients');
    if(!sel) return;
    if(tot) tot.textContent=`Total patients: ${patients.length}`;
    if(patients.length===0){
        sel.innerHTML=`<div class="empty-state" style="grid-column:1/-1; padding:20px;"><p>No patients found</p></div>`;
        return;
    }
    let html='';
    patients.forEach(p=>{
        const active = p.id===activePatientId ? 'active' : '';
        const isActive = p.id===activePatientId;
        const styleActive = isActive ? 'background:var(--green); color:white; border-color:var(--green-dark); box-shadow:0 2px 8px rgba(76,175,80,0.3);' : 'background:white;';
        html+=`<div class="patient-card" data-patient-id="${p.id}">
            <button class="patient-btn ${isActive?'active':''}" data-patient-id="${p.id}" aria-pressed="${isActive}">
                <span class="patient-name">${escapeHtml(p.name)} <span class="badge badge-info" style="font-size:0.62rem; padding:2px 7px; vertical-align:1px;">${langLabel(p.language)}</span></span>
                <span class="patient-meta">${escapeHtml(p.username)}</span>
            </button>
            <button type="button" class="delete-patient-btn" data-patient-id="${p.id}" data-patient-name="${escapeHtml(p.name)}" title="Delete patient" aria-label="Delete ${escapeHtml(p.name)}"><svg class="icon" viewBox="0 0 24 24" style="width:1em;height:1em;"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"></path></svg></button>
        </div>`;
    });
    sel.innerHTML=html;
    sel.querySelectorAll('.patient-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            const pid=parseInt(btn.getAttribute('data-patient-id'));
            setActivePatient(pid);
        });
    });
    sel.querySelectorAll('.delete-patient-btn').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            e.stopPropagation();
            const pid=parseInt(btn.getAttribute('data-patient-id'));
            const pname=btn.getAttribute('data-patient-name');
            if(!confirm(`Delete ${pname} permanently? This removes all their medicines, doses and upload history. This cannot be undone.`)) return;
            deletePatient(pid, pname);
        });
    });
    // update active info
    const info=document.getElementById('activePatientInfo');
    const addDesc=document.getElementById('addMedicinePatientName');
    const quickName=document.getElementById('quickPatientName');
    const quickBadge=document.getElementById('quickPatientBadge');
    const voiceName=document.getElementById('voicePatientName');
    const voiceDesc=document.getElementById('voiceDescPatient');
    if(activePatient){
        if(info) info.textContent=`Active: ${activePatient.name} (${activePatient.username}) • ${activePatient.language}`;
        if(addDesc) addDesc.textContent=activePatient.name;
        if(quickName) quickName.textContent=activePatient.name;
        if(quickBadge) quickBadge.textContent=activePatient.name;
        if(voiceName) voiceName.textContent=activePatient.name;
        if(voiceDesc) voiceDesc.textContent=activePatient.name;
        // update schedule title
        const titles = ['scheduleTitle','complianceTitle','historyTitle'];
        // will update in render functions
    } else {
        if(info) info.textContent='No patient selected';
        if(addDesc) addDesc.textContent='No patient selected';
        if(quickName) quickName.textContent='No patient';
        if(quickBadge) quickBadge.textContent='No patient';
        if(voiceName) voiceName.textContent='patient';
        if(voiceDesc) voiceDesc.textContent='selected patient';
    }
}
async function setActivePatient(pid){
    activePatientId=pid;
    activePatient=patients.find(p=>p.id===pid) || null;
    renderPatientSelector();
    await reloadActivePatientData();
}

// Delete Patient (caregiver-only) — permanently removes account + all their data
async function deletePatient(pid, pname){
    try{
        showLoading('Deleting patient...');
        await apiFetch(`/api/patients/${pid}`, {method:'DELETE'});
        showToast(`${pname} was deleted`,'success');
        if(activePatientId===pid) activePatientId=null;
        await loadPatients();
    }catch(err){
        showToast(err.message||'Failed to delete patient','error');
    }finally{
        hideLoading();
    }
}

// Add Patient (caregiver-only) — new credentials work on the patient website (:5001)
function initAddPatient(){
    const toggleBtn=document.getElementById('toggleAddPatientBtn');
    const toggleLabel=document.getElementById('toggleAddPatientLabel');
    const setToggleLabel=(text)=>{ if(toggleLabel) toggleLabel.textContent=text; else if(toggleBtn) toggleBtn.textContent=text; };
    const form=document.getElementById('addPatientForm');
    const cancelBtn=document.getElementById('cancelAddPatientBtn');
    if(!toggleBtn||!form) return;
    const open=()=>{
        form.style.display='block';
        toggleBtn.setAttribute('aria-expanded','true');
        setToggleLabel('Hide the form');
    };
    const close=()=>{
        form.style.display='none';
        toggleBtn.setAttribute('aria-expanded','false');
        setToggleLabel('Add a new patient');
    };
    toggleBtn.addEventListener('click', ()=>{
        if(form.style.display==='block') close(); else open();
    });
    if(cancelBtn) cancelBtn.addEventListener('click', close);
    form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const name=document.getElementById('newPatientName').value.trim();
        const username=document.getElementById('newPatientUsername').value.trim();
        const password=document.getElementById('newPatientPassword').value;
        const language=document.getElementById('newPatientLanguage').value;
        if(!name||!username||!password){
            showToast('Please fill in every required field','error');
            return;
        }
        try{
            const newPatient=await apiFetch('/api/patients',{
                method:'POST',
                body: JSON.stringify({username, password, name, language})
            });
            showToast(`${name} was added — they can log in on the patient site as "${username}"`,'success');
            form.reset();
            close();
            await loadPatients();
            if(newPatient && newPatient.id) setActivePatient(newPatient.id); else setActivePatient(null);
        }catch(err){
            showToast(err.message||'Failed to create patient','error');
        }
    });
}
async function reloadActivePatientData(){
    if(!activePatientId){
        showToast('Select a patient first','info');
        return;
    }
    showLoading('Loading patient data...');
    try{
        // parallel fetch
        const [meds, doses, st, hist] = await Promise.all([
            apiFetch(`/api/medicines?patient_id=${activePatientId}`),
            apiFetch(`/api/doses/today?patient_id=${activePatientId}`),
            apiFetch(`/api/stats?patient_id=${activePatientId}`).catch(()=>({taken:0,pending:0,missed:0,upcoming:0,overdue:0,total:0,compliance:0})),
            apiFetch(`/api/uploads?patient_id=${activePatientId}&limit=10`).catch(()=>[])
        ]);
        medicines = Array.isArray(meds)?meds:[];
        dosesToday = Array.isArray(doses)?doses:[];
        stats = st;
        uploads = Array.isArray(hist)?hist:[];
        renderSchedule();
        renderCompliance();
        renderHistory();
        renderUploadHistory();
        updateVoiceAgentForPatient();
    }catch(e){
        console.error('reload data failed',e);
        showToast('Failed to load patient data','error');
    } finally {
        hideLoading();
    }
}

// Upload / Mock OCR
function initUpload(){
    const dropZone=document.getElementById('dropZone');
    const fileInput=document.getElementById('prescriptionFile');
    const browseBtn=document.getElementById('browseBtn');
    const preview=document.getElementById('uploadPreview');
    const previewImg=document.getElementById('previewImage');
    const previewName=document.getElementById('previewName');
    const previewSize=document.getElementById('previewSize');
    const uploadActions=document.getElementById('uploadActions');
    const analyzeBtn=document.getElementById('analyzeBtn');
    const clearBtn=document.getElementById('clearUploadBtn');
    const ocrProcessing=document.getElementById('ocrProcessing');
    const ocrResults=document.getElementById('ocrResults');
    const extractedList=document.getElementById('extractedList');

    if(!dropZone || !fileInput) return;

    function handleFile(file){
        if(!activePatientId){ showToast('Select a patient first','error'); return; }
        if(!file) return;
        if(file.size > 5*1024*1024){ showToast('File too large (max 5MB)','error'); return; }
        if(!file.type.match(/image\/(jpeg|png|jpg)/)){ showToast('Only JPG/PNG allowed','error'); return; }
        currentPreviewFile = file;
        const reader=new FileReader();
        reader.onload=(e)=>{
            previewImg.src=e.target.result;
            previewName.textContent=file.name;
            previewSize.textContent=`${(file.size/1024).toFixed(1)} KB • ${file.type}`;
            preview.style.display='block';
            uploadActions.style.display='flex';
            // Hide previous OCR
            ocrResults.style.display='none';
            ocrProcessing.style.display='none';
        };
        reader.readAsDataURL(file);
    }

    browseBtn.addEventListener('click', ()=>fileInput.click());
    fileInput.addEventListener('change', ()=>{ if(fileInput.files[0]) handleFile(fileInput.files[0]); });
    dropZone.addEventListener('click', ()=>fileInput.click());
    dropZone.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); fileInput.click(); }});
    dropZone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', ()=>dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e)=>{ e.preventDefault(); dropZone.classList.remove('dragover'); const file=e.dataTransfer.files[0]; if(file) handleFile(file); });

    clearBtn.addEventListener('click', ()=>{
        currentPreviewFile=null;
        fileInput.value='';
        preview.style.display='none';
        previewImg.src='';
        ocrResults.style.display='none';
        ocrProcessing.style.display='none';
        extractedMedicines=[];
    });

    analyzeBtn.addEventListener('click', async ()=>{
        if(!currentPreviewFile){ showToast('Select an image first','error'); return; }
        if(!activePatientId){ showToast('Select a patient first','error'); return; }
        ocrProcessing.style.display='block';
        ocrResults.style.display='none';
        // Simulate delay 1.2s
        setTimeout(()=>{
            ocrProcessing.style.display='none';
            // Generate 1-3 medicines randomly from bank, but deterministic for testing: use file name hash? Use random 1-3
            const count = 1 + Math.floor(Math.random()*3); // 1-3
            // shuffle bank
            const shuffled = [...MOCK_MEDICINES_BANK].sort(()=>0.5-Math.random());
            extractedMedicines = shuffled.slice(0,count).map(m=>({...m}));
            renderExtractedList();
            ocrResults.style.display='block';
            showToast(`Found ${count} medicine${count===1?'':'s'} in the prescription`,'success');
            // Save thumbnail for history later
        }, 1200);
    });

    document.getElementById('addExtractedBtn').addEventListener('click', async ()=>{
        if(!activePatientId){ showToast('Select a patient first','error'); return; }
        if(extractedMedicines.length===0){ showToast('No medicines to add','error'); return; }
        showLoading('Adding medicines...');
        let added=0;
        for(const med of extractedMedicines){
            // Get current input values (allow edit)
            const item = document.querySelector(`.extracted-item[data-name="${CSS.escape(med.name)}"]`);
            let name=med.name, dosage=med.dosage, times=med.times, language=med.language;
            if(item){
                const nInput=item.querySelector('.ex-name');
                const dInput=item.querySelector('.ex-dosage');
                const tInput=item.querySelector('.ex-times');
                const lSelect=item.querySelector('.ex-lang');
                if(nInput) name=nInput.value.trim() || name;
                if(dInput) dosage=dInput.value.trim() || dosage;
                if(tInput) times=tInput.value.split(',').map(s=>s.trim()).filter(Boolean);
                if(lSelect) language=lSelect.value;
            }
            try{
                await apiFetch('/api/medicines', {method:'POST', body: JSON.stringify({patient_id:activePatientId, name, dosage, times, language})});
                added++;
            }catch(e){ console.warn('add extracted failed',e); showToast(`Failed to add ${name}: ${e.message}`,'error'); }
        }
        // Also save upload history
        try{
            const thumb = previewImg.src || '';
            await apiFetch('/api/uploads', {method:'POST', body: JSON.stringify({patient_id:activePatientId, filename: currentPreviewFile ? currentPreviewFile.name : 'prescription.jpg', extracted_medicines: extractedMedicines, thumbnail: thumb})});
        }catch(e){ console.warn('upload history save failed',e); }
        hideLoading();
        showToast(`Added ${added} medicine${added===1?'':'s'} for ${activePatient.name}`,'success');
        // Clear preview
        currentPreviewFile=null;
        fileInput.value='';
        preview.style.display='none';
        previewImg.src='';
        ocrResults.style.display='none';
        extractedMedicines=[];
        await reloadActivePatientData();
    });

    document.getElementById('discardOcrBtn').addEventListener('click', ()=>{
        ocrResults.style.display='none';
        extractedMedicines=[];
        showToast('Discarded','info');
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', async ()=>{
        if(!activePatientId){ showToast('Select a patient first','error'); return; }
        try{
            await apiFetch(`/api/uploads/clear?patient_id=${activePatientId}`, {method:'DELETE'});
            showToast('History cleared','success');
            await reloadActivePatientData();
        }catch(e){ showToast(e.message,'error'); }
    });
}
function renderExtractedList(){
    const list=document.getElementById('extractedList');
    if(!list) return;
    if(extractedMedicines.length===0){ list.innerHTML='<p>No medicines</p>'; return; }
    let html='';
    extractedMedicines.forEach(med=>{
        html+=`<div class="extracted-item" data-name="${escapeHtml(med.name)}">
            <div class="extracted-item-header">
                <h5>${escapeHtml(med.name)}</h5>
                <span class="badge badge-info">${escapeHtml(med.language)}</span>
            </div>
            <div class="extracted-fields">
                <label>Name<input class="ex-name" value="${escapeHtml(med.name)}"></label>
                <label>Dosage<input class="ex-dosage" value="${escapeHtml(med.dosage)}"></label>
                <label>Times<input class="ex-times" value="${escapeHtml(med.times.join(', '))}" placeholder="08:00, 20:00"></label>
                <label>Language<select class="ex-lang"><option value="en-US" ${med.language==='en-US'?'selected':''}>en-US</option><option value="hi-IN" ${med.language==='hi-IN'?'selected':''}>hi-IN</option><option value="kn-IN" ${med.language==='kn-IN'?'selected':''}>kn-IN</option></select></label>
            </div>
        </div>`;
    });
    list.innerHTML=html;
}
function renderUploadHistory(){
    const list=document.getElementById('uploadHistoryList');
    if(!list) return;
    if(!uploads || uploads.length===0){
        list.innerHTML='<p class="empty-history" style="color:var(--gray-500); font-size:0.85rem; text-align:center; padding:8px;">No uploads yet</p>';
        return;
    }
    let html='';
    uploads.forEach(item=>{
        const thumb = item.thumbnail || '';
        const meds = item.extracted_medicines || item.medicines || [];
        const medsText = meds.map(m=>m.name).join(', ') || 'No meds';
        const date = item.upload_date || item.date || '';
        html+=`<div class="upload-history-item">
            ${thumb?`<img src="${thumb}" class="upload-history-thumb" alt="thumb">`:`<div class="upload-history-thumb" style="display:flex;align-items:center;justify-content:center;"><svg class="icon" viewBox="0 0 24 24" style="width:1.1em;height:1.1em;"><path d="M6 3h9l5 5v13H6z"></path><path d="M15 3v5h5"></path></svg></div>`}
            <div class="upload-history-info">
                <strong>${escapeHtml(item.filename)}</strong>
                <small>${escapeHtml(date)}</small>
                <div class="upload-history-meds">${escapeHtml(medsText)}</div>
            </div>
        </div>`;
    });
    list.innerHTML=html;
}

// Add Medicine
function initAddMedicine(){
    const form=document.getElementById('medicineForm');
    if(!form) return;
    form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        if(!activePatientId){ showToast('Select a patient first','error'); return; }
        const name=document.getElementById('medicineName').value.trim();
        const dosage=document.getElementById('medicineDosage').value.trim();
        const time=document.getElementById('medicineTime').value.trim();
        const additional=document.getElementById('medicineTimes').value.trim();
        const language=document.getElementById('medicineLanguage').value;
        if(!name || !dosage || !time){ showToast('Name, dosage and time required','error'); return; }
        let times=[time];
        if(additional){
            const extra=additional.split(',').map(s=>s.trim()).filter(Boolean);
            times=times.concat(extra);
        }
        // dedup sort
        times=[...new Set(times)].sort();
        for(const t of times){ if(!/^\d{2}:\d{2}$/.test(t)){ showToast(`Invalid time ${t}`,'error'); return; } }
        try{
            await apiFetch('/api/medicines', {method:'POST', body: JSON.stringify({patient_id:activePatientId, name, dosage, times, language})});
            showToast(`Added ${name} for ${activePatient.name}`,'success');
            form.reset();
            document.getElementById('medicineTime').value='08:00';
            await reloadActivePatientData();
        }catch(err){ showToast(err.message,'error'); }
    });
}

// Schedule, filters, timeline
function updateTodayDate(){
    const el=document.getElementById('todayDate');
    if(el) el.textContent=`Today • ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
}
function updateTimeline(){
    const bar=document.getElementById('timelineBar');
    if(!bar) return;
    if(!medicines || medicines.length===0){
        bar.innerHTML='<span style="font-size:0.75rem;color:var(--gray-500);margin:auto;">No doses to display on timeline</span>';
        return;
    }
    const doses=[];
    medicines.forEach(med=>{
        med.times.forEach(t=>{
            const status=getStatus(med,t);
            const minutes=timeToMinutes(t);
            const leftPct=(minutes/(24*60))*100;
            doses.push({med,time:t,status,leftPct,minutes});
        });
    });
    doses.sort((a,b)=>a.minutes-b.minutes);
    const nowMin=timeToMinutes(getCurrentTime());
    const nowPct=(nowMin/(24*60))*100;
    let html=`<div class="timeline-dot now" style="left:${nowPct}%;" title="Now: ${formatTime(getCurrentTime())}"></div>`;
    doses.forEach(d=>{
        html+=`<div class="timeline-dot ${d.status}" style="left:${d.leftPct}%;" title="${escapeHtml(d.med.name)} ${formatTime(d.time)} - ${d.status} (${getRelativeTime(d.time)})"></div>`;
    });
    html+=`<div style="position:absolute;bottom:-18px;left:0;font-size:0.65rem;color:var(--gray-500);">00:00</div>
        <div style="position:absolute;bottom:-18px;left:25%;font-size:0.65rem;color:var(--gray-500);transform:translateX(-50%);">06:00</div>
        <div style="position:absolute;bottom:-18px;left:50%;font-size:0.65rem;color:var(--gray-500);transform:translateX(-50%);">12:00</div>
        <div style="position:absolute;bottom:-18px;left:75%;font-size:0.65rem;color:var(--gray-500);transform:translateX(-50%);">18:00</div>
        <div style="position:absolute;bottom:-18px;right:0;font-size:0.65rem;color:var(--gray-500);">24:00</div>`;
    bar.style.position='relative';
    bar.innerHTML=html;
}
function renderSchedule(){
    const container=document.getElementById('scheduleList');
    const doseCountEl=document.getElementById('doseCount');
    const nextText=document.getElementById('nextDoseText');
    const nextRel=document.getElementById('nextDoseRelative');
    const titleEl=document.getElementById('scheduleTitle');
    if(titleEl) titleEl.textContent=`Today's schedule (${activePatient?activePatient.name:'No patient'})`;
    if(!container) return;
    updateTodayDate();
    if(!activePatientId || !medicines){
        container.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"></circle><path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path></svg></div><h3>Select a patient</h3><p>Choose a patient above to view their schedule.</p></div>`;
        if(doseCountEl) doseCountEl.textContent='0 doses';
        if(nextText) nextText.textContent='Select a patient';
        return;
    }
    const totalDoses=medicines.reduce((sum,m)=>sum+m.times.length,0);
    if(doseCountEl){
        if(currentFilter==='today'||currentFilter==='all') doseCountEl.textContent=`${totalDoses} Doses`;
        else {
            let cnt=0;
            medicines.forEach(m=>m.times.forEach(t=>{ if(getStatus(m,t)===currentFilter) cnt++; }));
            doseCountEl.textContent=`${cnt} ${currentFilter}`;
        }
    }
    document.querySelectorAll('.filter-btn').forEach(btn=>{
        btn.classList.toggle('active', btn.dataset.filter===currentFilter);
        btn.setAttribute('aria-pressed', btn.dataset.filter===currentFilter ? 'true':'false');
    });
    if(medicines.length===0){
        container.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg class="icon" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="8" rx="4"></rect><path d="M12 10v8"></path></svg></div><h3>No medicines here yet</h3><p>Add a medicine for ${escapeHtml(activePatient.name)} to get started.</p></div>`;
        if(nextText) nextText.textContent='No doses scheduled';
        if(nextRel) nextRel.textContent='';
        updateTimeline();
        return;
    }
    // Filtered meds
    function getFilteredMeds(filter){
        if(filter==='today'||filter==='all') return [...medicines];
        return medicines.filter(m=>m.times.some(t=>getStatus(m,t)===filter));
    }
    const filteredMeds=getFilteredMeds(currentFilter);
    if(filteredMeds.length===0){
        const label=currentFilter.charAt(0).toUpperCase()+currentFilter.slice(1);
        container.innerHTML=`<div class="empty-state"><div class="empty-icon"><svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg></div><h3>No ${label.toLowerCase()} doses</h3><p>Nothing matches the "${label}" filter right now.</p><button class="btn btn-outline btn-sm" onclick="setFilter('today')" style="margin-top:10px;">Show today</button></div>`;
        updateTimeline();
        return;
    }
    // Next dose
    const nowMin=timeToMinutes(getCurrentTime());
    let next=null, minDiff=Infinity;
    medicines.forEach(med=>med.times.forEach(t=>{
        if(getStatus(med,t)==='pending'){
            const diff=timeToMinutes(t)-nowMin;
            if(diff>=0 && diff<minDiff){ minDiff=diff; next={med,time:t,diff}; }
        }
    }));
    if(nextText){
        if(next){
            nextText.textContent=`${next.med.name} at ${formatTime(next.time)} (${next.med.dosage})`;
            if(nextRel){ nextRel.textContent=getRelativeTime(next.time); nextRel.className=next.diff<=15?'relative-time now':'relative-time upcoming'; }
        } else {
            let overdue=null;
            medicines.forEach(med=>med.times.forEach(t=>{ if(getStatus(med,t)==='missed' && !overdue) overdue={med,time:t}; }));
            if(overdue){ nextText.textContent=`Overdue: ${overdue.med.name} at ${formatTime(overdue.time)}`; if(nextRel){ nextRel.textContent=getRelativeTime(overdue.time); nextRel.className='relative-time overdue'; } }
            else if(medicines.every(m=>m.times.every(t=>getStatus(m,t)==='taken'))){ nextText.textContent='All doses taken today — well done'; if(nextRel){ nextRel.textContent='Great job'; nextRel.className='relative-time now'; } }
            else { nextText.textContent='No pending doses'; if(nextRel) nextRel.textContent=''; }
        }
    }
    const statNext=document.getElementById('statNextDose');
    if(statNext){
        if(next) statNext.textContent=formatTime(next.time);
        else if(medicines.every(m=>m.times.every(t=>getStatus(m,t)==='taken'))) statNext.textContent='Done';
        else statNext.textContent='--';
    }

    // Render grouped
    const groupsOrder=['morning','afternoon','evening','night'];
    const groupLabels={morning:'Morning (6:00 – 11:59)', afternoon:'Afternoon (12:00 – 16:59)', evening:'Evening (17:00 – 20:59)', night:'Night (21:00 – 5:59)'};
    const grouped={morning:[], afternoon:[], evening:[], night:[]};
    const medsSorted=[...filteredMeds].sort((a,b)=>timeToMinutes(a.times[0])-timeToMinutes(b.times[0]));
    medsSorted.forEach(med=>{
        const grp=getTimeSlotGroup(med.times[0]);
        grouped[grp].push(med);
    });
    let html='';
    groupsOrder.forEach(group=>{
        const meds=grouped[group];
        if(meds.length===0) return;
        html+=`<div class="section-divider ${group}">${groupLabels[group]}</div>`;
        meds.forEach(med=>{
            const timeRows=med.times.filter(t=>{
                if(currentFilter==='pending'||currentFilter==='taken'||currentFilter==='missed') return getStatus(med,t)===currentFilter;
                return true;
            }).map(t=>{
                const status=getStatus(med,t);
                let badgeClass='status-pending-badge', badgeText='Pending', relClass='upcoming';
                if(status==='taken'){ badgeClass='status-taken-badge'; badgeText='Taken'; relClass='now';}
                else if(status==='missed'){ badgeClass='status-missed-badge'; badgeText='Missed'; relClass='overdue';}
                const rel=getRelativeTime(t);
                let btn='';
                if(status==='pending') btn=`<button class="confirm-btn btn btn-success btn-sm" data-id="${med.id}" data-time="${t}" style="min-height:48px;">Mark taken</button>`;
                else if(status==='taken') btn=`<button class="confirm-btn" disabled style="opacity:0.5; padding:6px 14px; border-radius:20px; background:var(--green); color:white; border:none;">Completed</button>`;
                else btn=`<button class="confirm-btn btn btn-warning btn-sm" data-id="${med.id}" data-time="${t}" style="min-height:48px;">Mark as taken</button>`;
                const isDue=isDueNow(med,t);
                return `<div class="dose-row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-100);gap:8px;flex-wrap:wrap;">
                    <span style="font-weight:600; ${isDue?'color:var(--blue);font-weight:800;':''}">${formatTime(t)} <small>(${t})</small></span>
                    <span class="relative-time ${relClass}">${rel}</span>
                    <span class="status-badge ${badgeClass}">${badgeText}</span>
                    ${btn}
                </div>`;
            }).join('');
            const statuses=med.times.filter(t=>{
                if(currentFilter==='pending'||currentFilter==='taken'||currentFilter==='missed') return getStatus(med,t)===currentFilter;
                return true;
            }).map(t=>getStatus(med,t));
            let overallClass='status-pending', overallBadge='<span class="status-badge status-pending-badge">Pending</span>';
            if(statuses.every(s=>s==='taken') && statuses.length>0){ overallClass='status-taken'; overallBadge='<span class="status-badge status-taken-badge">Taken</span>';}
            else if(statuses.some(s=>s==='missed')){ overallClass='status-missed'; overallBadge='<span class="status-badge status-missed-badge">Missed</span>';}
            const hasDue=med.times.some(t=>isDueNow(med,t));
            html+=`<div class="medicine-card ${overallClass}" data-id="${med.id}">
                <div class="medicine-card-top">
                    <div class="medicine-info">
                        <h3>${escapeHtml(med.name)} ${hasDue?'<span class="current-time-highlight">Due Now</span>':''}</h3>
                        <p class="medicine-dosage">${escapeHtml(med.dosage)} • ${med.times.map(formatTime).join(', ')}</p>
                        <span class="medicine-lang"><svg class="icon" style="width:0.85em;height:0.85em;" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"></path></svg> ${escapeHtml(med.language)}</span>
                    </div>
                    ${overallBadge}
                </div>
                <div style="margin:8px 0;">${timeRows}</div>
                <div class="medicine-card-actions">
                    <button class="delete-btn" data-id="${med.id}" style="min-height:44px;">Delete</button>
                    <button class="btn btn-outline btn-sm edit-btn" data-id="${med.id}" style="min-height:44px;">Edit</button>
                </div>
            </div>`;
        });
    });
    container.innerHTML=html;
    // handlers
    container.querySelectorAll('.confirm-btn[data-id]').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
            const id=parseInt(e.currentTarget.getAttribute('data-id'));
            const time=e.currentTarget.getAttribute('data-time');
            await confirmDose(id,time);
        });
    });
    container.querySelectorAll('.delete-btn').forEach(btn=>{
        btn.addEventListener('click', async (e)=>{
            const id=parseInt(e.currentTarget.getAttribute('data-id'));
            if(!confirm('Delete this medicine?')) return;
            try{
                await apiFetch(`/api/medicines/${id}?patient_id=${activePatientId}`, {method:'DELETE'});
                showToast('Medicine removed','success');
                await reloadActivePatientData();
            }catch(err){ showToast(err.message,'error'); }
        });
    });
    container.querySelectorAll('.edit-btn').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            const id=parseInt(e.currentTarget.getAttribute('data-id'));
            const med=medicines.find(m=>m.id===id);
            if(!med) return;
            const newName=prompt('Edit medicine name:', med.name);
            if(newName===null) return;
            const newDosage=prompt('Edit dosage:', med.dosage);
            if(newDosage===null) return;
            const newTimesStr=prompt('Edit times (comma separated HH:MM):', med.times.join(', '));
            if(newTimesStr===null) return;
            const newTimes=newTimesStr.split(',').map(s=>s.trim()).filter(Boolean);
            const newLang=prompt('Language (en-US/hi-IN/kn-IN):', med.language) || med.language;
            apiFetch(`/api/medicines/${id}`, {method:'PUT', body: JSON.stringify({patient_id:activePatientId, name:newName, dosage:newDosage, times:newTimes, language:newLang})})
                .then(()=>{ showToast('Medicine updated','success'); reloadActivePatientData(); })
                .catch(err=>showToast(err.message,'error'));
        });
    });
    updateTimeline();
}
function setFilter(filter){
    currentFilter=filter;
    try{ localStorage.setItem('caregiver_filter', filter); }catch(e){}
    renderSchedule();
    renderHistory();
}
function renderCompliance(){
    const title=document.getElementById('complianceTitle');
    if(title) title.textContent=`Compliance (${activePatient?activePatient.name:'No patient'})`;
    if(!stats || !activePatientId){
        document.getElementById('statTaken').textContent='0';
        document.getElementById('statPending').textContent='0';
        document.getElementById('statMissed').textContent='0';
        document.getElementById('statUpcoming').textContent='0';
        document.getElementById('statOverdue').textContent='0';
        document.getElementById('complianceText').innerHTML='<strong>0%</strong> (0/0)';
        document.getElementById('complianceFill').style.width='0%';
        return;
    }
    document.getElementById('statTaken').textContent=stats.taken;
    document.getElementById('statPending').textContent=stats.pending;
    document.getElementById('statMissed').textContent=stats.missed;
    document.getElementById('statUpcoming').textContent=stats.upcoming;
    document.getElementById('statOverdue').textContent=stats.overdue;
    const total=stats.total||0;
    const pct=stats.compliance||0;
    document.getElementById('complianceText').innerHTML=`<strong>${pct}%</strong> (${stats.taken}/${total} taken)`;
    const fill=document.getElementById('complianceFill');
    fill.style.width=`${pct}%`;
    document.querySelector('.compliance-bar').setAttribute('aria-valuenow', String(pct));
}
function renderHistory(){
    const container=document.getElementById('historyList');
    const title=document.getElementById('historyTitle');
    if(title) title.textContent=`Dose history (${activePatient?activePatient.name:'No patient'})`;
    if(!container) return;
    if(!activePatientId || medicines.length===0){
        container.innerHTML=`<div class="empty-state" style="padding:20px;"><p>No history yet</p></div>`;
        return;
    }
    const entries=[];
    medicines.forEach(med=>{
        med.times.forEach(t=>{
            const status=getStatus(med,t);
            if(currentFilter==='pending' && status!=='pending') return;
            if(currentFilter==='taken' && status!=='taken') return;
            if(currentFilter==='missed' && status!=='missed') return;
            entries.push({time:t, minutes:timeToMinutes(t), medicine:med.name, dosage:med.dosage, status, relative:getRelativeTime(t)});
        });
    });
    entries.sort((a,b)=>a.minutes-b.minutes);
    if(entries.length===0){ container.innerHTML=`<div class="empty-state" style="padding:20px;"><p>No history matches filter</p></div>`; return; }
    let html='';
    entries.forEach(e=>{
        let cls='history-pending';
        let badge='<span class="badge badge-warning">Pending</span>';
        if(e.status==='taken'){ cls='history-taken'; badge='<span class="badge badge-success">Taken</span>';}
        else if(e.status==='missed'){ cls='history-missed'; badge='<span class="badge badge-danger">Missed</span>';}
        html+=`<div class="history-item ${cls}"><span class="history-time">${formatTime(e.time)} • ${e.relative}</span><span class="history-medicine">${escapeHtml(e.medicine)} • ${escapeHtml(e.dosage)}</span><span class="history-status">${badge}</span></div>`;
    });
    container.innerHTML=html;
}
async function confirmDose(medicineId, time){
    if(!activePatientId) return;
    try{
        await apiFetch('/api/doses/confirm', {method:'POST', body: JSON.stringify({patient_id:activePatientId, medicine_id:medicineId, time})});
        showToast(`Marked as taken at ${formatTime(time)}`,'success');
        await reloadActivePatientData();
    }catch(e){ showToast(e.message,'error'); }
}

// Quick actions
function initQuickActions(){
    document.getElementById('quickMarkAllBtn').addEventListener('click', async ()=>{
        if(!activePatientId){ showToast('Select patient','error'); return; }
        const pending=[];
        medicines.forEach(m=>m.times.forEach(t=>{ if(getStatus(m,t)==='pending') pending.push({med:m,time:t}); }));
        if(pending.length===0){ showToast('No pending doses','info'); return; }
        showLoading('Marking all taken...');
        for(const p of pending){
            try{ await apiFetch('/api/doses/confirm', {method:'POST', body: JSON.stringify({patient_id:activePatientId, medicine_id:p.med.id, time:p.time})}); }catch(e){ console.warn(e); }
        }
        hideLoading();
        showToast(`Marked ${pending.length} dose${pending.length===1?'':'s'} as taken`,'success');
        await reloadActivePatientData();
    });
    document.getElementById('quickSpeakAllBtn').addEventListener('click', ()=>{
        if(!activePatientId){ showToast('Select patient','error'); return; }
        const pending=[];
        medicines.forEach(m=>m.times.forEach(t=>{ if(getStatus(m,t)==='pending') pending.push({med:m,time:t}); }));
        if(pending.length===0){ showToast('No pending doses','info'); return; }
        pending.sort((a,b)=>timeToMinutes(a.time)-timeToMinutes(b.time));
        // Use TTS
        speakAllPending(pending);
    });
    document.getElementById('quickStatsBtn').addEventListener('click', async ()=>{
        if(!activePatientId){ showToast('Select patient','error'); return; }
        await reloadActivePatientData();
        showToast('Stats refreshed','success');
    });
    document.getElementById('loadDemoBtn').addEventListener('click', async ()=>{
        if(!activePatientId){ showToast('Select patient','error'); return; }
        try{
            await apiFetch('/api/demo/load', {method:'POST', body: JSON.stringify({patient_id:activePatientId})});
            showToast('Demo data loaded','success');
            await reloadActivePatientData();
        }catch(e){ showToast(e.message,'error'); }
    });
    document.getElementById('resetDemoBtn').addEventListener('click', async ()=>{
        if(!activePatientId){ showToast('Select patient','error'); return; }
        if(!confirm(`Reset all data for ${activePatient.name}?`)) return;
        try{
            await apiFetch('/api/demo/reset', {method:'POST', body: JSON.stringify({patient_id:activePatientId})});
            showToast('Demo data reset','success');
            await reloadActivePatientData();
        }catch(e){ showToast(e.message,'error'); }
    });
    document.querySelectorAll('.filter-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>setFilter(btn.dataset.filter));
    });
    // restore filter
    try{ const stored=localStorage.getItem('caregiver_filter'); if(stored) currentFilter=stored; }catch(e){}
}

// TTS
let voices=[];
let isSpeaking=false;
let speakQueue=[];
function updateVoiceStatusForPatient(){
    // Not needed caregiver, but update generic
}
function loadVoices(){ voices=speechSynthesis.getVoices()||[]; }
if('speechSynthesis' in window){
    loadVoices();
    if(speechSynthesis.onvoiceschanged!==undefined) speechSynthesis.onvoiceschanged=loadVoices;
    setTimeout(loadVoices,500);
    setTimeout(loadVoices,1500);
}
function pickVoice(lang){
    if(voices.length===0) return null;
    let v=voices.find(x=>x.lang===lang);
    if(v) return v;
    const prefix=lang.split('-')[0];
    v=voices.find(x=>x.lang.startsWith(prefix));
    if(v) return v;
    if(lang==='kn-IN'){ v=voices.find(x=>x.lang.startsWith('kn'))||voices.find(x=>x.lang.startsWith('hi'))||voices.find(x=>x.lang==='en-IN')||voices.find(x=>x.lang==='en-US')||voices[0]; return v;}
    if(lang==='hi-IN'){ v=voices.find(x=>x.lang==='hi-IN')||voices.find(x=>x.lang.startsWith('hi'))||voices.find(x=>x.lang==='en-IN')||voices.find(x=>x.lang==='en-US')||voices[0]; return v;}
    return voices.find(x=>x.lang==='en-US')||voices[0];
}
function speak(text, lang){
    if(!('speechSynthesis' in window)){ showToast('Speech not supported','error'); return; }
    const utter=new SpeechSynthesisUtterance(text);
    utter.lang=lang||'en-US';
    utter.rate=0.9;
    utter.volume=1;
    const voice=pickVoice(utter.lang);
    if(voice) utter.voice=voice;
    utter.onend=()=>{ isSpeaking=false; if(speakQueue.length>0){ const next=speakQueue.shift(); setTimeout(()=>speak(next.text,next.lang),2000); }};
    utter.onerror=()=>{ isSpeaking=false; if(speakQueue.length>0){ const next=speakQueue.shift(); setTimeout(()=>speak(next.text,next.lang),2000); }};
    isSpeaking=true;
    speechSynthesis.speak(utter);
}
function stopSpeaking(){ speakQueue=[]; if('speechSynthesis' in window) speechSynthesis.cancel(); isSpeaking=false; }
function speakAllPending(pendingList){
    if(pendingList.length===0) return;
    stopSpeaking();
    speakQueue=[];
    const lang = activePatient ? activePatient.language : 'en-US';
    const texts=pendingList.map(p=>{
        const tmpl = lang==='kn-IN' ? `${activePatient.name}, ${p.med.name} ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯ. ${p.med.dosage} ತೆಗೆದುಕೊಳ್ಳಿ.` :
                     lang==='hi-IN' ? `${activePatient.name}, ${p.med.name} लेने का समय है. ${p.med.dosage} लें.` :
                     `${activePatient.name}, it is time to take ${p.med.name}. Take ${p.med.dosage}.`;
        return {text:tmpl, lang};
    });
    const first=texts.shift();
    speakQueue=texts;
    speak(first.text, first.lang);
    showToast(`Speaking ${pendingList.length} reminders for ${activePatient.name}`,'info');
}

// Voice Agent
let recognition=null;
let isListening=false;
function initVoiceAgent(){
    const startBtn=document.getElementById('voiceStartBtn');
    const stopBtn=document.getElementById('voiceStopBtn');
    const statusEl=document.getElementById('voiceStatus');
    const transEl=document.getElementById('voiceTranscription');
    const respEl=document.getElementById('voiceResponse');
    const examples=document.querySelectorAll('.voice-example-btn');

    // check support
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){
        if(statusEl) statusEl.textContent='Not supported in this browser (try Chrome)';
        if(startBtn) startBtn.disabled=true;
    } else {
        recognition=new SR();
        recognition.continuous=false;
        recognition.interimResults=false;
        recognition.lang='en-US'; // will adapt per patient later
        recognition.onstart=()=>{
            isListening=true;
            if(statusEl) statusEl.textContent='Listening...';
            if(startBtn) startBtn.disabled=true;
            if(stopBtn) stopBtn.disabled=false;
            document.querySelector('.voice-agent-container')?.classList.add('listening');
        };
        recognition.onend=()=>{
            isListening=false;
            if(statusEl) statusEl.textContent='Idle';
            if(startBtn) startBtn.disabled=false;
            if(stopBtn) stopBtn.disabled=true;
            document.querySelector('.voice-agent-container')?.classList.remove('listening');
        };
        recognition.onerror=(e)=>{
            showToast('Voice error: '+e.error,'error');
            if(statusEl) statusEl.textContent='Error';
            isListening=false;
        };
        recognition.onresult=async (e)=>{
            const transcript=e.results[0][0].transcript;
            if(transEl) transEl.textContent=transcript;
            const answer=await getVoiceAnswer(transcript);
            if(respEl) respEl.textContent=answer;
            // speak answer in patient's language
            const lang = activePatient?activePatient.language:'en-US';
            speak(answer, lang);
        };
    }

    if(startBtn){
        startBtn.addEventListener('click', ()=>{
            if(!activePatientId){ showToast('Select a patient first','error'); return; }
            if(!recognition){ // fallback: prompt
                const q=prompt('Enter your question:','What is due next?');
                if(q){
                    if(transEl) transEl.textContent=q;
                    getVoiceAnswer(q).then(ans=>{
                        if(respEl) respEl.textContent=ans;
                        const lang=activePatient?activePatient.language:'en-US';
                        speak(ans, lang);
                    });
                }
                return;
            }
            // set language per patient
            try{ recognition.lang = activePatient?activePatient.language:'en-US'; }catch(e){}
            if(transEl) transEl.textContent='Listening...';
            try{ recognition.start(); }catch(e){ showToast(e.message,'error'); }
        });
    }
    if(stopBtn){
        stopBtn.addEventListener('click', ()=>{
            if(recognition && isListening) recognition.stop();
            if(statusEl) statusEl.textContent='Idle';
        });
    }
    examples.forEach(btn=>{
        btn.addEventListener('click', async ()=>{
            const qtype=btn.getAttribute('data-question');
            let query='';
            // map to example questions as per spec
            if(qtype==='morning') query=`Did ${activePatient?activePatient.name:'patient'} take their morning medicine?`;
            else if(qtype==='next') query=`What is due next for ${activePatient?activePatient.name:'patient'}?`;
            else if(qtype==='missed') query=`Did ${activePatient?activePatient.name:'patient'} miss any today?`;
            else if(qtype==='summary') query=`Summary for today for ${activePatient?activePatient.name:'patient'}?`;
            else query=qtype;
            if(transEl) transEl.textContent=query;
            const ans=await getVoiceAnswer(query);
            if(respEl) respEl.textContent=ans;
            const lang=activePatient?activePatient.language:'en-US';
            speak(ans, lang);
        });
    });
}
function generateVoiceAnswer(transcript){
    if(!activePatient) return 'Please select a patient first.';
    const name=activePatient.name;
    const q=transcript.toLowerCase();
    // gather data
    const pending=[];
    const taken=[];
    const missed=[];
    medicines.forEach(m=>{
        m.times.forEach(t=>{
            const s=getStatus(m,t);
            if(s==='pending') pending.push({med:m,time:t});
            else if(s==='taken') taken.push({med:m,time:t});
            else if(s==='missed') missed.push({med:m,time:t});
        });
    });
    pending.sort((a,b)=>timeToMinutes(a.time)-timeToMinutes(b.time));
    missed.sort((a,b)=>timeToMinutes(a.time)-timeToMinutes(b.time));

    let answer='';
    // check keywords
    if(q.includes('morning')){
        // morning 6-11
        const morningMeds=pending.filter(p=>{ const h=Number(p.time.split(':')[0]); return h>=6&&h<=11; });
        const morningTaken=taken.filter(p=>{ const h=Number(p.time.split(':')[0]); return h>=6&&h<=11; });
        const morningMissed=missed.filter(p=>{ const h=Number(p.time.split(':')[0]); return h>=6&&h<=11; });
        if(morningTaken.length>0) answer=`Yes, ${name} took their morning medicine: ${morningTaken.map(p=>p.med.name+' at '+formatTime(p.time)).join(', ')}.`;
        else if(morningMissed.length>0) answer=`No, ${name} missed morning medicine: ${morningMissed.map(p=>p.med.name+' at '+formatTime(p.time)).join(', ')}.`;
        else if(morningMeds.length>0) answer=`${name} has pending morning medicine: ${morningMeds.map(p=>p.med.name+' at '+formatTime(p.time)).join(', ')}.`;
        else answer=`${name} has no morning medicines scheduled.`;
    } else if(q.includes('next') || q.includes('due')){
        if(pending.length>0){
            const next=pending[0];
            answer=`Next for ${name} is ${next.med.name} at ${formatTime(next.time)} (${next.med.dosage}), ${getRelativeTime(next.time)}.`;
        } else if(missed.length>0){
            answer=`${name} has no pending doses, but missed: ${missed.map(p=>p.med.name+' at '+formatTime(p.time)).join(', ')}.`;
        } else {
            answer=`All done! ${name} has taken all medicines today. Great job!`;
        }
    } else if(q.includes('miss')){
        if(missed.length>0) answer=`Yes, ${name} missed ${missed.length} dose(s): ${missed.map(p=>p.med.name+' at '+formatTime(p.time)).join(', ')}.`;
        else answer=`No, ${name} did not miss any medicines today.`;
    } else if(q.includes('summary') || q.includes('today')){
        const total=pending.length+taken.length+missed.length;
        const pct=total?Math.round((taken.length/total)*100):0;
        answer=`Summary for ${name} today: Taken ${taken.length}, Pending ${pending.length}, Missed ${missed.length}, Compliance ${pct}%.`;
        if(pending.length) answer+=` Next is ${pending[0].med.name} at ${formatTime(pending[0].time)}.`;
    } else {
        // check medicine name mention
        let found=false;
        for(const med of medicines){
            if(q.includes(med.name.toLowerCase())){
                const times=med.times;
                const statuses=times.map(t=>`${formatTime(t)}: ${getStatus(med,t)}`).join(', ');
                answer=`${name}'s ${med.name} (${med.dosage}) schedule: ${statuses}.`;
                found=true;
                break;
            }
        }
        if(!found){
            // generic summary
            if(pending.length>0) answer=`${name} has ${pending.length} pending doses. Next is ${pending[0].med.name} at ${formatTime(pending[0].time)}. Taken ${taken.length}, Missed ${missed.length}.`;
            else if(missed.length>0) answer=`${name} has no pending but missed ${missed.length} doses today.`;
            else answer=`${name}: All caught up! Taken ${taken.length} doses, no pending or missed.`;
        }
    }
    // Ensure name mentioned
    if(!answer.includes(name)) answer=`${name}: `+answer;
    return answer;
}
async function getVoiceAnswer(transcript){
    const fallback=()=>generateVoiceAnswer(transcript);
    if(!activePatientId) return 'Please select a patient first.';
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(), 15000);
    try{
        const r=await fetch('/api/voice-agent', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({text: transcript, patient_id: activePatientId}),
            signal: ctrl.signal
        });
        const data=await r.json();
        if(data && data.answer && data.source!=='rule') return data.answer;
    }catch(e){ /* SLM unreachable/offline -> rule matcher below */ }
    finally{ clearTimeout(timer); }
    return fallback();
}
function updateVoiceAgentForPatient(){
    const nameEl=document.getElementById('voicePatientName');
    const descEl=document.getElementById('voiceDescPatient');
    const respEl=document.getElementById('voiceResponse');
    if(nameEl) nameEl.textContent=activePatient?activePatient.name:'patient';
    if(descEl) descEl.textContent=activePatient?activePatient.name:'selected patient';
    if(respEl) respEl.textContent=`Ask about ${activePatient?activePatient.name:'patient'}...`;
    // update example buttons text
    document.querySelectorAll('.voice-example-btn').forEach(btn=>{
        const qtype=btn.getAttribute('data-question');
        if(qtype==='morning') btn.textContent=`Did ${activePatient?activePatient.name:'Amma'} take morning medicine?`;
        else if(qtype==='next') btn.textContent=`Next dose?`;
        else if(qtype==='missed') btn.textContent=`Missed any?`;
        else if(qtype==='summary') btn.textContent=`Summary?`;
    });
}

// Init
document.addEventListener('DOMContentLoaded', async ()=>{
    initDarkMode();
    await loadPatients();
    initAddPatient();
    initUpload();
    initAddMedicine();
    initQuickActions();
    initVoiceAgent();
    // Also ensure upload history etc loaded after patient selection
    if(!activePatientId && patients.length>0){
        // loadPatients already set
    }
    // offline listeners
    window.addEventListener('online', ()=>{ updateApiStatus(true); showToast('Online','success'); });
    window.addEventListener('offline', ()=>{ updateApiStatus(false); showToast('Offline','info'); });
});
window.setActivePatient=setActivePatient;


// Spotlight tour engine — caregiver app (vanilla JS, no dependencies)
// Persists "seen" state in localStorage under key 'caregiver_tour_v1_seen'

(function() {
  'use strict';
  var TOUR_KEY = 'caregiver_tour_v1_seen';
  var AUTO_DELAY = 1200;
  var PAD = 8;
  var STEPS = [
    { target: null, title: 'Welcome to the Caregiver Dashboard', body: "A quick, one-time look at how everything fits together — about a minute. Skip it any time, or press Next to continue." },
    { target: '#patientsSection', title: 'Everyone you look after', body: 'Every patient you manage lives here. Select one to see and manage their medicines — add a new patient any time with the button below the list.' },
    { target: '#uploadSection', title: 'Read a prescription in seconds', body: 'Upload a photo of a prescription and the app pulls out medicine names, dosages and times automatically. Review everything before it is added.' },
    { target: '#addMedicineForm', title: 'Or add one by hand', body: 'For anything the scan misses, this form adds a medicine directly — name, dosage, time, and which language it should be reminded in.' },
    { target: '#scheduleDisplay', title: "Today's schedule", body: 'Filter by pending, taken or missed, or scan the 24-hour timeline to see the shape of the day at a glance.' },
    { target: '#complianceSection', title: 'How today is going', body: 'One bar shows the percentage of doses taken so far today, with taken, pending and missed counted out separately.' },
    { target: '#historyLog', title: 'Nothing gets lost', body: "A short log of what happened today and recently — enough to answer 'did she take it?' without a phone call." },
    { target: '#voiceAgent', title: 'Or just ask', body: "Press Start Listening and ask a question out loud, like 'did Amma take her morning medicine?' — the answer comes back spoken, too." },
    { target: '#quickActions', title: 'Shortcuts for busy mornings', body: 'Mark every pending dose taken at once, speak all reminders aloud, or load and reset demo data for a walkthrough.' },
    { target: null, title: "That's everything", body: "You're ready to go. Press Take a Tour at the top any time to see this again." }
  ];

  var idx = 0;
  var active = false;
  var scrim = null, spot = null, card = null;
  var eyebrowEl = null, titleEl = null, bodyEl = null, dotsEl = null;
  var backBtn = null, skipBtn = null, nextBtn = null;
  var repositionTimer = null;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function getSeen() {
    try { return window.localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { return false; }
  }
  function setSeen() {
    try { window.localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
  }

  function ensureDOM() {
    if (card) return;
    scrim = document.createElement('div');
    scrim.className = 'tour-scrim';
    scrim.style.display = 'none';
    document.body.appendChild(scrim);

    spot = document.createElement('div');
    spot.className = 'tour-spot tour-spot-hidden';
    spot.style.display = 'none';
    document.body.appendChild(spot);

    card = document.createElement('div');
    card.className = 'tour-card';
    card.style.display = 'none';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    card.innerHTML =
      '<div class="tour-eyebrow"></div>' +
      '<h3 class="tour-title"></h3>' +
      '<p class="tour-body"></p>' +
      '<div class="tour-dots" aria-hidden="true"></div>' +
      '<div class="tour-actions">' +
        '<button type="button" class="tour-skip">Skip tour</button>' +
        '<div class="tour-nav">' +
          '<button type="button" class="tour-back">Back</button>' +
          '<button type="button" class="tour-next">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(card);

    eyebrowEl = card.querySelector('.tour-eyebrow');
    titleEl = card.querySelector('.tour-title');
    bodyEl = card.querySelector('.tour-body');
    dotsEl = card.querySelector('.tour-dots');
    backBtn = card.querySelector('.tour-back');
    skipBtn = card.querySelector('.tour-skip');
    nextBtn = card.querySelector('.tour-next');

    backBtn.addEventListener('click', function() { showStep(idx - 1); });
    nextBtn.addEventListener('click', function() { showStep(idx + 1); });
    skipBtn.addEventListener('click', function() { endTour(); });
  }

  function renderDots() {
    var html = '';
    for (var j = 0; j < STEPS.length; j++) {
      var cls = 'tour-dot';
      if (j === idx) cls += ' is-current';
      else if (j < idx) cls += ' is-done';
      html += '<div class="' + cls + '"></div>';
    }
    dotsEl.innerHTML = html;
  }

  function positionSpot(el) {
    var r = el.getBoundingClientRect();
    spot.style.width = (r.width + PAD * 2) + 'px';
    spot.style.height = (r.height + PAD * 2) + 'px';
    spot.style.top = Math.max(4, r.top - PAD) + 'px';
    spot.style.left = Math.max(4, r.left - PAD) + 'px';
  }

  function showStep(i) {
    if (!active) return;
    var dir = i >= idx ? 1 : -1;
    var guard = 0;
    while (i >= 0 && i < STEPS.length && guard < STEPS.length) {
      var t = STEPS[i].target;
      if (t === null || document.querySelector(t)) break;
      i += dir;
      guard++;
    }
    if (i < 0) i = 0;
    if (i >= STEPS.length) { endTour(); return; }
    var step = STEPS[i];
    if (step.target !== null && !document.querySelector(step.target)) { endTour(); return; }
    idx = i;

    eyebrowEl.textContent = (idx + 1) + ' of ' + STEPS.length;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    renderDots();
    nextBtn.textContent = (idx === STEPS.length - 1) ? 'Finish' : 'Next';
    backBtn.disabled = (idx === 0);
    card.style.display = 'block';

    if (step.target === null) {
      spot.classList.add('tour-spot-hidden');
      spot.style.display = 'none';
      scrim.style.display = 'block';
      scrim.style.background = 'rgba(14,18,19,0.58)';
      return;
    }

    var el = document.querySelector(step.target);
    scrim.style.display = 'block';
    scrim.style.background = 'transparent';
    try {
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    } catch (e) {}
    spot.style.display = 'block';
    positionSpot(el);
    spot.classList.remove('tour-spot-hidden');
    if (repositionTimer) { clearTimeout(repositionTimer); repositionTimer = null; }
    if (!reducedMotion()) {
      repositionTimer = setTimeout(function() {
        if (active && STEPS[idx] && STEPS[idx].target) {
          var cur = document.querySelector(STEPS[idx].target);
          if (cur) positionSpot(cur);
        }
      }, 400);
    }
  }

  function reposition() {
    if (!active) return;
    var step = STEPS[idx];
    if (!step || step.target === null) return;
    var el = document.querySelector(step.target);
    if (el && spot.style.display !== 'none') positionSpot(el);
  }

  function endTour() {
    active = false;
    setSeen();
    if (repositionTimer) { clearTimeout(repositionTimer); repositionTimer = null; }
    if (scrim) scrim.style.display = 'none';
    if (spot) { spot.classList.add('tour-spot-hidden'); spot.style.display = 'none'; }
    if (card) card.style.display = 'none';
    idx = 0;
  }

  function startTour() {
    ensureDOM();
    if (active) { showStep(0); return; }
    active = true;
    idx = 0;
    showStep(0);
  }

  document.addEventListener('keydown', function(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); endTour(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key === 'Enter' && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      e.preventDefault();
      showStep(idx + 1);
    }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); showStep(idx - 1); }
  });
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, { passive: true, capture: true });

  window.addEventListener('load', function() {
    var btn = document.getElementById('tourBtn');
    if (btn) btn.addEventListener('click', function() { startTour(); });
    if (!getSeen()) setTimeout(function() { startTour(); }, AUTO_DELAY);
  });

  window.startCaregiverTour = startTour;
})();

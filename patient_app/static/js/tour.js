// Spotlight tour engine — patient app (vanilla JS, no dependencies)
// Persists "seen" state in localStorage under key 'patient_tour_v1_seen'

(function() {
  'use strict';
  var TOUR_KEY = 'patient_tour_v1_seen';
  var AUTO_DELAY = 1000;
  var PAD = 8;
  var STEPS = [
    { target: null, title: 'Welcome to My Medicines', body: "A quick, one-time look at how everything works — about a minute. Press Next when you're ready, or skip it and look around on your own." },
    { target: '#scheduleSection', title: "Today's doses", body: 'Every medicine for today shows up here, grouped by morning, afternoon, evening and night. Each card shows the name, the dose, and exactly when to take it.' },
    { target: '#nextDoseBanner', title: "What's coming up", body: 'This banner always shows the very next dose, so there is never a need to scan the whole list to know what happens next.' },
    { target: '#confirmGlobalBtn', title: 'One press says it is done', body: 'Press this button — or the one on any dose card — the moment a medicine is taken. The card turns green and stays that way for the day.' },
    { target: '#speakerSection', title: 'It can read reminders aloud', body: 'Press Play Reminder to hear the dose spoken out loud, in English, Hindi or Kannada — whichever is easiest to understand.' },
    { target: '#ledSection', title: 'A light for every dose', body: 'A gentle amber glow means a dose is coming soon. It blinks faster right when a dose is due, turns green once taken, and red if it is missed.' },
    { target: '#buzzerSection', title: 'A sound, too', body: 'The buzzer sounds softly while a reminder is active. It can be muted any time, and it remembers that choice.' },
    { target: '#darkModeToggle', title: 'Easier on the eyes at night', body: 'This switches to a warm dark mode — handy for checking medicines before bed.' },
    { target: null, title: "That's everything", body: "You're ready. If this tour would help again, press Take a Tour at the top any time." }
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
    // Clamp + gracefully skip steps whose target is missing from the DOM
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
    // If we landed on another missing target (edge case), bail out safely
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
      // Centered welcome/closing step: dim backdrop, no spotlight
      spot.classList.add('tour-spot-hidden');
      spot.style.display = 'none';
      scrim.style.display = 'block';
      scrim.style.background = 'rgba(20,16,10,0.58)';
      return;
    }

    var el = document.querySelector(step.target);
    scrim.style.display = 'block';
    scrim.style.background = 'transparent';
    try {
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    } catch (e) {}
    spot.style.display = 'block';
    // Measure after scroll settles so off-screen targets highlight correctly
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
      // Don't hijack Enter while typing in inputs/textareas
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

  window.startPatientTour = startTour;
})();

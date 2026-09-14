/* Zstore AI — "One Ribbon" interactions. No dependencies.
   Popups (menu, project study) are native <dialog>s driven by one popup stack that owns
   history entries, the scroll lock, focus return and pausing the GL stage. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const doc = document.documentElement;
  const body = document.body;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const motionOn = () => !doc.classList.contains('motion-off');
  const stage = () => window.ZStage;
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol === 'file:';

  /* ---------- letter roll: split link labels into staggered characters ---------- */
  $$('.roll').forEach((el) => {
    const text = el.textContent;
    el.parentElement.setAttribute('aria-label', text);
    el.textContent = '';
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'ch'; s.style.setProperty('--i', i); s.textContent = ch; s.setAttribute('aria-hidden', 'true');
      el.appendChild(s);
    });
  });

  /* ---------- motion toggle (system preference is the default, a click is remembered) ---------- */
  const motionBtn = $('.motion-btn');
  const motionLabel = motionBtn && $('.motion-label', motionBtn);
  const syncMotion = () => {
    const on = motionOn();
    if (motionBtn) { motionBtn.setAttribute('aria-pressed', String(on)); motionBtn.setAttribute('aria-label', on ? 'Motion on. Pause motion' : 'Motion off. Play motion'); }
    if (motionLabel) motionLabel.textContent = on ? 'Motion on' : 'Motion off';
    if (stage()) stage().setMotion(on);
  };
  if (motionBtn) motionBtn.addEventListener('click', () => {
    doc.classList.toggle('motion-off');
    try { localStorage.setItem('zs-motion', motionOn() ? 'on' : 'off'); } catch (e) {}
    syncMotion();
  });
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const onReducedChange = (e) => {
    let saved = null; try { saved = localStorage.getItem('zs-motion'); } catch (err) {}
    if (saved) return;
    doc.classList.toggle('motion-off', e.matches); syncMotion();
  };
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReducedChange);
  syncMotion();
  addEventListener('load', syncMotion);

  /* ---------- live Tel Aviv clock + year ---------- */
  const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
  const tick = () => { const t = clockFmt.format(new Date()); $$('[data-clock]').forEach((el) => { el.textContent = t; }); };
  tick(); setInterval(tick, 20000);
  const year = $('#year'); if (year) year.textContent = new Date().getFullYear();

  /* ---------- reveals ---------- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  } else $$('.reveal').forEach((el) => el.classList.add('in'));

  /* ---------- scroll progress: a thin enamel line (ignored while a popup holds the page) ---------- */
  const progress = $('#scrollProgress');
  let progTick = 0;
  function updateProgress() {
    progTick = 0;
    if (!progress || doc.classList.contains('is-locked')) return;
    const total = doc.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${total > 0 ? Math.min(1, Math.max(0, scrollY / total)).toFixed(4) : 0})`;
  }
  addEventListener('scroll', () => { if (!progTick) progTick = requestAnimationFrame(updateProgress); }, { passive: true });
  addEventListener('resize', updateProgress);
  addEventListener('load', updateProgress);
  updateProgress();

  /* ---------- nav: current section ---------- */
  const navLinks = $$('.nav-links a');
  if ('IntersectionObserver' in window && navLinks.length) {
    const secIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((a) => { if (a.hash === '#' + en.target.id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    navLinks.forEach((a) => { const s = $(a.hash); if (s) secIO.observe(s); });
  }

  /* ---------- WhatsApp prefill ---------- */
  $$('[data-wa]').forEach((link) => {
    const url = new URL(link.href);
    url.searchParams.set('text', "Hi Zvi! I came across Zstore AI and I'd love to talk about a project I have in mind.");
    link.href = url.toString();
  });

  /* =====================================================================
     Popups: history entry per open popup, iOS-safe scroll lock, focus return.
     ===================================================================== */
  // Popup entries must never make the browser restore (and jump) the scroll position itself.
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
    addEventListener('pagehide', () => { history.scrollRestoration = 'auto'; });
    addEventListener('pageshow', () => { history.scrollRestoration = 'manual'; });
  }
  const stack = [];            // [{ dlg, opener, viaPop }]
  let ignorePops = 0;          // popstates caused by our own history.back()
  let settleWaiters = [];
  let settleTimer = 0;
  let lockY = 0;

  const settled = () => new Promise((resolve) => {
    if (!ignorePops) { resolve(); return; }
    settleWaiters.push(resolve);
  });
  const flushSettle = () => {
    clearTimeout(settleTimer);
    const w = settleWaiters; settleWaiters = []; w.forEach((fn) => fn());
  };

  const lockScroll = () => {
    lockY = scrollY;
    doc.classList.add('is-locked');
    Object.assign(body.style, { position: 'fixed', top: `-${lockY}px`, left: '0', right: '0', width: '100%' });
  };
  const unlockScroll = () => {
    doc.classList.remove('is-locked');
    Object.assign(body.style, { position: '', top: '', left: '', right: '', width: '' });
    window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
  };

  const openPopup = async (dlg, opener) => {
    if (!dlg || dlg.open) return;
    await settled();
    if (dlg.open) return;
    history.pushState({ zsPopup: stack.length + 1 }, '');
    if (!stack.length) lockScroll();
    stack.push({ dlg, opener: opener || document.activeElement, viaPop: false });
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    dlg.dispatchEvent(new CustomEvent('popup:open'));
    if (stage()) stage().setPaused(true);
  };

  /* Closing is synchronous (the native `close` event is async); history pops are batched
     into one history.go(-n) so closing a stacked menu + study never races two traversals. */
  const closePopup = (dlg) => {
    if (!dlg) return;
    if (dlg.open) dlg.close();
    onDialogClosed(dlg);
  };

  let pendingBack = 0;
  const flushBack = () => {
    const n = pendingBack; pendingBack = 0;
    if (!n) return;
    ignorePops++;
    history.go(-n);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { ignorePops = 0; flushSettle(); }, 700);
  };

  const onDialogClosed = (dlg) => {
    const i = stack.findIndex((e) => e.dlg === dlg);
    if (i < 0) return;
    const [entry] = stack.splice(i, 1);
    if (!entry.viaPop && history.state && history.state.zsPopup) {
      if (!pendingBack) queueMicrotask(flushBack);
      pendingBack++;
    }
    if (!stack.length) {
      unlockScroll();
      if (stage()) stage().setPaused(false);
    }
    const opener = entry.opener;
    if (opener && opener.isConnected && typeof opener.focus === 'function' && !entry.skipFocus) {
      opener.focus({ preventScroll: true });
    }
    dlg.dispatchEvent(new CustomEvent('popup:close'));
  };

  addEventListener('popstate', (e) => {
    if (ignorePops > 0) {
      ignorePops--;
      if (!ignorePops) flushSettle();
      return;
    }
    const top = stack[stack.length - 1];
    if (top) { top.viaPop = true; closePopup(top.dlg); return; }
    // same-page anchors (see below): back returns to where the visitor was, forward to the anchor
    const st = e.state;
    if (st && typeof st.zsY === 'number') window.scrollTo({ top: st.zsY, left: 0, behavior: 'instant' });
    else if (st && st.zsAnchor) scrollToTarget($(st.zsAnchor));
  });

  $$('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('close', () => onDialogClosed(dlg));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closePopup(dlg); });
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { closePopup(dlg); return; }
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePopup(dlg);
    });
  });

  /* Double tap on a sheet's ×: the second tap must not fall through to what sits under it (the nav's
     Menu button on phones, the Start a project CTA on desktop, or a stacked sheet's own ×).
     A click on the same spot (16px) within 450ms of a tap that closed a sheet is that double tap's tail,
     so it is swallowed. A deliberate tap anywhere else, e.g. on the Menu button beside ×, works at once. */
  let closeTap = null;
  $$('dialog.sheet').forEach((dlg) => dlg.addEventListener('pointerdown', (e) => {
    const r = dlg.getBoundingClientRect();
    const onBackdrop = e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    if (onBackdrop || e.target.closest('[data-close]')) closeTap = { x: e.clientX, y: e.clientY, t: performance.now(), dlg, closed: 0 };
  }));
  // capture phase (before any handler): swallow the tail of an already-armed double tap
  document.addEventListener('click', (e) => {
    if (!closeTap || !closeTap.closed) return;
    const tail = performance.now() - closeTap.closed < 450 && Math.hypot(e.clientX - closeTap.x, e.clientY - closeTap.y) < 16;
    closeTap = null;
    if (tail) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  // bubble phase (after the sheet's own click handler ran): arm only if that tap really closed the sheet
  document.addEventListener('click', () => {
    if (!closeTap || closeTap.closed) return;
    if (!closeTap.dlg.open) closeTap.closed = performance.now(); else closeTap = null;
  });

  const scrollToTarget = (target) => {
    if (!target) return;
    target.scrollIntoView({ behavior: motionOn() ? 'smooth' : 'instant', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  /* Close every popup, wait for the history to settle, then run `then` (used by links inside popups). */
  const closeAllThen = async (then) => {
    while (stack.length) {
      const top = stack[stack.length - 1];
      top.skipFocus = true;
      closePopup(top.dlg);
    }
    await Promise.resolve(); // let the batched history.go run first
    await settled();
    requestAnimationFrame(() => requestAnimationFrame(then));
  };

  /* ---------- same-page anchors (hero CTAs, service links, FAQ, Back to top, brand) ----------
     Scroll restoration is manual (popup entries must never jump the page), so plain hash links would
     leave a back press stranded. Each anchor click stores the visitor's position on the current entry,
     then pushes the anchor entry itself; popstate above scrolls back to that position. */
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.closest('dialog') || a.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    if (location.hash !== a.hash) {
      history.replaceState({ ...(history.state || {}), zsY: Math.round(scrollY) }, '');
      history.pushState({ zsAnchor: a.hash }, '', a.hash);
    }
    scrollToTarget(target);
  });

  /* ---------- mobile menu ---------- */
  const menu = $('#menu');
  const menuBtn = $('.menu-btn');
  if (menu && menuBtn) {
    menuBtn.addEventListener('click', () => openPopup(menu, menuBtn));
    menu.addEventListener('popup:open', () => { menuBtn.setAttribute('aria-expanded', 'true'); const s = $('.sheet-scroll', menu); if (s) s.scrollTop = 0; });
    menu.addEventListener('popup:close', () => menuBtn.setAttribute('aria-expanded', 'false'));
    $$('[data-menu-link]', menu).forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = $(a.hash);
      closeAllThen(() => scrollToTarget(target));
    }));
    matchMedia('(min-width: 1081px)').addEventListener('change', (e) => { if (e.matches && menu.open) closePopup(menu); });
  }

  /* ---------- interest chips ---------- */
  const interestInput = $('#interest');
  const selectInterest = (value) => {
    if (interestInput) interestInput.value = value;
    $$('[data-select-interest]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.selectInterest === value)));
  };
  $$('[data-select-interest]').forEach((b) => b.addEventListener('click', () => selectInterest(b.getAttribute('aria-pressed') === 'true' ? '' : b.dataset.selectInterest)));
  $$('[data-interest]').forEach((a) => a.addEventListener('click', () => selectInterest(a.dataset.interest)));

  /* ---------- project dialog ---------- */
  const projects = {
    atelier: { title: 'Atelier Studio', category: 'Concept study 01 · Web experience · Architecture', intro: 'A digital home with room to breathe.', idea: 'An architecture studio should feel as considered online as the spaces it creates. This concept explores a quieter, image-led approach to telling that story.', approach: 'Warm stone tones, generous spacing and editorial typography set the pace. Full-width photography lets the architecture lead, with restrained navigation that keeps the work in focus.', interest: 'Website' },
    lume: { title: 'Lume', category: 'Concept study 02 · Commerce experience · Beauty', intro: 'A quieter kind of commerce.', idea: 'How can an online shopping experience feel like a daily ritual? Lume explores an unhurried product story built around a single, beautifully presented object.', approach: 'A botanical palette, tactile art direction and a simple split layout bring clarity to the product. The design direction balances an expressive brand with an obvious next step.', interest: 'Website' },
    meridian: { title: 'Meridian', category: 'Concept study 03 · Digital product · Finance', intro: 'Complexity, made beautifully simple.', idea: 'A dashboard concept that gives busy business owners an at-a-glance understanding of their finances. Every number, card and chart has a clear place in the hierarchy.', approach: 'A compact navigation rail, calm lavender palette and generous spacing make the interface easy to scan. All balances and charts are illustrative sample data for this design study.', interest: 'UI / UX' },
  };
  const projectDlg = $('#project');
  let current = null;
  // "Next study" cycles only through the studies the work filter leaves visible
  const nextKey = (key) => {
    const vis = $$('.study:not([hidden]) .study-link').map((b) => b.dataset.project);
    const list = vis.includes(key) ? vis : Object.keys(projects);
    return list[(list.indexOf(key) + 1) % list.length];
  };
  const fillProject = (key) => {
    const p = projects[key]; if (!p || !projectDlg) return false;
    current = key;
    $('#dialogTitle').textContent = p.title;
    $('#dialogCategory').textContent = p.category;
    $('#dialogIntro').textContent = p.intro;
    $('#dialogIdea').textContent = p.idea;
    $('#dialogApproach').textContent = p.approach;
    const li = $(`.study [data-project="${key}"]`)?.closest('.study');
    const explores = li && $('.study-explores', li);
    $('#dialogExplores').textContent = explores ? explores.lastChild.textContent.trim() : '';
    const media = li && $('.study-media', li);
    if (media) {
      // Trusted, static same-page artwork only; no user input is inserted.
      const clone = media.cloneNode(true);
      clone.style.removeProperty('--rx'); clone.style.removeProperty('--ry');
      $$('img', clone).forEach((img) => { img.loading = 'eager'; });
      $('#dialogVisual').replaceChildren(clone);
    }
    const nk = nextKey(key);
    const nextBtn = $('#dialogNext');
    nextBtn.textContent = `Next study: ${projects[nk].title}`;
    nextBtn.hidden = nk === key;
    // a closed <dialog> is display:none, so this reset only counts for "Next study"; opening resets in popup:open
    if (projectDlg.open) { const scroller = $('.sheet-scroll', projectDlg); if (scroller) scroller.scrollTop = 0; }
    return true;
  };
  $$('[data-project]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!fillProject(btn.dataset.project)) return;
    openPopup(projectDlg, btn).then(() => { const c = $('[data-close]', projectDlg); if (c) c.focus({ preventScroll: true }); });
  }));
  if (projectDlg) {
    // runs after showModal(): Chrome restores a sheet's previous offset when the dialog is shown again
    projectDlg.addEventListener('popup:open', () => { const s = $('.sheet-scroll', projectDlg); if (s) s.scrollTop = 0; });
    $('#dialogNext').addEventListener('click', () => {
      fillProject(nextKey(current));
      $('#dialogTitle').focus && $('[data-close]', projectDlg).focus({ preventScroll: true });
    });
    $('#dialogContact').addEventListener('click', (e) => {
      e.preventDefault();
      if (current) selectInterest(projects[current].interest);
      closeAllThen(() => {
        scrollToTarget($('#contact'));
        const name = $('#full-name'); if (name) name.focus({ preventScroll: true });
      });
    });
  }

  /* ---------- process tabs (full ARIA tab pattern) ---------- */
  const tabs = $$('[data-step]');
  const stepsEl = $('.steps');
  const activateStep = (index, focus) => {
    tabs.forEach((tab, i) => {
      const sel = i === index;
      tab.setAttribute('aria-selected', String(sel)); tab.tabIndex = sel ? 0 : -1;
      const panel = $('#step-panel-' + i); if (panel) panel.hidden = !sel;
    });
    if (stepsEl) stepsEl.style.setProperty('--p', index);
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activateStep(i));
    tab.addEventListener('keydown', (e) => {
      let next;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i + tabs.length - 1) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { e.preventDefault(); activateStep(next, true); }
    });
  });

  /* ---------- contact form (Apps Script endpoint preserved; local preview never sends) ---------- */
  const form = $('#contact-form');
  if (form) {
    const loadedAt = Date.now();
    $('#form-ts').value = String(loadedAt);
    const message = $('#message');
    const counter = $('#msg-counter');
    message.addEventListener('input', () => { counter.textContent = message.value.length; });
    const statusEl = $('#form-status');
    const behavior = () => (motionOn() ? 'smooth' : 'instant');
    // the status sits under the button: bring it into view (and focus) so a tap on a phone never looks ignored
    const setStatus = (text, error = false) => {
      statusEl.hidden = false; statusEl.textContent = text;
      statusEl.classList.toggle('is-error', error);
      requestAnimationFrame(() => {
        statusEl.focus({ preventScroll: true });
        const r = statusEl.getBoundingClientRect();
        const navBottom = ($('.nav-pill') || statusEl).getBoundingClientRect().bottom;
        if (r.bottom > innerHeight - 12 || r.top < navBottom + 8) statusEl.scrollIntoView({ block: 'center', behavior: behavior() });
      });
    };
    const fields = [$('#full-name'), $('#email'), message];
    const showError = (f, on) => {
      const el = $('#' + f.id + '-error');
      if (on) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid');
      if (el) { el.hidden = !on; el.textContent = on ? el.dataset.error : ''; }
    };
    fields.forEach((f) => f.addEventListener('input', () => { if (f.getAttribute('aria-invalid') === 'true' && f.checkValidity()) showError(f, false); }));
    let submitting = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      const invalid = fields.filter((f) => !f.checkValidity());
      fields.forEach((f) => showError(f, invalid.includes(f)));
      if (invalid.length) {
        statusEl.hidden = true;
        invalid[0].focus({ preventScroll: true });
        invalid[0].closest('.field').scrollIntoView({ block: 'center', behavior: behavior() });
        return;
      }
      const name = $('#full-name').value.trim();
      const email = $('#email').value.trim();
      const brief = message.value.trim();
      if (name.length < 2 || brief.length < 10) { setStatus('Please add your name and at least 10 characters about your idea.', true); return; }
      if ($('#company').value) { setStatus('Submission blocked.', true); return; }
      if (localPreview) {
        setStatus('Preview complete — your form is valid. This local preview does not send messages. Your details have not been submitted.');
        if (stage()) stage().flip();
        return;
      }
      if (Date.now() - loadedAt < 3000) { setStatus('Please take a moment before sending your message.', true); return; }
      let lastSent = 0;
      try { lastSent = Number(sessionStorage.getItem('zs_last_submit') || 0); } catch (err) {}
      if (Date.now() - lastSent < 30000) { setStatus('Please wait a little before sending another message.', true); return; }
      const data = new FormData();
      data.append('name', name); data.append('email', email);
      data.append('message', (interestInput.value ? `Interested in: ${interestInput.value}\n\n` : '') + brief);
      data.append('ts', String(loadedAt)); data.append('dt', String(Math.round((Date.now() - loadedAt) / 1000)));
      const submit = $('button[type="submit"]', form);
      const original = submit.innerHTML;
      submitting = true; submit.disabled = true; submit.textContent = 'Sending…'; form.setAttribute('aria-busy', 'true');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        await fetch(form.action, { method: 'POST', body: data, mode: 'no-cors', signal: controller.signal });
        try { sessionStorage.setItem('zs_last_submit', String(Date.now())); } catch (err) {}
        setStatus('Your request has been sent. Delivery cannot be confirmed here; you can also reach me directly at zstore.ai295@gmail.com.');
        form.reset(); selectInterest(''); counter.textContent = '0';
        if (stage()) stage().flip();
      } catch (err) {
        setStatus('I couldn’t confirm the send. Please try again, or email zstore.ai295@gmail.com directly.', true);
      } finally {
        clearTimeout(timeout); submitting = false; submit.disabled = false; submit.innerHTML = original; form.setAttribute('aria-busy', 'false');
      }
    });
  }

  /* ---------- work: sticky stage info mirrors the focused study ---------- */
  const studies = $$('.study');
  const info = {
    box: $('.stage-info'), num: $('#stageNum'), title: $('#stageTitle'), kind: $('#stageKind'), explores: $('#stageExplores'), bar: $('.stage-bar'),
  };
  let stageIdx = -1, hoverIdx = -1, focusTick = 0;
  const visibleStudies = () => studies.filter((s) => !s.hidden);
  const showStudy = (i) => {
    studies.forEach((s, k) => s.classList.toggle('is-focus', k === i));
    if (i === stageIdx) return;
    const first = stageIdx < 0;
    stageIdx = i;
    if (!info.box || i < 0) return;
    const s = studies[i];
    const vis = visibleStudies();
    info.num.textContent = `Study ${vis.indexOf(s) + 1} of ${vis.length}`;
    info.title.textContent = $('h3', s).textContent;
    info.kind.textContent = $('.study-kind', s).textContent.replace(/^Concept study · /, '');
    info.explores.textContent = $('.study-explores', s).lastChild.textContent.trim();
    info.bar.style.setProperty('--p', vis.indexOf(s) + 1);
    info.bar.style.setProperty('--n', vis.length);
    if (!first) { info.box.classList.remove('stage-swap'); void info.box.offsetWidth; info.box.classList.add('stage-swap'); }
  };
  const pickStudy = () => {
    focusTick = 0;
    if (hoverIdx >= 0 && !studies[hoverIdx].hidden) { showStudy(hoverIdx); return; }
    let best = -1, bd = Infinity;
    studies.forEach((s, i) => { if (s.hidden) return; const r = $('.study-media', s).getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (d < bd) { bd = d; best = i; } });
    showStudy(best);
  };
  if (studies.length) {
    addEventListener('scroll', () => { if (!focusTick) focusTick = requestAnimationFrame(pickStudy); }, { passive: true });
    addEventListener('resize', pickStudy);
    pickStudy();
  }

  /* ---------- work filter: hidden studies leave the layout, tab order and accessibility tree ---------- */
  const filterBtns = $$('[data-filter]');
  const filterStatus = $('#filterStatus');
  filterBtns.forEach((btn) => btn.addEventListener('click', () => {
    filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    let count = 0;
    studies.forEach((s) => {
      const show = btn.dataset.filter === 'all' || btn.dataset.filter === s.dataset.category;
      s.hidden = !show;
      if (show) count++;
    });
    if (filterStatus) filterStatus.textContent = `Showing ${String(count).padStart(2, '0')} ${count === 1 ? 'study' : 'studies'}`;
    stageIdx = -1; hoverIdx = -1; pickStudy();
    if (stage()) stage().hover(-1);
    updateProgress();
  }));

  /* ---------- studies: enamel cursor label, tilt + sheen (fine pointers only) ---------- */
  const cursor = $('.cursor');
  let cx = -200, cy = -200, tx = -200, ty = -200, cRaf = 0;
  const loopCursor = () => {
    cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
    cursor.style.setProperty('--cx', cx + 'px'); cursor.style.setProperty('--cy', cy + 'px');
    cRaf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3) ? requestAnimationFrame(loopCursor) : 0;
  };
  studies.forEach((study, i) => {
    const media = $('.study-media', study);
    const link = $('.study-link', study);
    link.addEventListener('focus', () => { if (stage()) stage().hover(i); });
    link.addEventListener('blur', () => { if (stage()) stage().hover(-1); });
    if (!fine || !cursor) return;
    media.addEventListener('pointerenter', () => { hoverIdx = i; showStudy(i); if (stage()) stage().hover(i); cursor.style.setProperty('--cs', '1'); });
    media.addEventListener('pointerleave', () => {
      hoverIdx = -1; pickStudy(); if (stage()) stage().hover(-1); cursor.style.setProperty('--cs', '0');
      media.style.setProperty('--rx', '0deg'); media.style.setProperty('--ry', '0deg');
    });
    media.addEventListener('pointermove', (e) => {
      const r = media.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      media.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); media.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      tx = e.clientX; ty = e.clientY;
      if (motionOn()) {
        media.style.setProperty('--ry', ((px - 0.5) * 5).toFixed(2) + 'deg'); media.style.setProperty('--rx', ((0.5 - py) * 4).toFixed(2) + 'deg');
        if (!cRaf) cRaf = requestAnimationFrame(loopCursor);
      } else { cx = tx; cy = ty; cursor.style.setProperty('--cx', cx + 'px'); cursor.style.setProperty('--cy', cy + 'px'); }
    });
  });
})();

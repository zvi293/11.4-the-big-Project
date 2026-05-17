/* =====================================================================
   NZ WEB — STUDIO EDITION
   Interactive layer: cursor, magnetic CTAs, scroll progress, reveal,
   stat counters, marquee duplicator, word-swap, FAQ animations,
   nav state, mobile menu (inert-based), smooth scrolling, contact
   form handler with anti-bot defences, WhatsApp prefilled message.
   ===================================================================== */

(function () {
  "use strict";

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  /* ------------------------------------------------------------------
     CONSTANTS
     --------------------------------------------------------------- */
  const WA_MESSAGE = "Hi Zvi! I came across NZ Web and I'd love to talk about a project I have in mind.";
  const MIN_FILL_SECONDS = 3;
  const MAX_FILL_HOURS   = 12;
  const RATE_LIMIT_MS    = 30000;

  /* ------------------------------------------------------------------
     1. SCROLL PROGRESS
     --------------------------------------------------------------- */
  const progress = document.getElementById("scrollProgress");
  if (progress) {
    const update = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      const pct = total > 0 ? (h.scrollTop / total) * 100 : 0;
      progress.style.width = pct + "%";
    };
    document.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------
     2. NAV STATE (scrolled)
     --------------------------------------------------------------- */
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 24) nav.classList.add("is-scrolled");
      else nav.classList.remove("is-scrolled");
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------
     3. MOBILE MENU — uses `inert` so closed menu hides from AT cleanly
     --------------------------------------------------------------- */
  const navToggle = document.getElementById("navToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  let lastFocus = null;
  // True when openMenu has pushed a history entry that we still owe
  // back to the stack. Used to keep the back-button + close paths in
  // sync without ever pushing or popping more than once per open.
  let menuPushedState = false;

  // Slide-in/out CSS transition duration on `.mobile-menu`.
  // Keep this number in sync with the CSS (currently 0.55s).
  const MENU_ANIM_MS = 560;

  // closeMenu(opts):
  //   opts.fromPopState — set true when called from the `popstate`
  //   handler below. In that case the history entry was already
  //   removed by the browser, so we MUST NOT call history.back()
  //   again (which would navigate away from the site).
  const closeMenu = (opts) => {
    if (!mobileMenu) return;
    const fromPopState = !!(opts && opts.fromPopState);
    nav.classList.remove("is-open");
    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("inert", "");
    // Strip the programmatic tabindex we may have set in openMenu so
    // the closed container stays out of the natural tab order.
    mobileMenu.removeAttribute("tabindex");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open menu");
    document.body.style.overflow = "";
    // Aggressively reset the internal scroll so the first link cannot
    // be hidden by a stale scrollTop next time the menu opens.
    // (iOS Safari preserves scrollTop on hidden overflow containers.)
    mobileMenu.scrollTop = 0;
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus({ preventScroll: true }); }
      catch (_) { lastFocus.focus(); }
      lastFocus = null;
    }
    // If WE pushed a history entry on open AND this close did not
    // originate from the browser already popping that entry, pop it
    // now so the stack stays clean (no orphan entries that would
    // require an extra back-press to leave the site).
    if (menuPushedState && !fromPopState) {
      try { history.back(); } catch (_) {}
    }
    menuPushedState = false;
  };

  const openMenu = () => {
    if (!mobileMenu) return;
    lastFocus = document.activeElement;
    nav.classList.add("is-open");
    mobileMenu.classList.add("is-open");
    mobileMenu.removeAttribute("inert");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Close menu");
    document.body.style.overflow = "hidden";

    // ── BACK-BUTTON HANDLING ─────────────────────────────────────
    // Push a synthetic history entry so the phone's hardware /
    // gesture back button has somewhere to land. The `popstate`
    // listener below catches the back press and closes the menu
    // instead of leaving the site. We use the current URL (no
    // hash change) so neither the address bar nor the page state
    // is disturbed.
    try {
      if (window.history && typeof history.pushState === "function") {
        history.pushState({ nzMenu: true }, "", window.location.href);
        menuPushedState = true;
      }
    } catch (_) { /* private mode / sandboxed — degrade silently */ }

    // ── TOUCH PATH (mobile phones / tablets) ──────────────────────
    // Do NOTHING else. No focus. No scroll. No timers.
    // The menu uses `overflow: hidden` in CSS — there is no
    // internal scroll position to manage, and there is no way the
    // first link ("About") can be pushed out of view. Any focus
    // call on a touch device (even with preventScroll:true) has
    // historically caused Android Chrome to scroll-into-view the
    // focused element and hide the first link. The fix is simply
    // to not do it.
    if (isTouch) return;

    // ── KEYBOARD / DESKTOP PATH ───────────────────────────────────
    // For users navigating with a keyboard or assistive tech, we
    // give focus to the menu CONTAINER itself after the slide-in
    // animation finishes. Focusing the container (not the first
    // link) means scroll-into-view has no link to chase, and Tab
    // moves naturally from container → first link → second link.
    window.setTimeout(() => {
      if (!mobileMenu.classList.contains("is-open")) return;
      mobileMenu.setAttribute("tabindex", "-1");
      try { mobileMenu.focus({ preventScroll: true }); }
      catch (_) { mobileMenu.focus(); }
    }, MENU_ANIM_MS);
  };

  if (navToggle && mobileMenu) {
    navToggle.addEventListener("click", () => {
      mobileMenu.classList.contains("is-open") ? closeMenu() : openMenu();
    });
    $$("[data-mobile-link]", mobileMenu).forEach((a) =>
      a.addEventListener("click", () => setTimeout(closeMenu, 200))
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileMenu.classList.contains("is-open")) {
        closeMenu();
      }
    });
    // Phone hardware / browser back button: if the menu is open,
    // swallow the back press and close the menu instead of leaving
    // the site. Pass `fromPopState: true` so closeMenu does NOT
    // call history.back() again (the browser already popped).
    window.addEventListener("popstate", () => {
      if (mobileMenu.classList.contains("is-open")) {
        closeMenu({ fromPopState: true });
      }
    });
  }

  /* ------------------------------------------------------------------
     4. CUSTOM CURSOR (desktop only)
     --------------------------------------------------------------- */
  if (!isTouch && !prefersReduced) {
    const dot = document.querySelector(".cursor-dot");
    const ring = document.querySelector(".cursor-ring");
    if (dot && ring) {
      const state = { x: window.innerWidth / 2, y: window.innerHeight / 2, rx: 0, ry: 0 };
      let visible = false;

      const onMove = (e) => {
        if (!visible) {
          document.body.classList.add("has-cursor");
          visible = true;
        }
        state.x = e.clientX;
        state.y = e.clientY;
        dot.style.transform = `translate(${state.x}px, ${state.y}px) translate(-50%, -50%)`;
      };
      const onOut = () => {
        document.body.classList.remove("has-cursor");
        visible = false;
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerleave", onOut);

      const tick = () => {
        state.rx += (state.x - state.rx) * 0.18;
        state.ry += (state.y - state.ry) * 0.18;
        ring.style.transform = `translate(${state.rx}px, ${state.ry}px) translate(-50%, -50%)`;
        requestAnimationFrame(tick);
      };
      tick();

      const hoverSel = 'a, button, [data-cursor="hover"], summary, input, textarea, .case, .service, .quote';
      document.addEventListener("pointerover", (e) => {
        if (e.target.closest && e.target.closest(hoverSel)) {
          document.body.classList.add("is-hovering");
        }
      });
      document.addEventListener("pointerout", (e) => {
        if (e.target.closest && e.target.closest(hoverSel)) {
          document.body.classList.remove("is-hovering");
        }
      });
    }
  }

  /* ------------------------------------------------------------------
     5. MAGNETIC BUTTONS (desktop only)
     --------------------------------------------------------------- */
  if (!isTouch && !prefersReduced) {
    $$("[data-magnetic]").forEach((btn) => {
      const strength = 0.22;
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = "translate(0, 0)";
      });
    });
  }

  /* ------------------------------------------------------------------
     6. REVEAL ON SCROLL
     --------------------------------------------------------------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -80px 0px" }
    );
    $$("[data-reveal]").forEach((el) => io.observe(el));
  } else {
    $$("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
  }

  /* ------------------------------------------------------------------
     7. STAT COUNTERS
     --------------------------------------------------------------- */
  if ("IntersectionObserver" in window && !prefersReduced) {
    const counterIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = parseFloat(el.dataset.counter || "0");
          const isFloat = String(el.dataset.counter || "").includes(".");
          const suffix = el.dataset.suffix || "";
          const dur = 1600;
          const start = performance.now();
          const tick = (now) => {
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            const val = target * eased;
            el.textContent = (isFloat ? val.toFixed(1) : Math.round(val)) + suffix;
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = (isFloat ? target.toFixed(1) : target) + suffix;
          };
          requestAnimationFrame(tick);
          counterIO.unobserve(el);
        });
      },
      { threshold: 0.4 }
    );
    $$("[data-counter]").forEach((el) => counterIO.observe(el));
  } else {
    $$("[data-counter]").forEach((el) => {
      el.textContent = el.dataset.counter + (el.dataset.suffix || "");
    });
  }

  /* ------------------------------------------------------------------
     8. MARQUEE: duplicate items for seamless loop
     --------------------------------------------------------------- */
  const marquee = document.getElementById("marqueeTrack");
  if (marquee) {
    const original = marquee.innerHTML;
    marquee.innerHTML = original + original;
  }

  /* ------------------------------------------------------------------
     8B. TESTIMONIAL CAROUSEL — infinite loop, paused on hover/focus
     --------------------------------------------------------------- */
  const quotesTrack = document.getElementById("quotesTrack");
  if (quotesTrack) {
    // Duplicate the original quote nodes so the CSS animation can translateX(-50%)
    // and produce a seamless loop. We clone the actual DOM nodes (not innerHTML)
    // to keep event listeners, accessibility tree, and any data-* state intact.
    const originals = Array.from(quotesTrack.children);
    originals.forEach((node) => {
      const clone = node.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.setAttribute("tabindex", "-1");
      // Strip role="listitem" duplicate so AT only sees originals
      if (clone.getAttribute("role") === "listitem") clone.removeAttribute("role");
      quotesTrack.appendChild(clone);
    });

    // Pause animation when a quote is keyboard-focused (better a11y)
    quotesTrack.addEventListener("focusin", () => quotesTrack.style.animationPlayState = "paused");
    quotesTrack.addEventListener("focusout", () => quotesTrack.style.animationPlayState = "");

    // Pause when not visible (saves battery, prevents drift)
    if ("IntersectionObserver" in window) {
      const visIO = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          quotesTrack.style.animationPlayState = e.isIntersecting ? "" : "paused";
        });
      }, { threshold: 0.05 });
      visIO.observe(quotesTrack);
    }
  }

  /* ------------------------------------------------------------------
     9. HERO WORD SWAP
     --------------------------------------------------------------- */
  const swap = document.querySelector(".hero-headline .swap");
  if (swap && !prefersReduced) {
    const items = $$("b", swap);
    if (items.length > 1) {
      let i = 0;
      setInterval(() => {
        items[i].classList.remove("is-active");
        i = (i + 1) % items.length;
        items[i].classList.add("is-active");
      }, 2800);
    }
  }

  /* ------------------------------------------------------------------
     10. LIVE CLOCK (hero meta)
     --------------------------------------------------------------- */
  const clock = document.getElementById("liveClock");
  if (clock) {
    const fmt = () => {
      try {
        const opts = { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false };
        const t = new Date().toLocaleTimeString("en-GB", opts);
        clock.textContent = `${t} · IST`;
      } catch (_) {
        const d = new Date();
        clock.textContent =
          String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      }
    };
    fmt();
    setInterval(fmt, 30 * 1000);
  }

  /* ------------------------------------------------------------------
     11. SERVICE CARD CURSOR SPOTLIGHT
     --------------------------------------------------------------- */
  if (!isTouch && !prefersReduced) {
    $$(".service").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        card.style.setProperty("--mx", mx + "%");
        card.style.setProperty("--my", my + "%");
      });
    });
  }

  /* ------------------------------------------------------------------
     12. SUBTLE PARALLAX FOR HERO HEADLINE
     --------------------------------------------------------------- */
  if (!prefersReduced && !isTouch) {
    const heroHeadline = $(".hero-headline");
    const heroSection = $(".hero");
    if (heroHeadline && heroSection) {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          const rect = heroSection.getBoundingClientRect();
          if (rect.bottom > 0) {
            heroHeadline.style.transform = `translateY(${y * 0.06}px)`;
          }
          ticking = false;
        });
      };
      document.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  /* ------------------------------------------------------------------
     13. SMOOTH SCROLL with header offset
     --------------------------------------------------------------- */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: y, behavior: prefersReduced ? "auto" : "smooth" });
    });
  });

  /* ------------------------------------------------------------------
     14. WHATSAPP PREFILLED MESSAGE
        Adds ?text=<English message> to every wa.me link marked data-wa.
     --------------------------------------------------------------- */
  const enc = encodeURIComponent(WA_MESSAGE);
  $$('a[data-wa], a[href*="wa.me/"]').forEach((a) => {
    try {
      const u = new URL(a.href, window.location.origin);
      if (/(^|\.)wa\.me$/i.test(u.hostname)) {
        if (!u.searchParams.has("text")) {
          a.href = a.href + (a.href.includes("?") ? "&" : "?") + "text=" + enc;
        }
      }
    } catch (_) { /* ignore malformed href */ }
  });

  /* ------------------------------------------------------------------
     15. EXTERNAL LINK HARDENING — defence in depth
     --------------------------------------------------------------- */
  $$('a[target="_blank"]').forEach((a) => {
    const rel = (a.getAttribute("rel") || "").split(/\s+/);
    ["noopener", "noreferrer"].forEach((r) => { if (!rel.includes(r)) rel.push(r); });
    a.setAttribute("rel", rel.filter(Boolean).join(" "));
  });

  /* ------------------------------------------------------------------
     16. CONTACT FORM — hardened
     --------------------------------------------------------------- */

  // Strip non-printable control chars without using a literal-control-char regex.
  // Uses character-code filter — safe against source-mangling issues.
  function stripControl(input) {
    if (input == null) return "";
    const s = String(input);
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      // Keep printable, tab (9), LF (10), CR (13). Drop everything else <32 and 0x7F.
      if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 0x7F)) {
        out += s.charAt(i);
      }
    }
    return out;
  }

  function sanitizeField(value, maxLen) {
    let v = stripControl(value);
    v = v.replace(/[ \t]+/g, " ");
    v = v.replace(/\r\n?/g, "\n");
    v = v.replace(/\n{3,}/g, "\n\n");
    v = v.trim();
    if (typeof maxLen === "number" && v.length > maxLen) v = v.slice(0, maxLen);
    return v;
  }

  function isValidEmail(e) {
    return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(e) && e.length <= 160;
  }

  const form = document.getElementById("contact-form");
  if (form && window.fetch && window.FormData) {
    const submit = form.querySelector('button[type="submit"]');
    const statusEl = document.getElementById("form-status");
    const honeypot = form.elements.namedItem("company");
    const tsField = document.getElementById("form-ts");
    const successUrl = new URL("/thank-you.html", window.location.origin);
    const defaultLabel = submit ? submit.innerHTML : "";
    const delay = 1000;
    let isSubmitting = false;

    const loadedAt = Date.now();
    if (tsField) tsField.value = String(loadedAt);

    const messageInput = form.querySelector("#message");
    const counter = document.getElementById("msg-counter");
    if (messageInput && counter) {
      const updateCounter = () => { counter.textContent = String(messageInput.value.length); };
      messageInput.addEventListener("input", updateCounter);
      updateCounter();
    }

    const onUnload = (e) => {
      if (!isSubmitting) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const setStatus = (msg, type) => {
      if (!statusEl) return;
      if (!msg) {
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.className = "form-status";
        return;
      }
      statusEl.hidden = false;
      statusEl.textContent = msg;
      statusEl.className = "form-status is-" + (type || "info");
    };
    const setSubmitting = (state) => {
      isSubmitting = state;
      if (submit) {
        submit.disabled = state;
        submit.setAttribute("aria-disabled", String(state));
        submit.innerHTML = state ? "Sending…" : defaultLabel;
      }
      form.setAttribute("aria-busy", String(state));
      if (state) window.addEventListener("beforeunload", onUnload);
      else window.removeEventListener("beforeunload", onUnload);
    };
    const redirect = () => {
      window.removeEventListener("beforeunload", onUnload);
      window.location.assign(successUrl.toString());
    };

    form.addEventListener("submit", async (e) => {
      if (isSubmitting) {
        e.preventDefault();
        return;
      }

      // Rate limit (per browser session, 30s)
      let lastSent = 0;
      try { lastSent = parseInt(sessionStorage.getItem("nz_last_submit") || "0", 10); } catch (_) {}
      if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
        e.preventDefault();
        const wait = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSent)) / 1000);
        setStatus("Please wait " + wait + "s before sending another message.", "error");
        return;
      }

      if (!form.checkValidity()) {
        e.preventDefault();
        form.reportValidity();
        return;
      }
      e.preventDefault();
      setStatus("");

      // Honeypot — filled means it's a bot
      if (honeypot && typeof honeypot.value === "string" && honeypot.value.trim() !== "") {
        setStatus("Submission blocked.", "error");
        return;
      }

      // Time-based check
      const dt = (Date.now() - loadedAt) / 1000;
      if (dt < MIN_FILL_SECONDS) {
        setStatus("That was a little too fast. Please try again in a moment.", "error");
        return;
      }
      if (dt > MAX_FILL_HOURS * 3600 && tsField) {
        tsField.value = String(Date.now());
      }

      if ("onLine" in navigator && !navigator.onLine) {
        setStatus("You appear to be offline. Please check your connection.", "error");
        return;
      }

      // Sanitize
      const nameRaw  = form.elements["name"]  ? form.elements["name"].value  : "";
      const emailRaw = form.elements["email"] ? form.elements["email"].value : "";
      const msgRaw   = form.elements["message"] ? form.elements["message"].value : "";

      const name = sanitizeField(nameRaw, 80);
      const email = sanitizeField(emailRaw, 160).toLowerCase();
      const message = sanitizeField(msgRaw, 3000);

      if (name.length < 2)        { setStatus("Please enter your name.", "error"); return; }
      if (!isValidEmail(email))   { setStatus("Please enter a valid email.", "error"); return; }
      if (message.length < 10)    { setStatus("Please tell me a bit more about your project.", "error"); return; }

      // Build a sanitized FormData
      const data = new FormData();
      data.append("name", name);
      data.append("email", email);
      data.append("message", message);
      data.append("ts", String(loadedAt));
      data.append("dt", String(Math.round(dt)));
      data.append("ref", (document.referrer || "").slice(0, 250));
      data.append("ua", (navigator.userAgent || "").slice(0, 200));

      let timer = null;
      let handle = true;

      try {
        setSubmitting(true);
        setStatus("Sending your message…", "info");
        const req = fetch(form.action, {
          method: form.method || "POST",
          body: data,
          mode: "no-cors",
          keepalive: true,
          referrerPolicy: "strict-origin-when-cross-origin",
        });
        timer = window.setTimeout(() => {
          handle = false;
          try { sessionStorage.setItem("nz_last_submit", String(Date.now())); } catch (_) {}
          redirect();
        }, delay);
        req.catch((err) => {
          if (!handle) return;
          if (timer !== null) window.clearTimeout(timer);
          console.error("Contact form submission failed.", err);
          setStatus("There was a problem sending your message. Please try again.", "error");
          setSubmitting(false);
        });
      } catch (err) {
        if (timer !== null) window.clearTimeout(timer);
        handle = false;
        console.error("Contact form submission failed before dispatch.", err);
        setStatus("There was a problem sending your message. Please try again.", "error");
        setSubmitting(false);
      }
    });
  }

  /* ------------------------------------------------------------------
     17. KEYBOARD: focus ring polish
     --------------------------------------------------------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") document.body.classList.add("is-tabbing");
  });
  document.addEventListener("mousedown", () => {
    document.body.classList.remove("is-tabbing");
  });
})();

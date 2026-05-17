/* =====================================================================
   NZ WEB — STUDIO EDITION
   Interactive layer: cursor, magnetic CTAs, scroll progress, reveal,
   stat counters, marquee duplicator, word-swap, FAQ animations,
   nav state, mobile menu, smooth scrolling, contact form handler.
   ===================================================================== */

(function () {
  "use strict";

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

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
     3. MOBILE MENU
     --------------------------------------------------------------- */
  const navToggle = document.getElementById("navToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  if (navToggle && mobileMenu) {
    const close = () => {
      nav.classList.remove("is-open");
      mobileMenu.classList.remove("is-open");
      mobileMenu.setAttribute("aria-hidden", "true");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    const open = () => {
      nav.classList.add("is-open");
      mobileMenu.classList.add("is-open");
      mobileMenu.setAttribute("aria-hidden", "false");
      navToggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    };
    navToggle.addEventListener("click", () => {
      mobileMenu.classList.contains("is-open") ? close() : open();
    });
    $$("[data-mobile-link]", mobileMenu).forEach((a) => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
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

      // Hover effects for interactive elements
      const hoverSel = "a, button, [data-cursor=\"hover\"], summary, input, textarea, .case, .service, .quote";
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
      const strength = 0.25;
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
     6. REVEAL ON SCROLL (Intersection Observer)
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
  if (!prefersReduced) {
    const hero = $(".hero-headline");
    const heroSection = $(".hero");
    if (hero && heroSection) {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = window.scrollY;
          const rect = heroSection.getBoundingClientRect();
          if (rect.bottom > 0) {
            hero.style.transform = `translateY(${y * 0.08}px)`;
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
     14. CONTACT FORM HANDLER (preserves existing behaviour)
     --------------------------------------------------------------- */
  const form = document.getElementById("contact-form");
  if (form && window.fetch && window.FormData) {
    const submit = form.querySelector('button[type="submit"]');
    const statusEl = document.getElementById("form-status");
    const honeypot = form.elements.namedItem("company");
    const successUrl = new URL("/thank-you.html", window.location.origin);
    const defaultLabel = submit ? submit.innerHTML : "";
    const delay = 1000;
    let isSubmitting = false;

    const onUnload = (e) => {
      if (!isSubmitting) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const setStatus = (msg, type = "info") => {
      if (!statusEl) return;
      if (!msg) {
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.className = "form-status";
        return;
      }
      statusEl.hidden = false;
      statusEl.textContent = msg;
      statusEl.className = `form-status is-${type}`;
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
      if (!form.checkValidity()) {
        e.preventDefault();
        form.reportValidity();
        return;
      }
      e.preventDefault();
      setStatus("");
      if (honeypot && typeof honeypot.value === "string" && honeypot.value.trim() !== "") {
        return;
      }
      if ("onLine" in navigator && !navigator.onLine) {
        setStatus("You appear to be offline. Please check your connection.", "error");
        return;
      }

      const data = new FormData(form);
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
        });
        timer = window.setTimeout(() => {
          handle = false;
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
     15. KEYBOARD: skip to main
     --------------------------------------------------------------- */
  // Always allow Tab focus rings
  document.addEventListener("keydown", (e) => {
    if (e.key === "Tab") document.body.classList.add("is-tabbing");
  });
  document.addEventListener("mousedown", () => {
    document.body.classList.remove("is-tabbing");
  });
})();

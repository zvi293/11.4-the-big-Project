# Zstore AI — "One Ribbon"

## The idea

Zstore AI is one person, Zvi Moshe, carrying a project from the first sketch to the last line of code, with no handoffs. The site shows that as a single, unbroken object: a real-time ribbon of orange enamel outside and polished chrome inside. It is one continuous thread through the whole page:

- **Hero:** a figure-eight that loops out of the empty corners of "design & code" and passes behind the letters.
- **Work:** a sculpture on the material stage that turns to travertine, sage glass or ink indigo for each concept study.
- **Section changes:** the twisting seam between the dark stage and the paper.
- **Expertise:** a twisting bookmark under the sticky intro.
- **Studio:** a tilted ring passing behind Zvi's shoulders.
- **Contact:** it folds flat, twice, into the **Z** of Zstore AI.

Everything is hand-written WebGL2 and CSS with zero dependencies, which makes "hand-coded" something you can see rather than a claim.

Zstore AI here is its own studio identity. It shares a name with Zvi's Hebrew site zstore-ai.co.il, but not its logo or blue/violet palette. That site appears only as the preserved credit badge in the footer.

## Identity: the folded Z

- **Mark** (`zstore-mark.svg`, and the inline `#zmark` symbol in the page): one enamel ribbon folded flat twice.
  - The top bar and bottom bar are enamel (`#F26A33 → #B63B11`).
  - The 45° diagonal is the ribbon's reverse face, in brushed chrome (`#FFFCF7 → #56514B`), with a soft fold shadow under each crease.
  - Geometry is a 32-unit box: bars 7.2 thick, and the crease lines run at exactly 45°, so the three parts meet on clean diagonal cuts.
  - It is built from four polygons only, so it stays crisp at 16–30px (favicon, nav, menu) and scales to hero size.
- **Wordmark:** "Zstore" in Space Grotesk 600 (tracking −0.045em), then "AI" in 400 at 62% opacity, a quarter-space apart. Never uppercase, never letter-spaced.
- **Lock-up:** the mark plus the wordmark, with a 10px gap (12px in the footer). Used in the nav capsule, the menu sheet, the footer, and as the no-GL contact fallback (the SVG mark).
- **The live Z (Contact):** the same geometry as the mark, built in WebGL as three flat strips whose ends are cut on the crease lines.
  - Winding flips on the diagonal strip, so it shows the chrome back face with no twist, which means no crumpled join.
  - Each strip has a faint convex bow (normal tilt ±0.26), giving one clean chrome highlight on the diagonal and a clear-coat line on the bars.
  - The ribbon mesh blends into the flat strips over the last 65% of the morph, so broken in-between shapes are never on screen.
  - A valid form submit makes the Z do one slow eased flip.

## Palette

| Token | Hex | Role |
|---|---|---|
| Stage | `#0C0A09` | Warm near-black ground for hero, work, expertise, contact, footer |
| Stage raised | `#171310` | Nav capsule, sheets (menu, study dialog), the form panel |
| Bone | `#EFE8DE` | Primary text on dark; colour of the woven GL type |
| Bone dim | `#A89E93` | Secondary text on dark (about 7.5:1 on Stage) |
| Paper | `#ECE5D9` | Light ground for studio, process, FAQ |
| Ink | `#16110D` | Text on paper |
| Ink dim | `#62584F` | Secondary text on paper (about 5.5:1) |
| Enamel | `#E2521F` | Ribbon enamel, seams, dots, rules, the Z bars |
| Enamel flat | `#C8431A` / press `#B53B14` | Flat enamel pills (CTA, chips, active step) with a clear-coat inset edge, not a gradient |
| Enamel ink | `#B0390F` | Enamel used as text on paper (the signature) |
| Chrome | `#F4F1EC` / `#8E8A85` | Metal side of the ribbon and the Z diagonal |
| Travertine / Sage glass / Ink indigo | `#C8A67C` / `#8FA487` / `#6E6BF2` | Ribbon materials for the three concept studies |

Rules:
- Only one saturated colour on screen at a time: Enamel, or the active study's material.
- No gradient washes on text, and no glowing gradient pills.

## Typography

All fonts are local: Space Grotesk 400/500/600/700, Fraunces 400/italic, JetBrains Mono 400.

| Level | Font / weight | Size | Use |
|---|---|---|---|
| Display | Space Grotesk 700, lowercase, −0.068em / 0.80 | `min(21vw, 318px)`; phones 25.5vw | Only "design & code" and "let's talk." The hero line is drawn into the GL scene. |
| Headline | Space Grotesk 500, −0.048em | `clamp(38px, 5.2vw, 80px)`; phones `clamp(34px, 10.4vw, 46px)` | Section statements, balanced line breaks |
| Title | Space Grotesk 500 | `clamp(44px, 4.9vw, 74px)` | Stage study names, dialog titles |
| Body / lede | Space Grotesk 400 | 17px (16px on phones) / 19px | Everything else |
| Label | Space Grotesk 500, 13–15px | — | Nav, chips, facts. Never uppercase, never letter-spaced, and no rule-plus-label eyebrows. |
| Voice | Fraunces 400 | `clamp(20px, 1.8vw, 27px)` | Zvi's first-person words only (studio letter, FAQ answers, form status), and invented brand type inside the concept UIs |
| Mono | JetBrains Mono 400, 12px | — | Only the form's character counter |

The hero caption is a human figure-style line, not a technical readout: "Fig. 1 — this ribbon is written by hand in WebGL. Move your cursor to turn the light." It shows above 900px only; the old mono vertex/fps readout is gone.

## Motion principles

1. **One object, never a cut.** The ribbon morphs through five poses: figure-eight, sculpture, bookmark, ring, Z.
   - Each pose owns a DOM anchor: hero type, stage (or the studies list on phones), expertise anchor, portrait, Z anchor.
   - A morph runs centred in the gap while both anchors are off-screen. If the anchors overlap, it straddles the moment the next anchor enters.
   - Morphing into the ring is strict: it completes before the portrait appears.
   - **Desktop (fine pointer, wider than 900px):** the ribbon travels between the two anchors.
   - **Phones, tablets and stacked layouts:** it never travels. The old pose folds into its own anchor (width and size shrink to nothing over the first half of the morph), the pose swaps while it is flat, and the new one unfolds from its own anchor. Phone text is never crossed. The phone material swatch does the same when the focused study changes.
2. **Rides with the page.** The ribbon moves rigidly with scroll (no scroll lag, so it never slides over text) and eases only between pose changes (about 10/s). Scroll velocity adds twist.
3. **The cursor moves light, not layout.** On a fine pointer, the cursor:
   - rotates the procedural studio environment;
   - parallaxes the hero loops;
   - tilts the sculpture and the Z;
   - bulges the nearest part of the ribbon on the Work and Expertise poses.
4. **Easing:** `cubic-bezier(.2,.7,.1,1)` for arrivals and `(.7,0,.2,1)` for the letter roll. Morphs use smootherstep. Reveals are quiet (24px, 0.9s).
5. **Respect.** `prefers-reduced-motion` (the default) or the oscilloscope toggle in the nav (sine wave when on, flat line when off) turns motion off. That freezes time, inertia, cursor push, fringe, reveals, the letter roll and the Z flip, and frames render only on demand. A click on the toggle is remembered (`zs-motion`).

## Signature moments

1. **Hero weave.** The figure-eight's loops sit in the empty corners beside the type. The crossing runs behind the letters, and the text plane writes a depth so only the far lobe edges can pass in front. Every letter, including the ampersand and the g/n, reads at every moment. During any morph the type is always in front.
2. **Material stage (Work).**
   - **Desktop:** the sticky stage (Study n of 3, title, kind, "Explores") sits beside crafted concept frames, and the sculpture re-materialises per study. An enamel "Open study" disc follows the pointer, and frames tilt with a sheen.
   - **Phones:** each study gets its info block with a live material swatch in its slot, plus an "Open the study" button. The swatch spins about its own axis and is held tilted toward the viewer, so it never turns edge-on.
   - **Tablets (761–900px):** the frame and its notes sit side by side, with the swatch beside the title.
3. **Ribbon seams.** Every dark/paper boundary is a slowly twisting enamel/chrome ribbon in the background shader, with a soft contact shadow on paper.
4. **The ring (Studio).** A slim tilted loop threading the portrait's top-left corner (the owner's chosen spot, replacing the old chest-height ellipse that read as if it caged the person). Most of the loop floats on the open paper beside the frame; where it meets the card it slips behind the photo, so the ribbon appears to pierce the corner.
   - Zvi's head is a depth mask (nearest depth), so the ribbon can only ever pass behind it.
   - The name tag is a discard mask (the loop never reaches it anyway).
   - `ring-check.cjs` verifies zero enamel pixels on the face and name tag at every scroll position.
5. **The fold (Contact).** The flat-folded Z beside "let's talk.", the brand's bookend.

## Sections (all built)

- **Nav:** a fixed dark frosted capsule that never tints or samples GL colour: 80% opaque, backdrop desaturated and darkened.
  - Contents: the Z lock-up, per-letter-roll links with `aria-current`, the motion toggle, and a flat enamel "Start a project" pill.
  - Below 1080px: the lock-up, the motion toggle and "Menu".
- **Mobile menu:** a full-height `<dialog>` sheet.
  - Big numbered links (01 Work … 06 Let's talk).
  - Concept-study thumbnails that open the study dialog on top.
  - Email, WhatsApp and the live Tel Aviv clock.
- **Scroll progress:** a 2px enamel-to-chrome line fixed at the very top (`#scrollProgress`, scaleX only). It holds still while a popup locks the page.
- **Hero (dark):** the "Zstore AI is the studio of Zvi Moshe" kicker and the live Tel Aviv clock.
  - At ≤440px the two stack as one left-aligned column. At ≤380px the clock is hidden (it is in the menu).
  - Portrait tablets (761–1080px) use the phone composition at tablet scale: loop above, type, loop below.
  - Landscape phones put the CTAs beside the lede, inside the first screen.
  - The woven display line and a lede naming the offer: websites, landing pages, UI/UX and integrations for brands in Israel and worldwide.
  - "Start a project" in flat enamel (primary) and "See the studies" as a ghost button.
- **Work (dark):** the intro composed as one block, then three concept studies (Atelier Studio, Lume, Meridian), each labelled Concept.
  - Filter bar, ported from the real site: All work 03 / Web experiences / Digital products, with a "Showing 03 studies" live status.
    - The chosen filter is a bone pill, not enamel, keeping one saturated colour on screen.
    - Filtered-out studies are `hidden`, so they leave the layout, the tab order and the accessibility tree. The stage count, the sculpture and the phone swatch only consider visible studies.
  - Each study shows "Explores" (what it studies), not a material chip.
  - Meridian's "Illustrative sample data" note and the frame's Concept tag share one bottom row, so the tag never covers a tile.
  - No dead space after Meridian.
- **Study dialog:** a native `<dialog>`, full-screen on phones and an inset card at 1081px and up.
  - Contents: a cloned concept frame, category, title, intro, The idea / The approach / What it explores.
  - A permanent "not a commissioned client project" note.
  - "Explore a direction like this" closes the dialog, scrolls to Contact and preselects the interest. "Next study: …" swaps content in place.
- **Expertise (dark):** a sticky intro with the bookmark ribbon.
  - Four accordion rows: Web experiences, Digital product design, Code & connections, Refinement & care.
  - Each row has tags and a "Start with …" link that preselects the form interest.
- **Studio (paper):** headline, portrait with the ring, Zvi's Fraunces letter and signature.
  - Facts: Based in / Languages / Pricing / After launch.
- **Process (paper, CSS ground):** four steps (Discover, Design, Develop, Launch) as a full ARIA tab pattern (arrows, Home, End).
  - Desktop: an enamel progress thread.
  - Phones: 2×2 pill tabs.
- **FAQ (paper, CSS ground):** a sticky headline and six native `<details>` questions answered in Fraunces. The +/− is a tiny CSS ribbon twist.
- **Contact (dark):** "let's talk." with the Z, then:
  - email (`zstore.ai295@gmail.com`) and WhatsApp (+972 58 729 2029, prefilled "Hi Zvi! I came across Zstore AI…");
  - the expectation line;
  - the real form: interest chips, name, email, message with counter, honeypot and timestamp.
  - Validation marks invalid fields with `aria-invalid` and shows an inline message under each one (linked by `aria-describedby`). It then focuses and centres the first invalid field, with no native bubbles.
  - The preview or send status is focused and scrolled into view, so a tap on Send never looks ignored on a phone.
  - On localhost or file:// the form never sends and shows the preview message. In production it submits to Netlify Forms (form name `contact`, honeypot + a 3s minimum and a 30s repeat guard), with `thank-you.html` as the no-JS success page and an email notification to zstore.ai295@gmail.com.
- **Footer (dark):**
  - the Z lock-up, the tagline, back to top, © Zstore AI · Zvi Moshe, and Privacy/Terms (`./privacy-policy.html`, `./terms.html`);
  - the preserved credit badge: a link to https://zstore-ai.co.il/ in a new tab (`rel="noopener noreferrer"`, aria-label "Zstore AI — opens in a new tab"), holding `image/brand/zstore-logo.webp` 652×217 at 30px tall;
  - badge styling: a full 999px pill, 8px 14px padding, `rgba(255,255,255,.92)` background, `1px solid rgba(255,255,255,.2)` border, no shadow.
- **Legal pages:** `privacy-policy.html` and `terms.html` live in this folder, rewritten for Zstore AI with zstore.ai295@gmail.com, so the lab server never falls back to the real project's old pages.
  - Layout: a dark hero with a lowercase display word ("privacy." / "terms."), a still enamel/chrome seam, then paper with a sticky "On this page" index and numbered sections.
  - They share the nav capsule, footer and credit badge. `legal.css` holds only their layout.
- **Deep-link aliases:** `#services` and `#manifesto` (the real site's anchors) land on Expertise and Studio.
- **Safe areas:** every section and the footer pad with `--pad-l` / `--pad-r` (`max(gutter, env(safe-area-inset-*))`), so landscape notches never cover content.

## Popups (menu, study dialog)

- Every popup is a native `<dialog>` opened with `showModal()`, so the focus trap and Escape come free. Focus returns to the opener. Sheets use `overscroll-behavior: contain` and scroll internally.
- **Opening** pushes one history entry. The phone's back button (`popstate`) closes the top popup only, and the page never navigates or jumps.
- **Closing** by close button, backdrop, Escape, a menu link or the dialog CTA removes that entry: one batched `history.go(-n)`, guarded so stacked popups never race.
- Opens that arrive before the history settles wait for it, so repeated open/close never accumulates entries.
- `history.scrollRestoration` is `manual`, so the browser never restores (jumps) the scroll itself. It switches back to auto on pagehide, so a reload still restores.
- **Scroll lock (iOS-safe):** `body { position: fixed; top: -scrollY }` plus `html.is-locked { overflow: hidden }`. `scrollbar-gutter: stable` prevents layout shift. The exact position is restored instantly on close.
- **Menu links** close, wait for the history pop to settle, then scroll smoothly. `scroll-margin-top` keeps targets clear of the fixed nav.
- The study dialog can open on top of the menu: back closes the study, a second back closes the menu.
- The GL loop pauses while any popup is open.
- **Sheet header:** the top safe-area inset is applied once (on the sticky header, `top: 0`), so the header sits in the same place at rest and when scrolled.
- **Double tap on ×:** a click on the same spot (within 16px) less than 450ms after a tap on × or the backdrop closed a sheet is treated as the tail of a double tap. It is swallowed in the capture phase.
  - It can't re-open the menu, jump to #contact via the desktop CTA, or close a stacked sheet underneath.
  - A deliberate tap anywhere else, such as the Menu button right beside ×, works immediately. There is no overlay, so nothing races the browser's touch targeting.
- **Entrance:** a sheet's contents rise in, but the dialog box itself only fades and never moves. A tap during the entrance hits the sheet or the backdrop exactly where they are.
- **Rapid taps:** links, buttons, fields and sheets use `touch-action: manipulation`. A quick second tap on the same spot (for example "Next study" twice) is always its own click, never swallowed or delayed by double-tap gesture handling.
- `popup-check.cjs` exercises all of the above on a phone and on desktop.

## GL technique

- **One fixed WebGL2 canvas** (`pointer-events: none`) paints the ground of every `[data-gl]` section. Process and FAQ paint their own CSS paper, so the loop can pause there.
- **Background pass:** a fullscreen triangle. Theme regions come from live section boundaries with a sine edge, plus the twisting seam ribbons, contact shadow and a warm glow behind the ribbon.
- **Ribbon pass:** a CPU mesh, 440×11 vertices on desktop and 200×5 on phones, rebuilt per frame in one draw call.
  - Poses are parametric or arc-length resampled curves (hero loops use Chaikin smoothing then resampling) placed from DOM anchors, with camera-facing frames and an analytic twist.
  - The cup cross-section varies per pose (0.6 hero, 0.16–0.2 for the Z).
  - Enamel and chrome are chosen by `gl_FrontFacing`: enamel is diffuse plus a clear-coat Fresnel, chrome a tinted Fresnel. Both reflect a procedural studio environment rotated by the cursor, with ACES tonemapping. Secondary strip lights are dimmed on the Z.
- **DOM planes:** the hero type is rasterised from live DOM metrics; the portrait is a texture with SDF corners.
  - Both are depth-tested against the ribbon with a chosen `gl_FragDepth`: the type sits slightly in front of z=0 (fully in front during morphs), and the portrait's face region is nearest.
  - The DOM originals stay in the document (transparent) for selection, SEO and screen readers.
- **Post:** MSAA (4× desktop, 2× phones) resolved into a full-resolution texture, then blitted into a half-resolution mipmapped copy that feeds the bloom.
  - The alpha channel encodes the pass mask: 0.5 ground, above 0.5 highlight, towards 0 DOM planes.
  - Bloom and the chromatic fringe apply only to highlights, and the fringe only during fast scroll, so type and portrait are razor sharp at rest.
  - Vignette and full grain apply only to dark pixels, so GL paper matches CSS paper.

### Performance

- DPR is capped at 2 on desktop and 2.5 on coarse pointers (so the woven type and the Z stay sharp on 3× phone screens). Phones also get the lighter mesh and 2× MSAA.
- The loop runs only while a `[data-gl]` section intersects the viewport and the tab is visible, and no popup is open. With motion off it renders on demand.
- **Quality governor:** after warm-up, a sustained average frame time above 26ms (19ms on phones) for two consecutive seconds drops MSAA, caps DPR at 1.25 (1.5 on phones — the old phone default, so degraded quality never falls below the previous baseline) and throttles to 30fps.
- Measured at 390px, DPR 3, on the shared integrated GPU: median frame interval 7.1ms, p95 about 14ms, idle and during touch scroll. Before the phone path it was 18–21ms.
- The text texture is rebuilt only on resize or font load (debounced).

### Fallbacks

- **No WebGL2, shader or link failure, context loss, or a runtime error** → `html.no-gl`:
  - sections paint CSS grounds and the DOM type and portrait are visible;
  - the hero shows the ribbon sculpture photograph in a rounded window. On phones it is a 5:4 card and the empty loop row collapses, so the lede follows the title;
  - seams become static enamel/chrome bands;
  - Contact shows the SVG Z mark.
- **Forced colours:** the canvas is hidden and the woven type and portrait drop back to DOM.
- **CSP:** no external requests, no eval, no inline scripts (`boot.js` sets classes before first paint).

## Files

- `index.html`, `ribbon.css`, `site.js` (interactions, popups, form, filter, progress), `ribbon-gl.js` (the stage), `boot.js`, `zstore-mark.svg` (favicon and mark).
- `privacy-policy.html`, `terms.html`, `legal.css`: the legal pages.
- `fonts/` (the woff2 files and `fonts.css`) and `image/` (portrait, study images, `brand/zstore-logo.webp`, app icons and the share image), all referenced with relative paths.
- `favicon.ico`, `apple-touch-icon.png`, `site.webmanifest`: icons and manifest drawn from the Z mark.
- `tests/mobile-check.cjs`: the full phone QA suite (needs Playwright, writes into `tests/qa/`). `popup-check.cjs`, `ring-check.cjs` and `layout-check.cjs` were lab-only checks and are not included in this package.
- `serve.cjs`, `START.cmd`, `package.json`, `README.md`: running the site locally.

## Known issues / open questions

- **Letter spacing:** exact GL type metrics rely on `CanvasRenderingContext2D.letterSpacing`. Older Safari/Firefox fall back to per-glyph drawing (no kerning pairs), which is slightly looser than the DOM text.
- **Mobile Safari toolbar:** collapsing the dynamic toolbar can misalign the woven planes by a frame while it animates.
- **Cost:** the MSAA resolve still runs per frame. Bloom mips are built at half resolution. Very low-end phones rely on the quality governor.
- **Sticky stage:** the stage duplicates the study headings visually. It is `aria-hidden`, and the real headings stay in the DOM, visually hidden on desktop.

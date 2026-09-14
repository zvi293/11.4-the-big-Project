# Zstore AI — "One Ribbon"

English below · [עברית](#עברית)

---

## English

### What this is

"One Ribbon" is a finished website design for **Zstore AI**, the independent studio of Zvi Moshe. It is a single-page site plus Privacy and Terms pages.

- A real-time ribbon of orange enamel and polished chrome runs through the whole page. It is hand-written WebGL2: a figure-eight in the hero, a sculpture behind the concept studies, a ring in the Studio section, and it folds into the **Z** mark at Contact.
- It has its own identity: the folded-ribbon Z mark, Space Grotesk, Fraunces and JetBrains Mono.
- The three works (Atelier Studio, Lume, Meridian) are **concept studies** and are labelled that way on the page.
- Contact: `zstore.ai295@gmail.com` and WhatsApp `wa.me/972587292029`. The footer carries the Zstore AI credit badge linking to https://zstore-ai.co.il/.

**Zero dependencies.** Plain HTML, CSS and JavaScript. No framework, no build step, no `npm install`, no external requests (fonts and images are local). Node.js is used only to run the small local server.

The design idea, the motion system and the fallbacks are described in `CONCEPT.md`.

### How to run it

You need [Node.js](https://nodejs.org/) 18 or newer.

- **Windows:** double-click **`START.cmd`**. It starts the server and opens http://localhost:5190/ in your browser. Close the black window to stop.
- **Any system:** open a terminal in this folder and run `npm start` (or `node serve.cjs`), then open http://localhost:5190/.
- Another port: `set PORT=5191` then `node serve.cjs` (Windows), or `PORT=5191 node serve.cjs` (macOS/Linux).

Opening `index.html` directly (double-clicking it, a `file://` address) is **not supported**: browsers block WebGL textures on `file://`, so the ribbon and the woven type cannot render. Always use the server.

On `localhost` the contact form only validates and shows a preview message; it never sends. On the live site (https://nz-web.netlify.app/) it submits to **Netlify Forms** and is delivered to `zstore.ai295@gmail.com`.

All asset paths are relative, so the folder also works from a sub-path (for example `https://example.com/one-ribbon/`) on any static host.

### File map

```
One Ribbon/
├─ index.html            the site (all sections, the menu and the study dialog)
├─ privacy-policy.html   Privacy policy
├─ terms.html            Terms of service
├─ accessibility.html    Accessibility statement (WCAG 2.2 AA)
├─ thank-you.html        form success page (no-JS fallback)
├─ 404.html              not-found page (Netlify serves it automatically)
├─ robots.txt            open to search + AI crawlers, points to the sitemap
├─ sitemap.xml           the four indexable pages
├─ llms.txt              site summary for AI assistants (LLMO/GEO)
├─ humans.txt            credits
├─ netlify.toml          publish root, security headers, cache policy
├─ ribbon.css            all styles of the site
├─ legal.css             extra styles for the two legal pages
├─ site.js               interactions: menu and dialogs, filter, process tabs, form, clocks
├─ ribbon-gl.js          the WebGL2 ribbon stage
├─ boot.js               sets motion / JS classes before first paint
├─ zstore-mark.svg       the Z mark (SVG favicon)
├─ favicon.ico           favicon for older browsers
├─ apple-touch-icon.png  iOS home-screen icon
├─ site.webmanifest      app manifest (name, colours, icons)
├─ fonts/                fonts.css + the woff2 font files
├─ image/
│  ├─ 20251111_150847.webp   portrait of Zvi (Studio section)
│  ├─ studio/                concept-study images (atelier, lume, sculpture)
│  └─ brand/                 zstore-logo.webp (credit badge), app icons, og-share.jpg (1200×630 share image)
├─ CONCEPT.md            design concept and technical notes
├─ serve.cjs             local static server (no dependencies)
├─ START.cmd             Windows double-click launcher
├─ package.json          "npm start"
└─ tests/mobile-check.cjs   optional phone QA suite (needs Playwright, see below)
```

### Where to edit

| What | Where |
|---|---|
| **Email** | `index.html`: the `mailto:` link in the menu sheet and the Email link in Contact. `site.js`: the two form status messages that mention the address. `privacy-policy.html` and `terms.html`: the `legal-mail` link. Search for `zstore.ai295@gmail.com`. |
| **WhatsApp** | `index.html`: the two links with `data-wa` (menu sheet and Contact); change the number in `https://wa.me/972587292029` and the visible `+972 58 729 2029`. The pre-filled message is in `site.js` under "WhatsApp prefill". |
| **Form backend** | The form posts to **Netlify Forms** (form name `contact`): the `<form … data-netlify="true">` in `index.html` registers it at deploy time, and `site.js` submits it with `fetch('/')`. Submissions appear in the Netlify dashboard (Forms → contact) and are emailed to `zstore.ai295@gmail.com` via a form notification. No-JS visitors are redirected to `thank-you.html`. The spam guards (honeypot, timing) are in `site.js` under the form section. |
| Share image / title for social links | `index.html` `<head>`: the `og:` and `twitter:` tags. The share image lives at `image/brand/og-share.jpg` (1200×630 JPEG, source: `שיתוף.png` kept locally outside git); the tags point at the full `https://nz-web.netlify.app/…` address. If the domain ever changes, update `og:url`, `og:image`, `twitter:image`, the `canonical` link and the JSON-LD URLs. |

### Optional: the phone test

`tests/mobile-check.cjs` checks the site at phone, tablet and desktop sizes (menu, dialogs, links, form, legal pages, overflow). It is not needed to run the site.

1. Start the site (`npm start`).
2. In this folder: `npm i --no-save playwright` (and `npx playwright install chromium` if Google Chrome is not installed).
3. `node tests/mobile-check.cjs --url http://localhost:5190/` (or `npm run test:mobile`). Results and screenshots go to `tests/qa/` (change with `--out`). Use `--only legal,links` or `--views 390x844` for a shorter run.

---

<div dir="rtl" lang="he">

## עברית

### מה זה

"One Ribbon" הוא עיצוב אתר גמור עבור **Zstore AI**, הסטודיו העצמאי של צבי משה: אתר של עמוד אחד, ועוד עמודי מדיניות פרטיות ותנאי שימוש.

- סרט (ribbon) של אמייל כתום וכרום מלוטש עובר לאורך כל העמוד בזמן אמת. הוא כתוב ביד ב-WebGL2: צורת שמונה בפתיח, פסל מאחורי מחקרי הקונספט, טבעת באזור הסטודיו, ובאזור יצירת הקשר הוא מתקפל ללוגו ה-**Z**.
- לעיצוב זהות משלו: סימן ה-Z המקופל, והגופנים Space Grotesk,‏ Fraunces ו-JetBrains Mono.
- שלוש העבודות (Atelier Studio,‏ Lume,‏ Meridian) הן **מחקרי קונספט**, ומסומנות כך באתר.
- יצירת קשר: `zstore.ai295@gmail.com` ו-WhatsApp בכתובת `wa.me/972587292029`. בכותרת התחתונה יש תג קרדיט של Zstore AI שמקשר ל-https://zstore-ai.co.il/.

**אפס תלויות.** HTML,‏ CSS ו-JavaScript נקיים. בלי framework, בלי שלב build, בלי `npm install` ובלי בקשות חיצוניות (הגופנים והתמונות מקומיים). Node.js משמש רק להרצת השרת המקומי הקטן.

רעיון העיצוב, מערכת התנועה ומצבי הגיבוי מתוארים בקובץ `CONCEPT.md`.

### איך מריצים

צריך [Node.js](https://nodejs.org/) בגרסה 18 ומעלה.

- **Windows:** לחיצה כפולה על **`START.cmd`**. הקובץ מפעיל את השרת ופותח את http://localhost:5190/ בדפדפן. כדי לעצור, סוגרים את החלון השחור.
- **כל מערכת:** פותחים טרמינל בתיקייה הזו ומריצים `npm start` (או `node serve.cjs`), ואז פותחים את http://localhost:5190/.
- פורט אחר: `set PORT=5191` ואז `node serve.cjs` (ב-Windows), או `PORT=5191 node serve.cjs` (ב-macOS/Linux).

פתיחה ישירה של `index.html` (לחיצה כפולה על הקובץ, כתובת `file://`) **לא נתמכת**: דפדפנים חוסמים טקסטורות WebGL ב-`file://`, ולכן הסרט והטקסט השזור לא יוצגו. תמיד להריץ דרך השרת.

ב-`localhost` טופס יצירת הקשר רק בודק את השדות ומציג הודעת תצוגה מקדימה, והוא אף פעם לא שולח. באתר החי (https://nz-web.netlify.app/) הוא נשלח דרך **Netlify Forms** ומגיע למייל `zstore.ai295@gmail.com`.

כל הנתיבים יחסיים, כך שהתיקייה עובדת גם מתת-נתיב (למשל `https://example.com/one-ribbon/`) בכל אחסון סטטי.

### מפת קבצים

מפת הקבצים המלאה מופיעה בחלק האנגלי למעלה. בקצרה:

- `index.html` האתר, `privacy-policy.html` מדיניות פרטיות, `terms.html` תנאי שימוש.
- `ribbon.css` כל העיצוב, `legal.css` תוספת לעמודים המשפטיים.
- `site.js` האינטראקציות (תפריט, חלונות, מסנן, טופס), `ribbon-gl.js` במת ה-WebGL, `boot.js` מחלקות לפני הציור הראשון.
- `zstore-mark.svg`,‏ `favicon.ico`,‏ `apple-touch-icon.png`,‏ `site.webmanifest` אייקונים ומניפסט.
- `fonts/` הגופנים, `image/` הדיוקן, תמונות הקונספט, ו-`image/brand/` (תג הקרדיט `zstore-logo.webp`, אייקונים ותמונת השיתוף `og-share.jpg` בגודל 1200×630).
- `CONCEPT.md` הקונספט, `serve.cjs` השרת, `START.cmd` הפעלה ב-Windows, `package.json` הפקודה `npm start`, `tests/mobile-check.cjs` בדיקת מובייל אופציונלית.

### איפה עורכים

- **אימייל:** ב-`index.html` בקישור `mailto:` שבתפריט ובקישור האימייל שבאזור יצירת הקשר. ב-`site.js` בשתי הודעות הסטטוס של הטופס שמזכירות את הכתובת. ב-`privacy-policy.html` וב-`terms.html` בקישור `legal-mail`. כדאי לחפש `zstore.ai295@gmail.com`.
- **WhatsApp:** ב-`index.html` בשני הקישורים עם `data-wa` (בתפריט ובאזור יצירת הקשר). מחליפים את המספר בכתובת `https://wa.me/972587292029` ואת הטקסט הגלוי `+972 58 729 2029`. ההודעה הממולאת מראש נמצאת ב-`site.js` תחת "WhatsApp prefill".
- **הטופס:** עובד על **Netlify Forms** (טופס בשם `contact`). ה-`data-netlify="true"` ב-`index.html` רושם אותו בזמן פריסה, `site.js` שולח אותו ב-`fetch('/')`, וההודעות מגיעות לדשבורד של Netlify (Forms → contact) ולמייל `zstore.ai295@gmail.com` דרך התראת טופס. גולשים בלי JavaScript מופנים ל-`thank-you.html`. הגנות הספאם (שדה מלכודת, השהיות) נמצאות ב-`site.js` באזור הטופס.
- **תמונת שיתוף וכותרת לרשתות:** תגיות `og:` ב-`<head>` של `index.html`. כשהאתר עולה לדומיין אמיתי, כדאי לשנות את `og:image` לכתובת מלאה.

### אופציונלי: בדיקת המובייל

`tests/mobile-check.cjs` בודק את האתר בגדלים של טלפון, טאבלט ומחשב. הוא לא נדרש כדי להריץ את האתר. מפעילים את האתר (`npm start`), מתקינים `npm i --no-save playwright`, ומריצים `node tests/mobile-check.cjs --url http://localhost:5190/`. התוצאות נשמרות ב-`tests/qa/`.

</div>

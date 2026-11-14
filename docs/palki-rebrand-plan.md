# PALKI rebrand: implementation plan

Goal: palkicabs.buytogetherindia.com should show **no trace of ZI CAB**: no name, contact details, cities, people, logos or legal text. It also gets a **brand-new homepage** built from scratch in the PALKI logo's theme, with animated car visuals.

Status: **plan only, nothing changed yet.**

---

## 0. Brand system (from the PALKI logo)

| Token | Value | Use |
|---|---|---|
| `--palki-orange` | `#FF6A13` → `#FF8A2B` gradient | primary buttons, highlights, the "P" swoosh |
| `--palki-orange-deep` | `#E5530A` | hover / pressed |
| `--palki-ink` | `#2A2C33` | headings, dark sections, road |
| `--palki-ink-soft` | `#4A4D57` | body text |
| `--palki-paper` | `#FFFFFF` / `#FFF7F1` | backgrounds (white + warm off-white) |
| Road motif | dark road with white dashed centre line + orange map pin | recurring visual element (dividers, loaders, hero) |
| Type | geometric sans (e.g. *Outfit* / *Urbanist* for headings, *Inter* for body) | matches the wide, round "PALKI" wordmark |

- Name: **PALKI**. Tagline: **"Your Taxi App"**. Legal line: **"Powered by Bhaarat Apna Private Limited"**.
- Logo files: the uploaded JPG becomes `public/palki-logo.jpg`, plus a cropped square icon for the favicon / app icon. I'll ask for a transparent PNG/SVG later if you have one. Until then I'll crop the JPG cleanly.

---

## 1. Remove ZI CAB everywhere (333 mentions in 86 files)

### 1a. Brand text in code
- Replace every user-facing "ZI CAB / Zicab / Zi Cab / Zi Bus" with **PALKI** (and "Zi Bus" → **PALKI Bus**).
- Files to change: landing pages, Navbar, Footer, BookingModal, LandingShell, introGate, admin login, driver auth shell, support/legal pages, bus vendor panels, invoices, emails and notifications (`mailService`, `invoiceService`, `rideNotificationService`), voice-prompt defaults, wallet/ledger text, `index.html` (title, meta, JSON-LD), `SettingsContext`, backend `env.js` default app name.
- Code identifiers like `ZiBus.jsx` and CSS classes: rename to Palki equivalents where they show in URLs or the UI (e.g. route `/zi-bus` → `/palki-bus`, with a redirect from the old path). Purely internal names get renamed too, so a code search finds no "zicab".

### 1b. ZI CAB's company data (must not appear on PALKI)
| Data | Where | Replace with |
|---|---|---|
| Company "Zicab Group Private Limited" | supportInfo, footer copyright, index.html, legal texts, invoices | **Bhaarat Apna Private Limited** |
| Email `zicabofficial@gmail.com`, `support@zicab.in`, `noreply@zicab.in` | landing fallback, backend defaults, mail sender | **needs your PALKI email** (blank until given) |
| Phone `+91 8904343123` (14 places) and other real numbers | contact sections, support pages | **needs your PALKI phone / WhatsApp** |
| Address (Grand Majestic Mall, Gandhinagar, Bengaluru) + map link | contact, footer | **needs your PALKI address** (hidden until given) |
| Launch cities (Bengaluru, Mangaluru, Hubballi, Kempegowda Airport) | homepage, SEO, about, drivers | **needs your PALKI cities**; the section stays hidden until set |
| Founders and featured drivers (names, photos) | about page, homepage driver cards | removed; `public/founders`, `public/drivers` emptied |
| "200+ enterprises", ratings, ride counts | corporate/home stats | removed (not PALKI's numbers) |
| Terms & Privacy (36 + 16 ZI CAB mentions) | `terms-content.txt`, `privacy-content.txt` | rewritten for PALKI / Bhaarat Apna Pvt Ltd (template; **have a lawyer review**) |
| Sample/test data (`seedZicabAdmin.js`, `set_all_driver_wallets_500.js`, pricing scripts with zicab IDs) | `Backend/scripts` | ZI CAB-only one-off scripts deleted; the admin seed renamed to `seedAdmin.js` |
| Ops files (`ops/`, `deploy/` zicab nginx + backup cron) | repo | replaced with palkicabs versions matching the live server |
| `README.md`, `.env.example`, `.claude/launch.json` | repo | updated |

### 1c. Images and logos
- Delete `zicab-logo.jpg`, `trans logo.png`, `Rydon24.png`, `src/assets/{namologo,redigologo,rydon24_logo}.png` (other brands' logos) and the unused Gemini/ChatGPT images, after checking nothing still references them.
- Check every remaining image in `public/` (vehicle PNGs, banners, service photos) for a ZI CAB logo or watermark. Replace any branded one; keep the generic ones.

### 1d. Data stored on the server
- The palkicabs DB (`palkicabs_taxi`) is **fresh and empty**, so there's no ZI CAB data in it. The CMS currently falls back to the defaults in code, which step 1b cleans.
- `Backend/src/modules/taxi/admin/data/defaultLandingContent.js` (21 mentions) and `defaultThirdPartySettings` / `defaultRideVoiceSettings` get PALKI defaults, so a new CMS starts clean.

### 1e. Things that stay ZI CAB-linked until you replace them (not text, accounts)
- **Firebase project `zicab-e4c71`** (push notifications) and the **Google Maps key** are zicab's accounts. For a full split you'd create a PALKI Firebase project and Maps key. I'll wire them in when you have them. Until then notifications and maps keep working on zicab's accounts, and users won't see the name.

### 1f. Proof it's gone
- A case-insensitive search for `zi ?cab|zicab|zi-cab|zi_cab|8904343123|Grand Majestic` across the repo must return **0 results** (excluding this plan).
- The same search over the built `dist/` and the live site's HTML/JS.

---

## 2. New homepage, built from scratch

New files under `frontend/src/modules/landing/pages/home/` (one component per section) plus `palki-home.css`. The old `Home.jsx` (1,749 lines) is **deleted, not edited**. No layout, copy or sections carried over. It still reads CMS content (hero text, services, contact) so the admin panel keeps control.

Stack already in the project: **React 19, Tailwind 4, framer-motion, GSAP, Lenis** (smooth scroll). No new dependencies.

### Sections (top to bottom)
1. **Hero: "the road to your ride."**
   - Left: big headline ("Your city. Your ride. **PALKI.**"), tagline, a pickup → drop booking card (opens the existing booking flow), and app-store buttons.
   - Right: an **animated SVG scene** based on the logo. A winding dark road with a moving dashed centre line draws itself in, an original vector **car drives along the road** (framer-motion path animation), and an orange map pin drops and pulses at the destination.
   - Background: soft orange radial glow on warm white, with faint parallax city outlines.
2. **Ride types strip.** Cards for Bike, Auto, Mini, Sedan, SUV, Parcel and Bus, each with a car illustration that **slides in and bobs** on hover (wheels spin, headlights glint). Data comes from the existing vehicle-types API, so the admin controls the list.
3. **How it works.** Three steps (Set pickup → Driver arrives → Ride & pay) joined by a **road line that draws itself as you scroll** (GSAP ScrollTrigger), with a small car icon moving along it.
4. **Why PALKI.** Four value tiles (verified drivers, upfront fares, live tracking, 24x7 help) on a dark ink section with orange accents and a subtle animated road texture.
5. **Services showcase.** City rides, Outstation, Airport, Rentals, Parcel, PALKI Bus. Large cards with a **traffic scene on a horizontal loop** (cars moving across lanes at different speeds, pure CSS/SVG, no video).
6. **Drive with PALKI.** Driver sign-up band, with a car "parked" that pulls out when the section comes into view, and a CTA to the existing driver onboarding.
7. **App download.** A phone mockup showing a stylised live-tracking map, with the car moving along a route. Store badges.
8. **Footer.** New layout: logo, "Powered by Bhaarat Apna Private Limited", link columns, contact (from CMS, hidden when blank), social links, and a road strip with a dashed line across the top.

### Car images: original, animated
- All vehicles are **hand-built SVG illustrations** in the PALKI palette (orange body, charcoal glass and tyres), not stock or copied art. Each one has separate wheel, body and light groups, so wheels rotate, the body bobs slightly and headlights flash.
- One reusable `<PalkiCar variant="sedan|suv|hatch|auto|bike|bus" />` component powers every section, so the look stays consistent and loads fast (no heavy images).
- Generic, unbranded vehicle PNGs already in `public/` may be used inside the ride-type cards if they look better, after checking they carry no ZI CAB marks.

### Quality bar
- Responsive: designed for 360px phones up to wide desktop. The hero stacks on mobile, and the road animation simplifies.
- `prefers-reduced-motion`: all animation turns off, and the static scene still looks complete.
- Performance: SVG/CSS animations only, below-the-fold sections lazy-loaded, and a Lighthouse target of 90+ on mobile.
- Accessibility: real headings, alt text, visible focus states, AA colour contrast (orange text only at large sizes, ink for body).
- The rest of the landing site (Services, About, Contact, Driver, Partner, Corporate, Advertise, Bus) gets the new colours, fonts, navbar and footer, so it matches the homepage.

---

## 3. Order of work

1. Brand tokens + logo assets + new Navbar/Footer.
2. Remove ZI CAB text, data, images and scripts (step 1), then run the zero-results search.
3. Build the new homepage section by section, checking each one in the browser preview on desktop and mobile.
4. Restyle the other landing pages with the new theme.
5. Local build + lint, then one commit per stage, pushed to `appzetogit/palkicabs`.
6. Deploy to the server: `git pull`, build the frontend, restart `palkicabs-backend`, then check the live site and run the zero-results search against the live HTML/JS.

---

## 4. What I need from you
1. **PALKI contact details**: support phone/WhatsApp, email, office address.
2. **Cities** PALKI operates in (or "hide the cities section for now").
3. **App store links** for the PALKI rider/driver apps, if they exist (otherwise "Coming soon").
4. A **transparent PNG or SVG** of the logo, if you have one (optional; I can crop the JPG).
5. Later (optional): a PALKI **Firebase project** and **Google Maps key**, to fully split from zicab's accounts.

Anything not provided stays blank and hidden on the site. Nothing falls back to ZI CAB.

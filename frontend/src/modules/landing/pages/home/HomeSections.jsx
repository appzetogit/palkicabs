import { useLayoutEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight, BadgeIndianRupee, Bus, CalendarDays, Car, ChevronDown, Clock, MapPin, Navigation,
  Smartphone, Star, Users,
} from 'lucide-react';
import PalkiCar from './PalkiCar';
import { variantFor } from './palkiVariants';
import RoadScene from './RoadScene';
import { LANDING_ICONS } from '../../useLandingContent';

/* ── shared bits ─────────────────────────────────────────────────────────── */

const EASE = [0.16, 0.84, 0.28, 1];

export function Reveal({ children, delay = 0, y = 26, className = '', as = 'div' }) {
  const still = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={still ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

function SectionHead({ eyebrow, title, sub, light = false, center = false }) {
  return (
    <Reveal className={`ph-head ${light ? 'is-light' : ''} ${center ? 'is-center' : ''}`}>
      {eyebrow && <span className="ph-eyebrow">{eyebrow}</span>}
      <h2 className="ph-h2">{title}</h2>
      {sub && <p className="ph-sub">{sub}</p>}
    </Reveal>
  );
}

/** Thin road with a dashed centre line — the logo's road, used as a divider. */
export function RoadDivider({ flip = false }) {
  return (
    <div className={`ph-road-divider ${flip ? 'is-flip' : ''}`} aria-hidden="true">
      <span />
    </div>
  );
}

/* ── hero ───────────────────────────────────────────────────────────────── */

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Hero({ hero, onBook, onBusSearch }) {
  const still = useReducedMotion();
  const [mode, setMode] = useState('ride');
  const [pickup, setPickup] = useState('');
  const [drop, setDrop] = useState('');
  const [busFrom, setBusFrom] = useState('');
  const [busTo, setBusTo] = useState('');
  const [busDate, setBusDate] = useState(todayKey);

  const rise = (delay) => ({
    initial: still ? false : { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: EASE, delay },
  });

  const submitRide = (e) => {
    e.preventDefault();
    onBook();
  };

  const submitBus = (e) => {
    e.preventDefault();
    if (!busFrom.trim() || !busTo.trim()) return;
    onBusSearch({ fromCity: busFrom.trim(), toCity: busTo.trim(), date: busDate || todayKey() });
  };

  const badges = (hero?.badges || []).slice(0, 4);

  return (
    <section className="ph-hero">
      <div className="ph-hero-bg" aria-hidden="true">
        <span className="ph-blob ph-blob-a" />
        <span className="ph-blob ph-blob-b" />
      </div>

      <div className="ph-container ph-hero-grid">
        <div className="ph-hero-copy">
          <motion.span className="ph-pill" {...rise(0.05)}>
            <img src="/palki-mark.png" alt="" width="18" height="18" />
            PALKI · Your Taxi App
          </motion.span>

          <motion.h1 className="ph-h1" {...rise(0.12)}>
            <span>{hero?.titleLine1 || 'Your city.'}</span>
            <span className="ph-accent">{hero?.titleLine2 || 'Your ride. PALKI.'}</span>
          </motion.h1>

          <motion.p className="ph-lead" {...rise(0.22)}>
            {hero?.subtitle}
          </motion.p>

          <motion.div className="ph-book" {...rise(0.32)}>
            <div className="ph-book-tabs" role="tablist" aria-label="What would you like to book?">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'ride'}
                className={mode === 'ride' ? 'is-on' : ''}
                onClick={() => setMode('ride')}
              >
                <Car size={16} /> Ride
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'bus'}
                className={mode === 'bus' ? 'is-on' : ''}
                onClick={() => setMode('bus')}
              >
                <Bus size={16} /> Bus
              </button>
              <span className={`ph-book-tab-ink ${mode === 'bus' ? 'is-right' : ''}`} aria-hidden="true" />
            </div>

            {mode === 'ride' ? (
              <form className="ph-book-form" onSubmit={submitRide}>
                <label className="ph-field">
                  <span className="ph-field-dot" aria-hidden="true" />
                  <span className="ph-sr">Pickup location</span>
                  <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pickup location" />
                </label>
                <span className="ph-field-line" aria-hidden="true" />
                <label className="ph-field">
                  <MapPin size={16} className="ph-field-pin" aria-hidden="true" />
                  <span className="ph-sr">Drop location</span>
                  <input value={drop} onChange={(e) => setDrop(e.target.value)} placeholder="Where to?" />
                </label>
                <button type="submit" className="ph-btn ph-btn-primary ph-book-go">
                  {hero?.primaryCta || 'Book a Ride'} <ArrowRight size={18} />
                </button>
              </form>
            ) : (
              <form className="ph-book-form" onSubmit={submitBus}>
                <label className="ph-field">
                  <span className="ph-field-dot" aria-hidden="true" />
                  <span className="ph-sr">From city</span>
                  <input value={busFrom} onChange={(e) => setBusFrom(e.target.value)} placeholder="From city" required />
                </label>
                <span className="ph-field-line" aria-hidden="true" />
                <label className="ph-field">
                  <MapPin size={16} className="ph-field-pin" aria-hidden="true" />
                  <span className="ph-sr">To city</span>
                  <input value={busTo} onChange={(e) => setBusTo(e.target.value)} placeholder="To city" required />
                </label>
                <label className="ph-field ph-field-date">
                  <CalendarDays size={16} aria-hidden="true" />
                  <span className="ph-sr">Travel date</span>
                  <input type="date" value={busDate} min={todayKey()} onChange={(e) => setBusDate(e.target.value)} />
                </label>
                <button type="submit" className="ph-btn ph-btn-primary ph-book-go">
                  Search buses <ArrowRight size={18} />
                </button>
              </form>
            )}
          </motion.div>

          {badges.length > 0 && (
            <motion.ul className="ph-trust" {...rise(0.42)}>
              {badges.map((b) => {
                const Icon = LANDING_ICONS[b.icon] || Star;
                return (
                  <li key={b.label}>
                    <Icon size={16} aria-hidden="true" /> {b.label}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </div>

        <div className="ph-hero-visual">
          <RoadScene />
        </div>
      </div>
    </section>
  );
}

/* ── ride types ─────────────────────────────────────────────────────────── */

const RIDES = [
  { name: 'Bike', variant: 'bike', desc: 'Zip through traffic on two wheels', meta: '1 rider' },
  { name: 'Auto', variant: 'auto', desc: 'Everyday hops across town', meta: '3 seats' },
  { name: 'Mini', variant: 'hatch', desc: 'Compact AC cab, easy on the pocket', meta: '4 seats' },
  { name: 'Sedan', variant: 'sedan', desc: 'Extra legroom and boot space', meta: '4 seats' },
  { name: 'SUV', variant: 'suv', desc: 'Room for family and luggage', meta: '6–7 seats' },
  { name: 'Parcel', variant: 'bike', cargo: true, desc: 'Send packages across the city', meta: 'Doorstep pickup' },
  { name: 'PALKI Bus', variant: 'bus', desc: 'Pick your seat for intercity trips', meta: 'Live seat map', bus: true },
];

export function RideTypes({ vehicles, source, onBook, onBus }) {
  // Real catalog when the admin has set one up; otherwise PALKI's standard line-up.
  const list =
    source === 'api' && vehicles.length
      ? vehicles.map((v) => ({
          name: v.name,
          variant: variantFor(`${v.name} ${v.type}`),
          cargo: /parcel|deliver/i.test(v.name),
          desc: v.type || 'Book in seconds, track live',
          meta: [v.seats, v.price && `${v.price}${v.unit}`].filter(Boolean).join(' · '),
          bus: variantFor(v.name) === 'bus',
        }))
      : RIDES;

  return (
    <section className="ph-section ph-rides" id="rides">
      <div className="ph-container">
        <SectionHead
          eyebrow="Ride your way"
          title="One app. Every kind of ride."
          sub="From a quick bike hop to a family SUV or an overnight bus — pick what fits the trip."
        />
        <div className="ph-ride-grid">
          {list.map((r, i) => (
            <Reveal key={`${r.name}-${i}`} delay={Math.min(i, 6) * 0.06}>
              <button
                type="button"
                className={`ph-ride ${r.variant === 'bus' ? 'is-wide' : ''}`}
                onClick={() => (r.bus ? onBus() : onBook(r.name))}
              >
                <span className="ph-ride-stage" aria-hidden="true">
                  <span className="ph-ride-road" />
                  <PalkiCar variant={r.variant} cargo={r.cargo} className="ph-ride-car" />
                </span>
                <span className="ph-ride-body">
                  <strong>{r.name}</strong>
                  <span>{r.desc}</span>
                  {r.meta && <em>{r.meta}</em>}
                </span>
                <span className="ph-ride-go" aria-hidden="true"><ArrowRight size={18} /></span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── how it works ───────────────────────────────────────────────────────── */

const STEPS = [
  { icon: MapPin, title: 'Set pickup & drop', desc: 'Type where you are and where you are headed — or drop a pin on the map.' },
  { icon: BadgeIndianRupee, title: 'See your fare, confirm', desc: 'The fare is shown before you book. No surprises at the end of the trip.' },
  { icon: Navigation, title: 'Track & ride', desc: 'Watch your driver arrive live, share your trip, and pay the way you like.' },
];

const STEP_ROAD = 'M20 70C160 70 180 20 330 20S520 120 660 120S860 40 980 40';

export function HowItWorks() {
  const ref = useRef(null);
  const pathRef = useRef(null);
  const carRef = useRef(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const draw = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const place = (p) => {
    const path = pathRef.current;
    const car = carRef.current;
    if (!path || !car) return;
    const len = path.getTotalLength();
    const at = Math.max(0, Math.min(1, p)) * len;
    const pt = path.getPointAtLength(at);
    const ahead = path.getPointAtLength(Math.min(len, at + 1));
    const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
    car.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${angle})`);
  };

  useMotionValueEvent(scrollYProgress, 'change', place);
  useLayoutEffect(() => place(still ? 1 : scrollYProgress.get()));

  return (
    <section className="ph-section ph-how" ref={ref}>
      <div className="ph-container">
        <SectionHead eyebrow="How it works" title="Booked in three taps." center />

        <div className="ph-how-track">
          <svg viewBox="0 0 1000 140" className="ph-how-road" aria-hidden="true">
            <path d={STEP_ROAD} fill="none" stroke="#F1E3D8" strokeWidth="26" strokeLinecap="round" />
            <motion.path
              ref={pathRef}
              d={STEP_ROAD}
              fill="none"
              stroke="#2A2C33"
              strokeWidth="26"
              strokeLinecap="round"
              style={{ pathLength: still ? 1 : draw }}
            />
            <path d={STEP_ROAD} fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="10 12" strokeOpacity="0.8" />
            <g ref={carRef}>
              <rect x="-17" y="-10" width="34" height="20" rx="6" fill="#F25A0D" />
              <path d="M2-8Q8-8 10-3L10 3Q8 8 2 8Z" fill="#2A2C33" />
              <rect x="-7" y="-7" width="7" height="14" rx="2" fill="#FF9A3C" />
            </g>
          </svg>

          <ol className="ph-steps">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.12} className="ph-step">
                <span className="ph-step-num">{i + 1}</span>
                <span className="ph-step-icon"><s.icon size={22} /></span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ── why palki ──────────────────────────────────────────────────────────── */

export function WhyPalki({ valueProps }) {
  const items = (valueProps || []).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="ph-section ph-why">
      <div className="ph-why-lanes" aria-hidden="true"><span /><span /><span /></div>
      <div className="ph-container">
        <SectionHead
          light
          eyebrow="Why PALKI"
          title="Rides you can count on."
          sub="Every trip is built around three things: your safety, a fair price, and someone to call when you need help."
        />
        <div className="ph-why-grid">
          {items.map((v, i) => {
            const Icon = v.icon;
            return (
              <Reveal key={v.title} delay={i * 0.07} className="ph-why-card">
                <span className="ph-why-icon"><Icon size={22} /></span>
                <h3>{v.title}</h3>
                <p>{v.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── services ───────────────────────────────────────────────────────────── */

export function Services({ items, onBook, onBus, onAll }) {
  const list = (items || []).filter((s) => s.image).slice(0, 6);
  if (!list.length) return null;
  return (
    <section className="ph-section ph-services">
      <div className="ph-container">
        <div className="ph-head-row">
          <SectionHead
            eyebrow="Services"
            title="Wherever the day takes you."
            sub="City commutes, airport runs, weekend getaways, parcels and intercity buses."
          />
          <Reveal>
            <button type="button" className="ph-btn ph-btn-ghost" onClick={onAll}>
              All services <ArrowRight size={16} />
            </button>
          </Reveal>
        </div>

        <div className="ph-service-grid">
          {list.map((s, i) => (
            <Reveal key={s.id || s.title} delay={i * 0.06}>
              <button
                type="button"
                className="ph-service"
                onClick={() => (s.id === 'bus' ? onBus() : onBook(s.title))}
              >
                <span className="ph-service-img">
                  <img src={s.image} alt="" loading="lazy" />
                </span>
                <span className="ph-service-body">
                  {s.tag && <em>{s.tag}</em>}
                  <strong>{s.title}</strong>
                  <span>
                    Book now <ArrowRight size={15} />
                  </span>
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Looping traffic: PALKI vehicles crossing two lanes at different speeds. */
export function TrafficBand() {
  const still = useReducedMotion();
  const lanes = [
    ['sedan', 'auto', 'suv', 'bike', 'hatch'],
    ['bus', 'hatch', 'bike', 'sedan'],
  ];
  return (
    <div className={`ph-traffic ${still ? 'is-still' : ''}`} aria-hidden="true">
      {lanes.map((lane, li) => (
        <div key={li} className={`ph-lane ph-lane-${li}`}>
          <div className="ph-lane-track">
            {[...lane, ...lane].map((v, i) => (
              <PalkiCar
                key={i}
                variant={v}
                tone={i % 3 === 2 ? 'ink' : 'orange'}
                cargo={v === 'bike' && i % 2 === 0}
                driving={!still}
                className={`ph-lane-car is-${v}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── drive / partner ────────────────────────────────────────────────────── */

export function DriveBand({ onDriver, onPartner }) {
  const still = useReducedMotion();
  return (
    <section className="ph-section ph-drive">
      <div className="ph-container ph-drive-grid">
        <Reveal className="ph-drive-card ph-drive-main">
          <span className="ph-eyebrow">Drive with PALKI</span>
          <h2 className="ph-h2">Your car. Your hours. Your earnings.</h2>
          <p className="ph-sub">
            Sign up, get verified and start taking rides near you. Flexible timings and payouts you can track in the app.
          </p>
          <div className="ph-drive-actions">
            <button type="button" className="ph-btn ph-btn-primary" onClick={onDriver}>
              Become a driver <ArrowRight size={18} />
            </button>
            <button type="button" className="ph-btn ph-btn-light" onClick={onPartner}>
              Attach your fleet
            </button>
          </div>
          <motion.div
            className="ph-drive-car"
            aria-hidden="true"
            initial={still ? false : { x: '60%', opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, margin: '0px 0px -20% 0px' }}
            transition={{ duration: 1.3, ease: EASE }}
          >
            <PalkiCar variant="suv" driving={!still} />
          </motion.div>
        </Reveal>

        <div className="ph-drive-side">
          {[
            { icon: Clock, title: 'Flexible hours', desc: 'Go online when it suits you, go offline when it does not.' },
            { icon: BadgeIndianRupee, title: 'Clear earnings', desc: 'Every fare, payout and wallet entry visible in the driver app.' },
            { icon: Users, title: 'Bus operators too', desc: 'List your buses on PALKI Bus and sell seats online.' },
          ].map((p, i) => (
            <Reveal key={p.title} delay={0.1 + i * 0.08} className="ph-drive-perk">
              <span className="ph-why-icon"><p.icon size={20} /></span>
              <span>
                <strong>{p.title}</strong>
                <span>{p.desc}</span>
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── app download ───────────────────────────────────────────────────────── */

function StoreButton({ href, store }) {
  const label = store === 'play' ? 'Google Play' : 'App Store';
  const small = href ? (store === 'play' ? 'Get it on' : 'Download on the') : 'Coming soon to';
  const inner = (
    <>
      <Smartphone size={20} aria-hidden="true" />
      <span>
        <small>{small}</small>
        <strong>{label}</strong>
      </span>
    </>
  );
  return href ? (
    <a className="ph-store" href={href} target="_blank" rel="noreferrer">{inner}</a>
  ) : (
    <span className="ph-store is-soon" aria-disabled="true">{inner}</span>
  );
}

const PHONE_ROUTE = 'M40 300C40 240 120 250 130 200S90 120 150 90S210 60 200 40';

export function AppBand({ brand, onWeb }) {
  const still = useReducedMotion();
  return (
    <section className="ph-section ph-app">
      <div className="ph-container ph-app-grid">
        <div className="ph-app-copy">
          <SectionHead
            eyebrow="The PALKI app"
            title="Your rides, in your pocket."
            sub={brand?.appBlurb || 'Book in seconds, track your driver live and keep every receipt in one place.'}
          />
          <Reveal className="ph-app-stores" delay={0.1}>
            <StoreButton href={brand?.playStoreUrl} store="play" />
            <StoreButton href={brand?.appStoreUrl} store="apple" />
          </Reveal>
          <Reveal delay={0.16}>
            <button type="button" className="ph-link" onClick={onWeb}>
              Or book on the web <ArrowRight size={16} />
            </button>
          </Reveal>
        </div>

        <Reveal className="ph-phone-wrap" y={40}>
          <div className="ph-phone" aria-hidden="true">
            <span className="ph-phone-notch" />
            <svg viewBox="0 0 240 340" className="ph-phone-map">
              <rect width="240" height="340" fill="#FFF8F2" />
              {[[20, 30, 70, 50], [120, 20, 90, 40], [20, 120, 60, 60], [150, 130, 70, 60], [30, 230, 80, 40], [150, 240, 70, 70]].map(
                ([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="8" fill="#FBE7D8" />,
              )}
              <path d={PHONE_ROUTE} fill="none" stroke="#2A2C33" strokeWidth="12" strokeLinecap="round" />
              <path d={PHONE_ROUTE} fill="none" stroke="#FF6A13" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
              <g>
                {!still && <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path={PHONE_ROUTE} />}
                <g transform={still ? 'translate(130 200)' : undefined}>
                  <rect x="-11" y="-7" width="22" height="14" rx="4" fill="#F25A0D" />
                  <path d="M1-5Q6-5 7-2L7 2Q6 5 1 5Z" fill="#2A2C33" />
                </g>
              </g>
              <g transform="translate(200 40)">
                <path d="M0 0C-3-8-14-14-14-25A14 14 0 0 1 14-25C14-14 3-8 0 0Z" fill="#FF6A13" />
                <circle cy="-25" r="5.5" fill="#fff" />
              </g>
            </svg>
            <div className="ph-phone-sheet">
              <span className="ph-phone-grab" />
              <div className="ph-phone-row">
                <PalkiCar variant="sedan" className="ph-phone-car" />
                <span>
                  <strong>Your driver is on the way</strong>
                  <small>Arriving in 3 min · Sedan</small>
                </span>
              </div>
              <div className="ph-phone-bar"><span /></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── cities + faq ───────────────────────────────────────────────────────── */

export function Cities({ cities }) {
  if (!cities?.length) return null;
  return (
    <section className="ph-section ph-cities">
      <div className="ph-container">
        <SectionHead eyebrow="Where we ride" title="PALKI is live in" center />
        <div className="ph-city-list">
          {cities.map((c, i) => (
            <Reveal key={c.name} delay={i * 0.05} className="ph-city">
              <MapPin size={18} aria-hidden="true" />
              <span>
                <strong>{c.name}</strong>
                {c.note && <small>{c.note}</small>}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Faq({ faqs }) {
  const [open, setOpen] = useState(0);
  if (!faqs?.length) return null;
  return (
    <section className="ph-section ph-faq">
      <div className="ph-container ph-faq-grid">
        <SectionHead eyebrow="FAQ" title="Questions, answered." sub="Anything else? Our support team is a call or message away." />
        <div className="ph-faq-list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.04} className={`ph-faq-item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span>{f.q}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                <div className="ph-faq-a" hidden={!isOpen}>
                  <p>{f.a}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

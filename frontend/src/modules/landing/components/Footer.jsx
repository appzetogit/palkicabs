import { Mail, MapPin, MessageCircle, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { scrollToTop } from '../hooks/useSmoothScroll';
import { useLanding } from '../landingContentContext';
import './footer.css';

const COMPANY_LINKS = [
  { id: 'about', label: 'About PALKI' },
  { id: 'services', label: 'Services' },
  // Bus hidden from the menu for now; the /palki-bus page still exists.
  // { id: 'bus', label: 'PALKI Bus' },
  { id: 'corporate', label: 'PALKI for Business' },
  { id: 'advertise', label: 'Advertise with us' },
  { id: 'contact', label: 'Contact' },
];

const EARN_LINKS = [
  { id: 'driver', label: 'Drive with PALKI' },
  { id: 'partner', label: 'Attach your fleet' },
  // { href: '/bus-register', label: 'List your buses' },
];

const dial = (v = '') => String(v).replace(/[^\d+]/g, '');

/**
 * PALKI footer. Contact rows, cities and store links render only when the admin
 * has filled them in, so an unset field never shows as an empty label.
 */
export default function Footer({ setActiveTab }) {
  const { contact = {}, launchCities = [], waLink, brand, footer } = useLanding();

  const go = (id) => {
    setActiveTab(id);
    scrollToTop();
  };

  const phone = contact.tollFree || contact.whatsappDisplay;
  const contacts = [
    phone && { icon: Phone, label: phone, href: `tel:${dial(phone)}` },
    contact.whatsapp && { icon: MessageCircle, label: `WhatsApp ${contact.whatsappDisplay || ''}`.trim(), href: waLink(), external: true },
    contact.email && { icon: Mail, label: contact.email, href: `mailto:${contact.email}` },
    contact.address && { icon: MapPin, label: contact.address, href: contact.mapsUrl || undefined, external: true },
  ].filter(Boolean);

  const stores = [
    { url: brand.playStoreUrl, store: 'Google Play' },
    { url: brand.appStoreUrl, store: 'App Store' },
  ];
  const services = footer?.cabServices || [];

  return (
    <footer className="pf">
      <div className="pf-road" aria-hidden="true"><span /></div>

      <div className="pf-inner">
        <div className="pf-grid">
          <div className="pf-brand">
            <button type="button" className="pf-logo" onClick={() => go('home')} aria-label="PALKI home">
              <img src="/palki-mark.png" alt="" />
              <span>
                <strong>PALKI</strong>
                <small>{brand.tagline || 'Your Taxi App'}</small>
              </span>
            </button>
            {footer?.description && <p className="pf-desc">{footer.description}</p>}
            {contacts.length > 0 && (
              <ul className="pf-contacts">
                {contacts.map((c) => {
                  const Icon = c.icon;
                  const { label, href, external } = c;
                  return (
                  <li key={label}>
                    <Icon size={16} aria-hidden="true" />
                    {href ? (
                      <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{label}</a>
                    ) : (
                      <span>{label}</span>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="pf-col">
            <h4>Company</h4>
            <ul>
              {COMPANY_LINKS.map((l) => (
                <li key={l.id}><button type="button" onClick={() => go(l.id)}>{l.label}</button></li>
              ))}
            </ul>
          </div>

          <div className="pf-col">
            <h4>{footer?.servicesHeading || 'Services'}</h4>
            <ul>
              {services.map((s) => (
                <li key={s.label}><button type="button" onClick={() => go('services')}>{s.label}</button></li>
              ))}
            </ul>
          </div>

          <div className="pf-col">
            <h4>Earn with PALKI</h4>
            <ul>
              {EARN_LINKS.map((l) => (
                <li key={l.label}>
                  {l.href ? <a href={l.href}>{l.label}</a> : <button type="button" onClick={() => go(l.id)}>{l.label}</button>}
                </li>
              ))}
            </ul>
            <div className="pf-stores">
              {stores.map(({ url, store }) => {
                const inner = (
                  <>
                    <Smartphone size={16} aria-hidden="true" />
                    <span>
                      <small>{url ? 'Get it on' : 'Coming soon'}</small>
                      <strong>{store}</strong>
                    </span>
                  </>
                );
                return url ? (
                  <a key={store} className="pf-store" href={url} target="_blank" rel="noreferrer">{inner}</a>
                ) : (
                  <span key={store} className="pf-store is-soon">{inner}</span>
                );
              })}
            </div>
          </div>
        </div>

        {launchCities.length > 0 && (
          <div className="pf-cities">
            <span>Live in</span>
            {launchCities.map((c) => (
              <em key={c.name}><MapPin size={12} aria-hidden="true" /> {c.name}</em>
            ))}
          </div>
        )}

        <div className="pf-bottom">
          <div>
            <p>{footer?.copyright}</p>
            <p className="pf-powered">
              <ShieldCheck size={14} aria-hidden="true" /> Powered by Bhaarat Apna Private Limited
            </p>
          </div>
          <nav className="pf-legal" aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/refund">Refunds &amp; cancellation</a>
            {/* Required credit for the Creative Commons vehicle photos. */}
            <a href="/vehicles/ATTRIBUTION.md" target="_blank" rel="noreferrer">Photo credits</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

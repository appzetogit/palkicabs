import { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Menu, X } from 'lucide-react';
import { scrollToTop } from '../hooks/useSmoothScroll';
import { useLanding } from '../landingContentContext';
import './navbar.css';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'services', label: 'Services' },
  // Bus hidden from the menu for now; the /palki-bus page still exists.
  // { id: 'bus', label: 'PALKI Bus' },
  { id: 'driver', label: 'Drive' },
  { id: 'partner', label: 'Partner' },
  { id: 'corporate', label: 'Business' },
  { id: 'advertise', label: 'Advertise' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

/** PALKI site header: white glass bar, logo mark + wordmark, orange CTA. */
export default function Navbar({ activeTab, setActiveTab, openBookingModal }) {
  const { brand } = useLanding();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const go = (id) => {
    setActiveTab(id);
    setOpen(false);
    scrollToTop();
  };

  const wordmark = [brand.wordmarkPrimary, brand.wordmarkSecondary].filter(Boolean).join(' ') || 'PALKI';

  return (
    <header className={`pn ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
      <div className="pn-inner">
        <button type="button" className="pn-brand" onClick={() => go('home')} aria-label={`${wordmark} home`}>
          <img src={brand.logo} alt="" className="pn-logo" />
          <span className="pn-word">
            <strong>{wordmark}</strong>
            {brand.tagline && <small>{brand.tagline}</small>}
          </span>
        </button>

        <nav className="pn-links" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={activeTab === item.id ? 'is-active' : ''}
              aria-current={activeTab === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pn-actions">
          <button type="button" className="pn-cta" onClick={openBookingModal}>
            Book a Ride <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="pn-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <div className="pn-road" aria-hidden="true" />

      {open && (
        <div className="pn-drawer">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={activeTab === item.id ? 'is-active' : ''}
            >
              <span>{item.label}</span>
              <ChevronRight size={18} />
            </button>
          ))}
          <button
            type="button"
            className="pn-cta pn-drawer-cta"
            onClick={() => {
              setOpen(false);
              openBookingModal();
            }}
          >
            Book a Ride <ArrowRight size={16} />
          </button>
        </div>
      )}
    </header>
  );
}

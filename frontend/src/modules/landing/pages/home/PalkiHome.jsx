import { useNavigate } from 'react-router-dom';
import { useLanding } from '../../landingContentContext';
import useVehicleTypes from '../../useVehicleTypes';
import {
  AppBand, Cities, DriveBand, Faq, Hero, HowItWorks, RideTypes, RoadDivider, Services,
  TrafficBand, WhyPalki,
} from './HomeSections';
import './palki-home.css';

/**
 * PALKI homepage. Built from scratch around the logo: orange, charcoal, and the
 * winding road with a map pin. All copy that the admin can edit (hero, value
 * props, services, FAQs, cities, store links) still comes from the CMS via
 * useLanding, so the panel keeps control of the words.
 */
export default function PalkiHome({ openBookingModal, setActiveTab }) {
  const navigate = useNavigate();
  const { hero, brand, valueProps, servicesPage, launchCities, faqs } = useLanding();
  const { vehicles, source } = useVehicleTypes([]);

  const book = (vehicle) => openBookingModal?.(vehicle || null);

  return (
    <div className="ph-root">
      <Hero
        hero={hero}
        onBook={() => book()}
      />
      <RideTypes vehicles={vehicles} source={source} onBook={book} />
      <RoadDivider />
      <HowItWorks />
      <WhyPalki valueProps={valueProps} />
      <Services
        items={servicesPage?.items}
        onBook={book}
        onAll={() => setActiveTab?.('services')}
      />
      <TrafficBand />
      <DriveBand onDriver={() => setActiveTab?.('driver')} onPartner={() => setActiveTab?.('partner')} />
      <AppBand brand={brand} onWeb={() => navigate('/login')} />
      <Cities cities={launchCities} />
      <Faq faqs={faqs} />
    </div>
  );
}

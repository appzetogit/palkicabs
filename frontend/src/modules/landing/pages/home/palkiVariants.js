/** Variant for a vehicle name from the admin catalog ("Bike Taxi", "Sedan", ...). */
export function variantFor(name = '') {
  const n = String(name).toLowerCase();
  if (/bus|coach|tempo traveller|traveller/.test(n)) return 'bus';
  if (/auto|rickshaw|e-rick/.test(n)) return 'auto';
  if (/bike|moto|scoot|two/.test(n)) return 'bike';
  if (/parcel|deliver|courier/.test(n)) return 'bike';
  if (/suv|innova|ertiga|xl6|muv|7 ?seat|fortuner/.test(n)) return 'suv';
  if (/mini|hatch|micro|go\b/.test(n)) return 'hatch';
  return 'sedan';
}

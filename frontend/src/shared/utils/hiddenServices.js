// Bus, Rental and Spiritual-trip flows are switched off (code kept, not removed).
// To bring them back: delete this filter's use (search "isHiddenService") and
// un-comment the routes/menus marked "HIDDEN".
const HIDDEN = /(^|[^a-z])(bus|rental|rentals|self-drive|spiritual|tours?|dhabas?)([^a-z]|$)/i;

export const isHiddenService = (item = {}) =>
  [item.name, item.label, item.title, item.service_type, item.serviceType, item.moduleService,
    item.transport_type, item.transportType, item.route, item.path, item.id]
    .some((v) => HIDDEN.test(String(v ?? '')));

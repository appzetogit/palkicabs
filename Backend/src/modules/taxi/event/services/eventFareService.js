/**
 * Event booking fare. Pure functions - no database.
 *
 * One vehicle, one trip:
 *   way there   = slab price for the one-way distance
 *   way back    = the same again (returnPercent of it; 100 = same)
 *   extra days  = (days - 1) x extraDayCharge
 *   overtime    = hours beyond what the days include x extraHourCharge
 *   unit total  = there + back + extra days + overtime
 * Booking total = sum of (unit total x quantity) over the vehicle categories.
 */

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Price of one way for a distance: the slab it falls in, else the last slab + extra km. */
export const oneWayPrice = (slabs, distanceKm, extraPerKm = 0) => {
  const sorted = [...(slabs || [])].map((s) => ({ from: num(s.fromKm), to: num(s.toKm), price: num(s.price) })).sort((a, b) => a.from - b.from);
  if (sorted.length === 0) return null;
  const d = Math.max(0, num(distanceKm));
  if (d <= sorted[0].to) return sorted[0].price;
  const hit = sorted.find((s) => d > s.from && d <= s.to) || sorted.find((s) => d >= s.from && d <= s.to);
  if (hit) return hit.price;
  const last = sorted[sorted.length - 1];
  return round2(last.price + Math.ceil(d - last.to) * num(extraPerKm));
};

/** Days and overtime for a booking window. Days = 24 h blocks (8 h and 30 h are 1 and 2 days). */
export const timeUsage = ({ startAt, endAt, includedHours, extraDayIncludedHours }) => {
  const durationHours = Math.max(0, (new Date(endAt) - new Date(startAt)) / 3600000);
  const days = Math.max(1, Math.ceil(durationHours / 24));
  const allowed = num(includedHours) + (days - 1) * num(extraDayIncludedHours);
  const overtimeHours = Math.ceil(Math.max(0, durationHours - allowed) - 1e-9) || 0;
  return { durationHours: round2(durationHours), days, allowedHours: allowed, overtimeHours };
};

/** Price of ONE vehicle of a category for the whole trip. Returns null if the category has no price here. */
export const priceOneVehicle = ({ pricing, distanceKm, startAt, endAt }) => {
  const way = oneWayPrice(pricing.slabs, distanceKm, pricing.extraPerKm);
  if (way === null) return null;
  const back = round2((way * num(pricing.returnPercent, 100)) / 100);
  const t = timeUsage({ startAt, endAt, includedHours: pricing.includedHours, extraDayIncludedHours: pricing.extraDayIncludedHours });
  const extraDayAmount = round2((t.days - 1) * num(pricing.extraDayCharge));
  const overtimeAmount = round2(t.overtimeHours * num(pricing.extraHourCharge));
  return {
    oneWayPrice: round2(way),
    returnPrice: back,
    extraDayAmount,
    overtimeAmount,
    unitTotal: round2(way + back + extraDayAmount + overtimeAmount),
    days: t.days,
    durationHours: t.durationHours,
    overtimeHours: t.overtimeHours,
  };
};

/**
 * What the REAL trip time costs on top of what was already charged for the booked window.
 * rules = { includedHours, extraDayIncludedHours, extraDayCharge, extraHourCharge }; booked = { extraDayAmount, overtimeAmount }.
 */
export const realTimeExtra = ({ rules, booked, startedAt, endedAt }) => {
  const hours = Math.max(0, (new Date(endedAt) - new Date(startedAt)) / 3600000);
  const t = timeUsage({ startAt: startedAt, endAt: endedAt, includedHours: rules.includedHours, extraDayIncludedHours: rules.extraDayIncludedHours });
  const actual = round2((t.days - 1) * num(rules.extraDayCharge) + t.overtimeHours * num(rules.extraHourCharge));
  const already = round2(num(booked.extraDayAmount) + num(booked.overtimeAmount));
  return { actualHours: round2(hours), days: t.days, allowedHours: t.allowedHours, overtimeHours: t.overtimeHours, timeCharge: actual, alreadyCharged: already, extra: Math.max(0, round2(actual - already)) };
};

/** Whole booking. `lines` = [{ categoryId, categoryName, quantity, pricing }]. */
export const priceBooking = ({ lines, distanceKm, startAt, endAt, advancePercent }) => {
  const items = [];
  let tripTotal = 0; let extraDays = 0; let overtime = 0;
  let days = 1; let durationHours = 0;
  for (const line of lines) {
    const unit = priceOneVehicle({ pricing: line.pricing, distanceKm, startAt, endAt });
    if (!unit) return { error: `No price is set for ${line.categoryName} in this zone` };
    const qty = Math.max(1, Math.floor(num(line.quantity, 1)));
    items.push({
      categoryId: line.categoryId, categoryName: line.categoryName, quantity: qty,
      oneWayPrice: unit.oneWayPrice, returnPrice: unit.returnPrice, extraDayAmount: unit.extraDayAmount, overtimeAmount: unit.overtimeAmount,
      unitTotal: unit.unitTotal, lineTotal: round2(unit.unitTotal * qty), commissionPercent: num(line.pricing.commissionPercent),
      includedHours: num(line.pricing.includedHours, 10), extraDayIncludedHours: num(line.pricing.extraDayIncludedHours, 10),
      extraDayCharge: num(line.pricing.extraDayCharge), extraHourCharge: num(line.pricing.extraHourCharge),
    });
    tripTotal += (unit.oneWayPrice + unit.returnPrice) * qty;
    extraDays += unit.extraDayAmount * qty;
    overtime += unit.overtimeAmount * qty;
    days = unit.days; durationHours = unit.durationHours;
  }
  const total = round2(items.reduce((n, i) => n + i.lineTotal, 0));
  const advance = round2((total * Math.max(0, Math.min(100, num(advancePercent)))) / 100);
  return {
    items, days, durationHours,
    pricing: { tripTotal: round2(tripTotal), extraDays: round2(extraDays), overtime: round2(overtime), adjustments: 0, total, advancePercent: num(advancePercent), advanceAmount: advance, balanceAmount: round2(total - advance) },
  };
};

/** Split of what one vehicle earns: driver-owned vehicles pay PALKI a commission; admin vehicles pay all to PALKI. */
export const splitVehicleAmount = ({ amount, ownerType, commissionPercent }) => {
  if (ownerType !== 'driver') return { driverShare: 0, adminShare: round2(amount) };
  const adminShare = round2((amount * num(commissionPercent)) / 100);
  return { driverShare: round2(amount - adminShare), adminShare };
};

/** Haversine km between two points - the fallback when no road route is available. */
export const straightLineKm = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

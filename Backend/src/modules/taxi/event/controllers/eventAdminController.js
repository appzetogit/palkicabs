import mongoose from 'mongoose';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { Zone } from '../../driver/models/Zone.js';
import { Driver } from '../../driver/models/Driver.js';
import { User } from '../../user/models/User.js';
import {
  EventBooking, EventPricing, EventType, EventVehicle, EventVehicleCategory, EventWallet, EventWithdrawal,
} from '../models/eventModels.js';
import {
  addAdjustment, assignVehicles, cancelBooking, categoryAvailability, completeBooking, freeVehiclesFor,
  getSettings, rejectBooking, settleWithdrawal, updateSettings,
} from '../services/eventService.js';

const ok = (res, data, message) => res.json({ success: true, data, message });
const isId = (v) => mongoose.isValidObjectId(v);
const clean = (v) => String(v ?? '').trim();
const escape = (v) => clean(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dup = (e, what) => (e?.code === 11000 ? new ApiError(409, `${what} already exists`) : e);

// ---- generic catalog CRUD (event types, vehicle categories) -----------------------------------
const catalog = (Model, label, fields) => ({
  list: asyncHandler(async (_req, res) => ok(res, await Model.find().sort({ order: 1, name: 1 }).lean())),
  create: asyncHandler(async (req, res) => {
    const doc = {}; for (const f of fields) if (req.body[f] !== undefined) doc[f] = req.body[f];
    try { ok(res, await Model.create(doc), `${label} created`); } catch (e) { throw dup(e, label); }
  }),
  update: asyncHandler(async (req, res) => {
    const set = {}; for (const f of fields) if (req.body[f] !== undefined) set[f] = req.body[f];
    try {
      const doc = await Model.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after', runValidators: true });
      if (!doc) throw new ApiError(404, `${label} not found`);
      ok(res, doc, `${label} updated`);
    } catch (e) { throw dup(e, label); }
  }),
});

export const eventTypes = catalog(EventType, 'Event type', ['name', 'description', 'image', 'advancePercent', 'order', 'active']);
export const eventCategories = catalog(EventVehicleCategory, 'Vehicle category', ['name', 'seats', 'description', 'image', 'order', 'active']);

export const deleteEventType = asyncHandler(async (req, res) => {
  if (await EventBooking.exists({ eventTypeId: req.params.id })) throw new ApiError(409, 'Bookings use this event type - deactivate it instead');
  await EventType.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});
export const deleteEventCategory = asyncHandler(async (req, res) => {
  if (await EventVehicle.exists({ categoryId: req.params.id }) || await EventPricing.exists({ categoryId: req.params.id })) {
    throw new ApiError(409, 'Vehicles or prices use this category - deactivate it instead');
  }
  await EventVehicleCategory.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

// ---- zones (for the pickers) -----------------------------------------------------------------------
export const listZones = asyncHandler(async (_req, res) => ok(res, await Zone.find({ active: true }).select('name').sort({ name: 1 }).lean()));

// ---- pricing -----------------------------------------------------------------------------------------------
const cleanSlabs = (slabs) => {
  const list = (Array.isArray(slabs) ? slabs : []).map((s) => ({ fromKm: Number(s.fromKm), toKm: Number(s.toKm), price: Number(s.price) }));
  for (const s of list) if (![s.fromKm, s.toKm, s.price].every((n) => Number.isFinite(n) && n >= 0) || s.toKm <= s.fromKm) throw new ApiError(400, 'Each slab needs from < to km and a price');
  list.sort((a, b) => a.fromKm - b.fromKm);
  for (let i = 1; i < list.length; i += 1) if (list[i].fromKm < list[i - 1].toKm) throw new ApiError(400, 'Slabs must not overlap');
  return list;
};

export const listPricing = asyncHandler(async (req, res) => {
  const filter = isId(req.query.zoneId) ? { zoneId: req.query.zoneId } : {};
  ok(res, await EventPricing.find(filter).populate('categoryId', 'name seats').populate('zoneId', 'name').sort({ zoneId: 1 }).lean());
});

export const savePricing = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!isId(b.zoneId) || !isId(b.categoryId)) throw new ApiError(400, 'Zone and vehicle category are required');
  const slabs = cleanSlabs(b.slabs);
  if (slabs.length === 0) throw new ApiError(400, 'Add at least one distance slab');
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d);
  const doc = await EventPricing.findOneAndUpdate(
    { zoneId: b.zoneId, categoryId: b.categoryId },
    { $set: {
      slabs, extraPerKm: num(b.extraPerKm, 0), returnPercent: num(b.returnPercent, 100), includedHours: num(b.includedHours, 10),
      extraDayCharge: num(b.extraDayCharge, 0), extraDayIncludedHours: num(b.extraDayIncludedHours, 10), extraHourCharge: num(b.extraHourCharge, 0),
      commissionPercent: Math.min(100, Math.max(0, num(b.commissionPercent, 15))), active: b.active !== false,
    } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  );
  ok(res, doc, 'Pricing saved');
});

export const deletePricing = asyncHandler(async (req, res) => {
  await EventPricing.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

// ---- vehicles --------------------------------------------------------------------------------------------------
export const listVehicles = asyncHandler(async (req, res) => {
  const q = req.query; const f = {};
  if (isId(q.zoneId)) f.zoneId = q.zoneId;
  if (isId(q.categoryId)) f.categoryId = q.categoryId;
  if (['pending', 'approved', 'rejected', 'inactive'].includes(q.status)) f.status = q.status;
  if (['admin', 'driver'].includes(q.ownerType)) f.ownerType = q.ownerType;
  if (clean(q.q)) { const rx = new RegExp(escape(q.q), 'i'); f.$or = [{ name: rx }, { vehicleNumber: rx }, { driverName: rx }, { driverPhone: rx }]; }
  const rows = await EventVehicle.find(f).populate('categoryId', 'name').populate('zoneId', 'name').populate('driverId', 'name phone').sort({ createdAt: -1 }).limit(500).lean();
  ok(res, rows);
});

export const createAdminVehicle = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!isId(b.zoneId) || !isId(b.categoryId) || !clean(b.name) || !clean(b.vehicleNumber)) throw new ApiError(400, 'Zone, category, name and vehicle number are required');
  if (!clean(b.driverName) || !clean(b.driverPhone)) throw new ApiError(400, "The vehicle's driver name and phone are required");
  try {
    const v = await EventVehicle.create({
      ownerType: 'admin', zoneId: b.zoneId, categoryId: b.categoryId, name: clean(b.name), vehicleNumber: clean(b.vehicleNumber).replace(/\s+/g, ''),
      color: clean(b.color), seats: Number(b.seats) || 4, images: Array.isArray(b.images) ? b.images.filter(Boolean) : [],
      driverName: clean(b.driverName), driverPhone: clean(b.driverPhone), status: 'approved', approvedAt: new Date(),
    });
    ok(res, v, 'Vehicle added');
  } catch (e) { throw dup(e, 'A vehicle with this number'); }
});

export const updateVehicle = asyncHandler(async (req, res) => {
  const b = req.body || {}; const set = {};
  for (const k of ['name', 'color', 'driverName', 'driverPhone']) if (b[k] !== undefined) set[k] = clean(b[k]);
  if (b.vehicleNumber !== undefined) set.vehicleNumber = clean(b.vehicleNumber).replace(/\s+/g, '');
  if (isId(b.zoneId)) set.zoneId = b.zoneId;
  if (isId(b.categoryId)) set.categoryId = b.categoryId;
  if (b.seats !== undefined) set.seats = Number(b.seats) || 4;
  if (Array.isArray(b.images)) set.images = b.images.filter(Boolean);
  if (['approved', 'inactive'].includes(b.status)) set.status = b.status;
  try {
    const v = await EventVehicle.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after', runValidators: true });
    if (!v) throw new ApiError(404, 'Vehicle not found');
    ok(res, v, 'Vehicle updated');
  } catch (e) { throw dup(e, 'A vehicle with this number'); }
});

export const approveVehicle = asyncHandler(async (req, res) => {
  const v = await EventVehicle.findByIdAndUpdate(req.params.id, { $set: { status: 'approved', rejectionReason: '', approvedAt: new Date() } }, { returnDocument: 'after' });
  if (!v) throw new ApiError(404, 'Vehicle not found');
  ok(res, v, 'Vehicle approved');
});

export const rejectVehicle = asyncHandler(async (req, res) => {
  const v = await EventVehicle.findByIdAndUpdate(req.params.id, { $set: { status: 'rejected', rejectionReason: clean(req.body?.reason) } }, { returnDocument: 'after' });
  if (!v) throw new ApiError(404, 'Vehicle not found');
  ok(res, v, 'Vehicle rejected');
});

export const deleteVehicle = asyncHandler(async (req, res) => {
  if (await EventBooking.exists({ 'assignments.vehicleId': req.params.id, status: { $in: ['assigned', 'confirmed', 'ongoing'] } })) {
    throw new ApiError(409, 'This vehicle is assigned to a live booking');
  }
  await EventVehicle.findByIdAndDelete(req.params.id);
  ok(res, null, 'Deleted');
});

// ---- inventory: how many of each category, booked and left, for a zone and dates -------------------------------
export const inventory = asyncHandler(async (req, res) => {
  if (!isId(req.query.zoneId)) throw new ApiError(400, 'Choose a zone');
  const from = new Date(req.query.from || Date.now()); const to = new Date(req.query.to || from.getTime() + 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new ApiError(400, 'Dates are not valid');
  ok(res, await categoryAvailability({ zoneId: req.query.zoneId, startAt: from, endAt: to }));
});

// ---- bookings -------------------------------------------------------------------------------------------------------------
export const listBookings = asyncHandler(async (req, res) => {
  const q = req.query; const f = {};
  if (q.status && q.status !== 'all') f.status = q.status;
  if (isId(q.zoneId)) f.zoneId = q.zoneId;
  if (clean(q.q)) {
    const rx = new RegExp(escape(q.q), 'i');
    const users = await User.find({ $or: [{ name: rx }, { phone: rx }] }).select('_id').limit(100).lean();
    f.$or = [{ code: rx }, { eventTitle: rx }, { contactName: rx }, { contactPhone: rx }, { userId: { $in: users.map((u) => u._id) } }];
  }
  const page = Math.max(1, Number(q.page) || 1); const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const [rows, total, counts] = await Promise.all([
    EventBooking.find(f).populate('userId', 'name phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    EventBooking.countDocuments(f),
    EventBooking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  ok(res, { results: rows, total, page, limit, counts: Object.fromEntries(counts.map((c) => [c._id, c.count])) });
});

export const getBooking = asyncHandler(async (req, res) => {
  const b = await EventBooking.findById(req.params.id).populate('userId', 'name phone email').lean();
  if (!b) throw new ApiError(404, 'Booking not found');
  // per ordered category: what is left, and the vehicles that could be assigned
  const doc = await EventBooking.findById(b._id);
  const availability = await categoryAvailability({ zoneId: b.zoneId, startAt: b.startAt, endAt: b.endAt, excludeBookingId: b._id });
  const candidates = {};
  for (const item of b.items) {
    const free = await freeVehiclesFor(doc, item.categoryId);
    candidates[String(item.categoryId)] = free.map((v) => ({ _id: v._id, name: v.name, vehicleNumber: v.vehicleNumber, ownerType: v.ownerType, driverName: v.driverName, driverPhone: v.driverPhone, busy: v.busy, driverId: v.driverId }));
  }
  const driverIds = [...new Set(Object.values(candidates).flat().map((v) => String(v.driverId || '')).filter(Boolean))];
  const drivers = await Driver.find({ _id: { $in: driverIds } }).select('name phone').lean();
  const nameBy = Object.fromEntries(drivers.map((d) => [String(d._id), d]));
  for (const list of Object.values(candidates)) for (const v of list) if (v.driverId) { v.driverName = nameBy[String(v.driverId)]?.name || ''; v.driverPhone = nameBy[String(v.driverId)]?.phone || ''; }
  ok(res, { ...b, availability, candidates });
});

export const assign = asyncHandler(async (req, res) => ok(res, await assignVehicles(req.params.id, req.body?.vehicleIds), 'Vehicles assigned'));
export const reject = asyncHandler(async (req, res) => ok(res, await rejectBooking(req.params.id, req.body?.reason), 'Request rejected'));
export const cancel = asyncHandler(async (req, res) => ok(res, await cancelBooking(req.params.id, { by: 'admin', reason: req.body?.reason }), 'Booking cancelled'));
export const adjust = asyncHandler(async (req, res) => ok(res, await addAdjustment(req.params.id, req.body || {}), 'Charge added'));
export const complete = asyncHandler(async (req, res) => ok(res, await completeBooking(req.params.id), 'Booking completed'));

export const stats = asyncHandler(async (_req, res) => {
  const [byStatus, revenue, pendingVehicles, pendingWithdrawals] = await Promise.all([
    EventBooking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    EventBooking.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$pricing.total' } } }]),
    EventVehicle.countDocuments({ status: 'pending' }),
    EventWithdrawal.countDocuments({ status: 'pending' }),
  ]);
  ok(res, { byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])), completedRevenue: Math.round(revenue[0]?.total || 0), pendingVehicles, pendingWithdrawals });
});

// ---- withdrawals ---------------------------------------------------------------------------------------------------------------
export const listWithdrawals = asyncHandler(async (req, res) => {
  const f = ['pending', 'paid', 'rejected'].includes(req.query.status) ? { status: req.query.status } : {};
  const rows = await EventWithdrawal.find(f).populate('driverId', 'name phone bankDetails').sort({ createdAt: -1 }).limit(300).lean();
  const wallets = await EventWallet.find({ driverId: { $in: rows.map((r) => r.driverId?._id).filter(Boolean) } }).lean();
  const wBy = Object.fromEntries(wallets.map((w) => [String(w.driverId), w]));
  ok(res, rows.map((r) => ({ ...r, wallet: wBy[String(r.driverId?._id)] || null })));
});
export const payWithdrawal = asyncHandler(async (req, res) => ok(res, await settleWithdrawal(req.params.id, { pay: true, reference: req.body?.reference, note: req.body?.note }), 'Marked paid'));
export const rejectWithdrawal = asyncHandler(async (req, res) => ok(res, await settleWithdrawal(req.params.id, { pay: false, note: req.body?.note }), 'Withdrawal rejected, balance returned'));

// ---- settings -------------------------------------------------------------------------------------------------------------------
export const readSettings = asyncHandler(async (_req, res) => ok(res, await getSettings()));
export const writeSettings = asyncHandler(async (req, res) => ok(res, await updateSettings(req.body), 'Settings saved'));

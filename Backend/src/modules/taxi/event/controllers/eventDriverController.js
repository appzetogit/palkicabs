import mongoose from 'mongoose';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { Zone } from '../../driver/models/Zone.js';
import { Driver } from '../../driver/models/Driver.js';
import { EventBooking, EventVehicle, EventVehicleCategory, EventWallet, EventWalletTransaction, EventWithdrawal } from '../models/eventModels.js';
import { answerAssignment, endTrip, getSettings, requestWithdrawal, serializeForDriver, startTrip } from '../services/eventService.js';

const ok = (res, data, message) => res.json({ success: true, data, message });
const me = (req) => String(req.auth?.sub || '');
const isId = (v) => mongoose.isValidObjectId(v);
const clean = (v) => String(v ?? '').trim();

export const meta = asyncHandler(async (_req, res) => {
  const [categories, zones, settings] = await Promise.all([
    EventVehicleCategory.find({ active: true }).select('name seats image').sort({ order: 1, name: 1 }).lean(),
    Zone.find({ active: true }).select('name').sort({ name: 1 }).lean(),
    getSettings(),
  ]);
  ok(res, { categories, zones, minWithdrawal: settings.minWithdrawal });
});

// ---- my event vehicles (every add or edit goes back to the admin for approval) -------------------------
export const listVehicles = asyncHandler(async (req, res) =>
  ok(res, await EventVehicle.find({ driverId: me(req) }).populate('categoryId', 'name').populate('zoneId', 'name').sort({ createdAt: -1 }).lean()));

const vehicleFields = async (b, { creating }) => {
  if (creating && (!isId(b.zoneId) || !isId(b.categoryId) || !clean(b.name) || !clean(b.vehicleNumber))) throw new ApiError(400, 'Zone, category, name and vehicle number are required');
  const set = {};
  if (b.name !== undefined) set.name = clean(b.name);
  if (b.vehicleNumber !== undefined) set.vehicleNumber = clean(b.vehicleNumber).replace(/\s+/g, '');
  if (b.color !== undefined) set.color = clean(b.color);
  if (b.seats !== undefined) set.seats = Number(b.seats) || 4;
  if (Array.isArray(b.images)) set.images = b.images.filter(Boolean).slice(0, 8);
  if (Array.isArray(b.documents)) set.documents = b.documents.filter((d) => d?.url).slice(0, 8).map((d) => ({ label: clean(d.label), url: clean(d.url) }));
  if (b.zoneId !== undefined) {
    if (!isId(b.zoneId) || !(await Zone.exists({ _id: b.zoneId, active: true }))) throw new ApiError(400, 'Choose a valid zone');
    set.zoneId = b.zoneId;
  }
  if (b.categoryId !== undefined) {
    if (!isId(b.categoryId) || !(await EventVehicleCategory.exists({ _id: b.categoryId, active: true }))) throw new ApiError(400, 'Choose a valid vehicle category');
    set.categoryId = b.categoryId;
  }
  return set;
};
const dupMessage = (e) => (e?.code === 11000 ? new ApiError(409, 'A vehicle with this number already exists') : e);

export const createVehicle = asyncHandler(async (req, res) => {
  const set = await vehicleFields(req.body || {}, { creating: true });
  const driver = await Driver.findById(me(req)).select('name phone').lean();
  try {
    ok(res, await EventVehicle.create({ ...set, ownerType: 'driver', driverId: me(req), driverName: driver?.name || '', driverPhone: driver?.phone || '', status: 'pending' }), 'Vehicle submitted for approval');
  } catch (e) { throw dupMessage(e); }
});

export const updateVehicle = asyncHandler(async (req, res) => {
  const set = await vehicleFields(req.body || {}, { creating: false });
  if (await EventBooking.exists({ 'assignments.vehicleId': req.params.id, status: { $in: ['assigned', 'confirmed', 'ongoing'] } })) throw new ApiError(409, 'This vehicle is on a live booking');
  try {
    const v = await EventVehicle.findOneAndUpdate({ _id: req.params.id, driverId: me(req) }, { $set: { ...set, status: 'pending', rejectionReason: '' } }, { returnDocument: 'after' });
    if (!v) throw new ApiError(404, 'Vehicle not found');
    ok(res, v, 'Updated. The admin will approve it again.');
  } catch (e) { throw dupMessage(e); }
});

export const deleteVehicle = asyncHandler(async (req, res) => {
  if (await EventBooking.exists({ 'assignments.vehicleId': req.params.id, status: { $in: ['assigned', 'confirmed', 'ongoing'] } })) throw new ApiError(409, 'This vehicle is on a live booking');
  const v = await EventVehicle.findOneAndDelete({ _id: req.params.id, driverId: me(req) });
  if (!v) throw new ApiError(404, 'Vehicle not found');
  ok(res, null, 'Vehicle removed');
});

// ---- my event jobs ----------------------------------------------------------------------------------------
export const listAssignments = asyncHandler(async (req, res) => {
  const rows = await EventBooking.find({ 'assignments.driverId': me(req), status: { $in: ['assigned', 'confirmed', 'ongoing', 'completed'] } }).sort({ startAt: -1 }).limit(100);
  ok(res, rows.flatMap((b) => serializeForDriver(b, me(req))));
});

export const respond = asyncHandler(async (req, res) => {
  const accept = req.body?.accept === true;
  await answerAssignment(me(req), req.params.assignmentId, accept);
  ok(res, { accepted: accept }, accept ? 'Accepted' : 'Declined - the admin will assign another vehicle');
});

export const trip = (kind) => asyncHandler(async (req, res) => {
  const run = kind === 'start' ? startTrip : endTrip;
  const b = await run({ assignmentId: req.params.assignmentId, driverId: me(req), by: 'driver' });
  ok(res, serializeForDriver(b, me(req)).find((a) => String(a.assignmentId) === String(req.params.assignmentId)), kind === 'start' ? 'Trip started' : 'Trip ended');
});

// ---- earnings and withdrawals ----------------------------------------------------------------------------------
export const earnings = asyncHandler(async (req, res) => {
  const [wallet, tx, withdrawals] = await Promise.all([
    EventWallet.findOne({ driverId: me(req) }).lean(),
    EventWalletTransaction.find({ driverId: me(req) }).sort({ createdAt: -1 }).limit(50).lean(),
    EventWithdrawal.find({ driverId: me(req) }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);
  ok(res, { balance: wallet?.balance || 0, totalEarned: wallet?.totalEarned || 0, totalWithdrawn: wallet?.totalWithdrawn || 0, transactions: tx, withdrawals });
});

export const withdraw = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(me(req)).select('bankDetails').lean();
  ok(res, await requestWithdrawal(me(req), req.body?.amount, driver?.bankDetails || {}), 'Withdrawal requested');
});

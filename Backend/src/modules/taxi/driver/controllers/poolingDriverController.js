import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { boardPassenger, completeTrip, driverEarnings, listDriverTrips, startTrip } from '../../services/poolingTripService.js';

const ok = (res, data, message) => res.json({ success: true, data, message });

const vehicleIdOf = (req) => {
  if (String(req.auth?.role || '').toLowerCase() !== 'pooling_driver') throw new ApiError(403, 'Pooling driver access is required');
  return String(req.auth.sub);
};

const tripParams = (body = {}) => {
  const routeId = String(body.routeId || '').trim();
  const scheduleId = String(body.scheduleId || '').trim();
  const travelDate = String(body.travelDate || '').trim();
  if (!routeId || !scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) throw new ApiError(400, 'routeId, scheduleId and travelDate (YYYY-MM-DD) are required');
  return { routeId, scheduleId, travelDate };
};

export const getPoolingDriverTrips = asyncHandler(async (req, res) => ok(res, await listDriverTrips({ vehicleId: vehicleIdOf(req) }), 'Trips fetched'));

export const startPoolingDriverTrip = asyncHandler(async (req, res) =>
  ok(res, await startTrip({ vehicleId: vehicleIdOf(req), ...tripParams(req.body) }), 'Trip started'));

export const boardPoolingPassenger = asyncHandler(async (req, res) =>
  ok(res, await boardPassenger({ vehicleId: vehicleIdOf(req), bookingId: req.params.id, otp: req.body?.otp }), 'Rider boarded'));

export const completePoolingDriverTrip = asyncHandler(async (req, res) =>
  ok(res, await completeTrip({ vehicleId: vehicleIdOf(req), ...tripParams(req.body) }), 'Trip completed and settled'));

export const getPoolingDriverEarnings = asyncHandler(async (req, res) => ok(res, await driverEarnings({ vehicleId: vehicleIdOf(req) }), 'Earnings fetched'));

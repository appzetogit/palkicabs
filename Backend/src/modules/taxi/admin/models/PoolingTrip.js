import mongoose from 'mongoose';

/**
 * One run of a pooling vehicle: a route at a schedule on a date.
 * The driver starts it and completes it; completing it settles every booking on it.
 */
const poolingTripSchema = new mongoose.Schema(
  {
    route: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiPoolingRoute', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiPoolingVehicle', required: true },
    scheduleId: { type: String, required: true },
    travelDate: { type: String, required: true }, // YYYY-MM-DD (IST)
    status: { type: String, enum: ['scheduled', 'started', 'completed', 'cancelled'], default: 'scheduled' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    settlement: {
      riders: { type: Number, default: 0 },
      noShows: { type: Number, default: 0 },
      collected: { type: Number, default: 0 },
      refunded: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      platformCommission: { type: Number, default: 0 },
      ownerShare: { type: Number, default: 0 },
      driverEarning: { type: Number, default: 0 },
      noShowForfeit: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

poolingTripSchema.index({ route: 1, vehicle: 1, scheduleId: 1, travelDate: 1 }, { unique: true });

export const PoolingTrip = mongoose.models.TaxiPoolingTrip || mongoose.model('TaxiPoolingTrip', poolingTripSchema);

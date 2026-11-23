/**
 * Event booking: hiring vehicles for an event (a wedding, a corporate trip...).
 * Everything here is its own set of collections (taxievent*) - nothing is shared
 * with rides, parcels, pooling or the ride wallet.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

// ---- what an event can be ------------------------------------------------------
const eventTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, default: '', trim: true },
    // % of the total the customer must pay online to confirm. null = use the global setting.
    advancePercent: { type: Number, default: null, min: 0, max: 100 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
eventTypeSchema.index({ name: 1 }, { unique: true });
export const EventType = model('TaxiEventType', eventTypeSchema);

// ---- SUV, Sedan, Tempo Traveller ... ---------------------------------------------
const eventVehicleCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    seats: { type: Number, default: 4, min: 1 },
    description: { type: String, default: '', trim: true },
    image: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
eventVehicleCategorySchema.index({ name: 1 }, { unique: true });
export const EventVehicleCategory = model('TaxiEventVehicleCategory', eventVehicleCategorySchema);

// ---- price of one vehicle category in one zone ------------------------------------
const slabSchema = new Schema(
  {
    fromKm: { type: Number, required: true, min: 0 },
    toKm: { type: Number, required: true, min: 0 },
    // price of ONE way for that distance, per vehicle
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);
const eventPricingSchema = new Schema(
  {
    zoneId: { type: ObjectId, ref: 'TaxiZone', required: true },
    categoryId: { type: ObjectId, ref: 'TaxiEventVehicleCategory', required: true },
    slabs: { type: [slabSchema], default: [] },
    // beyond the last slab: price of the last slab + this per extra km
    extraPerKm: { type: Number, default: 0, min: 0 },
    // the return trip costs the same as the way there; this is a % of it (100 = same)
    returnPercent: { type: Number, default: 100, min: 0, max: 200 },
    // time: hours of use included on day 1, hours included on each extra day, extra hour price
    includedHours: { type: Number, default: 10, min: 0 },
    extraDayCharge: { type: Number, default: 0, min: 0 },
    extraDayIncludedHours: { type: Number, default: 10, min: 0 },
    extraHourCharge: { type: Number, default: 0, min: 0 },
    // % PALKI keeps when the vehicle belongs to a driver (admin vehicles: PALKI keeps all)
    commissionPercent: { type: Number, default: 15, min: 0, max: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
eventPricingSchema.index({ zoneId: 1, categoryId: 1 }, { unique: true });
export const EventPricing = model('TaxiEventPricing', eventPricingSchema);

// ---- a vehicle that can be hired for events ----------------------------------------
const eventVehicleSchema = new Schema(
  {
    ownerType: { type: String, enum: ['admin', 'driver'], required: true },
    driverId: { type: ObjectId, ref: 'TaxiDriver', default: null }, // set for driver-owned vehicles
    // admin-owned vehicles carry their own driver's details
    driverName: { type: String, default: '', trim: true },
    driverPhone: { type: String, default: '', trim: true },
    zoneId: { type: ObjectId, ref: 'TaxiZone', required: true },
    categoryId: { type: ObjectId, ref: 'TaxiEventVehicleCategory', required: true },
    name: { type: String, required: true, trim: true }, // e.g. Toyota Innova Crysta
    vehicleNumber: { type: String, required: true, trim: true, uppercase: true },
    color: { type: String, default: '', trim: true },
    seats: { type: Number, default: 4, min: 1 },
    images: { type: [String], default: [] },
    documents: { type: [{ _id: false, label: String, url: String }], default: [] },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending' },
    rejectionReason: { type: String, default: '', trim: true },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
eventVehicleSchema.index({ vehicleNumber: 1 }, { unique: true });
eventVehicleSchema.index({ zoneId: 1, categoryId: 1, status: 1 });
eventVehicleSchema.index({ driverId: 1 });
export const EventVehicle = model('TaxiEventVehicle', eventVehicleSchema);

// ---- the booking ---------------------------------------------------------------------
const pointSchema = new Schema(
  {
    address: { type: String, default: '', trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const itemSchema = new Schema(
  {
    categoryId: { type: ObjectId, ref: 'TaxiEventVehicleCategory', required: true },
    categoryName: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    oneWayPrice: { type: Number, default: 0 },
    returnPrice: { type: Number, default: 0 },
    extraDayAmount: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },
    unitTotal: { type: Number, default: 0 }, // one vehicle, the whole trip
    lineTotal: { type: Number, default: 0 },
    commissionPercent: { type: Number, default: 0 },
  },
  { _id: false },
);

const assignmentSchema = new Schema(
  {
    vehicleId: { type: ObjectId, ref: 'TaxiEventVehicle', required: true },
    categoryId: { type: ObjectId, ref: 'TaxiEventVehicleCategory' },
    categoryName: { type: String, default: '' },
    ownerType: { type: String, enum: ['admin', 'driver'] },
    driverId: { type: ObjectId, ref: 'TaxiDriver', default: null },
    driverName: { type: String, default: '' },
    driverPhone: { type: String, default: '' },
    vehicleName: { type: String, default: '' },
    vehicleNumber: { type: String, default: '' },
    amount: { type: Number, default: 0 }, // what this vehicle earns for the trip, before commission
    driverShare: { type: Number, default: 0 },
    adminShare: { type: Number, default: 0 },
    driverStatus: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    respondedAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },
  },
  { _id: true },
);

const paymentSchema = new Schema(
  {
    stage: { type: String, enum: ['advance', 'balance'], required: true },
    amount: { type: Number, required: true },
    provider: { type: String, default: 'razorpay' },
    orderId: { type: String, default: '' },
    paymentId: { type: String, default: '' },
    status: { type: String, enum: ['paid', 'refunded'], default: 'paid' },
    paidAt: { type: Date, default: Date.now },
    refundedAt: { type: Date, default: null },
    refundId: { type: String, default: '' },
  },
  { _id: false },
);

const eventBookingSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    userId: { type: ObjectId, ref: 'TaxiUser', required: true },
    eventTypeId: { type: ObjectId, ref: 'TaxiEventType', required: true },
    eventTypeName: { type: String, default: '' },
    eventTitle: { type: String, default: '', trim: true }, // "Sharma family wedding"
    notes: { type: String, default: '', trim: true },
    zoneId: { type: ObjectId, ref: 'TaxiZone', required: true },
    zoneName: { type: String, default: '' },
    pickup: { type: pointSchema, required: true },
    drop: { type: pointSchema, required: true },
    distanceKm: { type: Number, required: true }, // one way
    distanceSource: { type: String, default: 'route' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    durationHours: { type: Number, default: 0 },
    days: { type: Number, default: 1 },
    contactName: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },

    items: { type: [itemSchema], default: [] },
    pricing: {
      tripTotal: { type: Number, default: 0 }, // way there + way back
      extraDays: { type: Number, default: 0 },
      overtime: { type: Number, default: 0 },
      adjustments: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      advancePercent: { type: Number, default: 0 },
      advanceAmount: { type: Number, default: 0 },
      balanceAmount: { type: Number, default: 0 },
    },
    adjustments: { type: [{ _id: false, label: String, amount: Number, at: { type: Date, default: Date.now } }], default: [] },

    status: {
      type: String,
      enum: ['requested', 'assigned', 'confirmed', 'ongoing', 'completed', 'cancelled', 'rejected'],
      default: 'requested',
      index: true,
    },
    assignments: { type: [assignmentSchema], default: [] },
    payments: { type: [paymentSchema], default: [] },
    adminNote: { type: String, default: '', trim: true },
    cancelReason: { type: String, default: '' },
    cancelledBy: { type: String, default: '' },
    refundAmount: { type: Number, default: 0 },
    assignedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
eventBookingSchema.index({ userId: 1, createdAt: -1 });
eventBookingSchema.index({ zoneId: 1, startAt: 1, endAt: 1 });
eventBookingSchema.index({ 'assignments.driverId': 1 });
export const EventBooking = model('TaxiEventBooking', eventBookingSchema);

// ---- settings (one document) -------------------------------------------------------
const eventSettingsSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    advancePercent: { type: Number, default: 30, min: 0, max: 100 },
    bufferHours: { type: Number, default: 2, min: 0 }, // a vehicle is busy this long before and after a booking
    minLeadHours: { type: Number, default: 24, min: 0 }, // earliest a booking can start from now
    freeCancelHours: { type: Number, default: 48, min: 0 }, // advance refunded in full up to this long before start
    lateCancelRefundPercent: { type: Number, default: 0, min: 0, max: 100 },
    minWithdrawal: { type: Number, default: 500, min: 0 },
  },
  { timestamps: true },
);
export const EventSettings = model('TaxiEventSettings', eventSettingsSchema);

// ---- driver earnings from event bookings (kept apart from the ride wallet) ---------------
const eventWalletSchema = new Schema(
  {
    driverId: { type: ObjectId, ref: 'TaxiDriver', required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const EventWallet = model('TaxiEventWallet', eventWalletSchema);

const eventWalletTxSchema = new Schema(
  {
    driverId: { type: ObjectId, ref: 'TaxiDriver', required: true, index: true },
    type: { type: String, enum: ['earning', 'withdrawal_hold', 'withdrawal_release', 'withdrawal_paid'], required: true },
    amount: { type: Number, required: true }, // + credit, - debit
    balanceAfter: { type: Number, default: 0 },
    bookingId: { type: ObjectId, ref: 'TaxiEventBooking', default: null },
    withdrawalId: { type: ObjectId, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);
export const EventWalletTransaction = model('TaxiEventWalletTransaction', eventWalletTxSchema);

const eventWithdrawalSchema = new Schema(
  {
    driverId: { type: ObjectId, ref: 'TaxiDriver', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
    bank: { type: Schema.Types.Mixed, default: {} },
    adminNote: { type: String, default: '' },
    reference: { type: String, default: '' },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export const EventWithdrawal = model('TaxiEventWithdrawal', eventWithdrawalSchema);

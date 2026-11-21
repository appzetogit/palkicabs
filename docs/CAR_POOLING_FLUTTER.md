# PALKI Car Pooling — Flutter implementation guide

Base URL: `https://palkicabs.com/api/v1`
All requests: `Authorization: Bearer <token>`, `Content-Type: application/json`.
Every response is `{ "success": true|false, "data": ..., "message": "..." }`. On error `success=false` and `message` is safe to show to the user.

There are two apps:

| App | Who | Token role |
|---|---|---|
| Rider app | books seats | `user` |
| Driver app (pooling driver) | runs the trip | `pooling_driver` (the token's subject is the *pooling vehicle* id — the vehicle **is** the driver account) |

---------------------------------------------------------------------

## 1. How the fare works (read this first)

A route has a **fare per seat** (e.g. ₹800) and a **length in km** (e.g. 100 km). A vehicle has a number of passenger seats (e.g. 4).

```
whole vehicle fare   F = farePerSeat x seatsInVehicle        = 800 x 4 = ₹3,200
cost of one km           = F / routeKm                        = ₹32 per km
```

Every stretch of road is paid for by the riders who are in the vehicle on that stretch, split in proportion to the **seats** they booked. A rider alone on a stretch pays all of it. Nobody ever pays more than "alone on my stretch".

### Worked examples (100 km route, 4 seats, ₹800 per seat, tax ignored)

| Situation | Who pays what |
|---|---|
| One rider, whole route, nobody else joins | rider pays **₹3,200** (the whole vehicle) |
| A rides 0–100 km. B joins at 60 km and rides to the end | km 0–60 (₹1,920) paid only by A. km 60–100 (₹1,280) shared: A ₹640 + B ₹640. **A = ₹2,560, B = ₹640** |
| A 0–100, B joins at 20, C joins at 50 (all to the end) | A ₹1,653.33, B ₹1,013.33, C ₹533.33 (total ₹3,200). Longer ride = more. |
| Four riders, one seat each, whole route | ₹800 each |
| Rider books 2 seats, another books 1, same stretch | 2/3 and 1/3 of the stretch |

### Money flow — **pay the maximum first, get the difference back**

1. At booking the rider pays the **maximum** for their stretch: `maxTotal` = (F × stretchKm / routeKm) + tax. This is what they would pay if nobody else joined.
2. When the trip is **completed** by the driver, the real share of every rider who boarded is calculated. The difference (`paid − final share`) is credited to the **rider's PALKI wallet** (`refundAmount`).
3. A rider who never boards (**no-show**) is not refunded.
4. Rider can cancel for free up to **2 hours before departure** (full refund to wallet). Later: no refund.

The rider must be shown this clearly (see `PoolingFareCard` copy in section 3).

### Driver / owner / PALKI split (settlement, on each rider's *final base share*)

```
platform commission = base x adminCommissionPercentage
owner share         = (base - platform commission) x ownerCommissionPercentage   (only if the vehicle has an owner)
driver earning      = base - platform commission - owner share
tax                 = base x serviceTaxPercentage        (collected on top, not part of earnings)
```
Driver earnings are credited to the pooling vehicle's earnings balance (`walletBalance`); the owner's share to the owner's wallet.

If a route has `routeDistanceKm = 0` it is a **flat** route: fare = `farePerSeat × seats`, no sharing, `distancePriced=false`.

---------------------------------------------------------------------

## 2. Data you will see

**Route** (`GET /users/pooling/search`, `GET /users/pooling/routes/:id`)
```json
{
  "_id": "…", "routeName": "Indore to Maheshwar (100 km sample)",
  "originLabel": "Indore", "destinationLabel": "Maheshwar",
  "routeDistanceKm": 100, "farePerSeat": 800, "maxSeatsPerBooking": 4,
  "maxAdvanceBookingHours": 168, "boardingBufferMinutes": 30,
  "pickupPoints": [{ "id": "m0", "name": "Indore Vijay Nagar", "kmFromStart": 0, "latitude": 22.75, "longitude": 75.89 }],
  "dropPoints":   [{ "id": "m100", "name": "Maheshwar Ghat", "kmFromStart": 100 }],
  "stops": [ /* all stops, with kmFromStart */ ],
  "schedules": [{ "id": "s1", "label": "Morning", "departureTime": "07:30", "arrivalTime": "10:30", "activeDays": ["mon","tue"], "status": "active" }],
  "assignedVehicleTypeIds": [ /* populated pooling vehicles, see below */ ],
  "pricing": { "distancePriced": true, "routeKm": 100, "farePerSeat": 800, "seatsInVehicle": 4, "fullVehicleFare": 3200 },
  "seatAvailability": { "<vehicleId>:<scheduleId>": ["0-2", "1-0"] },   // already booked seat ids (only when travelDate is sent)
  "tripStatus": { "<vehicleId>:<scheduleId>": "scheduled|started|completed" }
}
```

**Vehicle** (inside `assignedVehicleTypeIds[]`): `_id, name, vehicleNumber, vehicleModel, color, capacity, images[], driverName, driverPhone, serviceTaxPercentage, blueprint`.

**Seat layout** — `blueprint = { rows, cols, layout: [{ r, c, type: "seat" | "driver" | "empty" }] }`.
Draw a `rows x cols` grid. **Seat id = `"{r}-{c}"`** (e.g. `"1-2"`), and that exact string is what you send in `selectedSeats`. Seats whose id appears in `seatAvailability[...]` are booked.

**Stops** have `kmFromStart`. The rider chooses a pickup and a drop; drop must have a larger `kmFromStart` than pickup.

---------------------------------------------------------------------

## 3. Rider app

### Screens
1. **Search** — `from`, `to`, `date` → routes.
2. **Seat selection** — choose pickup, drop, seats; live fare card.
3. **Confirm & pay** — fare card + Razorpay.
4. **Booking detail** — OTP, current share, final fare, cancel.
5. My bookings list.

### APIs

**Search** `GET /users/pooling/search?from=Indore&to=Maheshwar` → `data: Route[]`
(both filters are combined with AND; either may be empty).

**Route + seat availability** `GET /users/pooling/routes/:id?travelDate=2026-11-25` → `data: Route` (see above).

**Fare quote** — call it every time seats / pickup / drop change (debounce ~250 ms).
`POST /users/pooling/quote`
```json
{ "routeId": "…", "vehicleId": "…", "scheduleId": "s1", "travelDate": "2026-11-25",
  "selectedSeats": ["0-2"], "seats": 1, "pickupStopId": "m20", "dropStopId": "m100" }
```
Response `data`:
```json
{
  "distancePriced": true, "routeKm": 100, "boardKm": 20, "dropKm": 100, "segmentKm": 80,
  "seats": 1, "seatsInVehicle": 4, "farePerSeat": 800, "fullVehicleFare": 3200,
  "taxPercentage": 5,
  "maxBaseFare": 2560, "maxTaxAmount": 128, "maxTotal": 2688,        // PAY NOW
  "currentBaseFare": 1066.67, "currentTaxAmount": 53.33, "currentTotal": 1120,   // share if the trip runs as booked right now
  "coRiders": 1, "floorTotal": 672,
  "departureAt": "2026-11-25T02:00:00.000Z", "freeCancelHours": 2,
  "vehicleName": "Dzire Pool", "routeName": "…"
}
```
Errors (HTTP 400/404/409) you must show: `Booking is closed for this departure`, `Bookings open N hours before departure`, `This vehicle does not run on the selected day`, `This trip has already started`, `Maximum N seats allowed per booking`, `Drop point must be after the pickup point on this route`, `Seat X is not available in this vehicle`.

#### What to show the rider (fare card)
- "Your ride: 20 → 100 km (80 of 100 km)"
- "Charge per seat (full route): ₹800" and "Whole vehicle (4 seats): ₹3,200"
- "**You pay now: ₹{maxTotal}**"
- Text: *"This is the most you can pay. If no other rider joins your stretch, you pay for the whole stretch yourself. When other riders join, the vehicle fare is divided between everyone by the distance they travel — the longer you ride, the more you pay. {coRiders} other rider(s) are already on your stretch, so you would pay about ₹{currentTotal} right now. After the trip, whatever you paid above your share is added back to your PALKI wallet."*
- "Free cancellation up to {freeCancelHours} hours before departure."

**Create payment order** `POST /users/pooling/bookings/order` — same body as the quote.
Response `data`: `{ keyId, orderId, amount (paise), currency, fare, baseFare, serviceTaxAmount, quote }`. Open Razorpay Checkout with `keyId`, `orderId`, `amount`.
The order amount is `maxTotal` — the server recomputes it, never trust the app's amount.

**Verify payment** `POST /users/pooling/bookings/verify`
```json
{ "razorpay_order_id": "…", "razorpay_payment_id": "…", "razorpay_signature": "…",
  "routeId": "…", "vehicleId": "…", "scheduleId": "s1", "travelDate": "2026-11-25",
  "selectedSeats": ["0-2"], "pickupStopId": "m20", "dropStopId": "m100" }
```
Send exactly the same route/vehicle/schedule/date/seats/stops as in the order. The server checks the Razorpay order matches (amount, rider, seats). `201` → booking created. `409` "…seat was just booked… Your payment is being refunded" → show it, go back to seat selection. Calling verify twice with the same payment returns the same booking (safe to retry on timeout).

**My bookings** `GET /users/pooling/bookings` · **One booking** `GET /users/pooling/bookings/:id`
```json
{
  "_id": "…", "bookingId": "POOLXXXX", "bookingStatus": "confirmed|boarded|completed|cancelled|no_show",
  "route": { … }, "vehicle": { … }, "travelDay": "2026-11-25", "departureTime": "07:30",
  "pickupLabel": "Mhow Naka", "dropLabel": "Maheshwar Ghat", "boardKm": 20, "dropKm": 100, "distancePriced": true,
  "seatsBooked": 1, "selectedSeats": ["0-2"],
  "paidAmount": 2688,                       // charged at booking (the maximum)
  "estimate": { "baseFare": 1066.67, "taxAmount": 53.33, "total": 1120, "refundIfNoChange": 1568, "coRiders": 1 },  // only while confirmed/boarded
  "finalFare": null, "finalBaseFare": null, "finalTaxAmount": null, "refundAmount": 0, "settled": false,   // filled after the trip
  "boardingOtp": "4821",                    // only while confirmed/boarded - show big, rider tells it to the driver
  "canCancel": true
}
```
Refresh the detail screen every ~30 s while the booking is `confirmed`/`boarded` so `estimate` follows other riders joining.

**Cancel** `PATCH /users/pooling/bookings/:id/cancel` → `{ bookingId, refundAmount, refundTo: "wallet" | "", freeCancelHours }`. Only `confirmed` bookings. Refund goes to the rider's wallet.

### Rider booking-detail screen
- Status chip, **boarding OTP** card, trip card (date, pickup, drop, your km, seats, vehicle, driver + call button).
- Payment card: "Paid at booking (maximum)". While live: "Your share right now (N other riders)" and "If the trip runs like this, ₹X comes back to your wallet". After settlement: "Your final share", tax, **Final fare**, "Returned to your wallet ₹refundAmount". No-show: "You did not board, so the payment is not refunded."
- Cancel button when `canCancel`.

---------------------------------------------------------------------

## 4. Pooling driver app

Login/onboarding endpoints already exist: `/drivers/pooling/onboarding/*` (send-otp, verify-otp, details, complete, upload-image) and the normal driver OTP login with role `pooling_driver`. A new vehicle is `pending` until admin approves; `/drivers/me` returns `approve`/`status`.

### Screens
1. **Trips** (upcoming + completed) with an **earnings** header.
2. **Trip detail**: riders list, Start trip, OTP boarding per rider, Complete trip.

### APIs (all require the `pooling_driver` token)

**Trips** `GET /drivers/pooling/trips`
```json
[{
  "key": "<routeId>|s1|2026-11-25", "routeId": "…", "routeName": "…", "origin": "Indore", "destination": "Maheshwar",
  "scheduleId": "s1", "scheduleLabel": "Morning", "departureTime": "07:30", "arrivalTime": "10:30",
  "travelDate": "2026-11-25", "status": "scheduled|started|completed",
  "seatsInVehicle": 4, "seatsBooked": 2, "canStart": true, "canComplete": false,
  "passengers": [{
    "bookingId": "…", "code": "POOL…", "name": "Asha", "phone": "98…", "seats": 1, "selectedSeats": ["0-2"],
    "pickup": "Indore Vijay Nagar", "drop": "Maheshwar Ghat", "boardKm": 0, "dropKm": 100,
    "status": "confirmed|boarded|completed|no_show|cancelled",
    "paid": 3360, "estimatedFare": 2688, "finalFare": null, "driverEarning": 2419.2
  }],
  "totals": { "collected": 4704, "estimatedDriverEarning": 3763.2, "settledDriverEarning": null }
}]
```
The rider's OTP is **not** returned here (the rider tells it to the driver).

**Start** `POST /drivers/pooling/trips/start` `{ "routeId", "scheduleId", "travelDate": "2026-11-25" }` — only on the travel day (or later), only if there is a confirmed booking. After this, new bookings for this trip are rejected ("This trip has already started").

**Board a rider** `POST /drivers/pooling/bookings/:bookingId/board` `{ "otp": "4821" }` — trip must be started. Errors: `Wrong OTP`, `Start the trip before boarding riders`.

**Complete** `POST /drivers/pooling/trips/complete` (same body as start). This **settles** everything:
- riders who boarded → `completed` with their final distance share; difference refunded to their wallet,
- riders who did not board → `no_show` (not refunded),
- driver earnings, owner share and PALKI commission are credited.
Response: `{ tripId, status: "completed", settlement: { riders, noShows, collected, refunded, tax, platformCommission, ownerShare, driverEarning, noShowForfeit } }`. Calling it twice returns 409.

**Earnings** `GET /drivers/pooling/earnings` → `{ walletBalance, totalEarnings, trips: [{ tripId, routeName, travelDate, completedAt, riders, collected, refunded, platformCommission, ownerShare, driverEarning, … }] }`. (Withdrawals are handled by the admin team for now.)

---------------------------------------------------------------------

## 5. State machines

Booking: `confirmed → boarded → completed`; `confirmed → no_show` (never boarded, set when the trip completes); `confirmed → cancelled` (rider cancel or admin).
Trip: `scheduled → started → completed`.

## 6. Rules the app should respect
- Booking window: closes `boardingBufferMinutes` before departure; opens `maxAdvanceBookingHours` before (0 = no limit).
- Max `maxSeatsPerBooking` seats per booking.
- A seat is locked for the whole trip once booked (even if the rider gets off early).
- The server is the source of truth for every amount; the app only displays what `quote` / booking objects return.
- Amounts are rupees with 2 decimals; Razorpay amounts are paise.
- No push notifications exist for pooling yet; poll the screens (rider detail 30 s, driver trips 15 s while a trip is running).

## 7. Test data (already in the live DB)
- Route **"Indore to Maheshwar (100 km sample)"** — ₹800/seat, 100 km, stops at 0 / 20 / 40 / 50 / 60 / 100 km, vehicle with 4 seats and 5% tax. Upcoming trips tomorrow and the day after already have bookings that share the fare.
- Past completed trips show settled bookings (final fare + refund), including a no-show on Indore→Ujjain.
- Admin panel: Car Pooling → Routes (distance + km per stop), Commission (PALKI % / Owner % / tax %), Bookings.

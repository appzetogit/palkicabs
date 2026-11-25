# Event Booking: Flutter integration guide (Rider app + Driver app, with admin API reference)

Event Booking lets a customer hire **several vehicles for one event** (wedding, corporate trip, yatra, school trip...). It is a separate module: its own API, its own payments, its own driver wallet. It does not touch rides, parcels, pooling or the ride wallet.

- Base URL: `https://palkicabs.com/api/v1`
- Headers on every call: `Authorization: Bearer <token>`, `Content-Type: application/json`
- Rider screens use the **rider token** (`/users/events/*`). Driver screens use the **driver token** (`/drivers/events/*`). A driver token on a rider route (or the reverse) returns `403`.
- Success: `{ "success": true, "data": ..., "message": "..." }`. Error: `{ "success": false, "message": "..." }` with a 4xx status. **Always show `message` to the user.**
- All dates are ISO-8601 UTC strings (`2026-12-20T08:30:00.000Z`). Convert to the phone's local time for display and when the user picks a time. The business day for "event day" rules is **IST (Asia/Kolkata)**.
- Money values are numbers in rupees (can have 2 decimals).

---

## 1. Concepts

| Term | Meaning |
| --- | --- |
| Event type | Wedding, Corporate Event, Birthday / Party, Religious Function / Yatra, School / College Trip. Admin managed. |
| Vehicle category | Hatchback, Sedan, SUV, Tempo Traveller, Mini Bus. Price, fleet size and availability are per category. |
| Zone | City/region. The booking belongs to the zone that contains the **pickup point**. Only vehicles of that zone can be assigned. |
| Item | "2 x SUV". A booking has one or more items. |
| Assignment | One real vehicle (with its driver) that the admin picked for the booking. |
| PALKI vehicle | Owned by admin, carries a driver name + phone, has no driver login. Whole fare goes to PALKI. |
| Driver vehicle | Added by a driver in the driver app, approved by admin. Driver earns fare minus the zone's commission %. |

### 1.1 Booking status (state machine)

```
requested --admin assigns--> assigned --advance paid--> confirmed --balance paid--> ongoing --admin completes--> completed
    |                            |                          |
    +--admin rejects--> rejected +--customer/admin cancel--+--> cancelled
```

| Status | Meaning | Rider can | Driver sees |
| --- | --- | --- | --- |
| `requested` | Request sent, no money taken | cancel | nothing |
| `assigned` | Admin picked vehicles | **pay advance**, cancel | job (accept/decline) |
| `confirmed` | Advance paid | cancel (until a trip starts), **pay balance from the event day 00:00 IST** | job, customer phone |
| `ongoing` | Balance paid | pay "extra" charge if any | start / end trip |
| `completed` | Finished, driver credited | pay "extra" charge if still due | earning |
| `cancelled` | Cancelled by user/admin | - | - |
| `rejected` | Admin could not arrange (only unpaid requests) | - | - |

### 1.2 Money

```
one way        = price of the distance slab (set by admin per zone + category)
return         = one way x returnPercent / 100      (100 = same as going)
extra days     = (days - 1) x extraDayCharge        (days = ceil(hours / 24))
overtime       = hours over allowed x extraHourCharge
one vehicle    = one way + return + extra days + overtime
trip total     = sum(one vehicle x quantity) + admin charges
advance        = total x advance%      -> paid online AFTER admin assigns
balance        = total - advance       -> paid online from event day 00:00 IST
extra          = charges added after the balance was paid (real overtime) -> paid online, any time
```

The price shown in the quote **already includes the return trip**. The app never calculates money; always show what the server returns.

### 1.3 Time rules (real trip time)
Booking price uses the start/end the customer chose. The **real** trip time is recorded by the driver pressing **Start trip** and **End trip** (server time). If a vehicle ran longer than what was charged, the admin adds an "extra time" charge, the customer gets a push and pays it (`due.stage = "extra"`). If a vehicle ran shorter, nothing is refunded. There is no live GPS tracking in this module.

---

## 2. Push notifications (FCM)

All event pushes carry `data`:

```json
{ "type": "event_booking", "bookingId": "<booking _id>" }
```

On tap, open the booking (rider) or the job list (driver) and **refresh from the API**. Do not trust the push text for status.

| When | To | Title |
| --- | --- | --- |
| Admin assigns vehicles | Rider | Vehicles ready for your event (pay advance) |
| Admin assigns vehicles | Driver (own vehicle) | New event job |
| Advance paid, booking confirmed | Rider + driver | Event booking confirmed / Event confirmed |
| Trip started | Rider | Your event vehicle has started |
| Trip ended | Rider | Event trip finished |
| Admin adds an extra charge while ongoing | Rider | Extra charge on your event |
| Extra payment verified | Rider | Payment received |
| Cancelled | Rider (if admin cancelled) + drivers | Event booking cancelled |
| Rejected | Rider | Event request update |
| Completed | Rider + drivers | Event completed / Event earnings added |
| Withdrawal paid / rejected | Driver | Withdrawal paid / rejected |

Push failure never blocks a booking, so also refresh the list on app open and on pull-to-refresh.

---

## 3. Rider app

### 3.1 Screens to build

1. **Home tile**: the app-modules list contains an entry with `service_type: "event"` (name "Event Booking"). Tapping it opens the Event home. Admin can hide/reorder it, so render it from the modules API like the other tiles.
2. **Event home**: "Book vehicles for an event" button + list of my bookings (status chip, code, date, total, "Pay advance Rs X" hint when `due.stage != null`).
3. **New booking**: event type, event name (optional), pickup, drop, start, end, vehicle steppers with live availability, contact name + 10-digit mobile, notes, **See price**, **Send request**.
4. **Booking detail**: status banner, event info, vehicles (with call button), payment breakdown, Pay / Confirm / Cancel buttons.

### 3.2 API

#### Event types
`GET /users/events/types`

```json
{ "data": [ { "_id": "...", "name": "Wedding", "description": "...", "image": "/uploads/palki/event-catalog/....webp", "advancePercent": null } ] }
```
`image` is a path on the server: prefix it with `https://palkicabs.com` unless it already starts with `http`. `advancePercent` null = global default.

#### Availability (call whenever pickup or dates change)
`POST /users/events/availability`

```json
{ "pickup": { "address": "Vijay Nagar, Indore", "lat": 22.7533, "lng": 75.8937 },
  "startAt": "2026-12-20T08:30:00.000Z", "endAt": "2026-12-20T16:30:00.000Z" }
```
```json
{ "data": { "zone": { "id": "...", "name": "Indore" },
  "categories": [ { "categoryId": "...", "name": "SUV", "seats": 6, "image": "...", "total": 6, "booked": 2, "available": 4, "full": false } ],
  "allFull": false } }
```
- Show `available` next to each category. If `full` is true show **"Full"** and disable the stepper. If `allFull` show "All vehicles are booked for these dates".
- Only categories that have a price in that zone are returned.
- `404` "Event booking is not available at this pickup location yet": the pickup is outside every zone.
- `400`: pickup missing or end not after start.
- Debounce (about 300 ms) when the user edits dates.

#### Quote ("See price")
`POST /users/events/quote` with the **same body as create**.

```json
{ "data": {
  "zone": { "id": "...", "name": "Indore" }, "eventType": { "id": "...", "name": "Wedding" },
  "distanceKm": 54.78, "distanceSource": "route", "startAt": "...", "endAt": "...", "days": 1, "durationHours": 9,
  "items": [ { "categoryId": "...", "categoryName": "SUV", "quantity": 1, "oneWayPrice": 5000, "returnPrice": 5000, "extraDayAmount": 0, "overtimeAmount": 0, "unitTotal": 10000, "lineTotal": 10000 } ],
  "pricing": { "tripTotal": 17500, "extraDays": 0, "overtime": 0, "adjustments": 0, "total": 17500, "advancePercent": 30, "advanceAmount": 5250, "balanceAmount": 12250 },
  "availability": [ { "categoryId": "...", "name": "SUV", "requested": 1, "available": 6, "ok": true } ],
  "available": true, "minLeadHours": 24 } }
```
- `available: false` means some quantity no longer fits: show the message and let the user lower the quantity.
- `distanceSource: "estimate"` means no road route was found; the distance is an estimate.
- Quote does **not** enforce the minimum lead time; create does.

#### Create the request
`POST /users/events/bookings`

```json
{ "eventTypeId": "...", "eventTitle": "Sharma family wedding", "notes": "",
  "pickup": { "address": "Vijay Nagar, Indore", "lat": 22.7533, "lng": 75.8937 },
  "drop":   { "address": "Mahakaleshwar, Ujjain", "lat": 23.1828, "lng": 75.7683 },
  "startAt": "2026-12-20T08:30:00.000Z", "endAt": "2026-12-20T16:30:00.000Z",
  "contactName": "Anil Sharma", "contactPhone": "9000010001",
  "items": [ { "categoryId": "...", "quantity": 2 }, { "categoryId": "...", "quantity": 3 } ] }
```
Returns the booking (see "Booking object"), `status: "requested"`. **No money is taken.**

Validation (all return `400`/`409` + `message`):
- `eventTypeId` must be an active type; pickup and drop need valid lat/lng; end after start.
- `startAt` at least `minLeadHours` (default 24 h) from now: "Events must be booked at least 24 hours before they start".
- At least one item with quantity >= 1; each category must be priced in the zone.
- `409` "Only N SUV left for these dates": someone else took them meanwhile. Re-run availability.
- Client-side: contact phone must be exactly 10 digits, contact name required.

#### My bookings
- `GET /users/events/bookings` -> array (latest 100, newest first).
- `GET /users/events/bookings/:id` -> one booking.
- `GET /users/events/bookings/:id/due` -> only the `due` object.

**Booking object (rider)**

```json
{
  "_id": "...", "code": "EVTMWT984JI18D9", "status": "assigned",
  "eventTypeName": "Wedding", "eventTitle": "Sharma family wedding", "notes": "", "zoneName": "Indore",
  "pickup": { "address": "...", "lat": 0, "lng": 0 }, "drop": { "address": "...", "lat": 0, "lng": 0 },
  "distanceKm": 54.78, "startAt": "...", "endAt": "...", "days": 1, "durationHours": 9,
  "contactName": "...", "contactPhone": "...",
  "items": [ { "categoryId": "...", "categoryName": "SUV", "quantity": 1, "oneWayPrice": 5000, "returnPrice": 5000, "extraDayAmount": 0, "overtimeAmount": 0, "unitTotal": 10000, "lineTotal": 10000 } ],
  "pricing": { "tripTotal": 17500, "extraDays": 0, "overtime": 0, "adjustments": 0, "total": 17500, "advancePercent": 30, "advanceAmount": 5250, "balanceAmount": 12250 },
  "adjustments": [ { "label": "Parking and toll", "amount": 300, "at": "..." } ],
  "vehicles": [ { "categoryName": "SUV", "vehicleName": "Toyota Innova Crysta", "vehicleNumber": "MP09EV1011", "driverName": "Kamlesh Dubey", "driverPhone": "9000060111", "tripStartedAt": null, "tripEndedAt": null } ],
  "payments": [ { "stage": "advance", "amount": 5250, "status": "paid", "paidAt": "..." } ],
  "due": { "stage": "advance", "amount": 5250, "canPay": true },
  "cancelReason": "", "refundAmount": 0, "createdAt": "..."
}
```
- `vehicles[]` is empty until the admin assigns. Show a "Call driver" button using `driverPhone`.
- The rider never sees what a driver earns or the commission.
- `payments[].status` is `paid` or `refunded`; `payments[].stage` is `advance`, `balance` or `extra`.

**`due` object**

| `due.stage` | When | `canPay` | Action |
| --- | --- | --- | --- |
| `advance` | status `assigned` | true | Pay advance |
| `balance` | status `confirmed` | false until event day 00:00 IST (`payFrom` tells the time), then true | Pay balance |
| `extra` | status `ongoing` / `completed` and charges are still unpaid | true | Pay extra charge |
| `null` | nothing to pay | false | none |

If `status == "assigned"` and `due.stage == null` (advance 0 %), show **Confirm booking** and call `POST /users/events/bookings/:id/confirm`.

#### Pay (advance, balance and extra use the same 3 calls)
1. `POST /users/events/bookings/:id/pay/order` (no body)
   -> `{ "keyId": "rzp_...", "orderId": "order_...", "amount": 525000, "currency": "INR", "stage": "advance", "due": 5250 }` (`amount` is in **paise**).
   Errors: `409` "Nothing is due on this booking right now", `400` "The balance can be paid from the day of the event".
2. Open Razorpay Checkout with `key = keyId`, `order_id = orderId`, `amount`, `currency`.
3. On success call `POST /users/events/bookings/:id/pay/verify`
   ```json
   { "razorpay_order_id": "...", "razorpay_payment_id": "...", "razorpay_signature": "..." }
   ```
   -> updated booking. Then refresh the detail screen.

Rules and errors:
- The server decides the amount and checks the signature, order amount, booking and user. The app cannot change the amount. `400` "Invalid payment signature" / "Payment does not match this booking".
- `409` "This payment was already used" / "This booking was already updated": a retry; just refresh the booking.
- If verify fails with a network error after the user paid, **retry verify** with the same three values and show "If money was deducted, contact support".
- These two calls are rate limited (`429`); do not auto-retry in a tight loop.
- Status changes: advance -> `confirmed`; balance -> `ongoing`; extra -> status unchanged.

```dart
Future<void> payBooking(String id) async {
  final order = await api.post('/users/events/bookings/$id/pay/order');
  _razorpay.open({
    'key': order['keyId'], 'order_id': order['orderId'],
    'amount': order['amount'], 'currency': order['currency'],
    'name': 'PALKI Event Booking', 'description': order['stage'],
  });
}
// on PaymentSuccessResponse r:
await api.post('/users/events/bookings/$id/pay/verify', {
  'razorpay_order_id': r.orderId, 'razorpay_payment_id': r.paymentId, 'razorpay_signature': r.signature,
});
```

#### Cancel
`POST /users/events/bookings/:id/cancel` body `{ "reason": "optional" }`
-> `{ "booking": {...}, "refundDue": 5250, "refunded": 5250 }`

- Allowed in `requested`, `assigned`, `confirmed`. Not allowed once any vehicle started its trip (`409` "The event has already started...") or in ongoing/completed.
- Refund: up to `freeCancelHours` (default 48) before `startAt` the whole paid amount is refunded; later, `lateCancelRefundPercent` of it (default 0). Refund goes back to the original payment method via Razorpay. If `refunded < refundDue`, tell the user "Refund will be processed by support" (the admin completes it by hand).

### 3.3 Banner text per state (suggested)

| Status / due | Message |
| --- | --- |
| requested | We got your request. PALKI will assign vehicles; you can then pay the advance to confirm. |
| assigned + advance | Vehicles are ready for you. Pay Rs X now to confirm the booking. |
| confirmed + balance, `canPay=false` | Confirmed. The balance of Rs X is payable from `payFrom`. |
| confirmed + balance, `canPay=true` | Pay balance Rs X. |
| ongoing | Your event is on. (Show each vehicle's start/end time.) |
| due.stage = extra | Extra time was used on your event. Please pay the extra charge of Rs X. |
| rejected / cancelled | `cancelReason` (+ refund if `refundAmount > 0`). |

---

## 4. Driver app

Driver entry: Profile -> **Event Bookings**, three tabs: **Event jobs**, **My vehicles**, **Earnings**. Use the normal **driver token**.

### 4.1 My vehicles
A driver can add any number of vehicles for events. Every add/edit goes to the admin for approval. Only `approved` vehicles receive bookings.

| Call | Purpose |
| --- | --- |
| `GET /drivers/events/meta` | `{ "categories": [{_id,name,seats,image}], "zones": [{_id,name}], "minWithdrawal": 500 }` for the add form |
| `GET /drivers/events/vehicles` | my vehicles |
| `POST /drivers/events/vehicles` | add |
| `PATCH /drivers/events/vehicles/:id` | edit (status goes back to `pending`) |
| `DELETE /drivers/events/vehicles/:id` | remove |

Add / edit body:
```json
{ "zoneId": "...", "categoryId": "...", "name": "Toyota Innova Crysta", "vehicleNumber": "MP09AB1234",
  "color": "White", "seats": 6, "images": ["https://.../uploads/.../a.webp"], "documents": [ { "label": "RC", "url": "..." } ] }
```
- Required on add: `zoneId`, `categoryId`, `name`, `vehicleNumber`. Vehicle number is unique (`409` "A vehicle with this number already exists").
- Up to 8 images and 8 documents.
- Edit/delete returns `409` "This vehicle is on a live booking" while the vehicle is on an assigned/confirmed/ongoing booking.
- Vehicle object: `{ _id, name, vehicleNumber, color, seats, images[], status, rejectionReason, categoryId: {_id,name}, zoneId: {_id,name} }`. `status`: `pending` (waiting for admin), `approved`, `rejected` (show `rejectionReason`), `inactive` (admin switched off).
- **Photo upload**: `POST /common/upload/image` body `{ "image": "data:image/jpeg;base64,...", "folder": "event-vehicle" }` -> `{ data: { url } }`; put `url` in `images`. Keep photos under about 6 MB.

### 4.2 Event jobs
`GET /drivers/events/assignments` -> array (latest 100, by event date desc). One element per assigned vehicle of this driver:

```json
{
  "assignmentId": "...", "bookingCode": "EVT...", "bookingStatus": "confirmed", "driverStatus": "pending",
  "eventTypeName": "Wedding", "startAt": "...", "endAt": "...", "days": 1,
  "pickup": { "address": "...", "lat": 0, "lng": 0 }, "drop": { "address": "...", "lat": 0, "lng": 0 },
  "distanceKm": 54.78, "tripKm": 109.56,
  "vehicle": { "name": "Toyota Innova Crysta", "number": "MP09AB1234", "category": "SUV" },
  "earning": 8500, "settled": false,
  "tripStartedAt": null, "tripEndedAt": null, "canStart": false, "canEnd": false,
  "customer": null
}
```
- The driver sees only what the job needs: place, time, km, vehicle, **own earning**. Never the booking total or other vehicles.
- `customer` (`{ name, phone }`) is non-null only when the booking is `confirmed`, `ongoing` or `completed`.
- `earning` is the driver's share for this vehicle (fare minus commission). It becomes real money in the event wallet only when the admin completes the event (`settled: true`).

**Accept / decline**
`POST /drivers/events/assignments/:assignmentId/respond` body `{ "accept": true }` or `{ "accept": false }`
- Show the buttons while `driverStatus == "pending"` and `bookingStatus` is `assigned` or `confirmed`.
- Decline -> admin assigns another vehicle. A second answer returns `409` "You already accepted/rejected this".
- Decline needs a confirm dialog.

**Start / end trip**
- `POST /drivers/events/assignments/:assignmentId/start` (no body) -> updated assignment (same shape as above).
- `POST /drivers/events/assignments/:assignmentId/end` (no body) -> updated assignment.
- Show **Start trip** when `canStart`, **End trip** when `canEnd`. Both need a confirm dialog. The time is the **server time**; the app cannot send one.
- `canStart` is true only when: booking `confirmed`/`ongoing`, job accepted, trip not started, and today (IST) is the event day or later. Before that show "You can start the trip on the day of the event".
- Errors (`409`): "Accept the job first", "This trip has already started", "Start the trip first", "This trip has already ended", "The booking is not confirmed yet".
- When started/ended show "Started 08:10 AM · running" / "Started ... · Ended ... · 13.5 h".
- A wrong tap cannot be fixed by the driver: tell them to contact the admin (the admin edits the times).

### 4.3 Earnings and withdrawals
`GET /drivers/events/earnings`

```json
{ "data": {
  "balance": 8500, "totalEarned": 8500, "totalWithdrawn": 0,
  "transactions": [ { "_id": "...", "type": "earning", "amount": 8500, "balanceAfter": 8500, "bookingId": "...", "note": "EVT... - MP09AB1234", "createdAt": "..." } ],
  "withdrawals": [ { "_id": "...", "amount": 1000, "status": "pending", "reference": "", "adminNote": "", "createdAt": "...", "processedAt": null } ] } }
```
- `transactions[].type`: `earning` (+), `withdrawal_hold` (-, money reserved when requested), `withdrawal_release` (+, request rejected, money returned), `withdrawal_paid` (0, informational).
- This is the **event wallet**. It is separate from the ride wallet and the pooling earnings. Do not mix them in the UI.

`POST /drivers/events/withdrawals` body `{ "amount": 1000 }`
- Errors: `400` "Minimum withdrawal is Rs N", `400` "Not enough balance". The request is paid to the bank details saved in the driver profile; the server does not check them, so ask the driver to fill Profile -> Bank details **before** showing the withdraw button.
- The amount leaves `balance` immediately (hold). `status`: `pending` -> `paid` (admin sent the money, `reference` = UTR) or `rejected` (amount returned, show `adminNote`).

### 4.4 How a driver earns

| Vehicle | Fare Rs 10,000, commission 15% |
| --- | --- |
| PALKI vehicle (admin's, driver has no app login) | PALKI keeps all. No wallet credit. |
| Driver's own vehicle | Driver gets Rs 8,500 at completion. |
| Same + extra time Rs 2,000 added by admin for this vehicle | Driver gets Rs 8,500 + Rs 1,700 = Rs 10,200. |
| Parking / toll style charge added by admin | PALKI keeps it. |

---

## 5. Admin API reference (the admin panel is web; use this only if you build an admin app)

Token: admin token. All under `/admin/events/*`. Same envelope. Sub-admins with a read-only role are blocked from writes by the existing admin guard.

| Area | Calls |
| --- | --- |
| Settings | `GET/PUT /admin/events/settings` (`advancePercent`, `bufferHours`, `minLeadHours`, `freeCancelHours`, `lateCancelRefundPercent`, `minWithdrawal`) |
| Zones | `GET /admin/events/zones` |
| Event types | `GET/POST /admin/events/types`, `PATCH/DELETE /admin/events/types/:id` (`name, description, image, advancePercent, order, active`; delete is blocked if bookings use it) |
| Categories | `GET/POST /admin/events/categories`, `PATCH/DELETE .../:id` (`name, seats, description, image, order, active`) |
| Pricing | `GET /admin/events/pricing?zoneId=`, `PUT /admin/events/pricing`, `DELETE /admin/events/pricing/:id` |
| Vehicles | `GET /admin/events/vehicles?status&ownerType&zoneId&categoryId&q`, `POST` (PALKI vehicle), `PATCH /:id`, `POST /:id/approve`, `POST /:id/reject {reason}`, `DELETE /:id` |
| Inventory | `GET /admin/events/inventory?zoneId=&from=&to=` -> per category `total, booked, available, full` |
| Bookings | `GET /admin/events/bookings?status&zoneId&q&page&limit` -> `{ results, total, page, limit, counts }`; `GET /:id` (adds `availability`, `candidates`, `overtime`); `POST /:id/assign {vehicleIds}`; `POST /:id/reject {reason}`; `POST /:id/cancel {reason}`; `POST /:id/adjustments {label, amount, assignmentId?}`; `POST /:id/assignments/:assignmentId/trip {startedAt, endedAt}`; `POST /:id/complete` |
| Withdrawals | `GET /admin/events/withdrawals?status=`, `POST /:id/pay {reference, note}`, `POST /:id/reject {note}` |
| Stats | `GET /admin/events/stats` |

Pricing body (`PUT`):
```json
{ "zoneId": "...", "categoryId": "...",
  "slabs": [ { "fromKm": 0, "toKm": 50, "price": 3000 }, { "fromKm": 50, "toKm": 100, "price": 5000 } ],
  "extraPerKm": 40, "returnPercent": 100, "includedHours": 10, "extraDayCharge": 3000, "extraDayIncludedHours": 10, "extraHourCharge": 400,
  "commissionPercent": 15, "active": true }
```
Slabs must not overlap and `toKm > fromKm`. Beyond the last slab: last slab price + `extraPerKm` per km.

Assign rules: send exactly the quantity asked for each category (`vehicleIds` of approved, free vehicles of that zone). `409` if a vehicle is busy. A PALKI vehicle's `driverStatus` becomes `accepted` automatically; a driver's vehicle stays `pending` until he answers.

Adjustment rules: allowed in `assigned`, `confirmed`, `ongoing`. After the balance is paid only a positive amount is allowed. With `assignmentId` the charge is tied to that vehicle (extra time), so a driver's own vehicle earns its share. `overtime[]` in booking detail gives the suggested amount per vehicle (`actualHours, allowedHours, overtimeHours, timeCharge, alreadyCharged, alreadyAdded, suggested`).

Complete: blocked while any trip is running (`409`). Credits driver wallets once (no double credit).

---

## 6. Error reference

| HTTP | Typical `message` | What the app does |
| --- | --- | --- |
| 400 | validation text (dates, phone, quantity, signature) | show message, stay on screen |
| 401 | not logged in / token expired | go to login |
| 403 | "Insufficient permissions for this resource" | wrong role token; log out of the wrong panel |
| 404 | "Booking not found", "Assignment not found", "Event booking is not available at this pickup location yet" | show message |
| 409 | state conflict ("Only N SUV left...", "This payment was already used", "A ongoing booking cannot be cancelled", trip rules) | refresh the booking, show message |
| 429 | too many payment attempts | wait and retry manually |

---

## 7. Suggested Dart models (rider)

```dart
class EventBooking {
  final String id, code, status, eventTypeName, eventTitle, zoneName;
  final DateTime startAt, endAt;
  final num distanceKm;
  final List<EventItem> items;
  final EventPricing pricing;
  final List<EventVehicleInfo> vehicles;
  final List<EventPayment> payments;
  final EventDue due;
  final String cancelReason;
  final num refundAmount;
  EventBooking.fromJson(Map<String, dynamic> j)
      : id = j['_id'], code = j['code'], status = j['status'],
        eventTypeName = j['eventTypeName'] ?? '', eventTitle = j['eventTitle'] ?? '', zoneName = j['zoneName'] ?? '',
        startAt = DateTime.parse(j['startAt']).toLocal(), endAt = DateTime.parse(j['endAt']).toLocal(),
        distanceKm = j['distanceKm'] ?? 0,
        items = (j['items'] as List).map((e) => EventItem.fromJson(e)).toList(),
        pricing = EventPricing.fromJson(j['pricing']),
        vehicles = (j['vehicles'] as List? ?? []).map((e) => EventVehicleInfo.fromJson(e)).toList(),
        payments = (j['payments'] as List? ?? []).map((e) => EventPayment.fromJson(e)).toList(),
        due = EventDue.fromJson(j['due'] ?? {}),
        cancelReason = j['cancelReason'] ?? '', refundAmount = j['refundAmount'] ?? 0;
}

class EventDue {
  final String? stage;        // advance | balance | extra | null
  final num amount;
  final bool canPay;
  final DateTime? payFrom;
  EventDue.fromJson(Map<String, dynamic> j)
      : stage = j['stage'], amount = j['amount'] ?? 0, canPay = j['canPay'] ?? false,
        payFrom = j['payFrom'] == null ? null : DateTime.parse(j['payFrom']).toLocal();
}
```
Parse every number with `num` (the server may send ints or doubles). Treat unknown `status` values as "unknown" instead of crashing.

---

## 8. Build checklist

Rider: home tile -> event home list -> new booking (availability, quote, request) -> detail (pay advance, pay balance, pay extra, cancel, call driver, trip times) -> push deep link.
Driver: Profile entry -> vehicles (add with photo upload, edit, delete, status) -> jobs (accept/decline, start/end trip, customer phone after confirm) -> earnings (wallet, history, withdraw) -> push deep link.

Test with demo data: Indore pickup `22.7533, 75.8937`, drop Ujjain `23.1828, 75.7683`; rider and driver logins use OTP `1234` on the current server.

# Event Booking: Flutter integration guide

Event Booking lets a customer hire several vehicles for an event (wedding, corporate trip, yatra...). It is separate from rides, parcels and car pooling: own API, own payments, own driver wallet.

Base URL: `https://palkicabs.com/api/v1`. Every call needs `Authorization: Bearer <token>` (rider token for `/users/events/*`, driver token for `/drivers/events/*`). Every response is `{ success, data, message }`; errors are `{ success:false, message }` with a 4xx status, so show `message` to the user.

## 1. Booking life cycle

```
requested  -> customer sent a request, PALKI has not looked yet
assigned   -> PALKI picked the vehicles; customer must pay the ADVANCE
confirmed  -> advance paid; balance is paid on the event day
ongoing    -> event day started
completed  -> done; drivers' earnings are credited
cancelled / rejected
```

Money: `total = trip (to and back) + extra days + extra hours + admin charges`.
`advance = total x advance%` is paid online after PALKI assigns vehicles. `balance = total - advance` is paid online from 00:00 of the event day.

## 2. Rider app

### 2.1 Event types
`GET /users/events/types` -> `[{ _id, name, description, image, advancePercent }]`

### 2.2 Availability (show counts, "Full")
`POST /users/events/availability`
```json
{ "pickup": { "address": "Vijay Nagar, Indore", "lat": 22.7533, "lng": 75.8937 },
  "startAt": "2026-12-20T08:30:00.000Z", "endAt": "2026-12-20T16:30:00.000Z" }
```
Response `data`:
```json
{ "zone": { "id": "...", "name": "Indore" },
  "categories": [ { "categoryId": "...", "name": "SUV", "seats": 6, "image": "...", "total": 5, "booked": 2, "available": 3, "full": false } ],
  "allFull": false }
```
Show `available` per category; when `full` is true show "Full" and disable the stepper. `404` = no event service at that pickup.

### 2.3 Quote
`POST /users/events/quote` with the same body as create (below). `data`: `distanceKm` (one way), `days`, `items[]` (`categoryName`, `quantity`, `oneWayPrice`, `returnPrice`, `lineTotal`), `pricing { tripTotal, extraDays, overtime, adjustments, total, advancePercent, advanceAmount, balanceAmount }`, `available` (false if the quantities no longer fit). The price already includes the return trip.

### 2.4 Send the request
`POST /users/events/bookings`
```json
{ "eventTypeId": "...", "eventTitle": "Sharma family wedding", "notes": "",
  "pickup": { "address": "...", "lat": 22.75, "lng": 75.89 },
  "drop":   { "address": "...", "lat": 23.18, "lng": 75.77 },
  "startAt": "ISO", "endAt": "ISO",
  "contactName": "Anil Sharma", "contactPhone": "9000010001",
  "items": [ { "categoryId": "...", "quantity": 2 }, { "categoryId": "...", "quantity": 3 } ] }
```
`startAt` must be at least `minLeadHours` away (the quote returns it). Returns the booking (`status: "requested"`).

### 2.5 My bookings
`GET /users/events/bookings` and `GET /users/events/bookings/:id`. Useful fields: `status`, `items`, `vehicles[]` (appear after assign: vehicle, number, driver name, driver phone), `pricing`, `payments[]`, `adjustments[]`, and `due`:
```json
"due": { "stage": "advance" | "balance" | null, "amount": 1500, "canPay": true, "payFrom": "ISO (balance only)" }
```
Show a Pay button when `due.stage != null && due.canPay`. If `status == "assigned"` and `due.stage == null` (advance 0%), call `POST /users/events/bookings/:id/confirm` instead.

### 2.6 Pay (Razorpay), same for advance and balance
1. `POST /users/events/bookings/:id/pay/order` -> `{ keyId, orderId, amount, currency, stage, due }`
2. Open Razorpay checkout with `keyId`, `orderId`, `amount`.
3. On success `POST /users/events/bookings/:id/pay/verify` with `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` -> updated booking.
The server checks the signature, the amount and the booking, so the amount cannot be changed from the app. Poll or refresh the booking after verify.

### 2.7 Cancel
`POST /users/events/bookings/:id/cancel` `{ "reason": "..." }` -> `{ booking, refundDue, refunded }`. Full advance refund up to `freeCancelHours` before the start; later cancellations get the percentage set by the admin.

## 3. Driver app

Drivers can add any number of vehicles for events; the admin approves each one. Only approved vehicles get bookings.

| Call | Purpose |
| --- | --- |
| `GET /drivers/events/meta` | `{ categories[], zones[], minWithdrawal }` for the add-vehicle form |
| `GET /drivers/events/vehicles` | my event vehicles with `status` (`pending`, `approved`, `rejected` + `rejectionReason`) |
| `POST /drivers/events/vehicles` | `{ zoneId, categoryId, name, vehicleNumber, color, seats, images:[url] }` |
| `PATCH /drivers/events/vehicles/:id` | edit (goes back to `pending`); `409` if on a live booking |
| `DELETE /drivers/events/vehicles/:id` | remove |
| `GET /drivers/events/assignments` | my jobs |
| `POST /drivers/events/assignments/:assignmentId/respond` | `{ "accept": true|false }` |
| `GET /drivers/events/earnings` | `{ balance, totalEarned, totalWithdrawn, transactions[], withdrawals[] }` |
| `POST /drivers/events/withdrawals` | `{ "amount": 1000 }`, paid to the bank details in the profile |

Photos: upload with `POST /common/upload/image` `{ image: <base64 data URL>, folder: "event-vehicle" }` and send the returned `url` in `images`.

An assignment (`GET /drivers/events/assignments`) has: `assignmentId`, `bookingCode`, `bookingStatus`, `driverStatus` (`pending|accepted|rejected`), `eventTypeName`, `startAt`, `endAt`, `days`, `pickup`, `drop`, `tripKm`, `vehicle`, `earning`, `settled`, and `customer { name, phone }` only after the booking is confirmed. Drivers never see prices or other vehicles.

Earning: PALKI's own vehicles pay all the money to PALKI (the driver is salaried). For a driver's own vehicle, the driver gets the vehicle's fare minus the zone's commission %, credited to the **event wallet** when the admin completes the event. A withdrawal request holds the amount straight away; the admin pays it or rejects it (then the amount returns to the wallet).

## 4. Home screen tile
The tile is an app module with `service_type: "event"` (name "Event Booking"). Open the Event Booking section when a module with `service_type == "event"` is tapped. The admin can switch it off or reorder it in the app-modules page.

## 5. Admin (web only)
`/admin/events/*`: bookings, event types, vehicle categories, zone pricing (distance slabs, return %, extra day, extra hour, commission), vehicles, inventory, driver withdrawals, settings.

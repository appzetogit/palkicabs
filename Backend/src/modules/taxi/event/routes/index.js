import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { paymentOrderRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import * as admin from '../controllers/eventAdminController.js';
import * as user from '../controllers/eventUserController.js';
import * as driver from '../controllers/eventDriverController.js';

/**
 * Event booking API. Separate from rides: own collections, own wallet.
 *   /admin/events/*     admin panel
 *   /users/events/*     rider app
 *   /drivers/events/*   driver app
 */
export const eventRouter = Router();

// ---- admin ---------------------------------------------------------------------------------------------
const a = authenticate(['admin']);
eventRouter.get('/admin/events/stats', a, admin.stats);
eventRouter.get('/admin/events/zones', a, admin.listZones);
eventRouter.get('/admin/events/settings', a, admin.readSettings);
eventRouter.put('/admin/events/settings', a, admin.writeSettings);

eventRouter.get('/admin/events/types', a, admin.eventTypes.list);
eventRouter.post('/admin/events/types', a, admin.eventTypes.create);
eventRouter.patch('/admin/events/types/:id', a, admin.eventTypes.update);
eventRouter.delete('/admin/events/types/:id', a, admin.deleteEventType);

eventRouter.get('/admin/events/categories', a, admin.eventCategories.list);
eventRouter.post('/admin/events/categories', a, admin.eventCategories.create);
eventRouter.patch('/admin/events/categories/:id', a, admin.eventCategories.update);
eventRouter.delete('/admin/events/categories/:id', a, admin.deleteEventCategory);

eventRouter.get('/admin/events/pricing', a, admin.listPricing);
eventRouter.put('/admin/events/pricing', a, admin.savePricing);
eventRouter.delete('/admin/events/pricing/:id', a, admin.deletePricing);

eventRouter.get('/admin/events/vehicles', a, admin.listVehicles);
eventRouter.post('/admin/events/vehicles', a, admin.createAdminVehicle);
eventRouter.patch('/admin/events/vehicles/:id', a, admin.updateVehicle);
eventRouter.post('/admin/events/vehicles/:id/approve', a, admin.approveVehicle);
eventRouter.post('/admin/events/vehicles/:id/reject', a, admin.rejectVehicle);
eventRouter.delete('/admin/events/vehicles/:id', a, admin.deleteVehicle);

eventRouter.get('/admin/events/inventory', a, admin.inventory);

eventRouter.get('/admin/events/bookings', a, admin.listBookings);
eventRouter.get('/admin/events/bookings/:id', a, admin.getBooking);
eventRouter.post('/admin/events/bookings/:id/assign', a, admin.assign);
eventRouter.post('/admin/events/bookings/:id/reject', a, admin.reject);
eventRouter.post('/admin/events/bookings/:id/cancel', a, admin.cancel);
eventRouter.post('/admin/events/bookings/:id/adjustments', a, admin.adjust);
eventRouter.post('/admin/events/bookings/:id/assignments/:assignmentId/trip', a, admin.tripTimes);
eventRouter.post('/admin/events/bookings/:id/complete', a, admin.complete);

eventRouter.get('/admin/events/withdrawals', a, admin.listWithdrawals);
eventRouter.post('/admin/events/withdrawals/:id/pay', a, admin.payWithdrawal);
eventRouter.post('/admin/events/withdrawals/:id/reject', a, admin.rejectWithdrawal);

// ---- rider ----------------------------------------------------------------------------------------------
const u = authenticate(['user']);
eventRouter.get('/users/events/types', u, user.listTypes);
eventRouter.post('/users/events/availability', u, user.availability);
eventRouter.post('/users/events/quote', u, user.quote);
eventRouter.post('/users/events/bookings', u, user.create);
eventRouter.get('/users/events/bookings', u, user.list);
eventRouter.get('/users/events/bookings/:id', u, user.get);
eventRouter.post('/users/events/bookings/:id/cancel', u, user.cancel);
eventRouter.post('/users/events/bookings/:id/confirm', u, user.confirm);
eventRouter.get('/users/events/bookings/:id/due', u, user.due);
eventRouter.post('/users/events/bookings/:id/pay/order', u, paymentOrderRateLimit, user.payOrder);
eventRouter.post('/users/events/bookings/:id/pay/verify', u, paymentOrderRateLimit, user.payVerify);

// ---- driver ----------------------------------------------------------------------------------------------
const d = authenticate(['driver']);
eventRouter.get('/drivers/events/meta', d, driver.meta);
eventRouter.get('/drivers/events/vehicles', d, driver.listVehicles);
eventRouter.post('/drivers/events/vehicles', d, driver.createVehicle);
eventRouter.patch('/drivers/events/vehicles/:id', d, driver.updateVehicle);
eventRouter.delete('/drivers/events/vehicles/:id', d, driver.deleteVehicle);
eventRouter.get('/drivers/events/assignments', d, driver.listAssignments);
eventRouter.post('/drivers/events/assignments/:assignmentId/respond', d, driver.respond);
eventRouter.post('/drivers/events/assignments/:assignmentId/start', d, driver.trip('start'));
eventRouter.post('/drivers/events/assignments/:assignmentId/end', d, driver.trip('end'));
eventRouter.get('/drivers/events/earnings', d, driver.earnings);
eventRouter.post('/drivers/events/withdrawals', d, driver.withdraw);

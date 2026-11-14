/**
 * Renders a sample invoice so the layout can be eyeballed without a database.
 *   node scripts/testInvoicePdf.js [output.pdf]
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { renderInvoicePdf } from '../src/modules/taxi/services/invoiceService.js';

const model = {
  invoiceDate: '24 August 2026',
  company: {
    name: 'PALKI',
    tagline: 'Reliable rides, simple journeys',
    address: 'Sample Office, Sample Road, Sample City - 000000',
    phone: '9000000000',
    email: 'support@example.com',
    city: 'Sample City',
  },
  trip: {
    customerName: 'Test Rider',
    customerEmail: 'rider@example.com',
    driverName: 'Test Driver',
    vehicleNumber: 'XX 00 AB 0000',
    pickup: 'Sample Pickup, Sample City',
    drop: 'Sample Drop, Sample City',
    paymentMethod: 'cash',
  },
  fare: { symbol: '₹', tripFare: 3000, total: 3000 },
};

const out = process.argv[2] || 'sample-invoice.pdf';
const buffer = await renderInvoicePdf(model);

assert.ok(buffer.length > 1000, 'pdf looks empty');
assert.equal(buffer.subarray(0, 5).toString(), '%PDF-', 'not a PDF');

await fs.writeFile(out, buffer);
console.log(`  wrote ${out} (${(buffer.length / 1024).toFixed(1)} KB)`);

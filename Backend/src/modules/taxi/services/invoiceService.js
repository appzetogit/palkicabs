import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { Ride } from '../user/models/Ride.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';
import { getLandingContent } from '../admin/services/landingContentService.js';
import { sendEmail } from './mailService.js';
import { describeRidePayment, invoiceNumber } from './paymentLedgerService.js';

/**
 * Trip invoice PDF, emailed to the rider when a ride completes.
 *
 * Everything on the page is read at render time — company name, address, phone
 * and currency come from the admin panel (Landing CMS contact block and
 * business settings), the rest from the ride — so nothing here needs a deploy
 * to change.
 */

const PAGE_MARGIN = 48;
const INK = '#191713';
const MUTED = '#6B6660';
const RULE = '#DDD9D2';
const ACCENT = '#C8901F';

/**
 * pdfkit's built-in Helvetica is WinAnsi-encoded and has no glyph for the rupee
 * sign, which renders as a black box. If the host has a Unicode TTF we use it;
 * otherwise the amounts read "Rs." rather than shipping a broken glyph.
 */
const FONT_CANDIDATES = [
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'],
  ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
];

const resolveFonts = () => {
  for (const [regular, bold] of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(regular) && fs.existsSync(bold)) {
        return { regular, bold, unicode: true };
      }
    } catch {
      // unreadable path, try the next candidate
    }
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', unicode: false };
};

const FONTS = resolveFonts();

const money = (amount, symbol) => {
  const value = Number(amount || 0);
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}/-`;
};

const formatDate = (date) =>
  new Date(date || Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

const formatDateTime = (date) =>
  date
    ? new Date(date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : '-';

// "0000000000" is the admin panel's placeholder, not a number worth printing.
const realPhone = (value) => {
  const text = String(value || '').trim();
  const digits = text.replace(/\D/g, '');
  // all zeros / all nines / one repeated digit are placeholders
  return digits.length >= 8 && !/^(\d)+$/.test(digits) ? text : '';
};

const companyDetails = (general, contact) => ({
  name: String(general.app_name || 'PALKI').trim(),
  legalName: String(general.company_name || contact.legalName || 'Bhaarat Apna Private Limited').trim(),
  tagline: String(contact.tagline || 'Reliable rides, simple journeys').trim(),
  address: String(contact.address || general.address || '').trim(),
  phone: realPhone(contact.whatsappDisplay) || realPhone(general.contact_phone_1) || realPhone(general.contact_booking_number),
  email: String(contact.email || general.contact_email || '').trim(),
  website: String(general.website || 'palkicabs.com').trim(),
  gstin: String(general.gst_number || general.gstin || '').trim(),
  city: String(contact.city || '').trim(),
});

/** Company block shared by the invoice and the receipt. Returns the next y. */
const drawCompanyBlock = (doc, company, left, width, y) => {
  doc.font(FONTS.bold).fontSize(13).fillColor(INK).text(company.name, left, y);
  doc.font(FONTS.regular).fontSize(9.5).fillColor(ACCENT).text(company.tagline, left, y + 17);
  y += 42;
  const colWidth = (width - 24) / 2;
  const cells = [
    ['Registered Entity', company.legalName], ['Office Address', company.address], ['Phone', company.phone],
    ['Email', company.email], ['Website', company.website], ['GSTIN', company.gstin],
  ].filter(([, value]) => value);
  for (let i = 0; i < cells.length; i += 2) {
    const [l1, v1] = cells[i]; const second = cells[i + 1];
    const rowHeight = Math.max(
      doc.font(FONTS.regular).fontSize(10.5).heightOfString(v1, { width: colWidth }),
      second ? doc.font(FONTS.regular).fontSize(10.5).heightOfString(second[1], { width: colWidth }) : 0,
    ) + 13;
    drawLabelledColumn(doc, left, y, colWidth, l1, v1);
    if (second) drawLabelledColumn(doc, left + colWidth + 24, y, colWidth, second[0], second[1]);
    y += rowHeight + 12;
  }
  return y + 4;
};

/** The business's own details and currency, from the admin panel. */
const loadCompany = async () => {
  const [settingsDoc, landing] = await Promise.all([
    AdminBusinessSetting.findOne({ scope: 'default' }).select('general customization').lean(),
    getLandingContent().catch(() => null),
  ]);
  const general = settingsDoc?.general || {};
  const customization = settingsDoc?.customization || {};
  const contact = landing?.contact || {};
  const rawSymbol = String(customization.currency_symbol || '₹').trim() || '₹';
  return {
    symbol: FONTS.unicode ? rawSymbol : 'Rs. ',
    company: companyDetails(general, contact),
  };
};

/** Everything the invoice prints, resolved from the ride and the admin panel. */
export const buildInvoiceModel = async ({ rideId }) => {
  const ride = await Ride.findById(rideId)
    .populate('userId', 'name email phone')
    .populate('driverId', 'name phone vehicleNumber vehicleType vehicleModel')
    .populate('vehicleTypeId', 'name')
    .lean();

  if (!ride) {
    throw new Error(`Ride ${rideId} not found`);
  }

  const [settingsDoc, landing] = await Promise.all([
    AdminBusinessSetting.findOne({ scope: 'default' }).select('general customization').lean(),
    getLandingContent().catch(() => null),
  ]);

  const general = settingsDoc?.general || {};
  const customization = settingsDoc?.customization || {};
  const contact = landing?.contact || {};

  const rawSymbol = String(customization.currency_symbol || '₹').trim() || '₹';
  // Fall back to an ASCII marker when we have no Unicode font to draw it with.
  const currencySymbol = FONTS.unicode ? rawSymbol : 'Rs. ';

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fare = num(ride.fare);
  // Outstation tolls are inside the fare; the invoice lists them on their own.
  const tolls = Math.min(Math.max(0, num(ride.tollCharges?.total)), fare);
  const waiting = Math.max(0, num(ride.waitingCharge));
  const airportFee = Math.max(0, num(ride.trip_category?.airport_fee));
  const platformFee = Math.max(0, num(ride.pricingSnapshot?.rider_platform_fee));
  const discount = Math.max(0, num(ride.promo?.discount_amount));
  // Whatever is left of the total once the listed extras are taken out is the trip fare itself.
  const tripFare = Math.max(0, Math.round((fare - tolls - waiting - airportFee - platformFee + discount) * 100) / 100);
  const meters = ride.route?.distanceMeters ?? ride.estimatedDistanceMeters ?? null;
  const category = String(ride.trip_category?.category || '').toLowerCase();
  const service = ride.serviceType === 'parcel' ? 'Parcel delivery' : ride.serviceType === 'intercity' ? 'Intercity'
    : category === 'airport' ? 'Airport transfer' : category === 'outstation' ? 'Outstation' : 'City ride';
  const paid = describeRidePayment(ride);

  return {
    invoiceDate: formatDate(ride.completedAt || ride.updatedAt),
    company: companyDetails(general, contact),
    trip: {
      bookingId: `${ride.serviceType === 'parcel' ? 'DEL' : 'REQ'}_${String(ride._id).slice(-12).toUpperCase()}`,
      service,
      customerName: String(ride.userId?.name || 'Customer').trim(),
      customerPhone: String(ride.userId?.phone || '').trim(),
      customerEmail: String(ride.userId?.email || '').trim(),
      driverName: String(ride.driverId?.name || '-').trim(),
      driverPhone: String(ride.driverId?.phone || '').trim(),
      vehicleNumber: String(ride.driverId?.vehicleNumber || '-').trim(),
      vehicle: String(ride.vehicleTypeId?.name || ride.driverId?.vehicleModel || ride.driverId?.vehicleType || '').trim(),
      pickup: String(ride.pickupAddress || '-').trim(),
      drop: String(ride.dropAddress || '-').trim(),
      requestedAt: formatDateTime(ride.createdAt),
      startedAt: ride.startedAt ? formatDateTime(ride.startedAt) : '',
      completedAt: ride.completedAt ? formatDateTime(ride.completedAt) : '',
      distance: meters ? `${(num(meters) / 1000).toFixed(1)} km` : '',
      duration: ride.route?.durationMinutes ?? ride.estimatedDurationMinutes ? `${ride.route?.durationMinutes ?? ride.estimatedDurationMinutes} min` : '',
      paymentMethod: String(ride.paymentMethod || 'cash').trim(),
    },
    // How it was actually paid - a cash booking can be paid online at the end.
    payment: { detail: paid.detail, reference: paid.reference, status: paid.status, method: paid.method },
    invoiceNumber: invoiceNumber('ride', ride._id),
    fare: {
      symbol: currencySymbol,
      tripFare,
      waiting: waiting > 0 ? { label: `Waiting charge${num(ride.waitingMinutes) ? ` (${num(ride.waitingMinutes)} min)` : ''}`, amount: waiting } : null,
      airportFee: airportFee > 0 ? { label: `Airport fee${ride.trip_category?.airport_name ? ` - ${ride.trip_category.airport_name}` : ''}`, amount: airportFee } : null,
      platformFee: platformFee > 0 ? { label: 'Platform fee', amount: platformFee } : null,
      discount: discount > 0 ? { label: `Promo discount${ride.promo?.code ? ` (${ride.promo.code})` : ''}`, amount: discount } : null,
      tolls: tolls > 0
        ? (ride.tollCharges?.items || [])
          .filter((item) => Number(item.amount) > 0)
          .map((item) => ({
            label: `Toll - ${item.name || 'Toll plaza'}${ride.tollCharges?.roundTrip ? ' (both ways)' : ''}`,
            amount: Number(item.amount),
          }))
        : [],
      total: fare,
    },
  };
};

const drawLabelledColumn = (doc, x, y, width, label, value) => {
  doc
    .font(FONTS.bold)
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(label.toUpperCase(), x, y, { width, characterSpacing: 0.8 });

  doc
    .font(FONTS.regular)
    .fontSize(10.5)
    .fillColor(INK)
    .text(value || '-', x, y + 13, { width });
};

export const renderInvoicePdf = (model) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PAGE_MARGIN;
    const right = doc.page.width - PAGE_MARGIN;
    const width = right - left;

    // --- header -------------------------------------------------------------
    doc
      .font(FONTS.bold)
      .fontSize(20)
      .fillColor(INK)
      .text('TRIP INVOICE', left, PAGE_MARGIN, { characterSpacing: 1 });

    doc
      .font(FONTS.regular)
      .fontSize(10)
      .fillColor(MUTED)
      .text(model.invoiceDate, left, PAGE_MARGIN, { width, align: 'right' });
    if (model.invoiceNumber) {
      doc
        .font(FONTS.bold)
        .fontSize(9)
        .fillColor(INK)
        .text(`Invoice No. ${model.invoiceNumber}`, left, PAGE_MARGIN + 14, { width, align: 'right' });
    }

    let y = PAGE_MARGIN + 34;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(2).strokeColor(INK).stroke();

    // --- company ------------------------------------------------------------
    y += 18;
    y = drawCompanyBlock(doc, model.company, left, width, y);

    // --- trip details -------------------------------------------------------
    const sectionHeading = (text) => {
      doc
        .font(FONTS.bold)
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(text.toUpperCase(), left, y, { characterSpacing: 1.2 });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke();
      y += 14;
    };

    sectionHeading('Trip Details');

    const third = (width - 32) / 3;
    const col = (i) => left + (third + 16) * i;
    const detailRow = (cells) => {
      let rowHeight = 0;
      cells.forEach(([label, value], i) => {
        drawLabelledColumn(doc, col(i), y, third, label, value);
        rowHeight = Math.max(rowHeight, doc.font(FONTS.regular).fontSize(10.5).heightOfString(value || '-', { width: third }));
      });
      y += rowHeight + 13 + 12;
    };
    detailRow([
      ['Customer', [model.trip.customerName, model.trip.customerPhone].filter(Boolean).join('\n')],
      ['Driver', [model.trip.driverName, model.trip.driverPhone].filter(Boolean).join('\n')],
      ['Vehicle', [model.trip.vehicle, model.trip.vehicleNumber].filter((v) => v && v !== '-').join('\n') || '-'],
    ]);
    detailRow([
      ['Booking ID', model.trip.bookingId], ['Service', model.trip.service], ['Requested', model.trip.requestedAt],
    ]);
    const meta = [
      model.trip.startedAt ? ['Trip started', model.trip.startedAt] : null,
      model.trip.completedAt ? ['Trip completed', model.trip.completedAt] : null,
      model.trip.distance || model.trip.duration ? ['Distance / time', [model.trip.distance, model.trip.duration].filter(Boolean).join('  ·  ')] : null,
    ].filter(Boolean);
    if (meta.length) detailRow(meta);

    // --- journey ------------------------------------------------------------
    sectionHeading('Journey');

    const leg = (label, value) => {
      doc.circle(left + 3, y + 5, 3).fillColor(ACCENT).fill();
      doc
        .font(FONTS.bold)
        .fontSize(8)
        .fillColor(MUTED)
        .text(label.toUpperCase(), left + 14, y, { characterSpacing: 0.8 });
      const height = doc
        .font(FONTS.regular)
        .fontSize(10.5)
        .fillColor(INK)
        .heightOfString(value, { width: width - 14 });
      doc.text(value, left + 14, y + 12, { width: width - 14 });
      y += 12 + height + 12;
    };

    leg('Pickup', model.trip.pickup);
    leg('Drop', model.trip.drop);

    y += 4;

    // --- fare summary -------------------------------------------------------
    sectionHeading('Fare Summary');

    const amountX = right - 130;
    doc
      .font(FONTS.bold)
      .fontSize(8)
      .fillColor(MUTED)
      .text('DESCRIPTION', left, y)
      .text('AMOUNT', amountX, y, { width: 130, align: 'right' });

    y += 16;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke();
    y += 12;

    const row = (label, amount, bold = false, minus = false) => {
      doc
        .font(bold ? FONTS.bold : FONTS.regular)
        .fontSize(10.5)
        .fillColor(minus ? '#B42318' : INK)
        .text(label, left, y)
        .text(`${minus ? '- ' : ''}${money(amount, model.fare.symbol)}`, amountX, y, { width: 130, align: 'right' });
      y += 22;
    };

    row('Trip Fare', model.fare.tripFare);
    if (model.fare.waiting) row(model.fare.waiting.label, model.fare.waiting.amount);
    if (model.fare.airportFee) row(model.fare.airportFee.label, model.fare.airportFee.amount);
    for (const toll of model.fare.tolls || []) row(toll.label, toll.amount);
    if (model.fare.platformFee) row(model.fare.platformFee.label, model.fare.platformFee.amount);
    if (model.fare.discount) row(model.fare.discount.label, model.fare.discount.amount, false, true);
    doc.moveTo(left, y - 6).lineTo(right, y - 6).lineWidth(0.75).strokeColor(RULE).stroke();
    row('Total Amount (incl. applicable taxes)', model.fare.total, true);

    // --- total banner -------------------------------------------------------
    y += 8;
    doc.rect(left, y, width, 46).fillColor(INK).fill();
    doc
      .font(FONTS.bold)
      .fontSize(9)
      .fillColor('#FFFFFF')
      .text('TOTAL AMOUNT', left + 18, y + 17, { characterSpacing: 1.2 });
    doc
      .font(FONTS.bold)
      .fontSize(16)
      .fillColor('#FFFFFF')
      .text(money(model.fare.total, model.fare.symbol), left, y + 13, {
        width: width - 18,
        align: 'right',
      });

    y += 58;
    if (model.payment?.detail) {
      const status = model.payment.status ? `  ·  ${String(model.payment.status).toUpperCase()}` : '';
      doc
        .font(FONTS.regular)
        .fontSize(9.5)
        .fillColor(MUTED)
        .text(`Payment: ${model.payment.detail}${status}${model.payment.reference ? `  ·  Ref. ${model.payment.reference}` : ''}`, left, y, { width });
    }
    y += 16;

    // --- footer -------------------------------------------------------------
    doc
      .font(FONTS.bold)
      .fontSize(10.5)
      .fillColor(INK)
      .text(`Thank you for choosing ${model.company.name}.`, left, y, { width, align: 'center' });
    doc
      .font(FONTS.regular)
      .fontSize(9.5)
      .fillColor(MUTED)
      .text('We appreciate your business and wish you a safe journey.', left, y + 16, {
        width,
        align: 'center',
      });

    const footerY = doc.page.height - PAGE_MARGIN - 28;
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(0.75).strokeColor(RULE).stroke();
    doc
      .font(FONTS.bold)
      .fontSize(9)
      .fillColor(INK)
      .text(model.company.name, left, footerY + 10);
    doc
      .font(FONTS.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text(model.company.city, left, footerY + 10, { width, align: 'right' });

    doc.end();
  });

export const buildRideInvoicePdf = async ({ rideId }) => {
  const model = await buildInvoiceModel({ rideId });
  const buffer = await renderInvoicePdf(model);
  const stamp = model.invoiceDate.replace(/\s+/g, '_');
  const slug = model.company.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Invoice';

  return { buffer, model, filename: `${slug}_Trip_Invoice_${stamp}.pdf` };
};

/**
 * Emails the invoice to the rider. Never throws: a mail or PDF problem must not
 * fail the ride completion that triggered it, so failures are logged and
 * reported in the return value instead.
 */
export const sendRideInvoiceEmail = async ({ rideId }) => {
  try {
    const { buffer, model, filename } = await buildRideInvoicePdf({ rideId });
    const to = model.trip.customerEmail;

    if (!to) {
      return { sent: false, reason: 'no-customer-email' };
    }

    const total = money(model.fare.total, model.fare.symbol);
    const result = await sendEmail({
      to,
      subject: `Your ${model.company.name} trip invoice — ${model.invoiceDate}`,
      text: [
        `Hi ${model.trip.customerName},`,
        '',
        `Thank you for riding with ${model.company.name}.`,
        `Your invoice for ${model.invoiceDate} is attached.`,
        '',
        `Pickup: ${model.trip.pickup}`,
        `Drop:   ${model.trip.drop}`,
        `Total:  ${total}`,
        '',
        'We appreciate your business and wish you a safe journey.',
        model.company.name,
      ].join('\n'),
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#191713;line-height:1.6">
          <p>Hi ${model.trip.customerName},</p>
          <p>Thank you for riding with <strong>${model.company.name}</strong>.
             Your invoice for ${model.invoiceDate} is attached as a PDF.</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:4px 16px 4px 0;color:#6B6660">Pickup</td><td>${model.trip.pickup}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#6B6660">Drop</td><td>${model.trip.drop}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#6B6660">Total</td><td><strong>${total}</strong></td></tr>
          </table>
          <p style="color:#6B6660">We appreciate your business and wish you a safe journey.</p>
          <p><strong>${model.company.name}</strong></p>
        </div>`,
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });

    if (result?.skipped) {
      return { sent: false, reason: result.reason };
    }

    return { sent: true, to, filename };
  } catch (error) {
    console.error('[invoice] failed to send ride invoice:', error.message);
    return { sent: false, reason: 'error', message: error.message };
  }
};

/**
 * Receipt for a payment that is not a ride - a driver's subscription pass or a
 * wallet top-up - in the same style as the trip invoice. [payment] is a row
 * from paymentLedgerService.
 */
export const renderPaymentReceiptPdf = (payment, { company, symbol }) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PAGE_MARGIN;
    const right = doc.page.width - PAGE_MARGIN;
    const width = right - left;

    doc.font(FONTS.bold).fontSize(20).fillColor(INK).text('PAYMENT RECEIPT', left, PAGE_MARGIN, { characterSpacing: 1 });
    doc.font(FONTS.regular).fontSize(10).fillColor(MUTED).text(formatDate(payment.date), left, PAGE_MARGIN, { width, align: 'right' });
    doc.font(FONTS.bold).fontSize(9).fillColor(INK).text(`Receipt No. ${payment.invoice_number}`, left, PAGE_MARGIN + 14, { width, align: 'right' });

    let y = PAGE_MARGIN + 34;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(2).strokeColor(INK).stroke();

    y += 18;
    y = drawCompanyBlock(doc, company, left, width, y);
    const colWidth = (width - 24) / 2;

    const sectionHeading = (text) => {
      doc.font(FONTS.bold).fontSize(8.5).fillColor(MUTED).text(text.toUpperCase(), left, y, { characterSpacing: 1.2 });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke();
      y += 14;
    };

    sectionHeading('Received From');
    drawLabelledColumn(doc, left, y, colWidth, payment.payer.role === 'driver' ? 'Driver' : 'Rider', payment.payer.name);
    drawLabelledColumn(doc, left + colWidth + 24, y, colWidth, 'Phone', payment.payer.phone || '-');
    y += 46;
    drawLabelledColumn(doc, left, y, colWidth, 'Payment date & time', formatDateTime(payment.date));
    drawLabelledColumn(doc, left + colWidth + 24, y, colWidth, 'Receipt type', payment.kind_label || 'Payment');
    y += 46;
    if (payment.vehicle_names?.length) {
      drawLabelledColumn(doc, left, y, colWidth, 'Vehicle', payment.vehicle_names.join(', '));
      drawLabelledColumn(doc, left + colWidth + 24, y, colWidth, 'Payment status', String(payment.status || 'paid').toUpperCase());
      y += 46;
    }

    sectionHeading('Payment');
    const amountX = right - 130;
    doc.font(FONTS.bold).fontSize(8).fillColor(MUTED).text('DESCRIPTION', left, y).text('AMOUNT', amountX, y, { width: 130, align: 'right' });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke();
    y += 12;
    doc
      .font(FONTS.regular)
      .fontSize(10.5)
      .fillColor(INK)
      .text(`${payment.kind_label} - ${payment.description}`, left, y, { width: amountX - left - 12 })
      .text(money(payment.amount, symbol), amountX, y, { width: 130, align: 'right' });
    y += 30;

    doc.rect(left, y, width, 46).fillColor(INK).fill();
    doc.font(FONTS.bold).fontSize(9).fillColor('#FFFFFF').text('AMOUNT PAID', left + 18, y + 17, { characterSpacing: 1.2 });
    doc.font(FONTS.bold).fontSize(16).fillColor('#FFFFFF').text(money(payment.amount, symbol), left, y + 13, { width: width - 18, align: 'right' });
    y += 62;

    doc
      .font(FONTS.regular)
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`Payment: ${payment.method_label ? `${payment.method_label} - ` : ''}${payment.detail}${payment.reference ? `  ·  Ref. ${payment.reference}` : ''}`, left, y, { width });
    y += 30;
    doc.font(FONTS.bold).fontSize(10.5).fillColor(INK).text(`Thank you for choosing ${company.name}.`, left, y, { width, align: 'center' });

    const footerY = doc.page.height - PAGE_MARGIN - 28;
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(0.75).strokeColor(RULE).stroke();
    doc.font(FONTS.bold).fontSize(9).fillColor(INK).text(company.name, left, footerY + 10);
    doc.font(FONTS.regular).fontSize(9).fillColor(MUTED).text(company.city, left, footerY + 10, { width, align: 'right' });
    doc.end();
  });

/// Invoice PDF for any row of the payments ledger: the trip invoice for a ride,
/// a receipt for everything else.
export const buildPaymentInvoicePdf = async (payment) => {
  if (payment.kind === 'ride') {
    const { buffer, filename } = await buildRideInvoicePdf({ rideId: payment.record_id });
    return { buffer, filename: filename.replace('.pdf', `_${payment.invoice_number}.pdf`) };
  }
  const company = await loadCompany();
  const buffer = await renderPaymentReceiptPdf(payment, company);
  const slug = company.company.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Receipt';
  return { buffer, filename: `${slug}_Receipt_${payment.invoice_number}.pdf` };
};

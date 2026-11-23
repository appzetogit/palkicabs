/**
 * Puts proper photos on Event Booking data, uploaded through the same pipeline the admin panel uses
 * (so they live in the system's uploads, not at an outside link).
 *   event types      <- scripts/assets/event-images/*.jpg   (Unsplash licence)
 *   vehicle category <- the vehicle photos in frontend/public
 *   event vehicles   <- their category's photo (until the admin or driver uploads their own)
 * Idempotent:  node scripts/seedEventImages.js
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { uploadDataUrl } from '../src/utils/fileUpload.js';
import { EventType, EventVehicle, EventVehicleCategory } from '../src/modules/taxi/event/models/eventModels.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
const PUBLIC = path.resolve(here, '../../frontend/public');

const TYPE_FILES = { Wedding: 'wedding.jpg', 'Corporate Event': 'corporate.jpg', 'Birthday / Party': 'birthday.jpg', 'Religious Function / Yatra': 'yatra.jpg', 'School / College Trip': 'school.jpg' };
const CATEGORY_FILES = { Hatchback: 'vehicles/hatchback.jpg', Sedan: 'vehicles/dzire.jpg', SUV: 'vehicles/innova-crysta.jpg', 'Tempo Traveller': 'vehicles/traveller.jpg', 'Mini Bus': 'mini_bus.png' };
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png' };

const upload = async (file, label) => {
  const ext = path.extname(file).toLowerCase();
  const dataUrl = `data:${MIME[ext]};base64,${fs.readFileSync(file).toString('base64')}`;
  const r = await uploadDataUrl({ dataUrl, folder: `${env.uploads.folder}/event-catalog`, publicIdPrefix: `event-${label}` });
  return r.secureUrl;
};
const mine = (url) => /\/uploads\//.test(String(url || ''));

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
const out = { types: 0, categories: 0, vehicles: 0 };

for (const [name, file] of Object.entries(TYPE_FILES)) {
  const t = await EventType.findOne({ name });
  if (t && !mine(t.image)) { t.image = await upload(path.join(here, 'assets/event-images', file), name.replace(/\W+/g, '-').toLowerCase()); await t.save(); out.types += 1; }
}
for (const [name, file] of Object.entries(CATEGORY_FILES)) {
  const c = await EventVehicleCategory.findOne({ name });
  if (!c) continue;
  if (!mine(c.image)) { c.image = await upload(path.join(PUBLIC, file), name.replace(/\W+/g, '-').toLowerCase()); await c.save(); out.categories += 1; }
  const res = await EventVehicle.updateMany({ categoryId: c._id, $or: [{ images: { $size: 0 } }, { 'images.0': { $not: /\/uploads\// } }] }, { $set: { images: [c.image] } });
  out.vehicles += res.modifiedCount;
}
console.log(JSON.stringify(out));
await mongoose.disconnect();

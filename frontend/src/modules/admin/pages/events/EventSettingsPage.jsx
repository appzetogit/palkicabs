import React, { useEffect, useState } from 'react';
import { Field, Shell, Spinner, act, btnPrimary, call, inputCls, useLoad } from './eventUi';

const FIELDS = [
  ['advancePercent', 'Advance %', 'Default share of the total the customer pays online to confirm a booking. An event type can override it.'],
  ['bufferHours', 'Buffer between bookings (hours)', 'A vehicle is treated as busy this long before and after a booking.'],
  ['minLeadHours', 'Earliest booking (hours before start)', 'Customers cannot book an event that starts sooner than this.'],
  ['freeCancelHours', 'Free cancellation until (hours before start)', 'Up to this long before the event the customer gets the whole advance back.'],
  ['lateCancelRefundPercent', 'Refund % of the advance after that', '0 = no refund for late cancellations.'],
  ['minWithdrawal', 'Minimum driver withdrawal (₹)', 'Smallest amount a driver can request from his event earnings.'],
];

const EventSettingsPage = () => {
  const { data, loading } = useLoad(() => call('get', '/admin/events/settings'));
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = async () => {
    setSaving(true);
    await act(() => call('put', '/admin/events/settings', Object.fromEntries(FIELDS.map(([k]) => [k, form[k]]))), 'Settings saved');
    setSaving(false);
  };

  return (
    <Shell title="Settings" subtitle="Rules that apply to every event booking.">
      {loading || !form ? <Spinner /> : (
        <div className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          {FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input type="number" min="0" className={inputCls} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </Field>
          ))}
          <button type="button" className={btnPrimary} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      )}
    </Shell>
  );
};

export default EventSettingsPage;

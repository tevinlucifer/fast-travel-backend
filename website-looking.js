// LankaRides website -> back office booking connector.
// Add this file to the WEBSITE project and load it at the end of the page:
//   <script src="website-booking.js"></script>
// It finds your booking form by its "Confirm booking" button and matches each
// field by its label / name / placeholder, so you do not need to rename anything.
// NOTE: it replaces whatever the form does on submit today (the booking goes to the back office instead).

const BACKOFFICE_URL = 'https://ideas-complications-recovered-salem.trycloudflare.com'; // no slash at the end

(() => {
  const RULES = [ // [field, pattern] checked in this order
    ['email', /e-?mail/], ['date', /date/], ['time', /time/], ['dropoff', /drop|destination/],
    ['pickup', /pick|from/], ['phone', /phone|whatsapp|mobile|tel/], ['nationality', /national|country/],
    ['passengers', /passenger|guests|people|seats/], ['requests', /request|message|note|comment/], ['name', /name/],
  ];

  const labelOf = (el) =>
    (el.labels?.[0]?.textContent || el.closest('label')?.textContent ||
     el.closest('div')?.querySelector('label')?.textContent || '');

  const fieldOf = (el) => {
    if (el.type === 'email') return 'email';
    if (el.type === 'tel') return 'phone';
    if (el.type === 'date') return 'date';
    if (el.type === 'time') return 'time';
    if (el.tagName === 'TEXTAREA') return 'requests';
    const s = [el.name, el.id, el.placeholder, labelOf(el)].join(' ').toLowerCase();
    return (RULES.find(([, re]) => re.test(s)) || [])[0];
  };

  const isBookingForm = (f) =>
    f.tagName === 'FORM' && /confirm booking/i.test(f.textContent) && f.querySelector('input[type="email"], input[name*="mail" i]');

  document.addEventListener('submit', async (e) => {
    const form = e.target;
    if (!isBookingForm(form)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // stop the old handler so the booking is not sent twice

    const payload = { website: '' }; // "website" is a hidden spam trap; keep it empty
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (['submit', 'button', 'hidden', 'checkbox', 'radio'].includes(el.type)) return;
      const key = fieldOf(el);
      if (key && !payload[key]) payload[key] = el.value;
    });
    console.log('[LankaRides] sending booking', payload);

    const btn = form.querySelector('button[type="submit"], button:not([type])');
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const res = await fetch(`${BACKOFFICE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || `Booking failed (${res.status})`);
      alert(`Thank you! Your booking ${data.id || ''} was received. We'll confirm availability and pricing by email.`);
      form.reset();
    } catch (err) {
      console.error('[LankaRides] booking error', err);
      alert('Sorry, we could not send your booking: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }, true); // capture phase: runs before the page's own handlers
})();
// LankaRides website -> back office booking connector (v2).
// Add to the WEBSITE project and load it at the end of the page:
//   <script src="website-booking.js"></script>
// It catches the "Confirm booking" button (click OR form submit) and sends the booking
// to the back office instead of the page's old handler. Fields are matched by their labels.
(() => {
  const BACKOFFICE_URL = 'https://amino-nashville-recognize-stakeholders.trycloudflare.com'; // no slash at the end

  window.__lrOff?.(); // if this script was pasted before, remove the old copy first

  const RULES = [
    ['email', /e-?mail/], ['date', /date/], ['time', /time/], ['dropoff', /drop|destination/],
    ['pickup', /pick|from/], ['phone', /phone|whatsapp|mobile|tel/], ['nationality', /national|country/],
    ['passengers', /passenger|guests|people|seats/], ['requests', /request|message|note|comment/], ['name', /name/],
  ];
  const labelOf = (el) => (el.labels?.[0]?.textContent || el.closest('label')?.textContent ||
    el.parentElement?.querySelector('label')?.textContent || el.parentElement?.parentElement?.querySelector('label')?.textContent || '');
  const fieldOf = (el) => {
    if (el.type === 'email') return 'email';
    if (el.type === 'tel') return 'phone';
    if (el.type === 'date') return 'date';
    if (el.type === 'time') return 'time';
    if (el.tagName === 'TEXTAREA') return 'requests';
    const s = [el.name, el.id, el.placeholder, labelOf(el)].join(' ').toLowerCase();
    return (RULES.find(([, re]) => re.test(s)) || [])[0];
  };
  const hasEmail = (root) => !!root?.querySelector('input[type="email"], input[name*="mail" i], input[id*="mail" i]');
  const isConfirm = (b) => /confirm booking/i.test((b.textContent || b.value || '').trim());

  let busy = false;
  async function send(root, btn) {
    if (busy) return;
    busy = true;
    const payload = { website: '' }; // "website" is a hidden spam trap, keep it empty
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      if (['submit', 'button', 'hidden', 'checkbox', 'radio'].includes(el.type)) return;
      const key = fieldOf(el);
      if (key && !payload[key]) payload[key] = el.value;
    });
    console.log('[LankaRides] sending booking', payload);
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const res = await fetch(`${BACKOFFICE_URL}/api/bookings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || `Booking failed (${res.status})`);
      console.log('[LankaRides] booking saved', data.id);
      alert(`Thank you! Your booking ${data.id || ''} was received. We'll confirm availability and pricing by email.`);
      root.tagName === 'FORM' ? root.reset() : root.querySelectorAll('input:not([type=hidden]), textarea').forEach((i) => (i.value = ''));
    } catch (err) {
      console.error('[LankaRides] booking error', err);
      alert('Sorry, we could not send your booking: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label; }
      busy = false;
    }
  }

  // Case 1: the button is clicked (works even if the page does not use a real form submit)
  const onClick = (e) => {
    const btn = e.target.closest('button, input[type="submit"], a');
    if (!btn || !isConfirm(btn)) return;
    const root = btn.form || btn.closest('form') || btn.closest('#booking, [id*="book" i], section');
    if (!hasEmail(root)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!root.checkValidity || root.checkValidity()) send(root, btn);
    else root.reportValidity();
  };
  // Case 2: the form is submitted (e.g. pressing Enter)
  const onSubmit = (e) => {
    const f = e.target;
    if (f.tagName !== 'FORM' || !hasEmail(f)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    send(f, f.querySelector('button[type="submit"], button:not([type])'));
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);
  window.__lrOff = () => { document.removeEventListener('click', onClick, true); document.removeEventListener('submit', onSubmit, true); };
  console.log('[LankaRides] booking connector loaded →', BACKOFFICE_URL);
})();
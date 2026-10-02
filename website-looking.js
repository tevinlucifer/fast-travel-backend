// Add to the LankaRides website (fast-travel-1.vercel.app) booking form script.
// Set BACKOFFICE_URL to wherever you host the backoffice (server.js), e.g. 'https://backoffice.example.com'
// and add that website origin to ALLOWED_ORIGINS on the backoffice.
const BACKOFFICE_URL = 'https://YOUR-BACKOFFICE-HOST';

const form = document.querySelector('#booking form, #booking-form');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  const fd = Object.fromEntries(new FormData(form).entries());

  // Map your form's field names -> API fields (edit the right-hand side)
  const payload = {
    pickup: fd.pickup, dropoff: fd.dropoff, date: fd.date, time: fd.time,
    name: fd.name, email: fd.email, phone: fd.phone, nationality: fd.nationality,
    passengers: fd.passengers, requests: fd.requests,
    website: fd.website || '', // hidden honeypot field, leave empty
  };

  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${BACKOFFICE_URL}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Booking failed.');
    alert(`Thank you! Your booking ${data.id} was received. We'll confirm by email.`);
    form.reset();
  } catch (err) {
    alert('Sorry, we could not send your booking: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});
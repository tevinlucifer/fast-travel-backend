// Add to the LankaRides website. Shows which vehicle categories are enabled in the back office.
// Uses the same BACKOFFICE_URL as the booking form code.
const BACKOFFICE_URL = 'https://YOUR-BACKOFFICE-HOST';
const CATEGORIES = { Sedan: /sedan/i, KDH: /kdh/i, Hatchback: /hatchback/i };

async function applyCategoryAvailability() {
  let cats;
  try {
    const r = await fetch(`${BACKOFFICE_URL}/api/categories`, { cache: 'no-store' });
    cats = (await r.json()).categories;
  } catch { return; } // back office offline: leave the site as it is

  for (const [name, pattern] of Object.entries(CATEGORIES)) {
    const enabled = cats[name] !== false;

    // 1) Fleet cards: find the card by its heading text (Sedan Cars / KDH / Hatchback)
    document.querySelectorAll('h2, h3, h4').forEach((h) => {
      if (!pattern.test(h.textContent) || h.textContent.length > 25) return;
      const card = h.closest('article, .card, [class*="card"]') || h.parentElement;
      card.style.opacity = enabled ? '' : '.45';
      card.style.filter = enabled ? '' : 'grayscale(1)';
      card.querySelector('.cat-badge')?.remove();
      if (!enabled) {
        const b = document.createElement('div');
        b.className = 'cat-badge';
        b.textContent = 'Currently unavailable';
        b.style.cssText = 'margin-top:10px;font-weight:700;color:#e8484d';
        card.appendChild(b);
      }
    });

    // 2) Booking form: disable the matching vehicle option (if the form has one)
    document.querySelectorAll('select option').forEach((o) => {
      if (!pattern.test(o.textContent)) return;
      o.disabled = !enabled;
      o.textContent = o.textContent.replace(/ \(unavailable\)$/, '') + (enabled ? '' : ' (unavailable)');
    });
  }
}

applyCategoryAvailability();
setInterval(applyCategoryAvailability, 60000); // refresh every minute
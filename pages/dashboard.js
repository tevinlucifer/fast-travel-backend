export default function createDashboardPage(ctx) {
  return {
    dash() {
      const { by, DR, BK, FLEET, US, $, E, IC, LKR, when, bd, CFG } = ctx;
      const n = by('New').length;
      const accepted = by('Accepted');
      const rejected = by('Rejected').length;
      const noShows = by('No-show').length;
      const revenue = accepted.reduce((sum, booking) => sum + (+booking.fare || 0), 0);
      const availableDrivers = DR.filter(driver => driver.status == 'Available').length;
      const hour = new Date().getHours();
      const name = ($('#un').textContent || '').split('@')[0];
      const rate = accepted.length + rejected ? Math.round(100 * accepted.length / (accepted.length + rejected)) : 0;
      const total = BK.length;
      const newPercent = n / (total || 1) * 100;
      const acceptedPercent = newPercent + accepted.length / (total || 1) * 100;
      const rejectedPercent = acceptedPercent + rejected / (total || 1) * 100;
      const recent = [...BK].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
      const kpi = (icon, color, label, value, note, route) => `<a class="st kp glass-card glass-lift" href="#${route}"><span class="ic ${color}">${IC[icon]}</span><div><small>${label}</small><b>${value}</b><em>${note}</em></div></a>`;
      const legend = (color, label, value) => `<p><i style="background:${color}"></i>${label}<span>${value}</span></p>`;
      const fleetRow = (icon, color, label, value, route) => `<a class="rw glass-row" href="#${route}"><span class="ic ${color}">${IC[icon]}</span><div><b>${label}</b></div><div class="r2"><span>${value}</span></div></a>`;
      const bookingStatus = CFG.maintenanceMode ? 'Maintenance mode' : CFG.onlineBookings === false ? 'Bookings paused' : 'Accepting bookings';
      const statusClass = CFG.maintenanceMode || CFG.onlineBookings === false ? 'no' : 'ok';

      return `<div class="dash-ref">
        <div class="dash-content">
          <header class="dash-welcome">
            <div>
              <span class="dash-eyebrow">Back office overview</span>
              <h2>Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}${name ? ', ' + E(name) : ''}</h2>
            </div>
            <div class="dash-status">${bd(bookingStatus, statusClass)}</div>
          </header>
          <div class="dash-grid">
            <section class="operation-card glass-card">
              <div class="ch"><div><small>Operations</small><h4>Website bookings</h4></div><span class="operation-more">•••</span></div>
              <div class="operation-orb"><div><b>${n}</b><span>New request${n == 1 ? '' : 's'}</span></div></div>
              <p>${n ? 'Waiting for a decision' : 'No requests waiting'}</p>
              <div class="operation-actions">
                <a href="#new" class="operation-action">Review</a>
                <a href="#bookings" class="operation-action secondary">Details</a>
              </div>
            </section>
            <div class="dash-main">
              <section class="balance-card glass-card">
                <div class="ch"><div><small>Revenue balance</small><h4>Accepted bookings</h4></div><span class="growth-pill">+${rate}%</span></div>
                <div class="balance-layout">
                  <div class="balance-copy"><b>${LKR(revenue)}</b><span>Your confirmed revenue</span></div>
                  <div class="mini-chart" aria-label="Revenue trend">${[38,52,44,68,58,76,61,82,72,88,64,79].map(v => `<i style="height:${v}%"></i>`).join('')}</div>
                </div>
              </section>
              <div class="dash-kpis">
                ${kpi('inbox', 'b', 'New requests', n, 'Waiting', 'new')}
                ${kpi('check', 'g', 'Accepted', accepted.length, 'Confirmed', 'accepted')}
                ${kpi('pct', 'o', 'Acceptance', rate + '%', 'Success rate', 'analytics')}
              </div>
              <div class="dash-bottom">
                <section class="recent-card glass-card">
                  <div class="ch"><div><small>Most recent</small><h4>Booking activity</h4></div><a href="#bookings">View all</a></div>
                  ${recent.map(booking => `<a class="rw glass-row" href="#booking/${E(booking.id)}"><span class="ic b">${IC.fleet}</span><div><b>${E(booking.pickup)} to ${E(booking.dropoff)}</b><small>${E(booking.name)} · ${when(booking)}</small></div><div class="r2"><span>${LKR(booking.fare)}</span>${bd(booking.status, booking.status == 'Accepted' || booking.status == 'Completed' ? 'ok' : ['Rejected', 'Cancelled'].includes(booking.status) ? 'no' : '')}</div></a>`).join('') || '<p class="sub">No bookings yet.</p>'}
                </section>
                <section class="overview-card glass-card">
                  <div class="ch"><div><small>Live overview</small><h4>Fleet & team</h4></div></div>
                  ${fleetRow('fleet', 'b', 'Vehicles', FLEET.length, 'fleet')}
                  ${fleetRow('drivers', 'g', 'Drivers available', availableDrivers + ' of ' + DR.length, 'drivers')}
                  ${fleetRow('users', 'p', 'User accounts', US.length, 'users')}
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    }
  };
}
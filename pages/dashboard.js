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

      return `<div class="cd glass-card"><div class="row"><h4>Website booking status</h4>${bd(CFG.maintenanceMode ? 'Maintenance mode' : CFG.onlineBookings === false ? 'Bookings paused' : 'Accepting bookings', CFG.maintenanceMode || CFG.onlineBookings === false ? 'no' : 'ok')}</div><p>Minimum notice ${E(CFG.minNotice ?? 0)}h · Maximum trip ${E(CFG.maxDuration ?? 0)} days · Passenger limit ${E(CFG.maxPassengers ?? 0)} · No-show grace ${E(CFG.grace ?? 0)} min</p>${noShows ? `<p>${noShows} booking${noShows == 1 ? '' : 's'} marked no-show.</p>` : ''}</div><div class="hero glass-hero"><svg class="hv" viewBox="0 0 300 130" preserveAspectRatio="none"><path d="M0 130V70l50-25 40 18 60-40 50 30 50-20 50 25v72z" fill="#fff" opacity=".16"/><path d="M0 130v-30l70-20 70 15 80-25 80 20v40z" fill="#fff" opacity=".26"/></svg><h2>Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}${name ? ', ' + E(name) : ''}</h2><p>${n ? `${n} new request${n > 1 ? 's are' : ' is'} waiting for a decision.` : 'No requests are waiting. You are all caught up.'}</p></div>
<div class="g g4">${kpi('inbox', 'b', 'New requests', n, 'Waiting for a decision', 'new')}${kpi('check', 'g', 'Accepted trips', accepted.length, 'Confirmed bookings', 'accepted')}${kpi('cash', 'p', 'Revenue', LKR(revenue), 'From accepted bookings', 'analytics')}${kpi('pct', 'o', 'Acceptance rate', rate + '%', 'Accepted vs rejected', 'analytics')}</div>
<div class="dg"><div class="cd glass-card"><div class="ch"><h4>Recent requests</h4><a href="#bookings">View all</a></div>${recent.map(booking => `<a class="rw glass-row" href="#booking/${E(booking.id)}"><span class="ic b">${IC.fleet}</span><div><b>${E(booking.pickup)} to${E(booking.dropoff)}</b><small>${E(booking.name)} ·${when(booking)}</small></div><div class="r2"><span>${LKR(booking.fare)}</span>${bd(booking.status, booking.status == 'Accepted' || booking.status == 'Completed' ? 'ok' : ['Rejected', 'Cancelled'].includes(booking.status) ? 'no' : '')}</div></a>`).join('') || '<p class="sub">No bookings yet. Requests from the website will appear here.</p>'}</div>
<div><div class="cd glass-card"><div class="ch"><h4>Booking overview</h4></div><div class="ov"><div class="dn" style="background:conic-gradient(#f59e0b 0 ${newPercent}%,#10b981 ${newPercent}% ${acceptedPercent}%,#ef4444 ${acceptedPercent}% ${rejectedPercent}%,rgba(148,163,184,.45) ${rejectedPercent}% 100%)"><div><b>${total}</b><small>Total</small></div></div><div class="lg">${legend('#f59e0b', 'New', n)}${legend('#10b981', 'Accepted', accepted.length)}${legend('#ef4444', 'Rejected', rejected)}${legend('rgba(148,163,184,.75)', 'Other', total - n - accepted.length - rejected)}</div></div></div>
<div class="cd glass-card"><div class="ch"><h4>Fleet and team</h4></div>${fleetRow('fleet', 'b', 'Vehicles', FLEET.length, 'fleet')}${fleetRow('drivers', 'g', 'Drivers available', availableDrivers + ' of ' + DR.length, 'drivers')}${fleetRow('users', 'p', 'User accounts', US.length, 'users')}</div></div></div>`;
    }
  };
}
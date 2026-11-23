export default function createBookingsPage(ctx) {
  return {
    bookings() {
      const { by, head, tile, bd, E, CFG } = ctx;
      const old = by('New').filter(booking => Date.now() - new Date(booking.createdAt) > 2 * 36e5);
      const noShows = by('No-show').length;
      const bookingStatus = CFG.maintenanceMode ? 'Maintenance mode' : CFG.onlineBookings === false ? 'Online bookings paused' : 'Online bookings open';
      return head('Bookings', 'Review requests from the website and manage confirmed trips') +
        `<div class="cd"><div class="row"><h4>Booking controls</h4>${bd(bookingStatus, CFG.maintenanceMode || CFG.onlineBookings === false ? 'no' : 'ok')}</div><p>Minimum notice: ${E(CFG.minNotice ?? 0)} hours · Maximum trip: ${E(CFG.maxDuration ?? 0)} days · Passenger limit: ${E(CFG.maxPassengers ?? 0)}</p><p>Airport notice: ${E(CFG.airportSameDayHours ?? 0)} hours · Buffer: ${E(CFG.buffer ?? 0)} minutes · No-show grace: ${E(CFG.grace ?? 0)} minutes</p></div>` +
        `<div class="g g4">${tile('New requests', '<big>' + by('New').length + '</big>', 'new')}${tile('Accepted', '<big>' + by('Accepted').length + '</big>', 'accepted', 'green')}${tile('Rejected', '<big>' + by('Rejected').length + '</big>', 'rejected', 'red')}${tile('Completed / cancelled', '<big>' + (by('Completed').length + by('Cancelled').length) + '</big>', 'history')}${tile('No-shows', '<big>' + noShows + '</big>', 'history', 'red')}</div><div class="cd"><h4>Needs attention</h4>${old.map(booking => `<p>${bd('Waiting 2h+')} ${E(booking.id)} ${E(booking.name)} · ${E(booking.pickup)} to ${E(booking.dropoff)}</p>`).join('') || '<p>Nothing waiting.</p>'}</div>`;
    },
    new() {
      const { head, T, by, E, when, LKR } = ctx;
      return head('New requests', by('New').length + ' waiting for a decision') + T(['Booking ID', 'Customer', 'Mobile', 'From', 'To', 'Type', 'Vehicle', 'Pickup', 'Fare', 'Action'], by('New').map(booking => `<tr data-go="booking/${E(booking.id)}"><td>${E(booking.id)}</td><td>${E(booking.name)}</td><td>${E(booking.phone)}</td><td>${E(booking.pickup)}</td><td>${E(booking.dropoff)}</td><td>${E(booking.type || '—')}</td><td>${E(booking.vehicle || '—')}</td><td>${when(booking)}</td><td>${LKR(booking.fare)}</td><td><button class="btn g s">Accept</button> <button class="btn r s" data-dec="${E(booking.id)}">Decline</button></td></tr>`).join(''));
    },
    accepted() {
      const { head, T, by, E, when, bd } = ctx;
      return head('Accepted requests', by('Accepted').length + ' confirmed trips') + T(['Booking ID', 'Customer', 'From', 'To', 'Vehicle', 'Pickup', 'Driver', 'Status'], by('Accepted').map(booking => `<tr data-go="booking/${E(booking.id)}"><td>${E(booking.id)}</td><td>${E(booking.name)}</td><td>${E(booking.pickup)}</td><td>${E(booking.dropoff)}</td><td>${E(booking.vehicle || '—')}</td><td>${when(booking)}</td><td>${E(booking.driver || 'Not assigned')}</td><td>${booking.driver ? bd('Confirmed', 'ok') : bd('Assign driver')}</td></tr>`).join(''));
    },
    history() {
      const { BK, head, T, E, when, LKR, bd } = ctx;
      const bookings = BK.filter(booking => ['Completed', 'Cancelled', 'No-show'].includes(booking.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return head('Trip history', bookings.length + ' completed, cancelled, or no-show trips') + T(['Booking ID', 'Customer', 'From', 'To', 'Vehicle', 'Pickup', 'Driver', 'Fare', 'Cancellation fee', 'Status'], bookings.map(booking => `<tr data-go="booking/${E(booking.id)}"><td>${E(booking.id)}</td><td>${E(booking.name)}</td><td>${E(booking.pickup)}</td><td>${E(booking.dropoff)}</td><td>${E(booking.vehicle || '—')}</td><td>${when(booking)}</td><td>${E(booking.driver || '—')}</td><td>${LKR(booking.fare)}</td><td>${booking.status == 'Cancelled' ? `${E(booking.cancellationFeePercent || 0)}% · ${LKR(booking.cancellationFee || 0)}` : '—'}</td><td>${bd(booking.status, booking.status == 'Completed' ? 'in' : 'no')}</td></tr>`).join(''));
    },
    rejected() {
      const { head, T, by, E, bd, CFG } = ctx;
      return head('Rejected requests', by('Rejected').length + ' declined') + T(['Booking ID', 'Customer', 'Mobile', 'From', 'To', 'Vehicle', 'Reason', 'Status notifications'], by('Rejected').map(booking => `<tr><td>${E(booking.id)}</td><td>${E(booking.name)}</td><td>${E(booking.phone)}</td><td>${E(booking.pickup)}</td><td>${E(booking.dropoff)}</td><td>${E(booking.vehicle || '—')}</td><td>${E(booking.reason || '—')}</td><td>${bd(CFG.statusNotifications === false ? 'Disabled' : 'On status change', CFG.statusNotifications === false ? 'no' : 'ok')}</td></tr>`).join(''));
    },
    booking(id) {
      const { BK, head, E, bd, when, DR, FLEET, PAYS, LKR, CFG } = ctx;
      const booking = BK.find(item => item.id == id);
      if (!booking) return head('Not found', '');
      const options = (values, selected) => values.map(value => `<option ${value == selected ? 'selected' : ''}>${E(value)}</option>`).join('');
      const pickupAt = booking.date ? new Date(`${booking.date}T${booking.time || '00:00'}:00+05:30`).getTime() : NaN;
      const hoursUntilPickup = (pickupAt - Date.now()) / 3600000;
      const cancellationPercent = hoursUntilPickup >= 48 ? CFG.cancelFee48 : hoursUntilPickup >= 24 ? CFG.cancelFee24 : CFG.cancelFeeUnder24;
      const canMarkNoShow = booking.status == 'Accepted' && Date.now() >= pickupAt + Number(CFG.grace || 0) * 60000;
      const feeEstimate = booking.status == 'Cancelled'
        ? `${E(booking.cancellationFeePercent || 0)}% · ${LKR(booking.cancellationFee || 0)}`
        : `${E(cancellationPercent ?? 0)}% · ${LKR((Number(booking.fare) || 0) * (Number(cancellationPercent) || 0) / 100)}`;
      const statusClass = booking.status == 'Accepted' ? 'ok' : ['Rejected', 'Cancelled', 'No-show'].includes(booking.status) ? 'no' : booking.status == 'Completed' ? 'in' : '';
      return head('Booking ' + E(booking.id), bd(booking.status, statusClass) + ' Received ' + new Date(booking.createdAt).toLocaleString() + ' via website') +
        `<div class="two"><div class="cd"><h4>Trip</h4><p>${E(booking.pickup)} → ${E(booking.dropoff)} · ${when(booking)}</p><p>Passengers ${E(booking.passengers)}${booking.nationality ? ' · Nationality ' + E(booking.nationality) : ''}</p>${booking.service ? `<p>Service: ${E(booking.service)}</p>` : ''}${booking.flight ? `<p>Flight: ${E(booking.flight)}</p>` : ''}<p>Special request: ${E(booking.requests || 'none')}</p><p>Cancellation fee ${booking.status == 'Cancelled' ? 'charged' : 'estimate'}: <b>${feeEstimate}</b></p>${booking.status == 'No-show' && booking.noShowAt ? `<p>No-show recorded ${E(new Date(booking.noShowAt).toLocaleString())}</p>` : ''}<hr><h4 style="margin-top:12px">Customer</h4><p>${E(booking.name)} · ${E(booking.phone)} · ${E(booking.email)}</p><hr><h4 style="margin-top:12px">Fare</h4><div class="row"><p>${E(booking.vehicle || booking.type || 'Vehicle not chosen')}</p><b>${LKR(booking.fare)}</b></div><label>Distance (km)<input id="dist" type="number" min="0" step="0.1" value="${E(booking.distanceKm ?? '')}"></label><label>Waiting time (hours)<input id="waitHrs" type="number" min="0" step="0.25" value="${E(booking.waitingHours || 0)}"></label><button class="btn o" style="width:100%;margin-top:10px" data-quote="${E(booking.id)}">Calculate fare from settings</button><label>Quoted fare (${E(CFG.currency || 'LKR')})<input id="fa" type="number" min="0" value="${E(booking.fare || '')}"></label></div>
<div class="cd"><h4>Assign</h4><select id="dr"><option value="">Driver…</option>${options(DR.filter(driver => driver.status == 'Available' || driver.name == booking.driver).map(driver => driver.name), booking.driver)}</select><br><br><select id="ve"><option value="">Vehicle…</option>${options(FLEET.map(vehicle => vehicle.name + ' · ' + vehicle.plate), booking.vehicle)}</select><br><br><select id="pm"><option value="">Payment type…</option>${options(PAYS, booking.payment)}</select><br><br><button class="btn g" style="width:100%" data-acc="${E(booking.id)}">Accept and notify</button><br><br><button class="btn r" style="width:100%" data-dec="${E(booking.id)}">Decline with reason</button><br><br><button class="btn o" style="width:100%" data-sv="${E(booking.id)}">Save driver, vehicle and payment</button>${booking.status == 'Accepted' ? `<br><br><button class="btn" style="width:100%" data-done="${E(booking.id)}">Mark trip completed</button><br><br><button class="btn r" style="width:100%" data-can="${E(booking.id)}">Cancel trip</button>${canMarkNoShow ? `<br><br><button class="btn r" style="width:100%" data-noshow="${E(booking.id)}">Mark no-show</button>` : ''}` : ''}</div></div>`;
    }
  };
}

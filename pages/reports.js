export default function createReportsPage(ctx) {
  return {
    reports() {
      const { head, tile } = ctx;
      const reports = [['Booking report', 'report'], ['Sales report', 'sales'], ['Payment mode summary', 'paymode'], ['Cash and flow'], ['Refund report'], ['Driver report', 'driverrep'], ['Vehicle utilisation'], ['Customer report', 'customer']];
      return head('Reports', 'Choose a report, set a date range, then print or export') + `<div class="g g4">${reports.map(report => report[1] ? tile(report[0], 'Open ›', report[1], 'aqua glass-lift') : `<a class="tile aqua glass-lift" onclick="alert('${report[0]}: coming soon')"><h3>${report[0]}</h3><p>Open ›</p></a>`).join('')}</div>`;
    },
    report() {
      const { BK, inR, setExport, RH, RFBAR, T, E, bd, when, SB } = ctx;
      const bookings = BK.filter(inR);
      const count = status => bookings.filter(booking => booking.status === status).length;
      const report = { name: 'booking-report', head: ['Booking ID', 'Customer', 'Mobile', 'From', 'To', 'Vehicle', 'Pickup', 'Status'], rows: bookings.map(booking => [booking.id, booking.name, booking.phone, booking.pickup, booking.dropoff, booking.vehicle || '', booking.date + ' ' + booking.time, booking.status]) };
      setExport(report);
      return RH('Booking report', 'All website bookings') + RFBAR() + `<div class="g g5">${[['Total bookings', bookings.length], ['Accepted', count('Accepted')], ['Rejected', count('Rejected')], ['Cancelled', count('Cancelled')], ['Completed', count('Completed')], ['No-shows', count('No-show')]].map(SB).join('')}</div>` + T(report.head, bookings.map(booking => `<tr class="glass-row"><td>${E(booking.id)}</td><td>${E(booking.name)}</td><td>${E(booking.phone)}</td><td>${E(booking.pickup)}</td><td>${E(booking.dropoff)}</td><td>${E(booking.vehicle || '—')}</td><td>${when(booking)}</td><td>${bd(booking.status, booking.status == 'Accepted' || booking.status == 'Completed' ? 'ok' : ['Rejected', 'Cancelled', 'No-show'].includes(booking.status) ? 'no' : '')}</td></tr>`).join(''));
    },
    sales() {
      const { paid, fareOf, plateOf, setExport, RH, RFBAR, LKR, SB, T, trw, E, fdt, payBd } = ctx;
      const bookings = paid();
      const total = bookings.reduce((sum, booking) => sum + fareOf(booking), 0);
      const sumByPayment = payment => bookings.filter(booking => booking.payment == payment).reduce((sum, booking) => sum + fareOf(booking), 0);
      const report = { name: 'sales-report', head: ['Booking ID', 'Date', 'Vehicle number', 'Cash / Card', 'Price'], rows: bookings.map(booking => [booking.id, booking.date, plateOf(booking), booking.payment || '', fareOf(booking)]) };
      setExport(report);
      return RH('Sales report', 'Accepted and completed bookings') + RFBAR() + `<div class="g g5">${[['Total sales', LKR(total)], ['Bookings', bookings.length], ['Cash', LKR(sumByPayment('Cash'))], ['Card', LKR(sumByPayment('Card'))], ['Online transfer', LKR(sumByPayment('Online transfer'))]].map(SB).join('')}</div>` + T(report.head, bookings.length ? bookings.map(booking => trw([E(booking.id), fdt(booking.date), E(plateOf(booking)), payBd(booking.payment), LKR(fareOf(booking))])).join('') + `<tr class="tot glass-row"><td>Total</td><td></td><td></td><td></td><td>${LKR(total)}</td></tr>` : '');
    },
    paymode() {
      const { paid, PAYS, setExport, RH, RFBAR, SB, T, trw, E, fdt, payBd } = ctx;
      const bookings = paid();
      const count = payment => bookings.filter(booking => booking.payment == payment).length;
      const report = { name: 'payment-mode-summary', head: ['Booking ID', 'Date', 'Payment type'], rows: bookings.map(booking => [booking.id, booking.date, booking.payment || '']) };
      setExport(report);
      return RH('Payment mode summary', 'Payment type for each accepted or completed booking') + RFBAR() + `<div class="g g4">${[['Card', count('Card')], ['Cash', count('Cash')], ['Online transfer', count('Online transfer')], ['Not set', bookings.filter(booking => !PAYS.includes(booking.payment)).length]].map(SB).join('')}</div>` + T(report.head, bookings.map(booking => trw([E(booking.id), fdt(booking.date), payBd(booking.payment)])).join(''));
    },
    driverrep() {
      const { paid, drvId, fareOf, E, LKR, gtr, trw, nice, setExport, RH, RFBAR, SB, T } = ctx;
      const bookings = paid().filter(booking => booking.driver);
      const groups = {};
      bookings.forEach(booking => {
        const id = drvId(booking);
        const key = id + '|' + booking.driver;
        (groups[key] = groups[key] || { id, name: booking.driver, trips: [] }).trips.push(booking);
      });
      const drivers = Object.values(groups).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const rows = [];
      let html = '';
      drivers.forEach(driver => {
        const allocated = driver.trips.reduce((sum, booking) => sum + fareOf(booking), 0);
        html += gtr([E(driver.id), E(driver.name), LKR(allocated), driver.trips.length + (driver.trips.length == 1 ? ' trip' : ' trips'), '', '', '']);
        driver.trips.forEach(booking => {
          html += trw(['', '', '', LKR(fareOf(booking)), E(booking.pickup), E(booking.dropoff), E(nice(booking.name))]);
          rows.push([driver.id, driver.name, allocated, fareOf(booking), booking.pickup, booking.dropoff, nice(booking.name)]);
        });
      });
      const report = { name: 'driver-report', head: ['Driver ID', 'Driver name', 'Allocated amount', 'Trip (amount)', 'From', 'To', 'Customer'], rows };
      setExport(report);
      return RH('Driver report', 'Allocated amount and trips for each driver') + RFBAR() + `<div class="g g4">${[['Drivers', drivers.length], ['Trips', bookings.length], ['Total allocated', LKR(bookings.reduce((sum, booking) => sum + fareOf(booking), 0))]].map(SB).join('')}</div>` + T(report.head, html);
    },
    customer() {
      const { custMap, BK, inR, cn, nice, E, gtr, fdt, trw, setExport, RH, RFBAR, SB, T } = ctx;
      const customerIds = custMap();
      const bookings = BK.filter(inR).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const groups = {};
      bookings.forEach(booking => {
        const key = cn(booking.name);
        if (!key)
          return;
        (groups[key] = groups[key] || { key, name: nice(booking.name), trips: [] }).trips.push(booking);
      });
      const customers = Object.values(groups).sort((a, b) => customerIds[a.key].localeCompare(customerIds[b.key]));
      const rows = [];
      let html = '';
      customers.forEach(customer => {
        html += gtr([customerIds[customer.key], E(customer.name), customer.trips.length, '', '', '', '']);
        customer.trips.forEach(booking => {
          html += trw(['', '', '', fdt(booking.date), E(booking.pickup), E(booking.dropoff), E(booking.driver || '—')]);
          rows.push([customerIds[customer.key], customer.name, customer.trips.length, booking.date, booking.pickup, booking.dropoff, booking.driver || '']);
        });
      });
      const report = { name: 'customer-report', head: ['Customer ID', 'Customer name', 'Trips requested', 'Date', 'From', 'To', 'Driver'], rows };
      setExport(report);
      return RH('Customer report', 'Trips requested by each customer (same first and last name)') + RFBAR() + `<div class="g g4">${[['Customers', customers.length], ['Trips requested', bookings.length], ['Repeat customers', customers.filter(customer => customer.trips.length > 1).length]].map(SB).join('')}</div>` + T(report.head, html);
    }
  };
}
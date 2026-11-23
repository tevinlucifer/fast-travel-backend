export default function createAnalyticsPage(ctx) {
  return {
    analytics() {
      const { BK, E, head, LKR, by, CFG } = ctx;
      const monthly = {};
      BK.forEach(booking => {
        const month = booking.createdAt.slice(0, 7);
        monthly[month] = (monthly[month] || 0) + 1;
      });
      const months = Object.keys(monthly).sort().slice(-6);
      const max = Math.max(1, ...months.map(month => monthly[month]));
      const destinations = {};
      BK.forEach(booking => destinations[booking.dropoff] = (destinations[booking.dropoff] || 0) + 1);
      const topDestinations = Object.entries(destinations).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const revenue = by('Accepted').reduce((sum, booking) => sum + (+booking.fare || 0), 0);
      const noShows = by('No-show').length;
      return head('Analytics', 'Bookings from the website') +
        `<div class="g g4"><div class="st glass-card glass-lift"><small>Bookings</small><b>${BK.length}</b></div><div class="st glass-card glass-lift"><small>Revenue (accepted)</small><b>${LKR(revenue)}</b></div><div class="st glass-card glass-lift"><small>No-shows</small><b>${noShows}</b></div><div class="st glass-card glass-lift"><small>Cancellation fee policy</small><b>${E(CFG.cancelFee48 ?? 0)}% / ${E(CFG.cancelFee24 ?? 0)}% / ${E(CFG.cancelFeeUnder24 ?? 0)}%</b></div></div>` +
        `<div class="cd glass-card"><h4>Configured rates (${E(CFG.currency || 'LKR')} per km)</h4><p>Sedan ${LKR(CFG.rateSedan)} · SUV ${LKR(CFG.rateSUV)} · KDH ${LKR(CFG.rateKDH)} · Hatchback ${LKR(CFG.rateHatch)}</p><p>Base fare ${LKR(CFG.baseFare)} · Minimum fare ${LKR(CFG.minimumFare)} · Booking fee ${LKR(CFG.bookingFee)}</p></div>` +
        `<div class="two"><div class="cd glass-card"><h4>Bookings per month</h4><div class="bars glass-bars">${months.map(month => `<div><i class="glass-bar-col" style="height:${monthly[month] / max * 170}px"></i>${month.slice(5)}/${month.slice(2, 4)} (${monthly[month]})</div>`).join('') || 'No data yet'}</div></div><div class="cd glass-card"><h4>Top destinations</h4>${topDestinations.map(destination => `<p>${E(destination[0])}<div class="bar glass-bar-row" style="width:${destination[1] / topDestinations[0][1] * 100}%"></div></p>`).join('')}</div></div>`;
    }
  };
}
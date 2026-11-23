export default function createFleetPage(ctx) {
  return {
    fleet() {
      const { FLEET, head, T, E, CFG } = ctx;
      const types = { Sedan: 'Sedan Cars', SUV: 'SUV', KDH: 'KDH', Hatchback: 'Hatchback' };
      return head('Fleet', FLEET.length + ' vehicles', '<button class="btn" id="addVe">+ Add vehicle</button>') +
        `<div class="cd"><h4>Booking capacity rules</h4><p>Global limit: ${E(CFG.maxPassengers ?? '—')} passengers per booking</p><p>Category occupancy limits: ${E(CFG.vehicleOccupancyLimits || 'Not set')}</p><p>Per-day category caps: ${E(CFG.vehicleCounts || 'Not set')}</p></div>` +
        T(['Vehicle', 'Type', 'Plate', 'Colour', 'Seats', 'A/C', 'Action'], FLEET.map(vehicle => `<tr><td>${E(vehicle.name)}<br><small>${E(vehicle.model || '')}</small></td><td>${E(types[vehicle.type] || vehicle.type)}</td><td>${E(vehicle.plate)}</td><td>${E(vehicle.color || '—')}</td><td>${E(vehicle.seats || '—')}</td><td>${E(vehicle.ac || '—')}</td><td><button class="btn o s" data-edv="${E(vehicle.id)}">Edit</button> <button class="btn r s" data-rmv="${E(vehicle.id)}">Remove</button></td></tr>`).join(''));
    }
  };
}

export default function createDriversPage(ctx) {
  return {
    drivers() {
      const { DR, head, T, E, CFG } = ctx;
      const count = status => DR.filter(driver => driver.status == status).length;
      return head('Drivers', DR.length + ' registered · ' + count('Available') + ' available · ' + count('Unavailable') + ' unavailable · ' + count('On trip') + ' on trip', '<button class="btn" id="addDr">+ Add driver</button>') +
        `<div class="cd"><h4>Driver availability rules</h4><p>${E(CFG.driverAvailabilityRules || 'No additional availability rules configured.')}</p><p>Only drivers marked Available can be assigned to new accepted trips.</p></div>` +
        T(['Name', 'Phone', 'City', 'Licence', 'Availability', 'Since', 'Action'], DR.map(driver => `<tr><td>${E(driver.name)}</td><td>${E(driver.phone)}</td><td>${E(driver.city || '—')}</td><td>${E(driver.license || '—')}</td><td><div class="sb">${['Available', 'Unavailable', 'On trip'].map(status => `<button class="${status.replace(' ', '')} ${driver.status == status ? 'on' : ''}" data-st="${status}" data-id="${E(driver.id)}">${status}</button>`).join('')}</div></td><td>${new Date(driver.updatedAt).toLocaleString()}</td><td><button class="btn o s" data-edd="${E(driver.id)}">Edit</button> <button class="btn r s" data-rmd="${E(driver.id)}">Remove</button></td></tr>`).join(''));
    }
  };
}

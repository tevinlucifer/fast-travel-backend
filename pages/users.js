export default function createUsersPage(ctx) {
  return {
    users() {
      const { US, head, T, E, bd } = ctx;
      return head('Users and roles', US.length + ' accounts', '<button class="btn" id="addUs">+ Add user</button>') + T(['Name', 'Email', 'Phone', 'Role', 'Status', 'Action'], US.map(user => `<tr><td>${E(user.name)}</td><td>${E(user.email)}</td><td>${E(user.phone || '—')}</td><td>${bd(user.role, 'in')}</td><td>${bd(user.status, user.status == 'Active' ? 'ok' : 'no')}</td><td><button class="btn o s" data-edu="${E(user.id)}">Edit</button> <button class="btn r s" data-rmu="${E(user.id)}">Remove</button></td></tr>`).join(''));
    }
  };
}

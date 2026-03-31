const { ROLE } = require('./system');

const AUTH_ACCENT_COLORS = {
  [ROLE.STUDENT]: '#146356',
  [ROLE.TEACHER]: '#1d4d8f',
  [ROLE.ADMIN]: '#8d5b2d'
};

const AUTH_DEFAULT_PASSWORDS = {
  [ROLE.STUDENT]: 'student123',
  [ROLE.TEACHER]: 'teacher123',
  [ROLE.ADMIN]: 'admin123'
};

function getRoleColor(role) {
  return AUTH_ACCENT_COLORS[role] || AUTH_ACCENT_COLORS[ROLE.STUDENT];
}

module.exports = {
  AUTH_DEFAULT_PASSWORDS,
  AUTH_ACCENT_COLORS,
  getRoleColor
};

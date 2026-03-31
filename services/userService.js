const { query } = require('../config/database');
const { getRoleLabel, ROLE } = require('../utils/system');

async function getSessionUser(userId) {
  const rows = await query(
    `
      SELECT
        users.id,
        users.username,
        users.role,
        users.full_name,
        users.email,
        users.phone,
        users.avatar_color,
        users.status,
        students.id AS student_profile_id,
        students.student_no,
        classes.class_name,
        classes.class_code,
        majors.name AS major_name,
        departments.name AS student_department_name,
        teachers.id AS teacher_profile_id,
        teachers.teacher_no,
        teachers.title,
        teacher_departments.name AS teacher_department_name,
        admins.id AS admin_profile_id,
        admins.admin_no,
        admins.position
      FROM users
      LEFT JOIN students ON students.user_id = users.id
      LEFT JOIN classes ON classes.id = students.class_id
      LEFT JOIN majors ON majors.id = classes.major_id
      LEFT JOIN departments ON departments.id = majors.department_id
      LEFT JOIN teachers ON teachers.user_id = users.id
      LEFT JOIN departments AS teacher_departments ON teacher_departments.id = teachers.department_id
      LEFT JOIN admins ON admins.user_id = users.id
      WHERE users.id = ?
      LIMIT 1
    `,
    [userId]
  );

  const user = rows[0];

  if (!user) {
    return null;
  }

  if (user.role === ROLE.STUDENT) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      avatarColor: user.avatar_color,
      status: user.status,
      profileId: user.student_profile_id,
      identityCode: user.student_no,
      meta: [user.major_name, user.class_name, user.student_department_name].filter(Boolean).join(' · ')
    };
  }

  if (user.role === ROLE.TEACHER) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      avatarColor: user.avatar_color,
      status: user.status,
      profileId: user.teacher_profile_id,
      identityCode: user.teacher_no,
      meta: [user.title, user.teacher_department_name].filter(Boolean).join(' · ')
    };
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    avatarColor: user.avatar_color,
    status: user.status,
    profileId: user.admin_profile_id,
    identityCode: user.admin_no,
    meta: user.position || `${getRoleLabel(ROLE.ADMIN)}账号`
  };
}

async function refreshSessionUser(req) {
  if (!req.session.user) {
    return null;
  }

  const sessionUser = await getSessionUser(req.session.user.id);
  req.session.user = sessionUser;
  return sessionUser;
}

module.exports = {
  getSessionUser,
  refreshSessionUser
};

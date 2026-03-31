const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { refreshSessionUser } = require('../services/userService');

const router = express.Router();

async function getProfileDetail(userId) {
  const rows = await query(
    `
      SELECT
        users.id,
        users.username,
        users.role,
        users.full_name,
        users.email,
        users.phone,
        users.status,
        students.student_no,
        students.gender,
        students.entry_year,
        students.birth_date,
        students.address,
        students.credits_required,
        classes.class_name,
        majors.name AS major_name,
        student_departments.name AS student_department_name,
        teachers.teacher_no,
        teachers.gender AS teacher_gender,
        teachers.birth_date AS teacher_birth_date,
        teachers.address AS teacher_address,
        teachers.title,
        teachers.office_location,
        teachers.specialty_text,
        teacher_departments.name AS teacher_department_name,
        admins.admin_no,
        admins.position
      FROM users
      LEFT JOIN students ON students.user_id = users.id
      LEFT JOIN classes ON classes.id = students.class_id
      LEFT JOIN majors ON majors.id = classes.major_id
      LEFT JOIN departments AS student_departments ON student_departments.id = majors.department_id
      LEFT JOIN teachers ON teachers.user_id = users.id
      LEFT JOIN departments AS teacher_departments ON teacher_departments.id = teachers.department_id
      LEFT JOIN admins ON admins.user_id = users.id
      WHERE users.id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0];
}

router.get('/', requireAuth, async (req, res) => {
  const profile = await getProfileDetail(req.session.user.id);

  return res.render('pages/profile', {
    pageTitle: '个人资料',
    profile
  });
});

router.post('/', requireAuth, async (req, res) => {
  const {
    full_name,
    email,
    phone,
    gender,
    birth_date,
    address,
    office_location,
    specialty_text,
    position
  } = req.body;
  const currentUser = req.session.user;

  if (!full_name) {
    req.flash('danger', '姓名不能为空。');
    return res.redirect('/profile');
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE users
        SET full_name = ?, email = ?, phone = ?
        WHERE id = ?
      `,
      [full_name.trim(), email?.trim() || null, phone?.trim() || null, currentUser.id]
    );

    if (currentUser.role === 'student') {
      await connection.execute(
        `
          UPDATE students
          SET gender = ?, birth_date = ?, address = ?
          WHERE id = ?
        `,
        [gender || null, birth_date || null, address?.trim() || null, currentUser.profileId]
      );
    }

    if (currentUser.role === 'teacher') {
      await connection.execute(
        `
          UPDATE teachers
          SET gender = ?,
              birth_date = ?,
              address = ?,
              office_location = ?,
              specialty_text = ?
          WHERE id = ?
        `,
        [
          gender || null,
          birth_date || null,
          address?.trim() || null,
          office_location?.trim() || null,
          specialty_text?.trim() || null,
          currentUser.profileId
        ]
      );
    }

    if (currentUser.role === 'admin') {
      await connection.execute(
        `
          UPDATE admins
          SET position = ?
          WHERE id = ?
        `,
        [position?.trim() || null, currentUser.profileId]
      );
    }
  });

  await refreshSessionUser(req);

  req.flash('success', '个人资料已更新。');
  return res.redirect('/profile');
});

router.post('/password', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const currentUser = req.session.user;

  if (!current_password || !new_password || !confirm_password) {
    req.flash('danger', '请完整填写密码修改表单。');
    return res.redirect('/profile');
  }

  if (new_password.length < 6) {
    req.flash('danger', '新密码长度不能少于 6 位。');
    return res.redirect('/profile');
  }

  if (new_password !== confirm_password) {
    req.flash('danger', '两次输入的新密码不一致。');
    return res.redirect('/profile');
  }

  const users = await query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [currentUser.id]);
  const user = users[0];
  const matched = await bcrypt.compare(current_password, user.password_hash);

  if (!matched) {
    req.flash('danger', '当前密码输入不正确。');
    return res.redirect('/profile');
  }

  const passwordHash = await bcrypt.hash(new_password, 10);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, currentUser.id]);

  req.flash('success', '密码修改成功，请妥善保管。');
  return res.redirect('/profile');
});

module.exports = router;

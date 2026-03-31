const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { getPagination, buildPagination } = require('../utils/pagination');
const { ROLE } = require('../utils/system');

const router = express.Router();

function buildAccessClause(currentUser) {
  if (currentUser.role === ROLE.ADMIN) {
    return {
      whereClause: '1 = 1',
      params: []
    };
  }

  const filters = ['announcements.target_role IN ("all", ?)'];
  const params = [currentUser.role];

  if (currentUser.role === ROLE.STUDENT) {
    filters.push('(announcements.target_student_id IS NULL OR announcements.target_student_id = ?)');
    params.push(currentUser.profileId);
  } else {
    filters.push('announcements.target_student_id IS NULL');
  }

  return {
    whereClause: filters.join(' AND '),
    params
  };
}

router.get('/', requireAuth, async (req, res) => {
  const currentUser = req.session.user;
  const { keyword = '', priority = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 6);
  const access = buildAccessClause(currentUser);
  const filters = [access.whereClause];
  const params = [...access.params];

  if (keyword) {
    filters.push('(announcements.title LIKE ? OR announcements.content LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (priority) {
    filters.push('announcements.priority = ?');
    params.push(priority);
  }

  const whereClause = filters.join(' AND ');

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM announcements
      WHERE ${whereClause}
    `,
    params
  );

  const announcements = await query(
    `
      SELECT
        announcements.*,
        users.full_name AS publisher_name
      FROM announcements
      LEFT JOIN users ON users.id = announcements.published_by
      WHERE ${whereClause}
      ORDER BY
        CASE announcements.priority
          WHEN '紧急' THEN 1
          WHEN '重要' THEN 2
          ELSE 3
        END,
        announcements.published_at DESC,
        announcements.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/announcements', {
    pageTitle: '公告中心',
    announcements,
    filters: { keyword, priority },
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/:announcementId', requireAuth, async (req, res) => {
  const currentUser = req.session.user;
  const access = buildAccessClause(currentUser);
  const rows = await query(
    `
      SELECT
        announcements.*,
        users.full_name AS publisher_name,
        students.student_no
      FROM announcements
      LEFT JOIN users ON users.id = announcements.published_by
      LEFT JOIN students ON students.id = announcements.target_student_id
      WHERE announcements.id = ?
        AND ${access.whereClause}
      LIMIT 1
    `,
    [Number(req.params.announcementId), ...access.params]
  );

  const announcement = rows[0];

  if (!announcement) {
    return res.status(404).render('pages/errors/404', {
      layout: 'layout',
      pageTitle: '公告不存在'
    });
  }

  const backHref =
    typeof req.query.back === 'string' && req.query.back.startsWith('/') ? req.query.back : '/announcements';

  return res.render('pages/announcement-detail', {
    pageTitle: announcement.category === '学业预警' ? '学业预警详情' : '公告详情',
    announcement,
    backHref
  });
});

module.exports = router;

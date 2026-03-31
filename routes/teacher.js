const express = require('express');
const { query, withTransaction } = require('../config/database');
const { requireRoles } = require('../middlewares/auth');
const { getTerms } = require('../services/referenceService');
const { recalculateSectionGrades } = require('../services/gradeService');
const { getPagination, buildPagination } = require('../utils/pagination');
const { calculateTotalScore } = require('../utils/score');
const { buildScheduleGrid } = require('../utils/schedule');
const {
  ENROLLMENT_STATUS,
  GRADE_STATUS
} = require('../utils/system');

const router = express.Router();

function getSafeTeacherReturnPath(value, fallback) {
  if (typeof value === 'string' && value.startsWith('/teacher/')) {
    return value;
  }

  return fallback;
}

router.use(requireRoles('teacher'));

function parseOptionalScore(value) {
  if (value === '' || value === undefined || value === null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

router.get('/sections', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const terms = await getTerms();
  const { keyword = '', term_id = '', status = '', course_type = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 6);

  const filters = ['course_sections.teacher_id = ?'];
  const params = [teacherId];

  if (keyword) {
    filters.push('(courses.course_name LIKE ? OR courses.course_code LIKE ? OR course_sections.section_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (term_id) {
    filters.push('course_sections.term_id = ?');
    params.push(Number(term_id));
  }

  if (status) {
    filters.push('course_sections.selection_status = ?');
    params.push(status);
  }

  if (course_type) {
    filters.push('courses.course_type = ?');
    params.push(course_type);
  }

  const whereClause = filters.join(' AND ');

  const countRows = await query(
    `
      SELECT COUNT(DISTINCT course_sections.id) AS total
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      WHERE ${whereClause}
    `,
    params
  );

  const sections = await query(
    `
      SELECT
        course_sections.*,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        terms.name AS term_name,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.label,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND grades.status = '${GRADE_STATUS.PUBLISHED}' THEN 1 END) AS published_count
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
      GROUP BY course_sections.id
      ORDER BY terms.start_date DESC, time_slots.weekday ASC, time_slots.start_period ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/teacher/sections', {
    pageTitle: '教学任务',
    sections,
    terms,
    filters: { keyword, term_id, status, course_type },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/sections/:sectionId', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const sectionId = Number(req.params.sectionId);
  const { keyword = '' } = req.query;
  const backHref = getSafeTeacherReturnPath(req.query.return_to, '/teacher/sections');
  const { page, pageSize, offset } = getPagination(req.query, 6);

  const sectionRows = await query(
    `
      SELECT
        course_sections.*,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.assessment_method,
        terms.name AS term_name,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.label,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      WHERE course_sections.id = ?
        AND course_sections.teacher_id = ?
      LIMIT 1
    `,
    [sectionId, teacherId]
  );

  const section = sectionRows[0];

  if (!section) {
    return res.status(404).render('pages/errors/404', {
      layout: 'layout'
    });
  }

  const summaryRows = await query(
    `
      SELECT
        COUNT(*) AS student_count,
        COUNT(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' THEN 1 END) AS published_count,
        COUNT(CASE WHEN grades.id IS NULL OR grades.status = '${GRADE_STATUS.PENDING}' THEN 1 END) AS pending_count,
        COUNT(CASE WHEN grades.total_score IS NULL THEN 1 END) AS missing_total_count,
        ROUND(AVG(CASE WHEN grades.total_score IS NOT NULL THEN grades.total_score END), 1) AS average_score
      FROM enrollments
      INNER JOIN students ON students.id = enrollments.student_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.section_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
    `,
    [sectionId]
  );

  const evaluationSummaryRows = await query(
    `
      SELECT
        ROUND(COALESCE(AVG(teaching_evaluations.rating), 0), 1) AS average_rating,
        COUNT(*) AS evaluation_count
      FROM teaching_evaluations
      WHERE teaching_evaluations.section_id = ?
    `,
    [sectionId]
  );

  const recentEvaluations = await query(
    `
      SELECT
        teaching_evaluations.rating,
        teaching_evaluations.content,
        teaching_evaluations.created_at,
        users.full_name AS student_name
      FROM teaching_evaluations
      INNER JOIN students ON students.id = teaching_evaluations.student_id
      INNER JOIN users ON users.id = students.user_id
      WHERE teaching_evaluations.section_id = ?
      ORDER BY teaching_evaluations.id DESC
      LIMIT 5
    `,
    [sectionId]
  );

  const filters = ['enrollments.section_id = ?', `enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'`];
  const params = [sectionId];

  if (keyword) {
    filters.push('(students.student_no LIKE ? OR users.full_name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const whereClause = filters.join(' AND ');

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM enrollments
      INNER JOIN students ON students.id = enrollments.student_id
      INNER JOIN users ON users.id = students.user_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
    `,
    params
  );

  const roster = await query(
    `
      SELECT
        enrollments.id AS enrollment_id,
        students.student_no,
        users.full_name AS student_name,
        classes.class_name,
        grades.usual_score,
        grades.final_exam_score,
        grades.total_score,
        grades.grade_point
      FROM enrollments
      INNER JOIN students ON students.id = enrollments.student_id
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN classes ON classes.id = students.class_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
      ORDER BY students.student_no ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/teacher/section-detail', {
    pageTitle: `${section.course_name} 成绩册`,
    section,
    roster,
    filters: { keyword },
    backHref,
    currentUrl: req.originalUrl,
    summary: summaryRows[0] || {},
    evaluationSummary: evaluationSummaryRows[0] || {},
    recentEvaluations,
    hasStudents: Number(summaryRows[0]?.student_count || 0) > 0,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.post('/sections/:sectionId/weights', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const sectionId = Number(req.params.sectionId);
  const usualWeight = Number(req.body.usual_weight);
  const finalWeight = Number(req.body.final_weight);
  const redirectPath = getSafeTeacherReturnPath(req.body.return_to, `/teacher/sections/${sectionId}`);

  if (usualWeight < 0 || finalWeight < 0 || usualWeight + finalWeight !== 100) {
    req.flash('danger', '平时成绩占比与期末成绩占比之和必须为 100%。');
    return res.redirect(redirectPath);
  }

  const sectionRows = await query(
    `
      SELECT id
      FROM course_sections
      WHERE id = ?
        AND teacher_id = ?
      LIMIT 1
    `,
    [sectionId, teacherId]
  );

  if (!sectionRows[0]) {
    req.flash('danger', '课程不存在或不属于当前教师。');
    return res.redirect('/teacher/sections');
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE course_sections
        SET usual_weight = ?, final_weight = ?
        WHERE id = ?
      `,
      [usualWeight, finalWeight, sectionId]
    );
    await recalculateSectionGrades(connection, sectionId, usualWeight, finalWeight);
  });

  return res.redirect(redirectPath);
});
router.post('/enrollments/:enrollmentId/grade', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const enrollmentId = Number(req.params.enrollmentId);
  const usualScore = parseOptionalScore(req.body.usual_score);
  const finalScore = parseOptionalScore(req.body.final_exam_score);
  const sectionId = Number(req.body.section_id);
  const expectsJson = req.get('X-Requested-With') === 'XMLHttpRequest' || req.accepts(['json', 'html']) === 'json';

  if (
    (usualScore !== null && (usualScore < 0 || usualScore > 100)) ||
    (finalScore !== null && (finalScore < 0 || finalScore > 100))
  ) {
    if (expectsJson) {
      return res.status(400).json({ success: false, message: '成绩范围必须在 0 到 100 之间。' });
    }
    return res.redirect(`/teacher/sections/${sectionId}`);
  }

  const rows = await query(
    `
      SELECT
        course_sections.id AS section_id,
        course_sections.usual_weight,
        course_sections.final_weight,
        courses.course_name
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      WHERE enrollments.id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND course_sections.teacher_id = ?
      LIMIT 1
    `,
    [enrollmentId, teacherId]
  );

  const record = rows[0];

  if (!record) {
    if (expectsJson) {
      return res.status(404).json({ success: false, message: '未找到可录入成绩的学生记录。' });
    }
    return res.redirect('/teacher/sections');
  }

  const result = calculateTotalScore(
    usualScore,
    finalScore,
    record.usual_weight,
    record.final_weight
  );

  await query(
    `
      INSERT INTO grades (
        enrollment_id,
        usual_score,
        final_exam_score,
        total_score,
        grade_point,
        letter_grade,
        status,
        teacher_comment
      )
      VALUES (?, ?, ?, ?, ?, ?, '${GRADE_STATUS.PENDING}', NULL)
      ON DUPLICATE KEY UPDATE
        usual_score = VALUES(usual_score),
        final_exam_score = VALUES(final_exam_score),
        total_score = VALUES(total_score),
        grade_point = VALUES(grade_point),
        letter_grade = VALUES(letter_grade),
        status = '${GRADE_STATUS.PENDING}',
        teacher_comment = NULL
    `,
    [
      enrollmentId,
      usualScore,
      finalScore,
      result.totalScore,
      result.gradePoint,
      result.letterGrade
    ]
  );

  if (expectsJson) {
    return res.json({
      success: true,
      message: '成绩记录已保存。',
      data: {
        totalScore: result.totalScore,
        gradePoint: result.gradePoint,
        failed: result.totalScore !== null && Number(result.totalScore) < 60
      }
    });
  }

  return res.redirect(`/teacher/sections/${record.section_id}`);
});

router.post('/sections/:sectionId/publish', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const sectionId = Number(req.params.sectionId);
  const redirectPath = getSafeTeacherReturnPath(req.body.return_to, `/teacher/sections/${sectionId}`);

  const [sectionInfo, publishSummary] = await Promise.all([
    query(
      `
        SELECT courses.course_name
        FROM course_sections
        INNER JOIN courses ON courses.id = course_sections.course_id
        WHERE course_sections.id = ?
          AND course_sections.teacher_id = ?
        LIMIT 1
      `,
      [sectionId, teacherId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT
          COUNT(*) AS total_students,
          COUNT(CASE WHEN grades.total_score IS NOT NULL THEN 1 END) AS publishable_count
        FROM enrollments
        LEFT JOIN grades ON grades.enrollment_id = enrollments.id
        WHERE enrollments.section_id = ?
          AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
      `,
      [sectionId]
    ).then((rows) => rows[0] || null)
  ]);

  if (!sectionInfo) {
    return res.redirect('/teacher/sections');
  }

  if (!publishSummary?.total_students) {
    return res.redirect(redirectPath);
  }

  if (!Number(publishSummary.publishable_count || 0)) {
    return res.redirect(redirectPath);
  }

  await query(
    `
      UPDATE grades
      INNER JOIN enrollments ON enrollments.id = grades.enrollment_id
      SET grades.status = '${GRADE_STATUS.PUBLISHED}'
      WHERE enrollments.section_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND grades.total_score IS NOT NULL
    `,
    [sectionId]
  );

  req.flash('success', `${sectionInfo.course_name} 成绩已发布`);
  return res.redirect(redirectPath);
});
router.get('/evaluations', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const { keyword = '', section_id = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 6);
  const sections = await query(
    `
      SELECT
        course_sections.id,
        course_sections.section_code,
        courses.course_name
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      WHERE course_sections.teacher_id = ?
      ORDER BY course_sections.term_id DESC, course_sections.id DESC
    `,
    [teacherId]
  );

  const filters = ['teaching_evaluations.teacher_id = ?'];
  const params = [teacherId];

  if (keyword) {
    filters.push('(courses.course_name LIKE ? OR users.full_name LIKE ? OR course_sections.section_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (section_id) {
    filters.push('teaching_evaluations.section_id = ?');
    params.push(Number(section_id));
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM teaching_evaluations
      INNER JOIN students ON students.id = teaching_evaluations.student_id
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN course_sections ON course_sections.id = teaching_evaluations.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      WHERE ${whereClause}
    `,
    params
  );

  const evaluations = await query(
    `
      SELECT
        teaching_evaluations.rating,
        teaching_evaluations.content,
        teaching_evaluations.created_at,
        users.full_name AS student_name,
        courses.course_name,
        courses.course_type,
        course_sections.section_code
      FROM teaching_evaluations
      INNER JOIN students ON students.id = teaching_evaluations.student_id
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN course_sections ON course_sections.id = teaching_evaluations.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      WHERE ${whereClause}
      ORDER BY teaching_evaluations.created_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/teacher/evaluations', {
    pageTitle: '教学评价',
    evaluations,
    sectionOptions: sections,
    filters: { keyword, section_id },
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/schedule', async (req, res) => {
  const teacherId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;

  const scheduleItems = currentTerm
    ? await query(
        `
          SELECT
            courses.course_name,
            courses.course_type,
            course_sections.section_code,
            classrooms.building_name,
            classrooms.room_number,
            time_slots.weekday,
            time_slots.start_period,
            time_slots.end_period,
            time_slots.label
          FROM course_sections
          INNER JOIN courses ON courses.id = course_sections.course_id
          INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
          INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
          WHERE course_sections.teacher_id = ?
            AND course_sections.term_id = ?
          ORDER BY time_slots.weekday ASC, time_slots.start_period ASC
        `,
        [teacherId, currentTerm.id]
      )
    : [];

  return res.render('pages/teacher/schedule', {
    pageTitle: '教师课表',
    scheduleRows: buildScheduleGrid(scheduleItems),
    scheduleItems
  });
});

module.exports = router;







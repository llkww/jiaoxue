const express = require('express');
const { query, withTransaction } = require('../config/database');
const { requireRoles } = require('../middlewares/auth');
const { getPagination, buildPagination } = require('../utils/pagination');
const { getTerms, getMajors } = require('../services/referenceService');
const { getStudentTrainingPlan, getRecommendedCourseIds } = require('../services/programPlanService');
const { buildScheduleGrid } = require('../utils/schedule');
const {
  COURSE_TYPE,
  ENROLLMENT_STATUS,
  GRADE_STATUS,
  SECTION_STATUS
} = require('../utils/system');

const router = express.Router();

function getSafeStudentReturnPath(value, fallback) {
  if (typeof value === 'string' && value.startsWith('/student/')) {
    return value;
  }

  return fallback;
}


async function getPassedCourseIds(studentId) {
  const rows = await query(
    `
      SELECT DISTINCT course_sections.course_id
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
        AND grades.total_score >= 60
    `,
    [studentId]
  );

  return rows.map((item) => item.course_id);
}

async function getStudentSectionDetail(sectionId, studentId, currentTermId = null) {
  const rows = await query(
    `
      SELECT
        course_sections.id,
        course_sections.section_code,
        course_sections.capacity,
        course_sections.selection_status,
        course_sections.weeks_text,
        course_sections.notes,
        course_sections.usual_weight,
        course_sections.final_weight,
        courses.id AS course_id,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.total_hours,
        courses.assessment_method,
        courses.description,
        majors.name AS major_name,
        departments.name AS department_name,
        classrooms.building_name,
        classrooms.room_number,
        classrooms.room_type,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period,
        time_slots.label,
        users.full_name AS teacher_name,
        teachers.teacher_no,
        teachers.title AS teacher_title,
        terms.id AS term_id,
        terms.name AS term_name,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count,
        MAX(CASE WHEN self_enrollment.id IS NOT NULL AND self_enrollment.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 ELSE 0 END) AS is_selected
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN majors ON majors.id = courses.major_id
      INNER JOIN departments ON departments.id = courses.department_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      LEFT JOIN enrollments AS self_enrollment
        ON self_enrollment.section_id = course_sections.id
       AND self_enrollment.student_id = ?
      WHERE course_sections.id = ?
        AND (
          (? IS NOT NULL AND course_sections.term_id = ?)
          OR self_enrollment.id IS NOT NULL
        )
      GROUP BY course_sections.id
      LIMIT 1
    `,
    [studentId, Number(sectionId), currentTermId, currentTermId]
  );

  return rows[0] || null;
}

async function getLearningProfile(studentId, requestedTermId = null, requestedMode = 'gpa') {
  const mode = requestedMode === 'score' ? 'score' : 'gpa';
  const terms = await query(
    `
      SELECT DISTINCT
        terms.id,
        terms.name,
        terms.start_date
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
      ORDER BY terms.start_date DESC
    `,
    [studentId]
  );

  const selectedTerm =
    terms.find((item) => Number(item.id) === Number(requestedTermId)) ||
    terms[0] ||
    null;

  if (!selectedTerm) {
    return {
      mode,
      terms: [],
      selectedTerm: null,
      summary: {
        published_count: 0,
        average_score: 0,
        average_gpa: 0,
        weighted_gpa: 0,
        failed_count: 0
      },
      radar: {
        labels: [],
        values: [],
        max: mode === 'score' ? 100 : 4,
        stepSize: mode === 'score' ? 20 : 1,
        datasetLabel: mode === 'score' ? '总评成绩' : '绩点'
      }
    };
  }

  const termId = Number(selectedTerm.id);
  const [summary] = await query(
    `
      SELECT
        COUNT(*) AS published_count,
        ROUND(COALESCE(AVG(grades.total_score), 0), 1) AS average_score,
        ROUND(COALESCE(AVG(grades.grade_point), 0), 1) AS average_gpa,
        ROUND(
          COALESCE(
            SUM(grades.grade_point * courses.credits) /
            NULLIF(SUM(courses.credits), 0),
            0
          ),
          1
        ) AS weighted_gpa,
        COUNT(CASE WHEN grades.total_score < 60 THEN 1 END) AS failed_count
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
        AND course_sections.term_id = ?
    `,
    [studentId, termId]
  );

  const courseRecords = await query(
    `
      SELECT
        courses.course_code,
        courses.course_name,
        grades.total_score,
        grades.grade_point
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
        AND course_sections.term_id = ?
      ORDER BY courses.course_code ASC
    `,
    [studentId, termId]
  );

  return {
    mode,
    terms,
    selectedTerm,
    summary: summary || {},
    radar: {
      labels: courseRecords.map((item) => item.course_name),
      values: courseRecords.map((item) => Number(mode === 'score' ? item.total_score || 0 : item.grade_point || 0)),
      max: mode === 'score' ? 100 : 4,
      stepSize: mode === 'score' ? 20 : 1,
      datasetLabel: mode === 'score' ? '总评成绩' : '绩点'
    }
  };
}

router.use(requireRoles('student'));

router.get('/courses', async (req, res) => {
  const studentId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;
  const { keyword = '', weekday = '', course_type = '', scope = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 12);

  if (!currentTerm) {
    return res.render('pages/student/courses', {
      pageTitle: '在线选课',
      sections: [],
      filters: { keyword, weekday, course_type, scope: 'all' },
      pagination: buildPagination(0, page, pageSize),
      selectionOpen: false,
      recommendation: { hasPlan: false, currentSemesterNo: null, recommendedCourseIds: [] }
    });
  }

  const [passedCourseIds, recommendation, availabilityRows] = await Promise.all([
    getPassedCourseIds(studentId),
    getRecommendedCourseIds(studentId, currentTerm.id),
    query(
      `
        SELECT COUNT(*) AS total
        FROM course_sections
        INNER JOIN courses ON courses.id = course_sections.course_id
        WHERE course_sections.term_id = ?
          AND course_sections.selection_status = '${SECTION_STATUS.OPEN}'
      `,
      [currentTerm.id]
    )
  ]);
  const passedCourseIdSet = new Set(passedCourseIds.map((id) => Number(id)));
  const activeScope =
    scope === 'recommended'
      ? 'recommended'
      : scope === 'all'
        ? 'all'
        : recommendation.hasPlan
          ? 'recommended'
          : 'all';
  const filters = [
    'course_sections.term_id = ?',
    `course_sections.selection_status = '${SECTION_STATUS.OPEN}'`
  ];
  const params = [currentTerm.id];

  if (keyword) {
    filters.push(
      '(courses.course_name LIKE ? OR courses.course_code LIKE ? OR teacher_users.full_name LIKE ? OR course_sections.section_code LIKE ?)'
    );
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (weekday) {
    filters.push('time_slots.weekday = ?');
    params.push(Number(weekday));
  }

  if (course_type) {
    filters.push('courses.course_type = ?');
    params.push(course_type);
  }

  if (activeScope === 'recommended') {
    if (recommendation.hasPlan && recommendation.recommendedCourseIds.length) {
      filters.push(`courses.id IN (${recommendation.recommendedCourseIds.map(() => '?').join(', ')})`);
      params.push(...recommendation.recommendedCourseIds);
    } else {
      filters.push('1 = 0');
    }
  }

  const whereClause = filters.join(' AND ');

  const countRows = await query(
    `
      SELECT COUNT(DISTINCT course_sections.id) AS total
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users AS teacher_users ON teacher_users.id = teachers.user_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      WHERE ${whereClause}
    `,
    params
  );

  const sections = await query(
    `
      SELECT
        course_sections.id,
        course_sections.section_code,
        course_sections.capacity,
        course_sections.selection_status,
        course_sections.weeks_text,
        course_sections.notes,
        course_sections.usual_weight,
        course_sections.final_weight,
        courses.id AS course_id,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.assessment_method,
        terms.selection_start,
        terms.selection_end,
        terms.is_current,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period,
        time_slots.label,
        teacher_users.full_name AS teacher_name,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count,
        MAX(CASE WHEN self_enrollment.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 ELSE 0 END) AS is_selected,
        MAX(CASE WHEN self_enrollment.status = '${ENROLLMENT_STATUS.SELECTED}' THEN self_enrollment.id END) AS enrollment_id,
        MAX(self_grade.status) AS self_grade_status,
        MAX(self_grade.total_score) AS self_total_score
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users AS teacher_users ON teacher_users.id = teachers.user_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      LEFT JOIN enrollments AS self_enrollment
        ON self_enrollment.section_id = course_sections.id
       AND self_enrollment.student_id = ?
      LEFT JOIN grades AS self_grade ON self_grade.enrollment_id = self_enrollment.id
      WHERE ${whereClause}
      GROUP BY
        course_sections.id,
        course_sections.section_code,
        course_sections.capacity,
        course_sections.selection_status,
        course_sections.weeks_text,
        course_sections.notes,
        course_sections.usual_weight,
        course_sections.final_weight,
        courses.id,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.assessment_method,
        terms.selection_start,
        terms.selection_end,
        terms.is_current,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period,
        time_slots.label,
        teacher_users.full_name
      ORDER BY time_slots.weekday ASC, time_slots.start_period ASC, courses.course_code ASC
      LIMIT ? OFFSET ?
    `,
    [studentId, ...params, pageSize, offset]
  );

  const sectionRows = sections.map((item) => {
    const isCompleted =
      item.self_grade_status === GRADE_STATUS.PUBLISHED && Number(item.self_total_score || 0) >= 60;
    const remain = Number(item.capacity || 0) - Number(item.selected_count || 0);

    return {
      ...item,
      hasPassedCourse: passedCourseIdSet.has(Number(item.course_id)),
      canSelect:
        Number(item.is_selected) !== 1 &&
        item.selection_status === SECTION_STATUS.OPEN &&
        remain > 0,
      canDrop:
        Number(item.is_selected) === 1 &&
        Number(item.is_current) === 1 &&
        !isCompleted
    };
  });

  return res.render('pages/student/courses', {
    pageTitle: '在线选课',
    sections: sectionRows,
    filters: { keyword, weekday, course_type, scope: activeScope },
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize),
    selectionOpen: Number(availabilityRows[0]?.total || 0) > 0,
    recommendation
  });
});

router.post('/courses/:sectionId/select', async (req, res) => {
  const studentId = req.session.user.profileId;
  const sectionId = Number(req.params.sectionId);
  const currentTerm = res.locals.currentTerm;
  const redirectPath = getSafeStudentReturnPath(req.body.return_to, '/student/courses');

  if (!currentTerm) {
    req.flash('danger', '当前学期未开放选课。');
    return res.redirect(redirectPath);
  }

  const sections = await query(
    `
      SELECT
        course_sections.*,
        courses.course_name,
        courses.course_type,
        courses.course_code,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period,
        time_slots.label,
        terms.selection_start,
        terms.selection_end,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      WHERE course_sections.id = ?
        AND course_sections.term_id = ?
      GROUP BY course_sections.id
      LIMIT 1
    `,
    [sectionId, currentTerm.id]
  );

  const section = sections[0];

  if (!section) {
    req.flash('danger', '课程不存在或不在当前学期。');
    return res.redirect(redirectPath);
  }

  if (section.selection_status !== SECTION_STATUS.OPEN) {
    req.flash('danger', '当前课程未开放选课。');
    return res.redirect(redirectPath);
  }


  const existingRows = await query(
    `
      SELECT id, status
      FROM enrollments
      WHERE section_id = ?
        AND student_id = ?
      LIMIT 1
    `,
    [sectionId, studentId]
  );


  if (Number(section.selected_count || 0) >= Number(section.capacity || 0) && !existingRows[0]) {
    req.flash('danger', '该课程容量已满。');
    return res.redirect(redirectPath);
  }

  const conflictRows = await query(
    `
      SELECT
        courses.course_name,
        time_slots.label
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND course_sections.term_id = ?
        AND time_slots.weekday = ?
        AND time_slots.start_period <= ?
        AND time_slots.end_period >= ?
      LIMIT 1
    `,
    [studentId, section.term_id, section.weekday, section.end_period, section.start_period]
  );

  if (conflictRows[0]) {
    req.flash('danger', `与已选课程《${conflictRows[0].course_name}》(${conflictRows[0].label}) 时间冲突。`);
    return res.redirect(redirectPath);
  }

  await withTransaction(async (connection) => {
    let enrollmentId = existingRows[0]?.id;

    if (existingRows[0]) {
      if (existingRows[0].status === ENROLLMENT_STATUS.SELECTED) {
        return;
      }

      await connection.execute(
        `
          UPDATE enrollments
          SET status = '${ENROLLMENT_STATUS.SELECTED}',
              selected_at = NOW(),
              dropped_at = NULL
          WHERE id = ?
        `,
        [existingRows[0].id]
      );
      enrollmentId = existingRows[0].id;
    } else {
      const [result] = await connection.execute(
        `
          INSERT INTO enrollments (section_id, student_id, status, selected_at)
          VALUES (?, ?, '${ENROLLMENT_STATUS.SELECTED}', NOW())
        `,
        [sectionId, studentId]
      );
      enrollmentId = result.insertId;
    }

    await connection.execute(
      `
        INSERT INTO grades (enrollment_id, status)
        VALUES (?, '${GRADE_STATUS.PENDING}')
        ON DUPLICATE KEY UPDATE
          status = '${GRADE_STATUS.PENDING}',
          usual_score = NULL,
          final_exam_score = NULL,
          total_score = NULL,
          grade_point = NULL,
          letter_grade = NULL
      `,
      [enrollmentId]
    );
  });

  req.flash('success', '课程选择成功。');
  return res.redirect(redirectPath);
});
router.post('/enrollments/:enrollmentId/drop', async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  const studentId = req.session.user.profileId;
  const redirectPath = getSafeStudentReturnPath(req.body.return_to, '/student/enrollments');

  const rows = await query(
    `
      SELECT
        enrollments.id,
        enrollments.status,
        terms.is_current,
        course_sections.section_code,
        courses.course_name,
        grades.status AS grade_status,
        grades.total_score
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.id = ?
        AND enrollments.student_id = ?
      LIMIT 1
    `,
    [enrollmentId, studentId]
  );

  const enrollment = rows[0];

  if (!enrollment || enrollment.status !== ENROLLMENT_STATUS.SELECTED) {
    return res.redirect(redirectPath);
  }

  const isCompleted =
    enrollment.grade_status === GRADE_STATUS.PUBLISHED && Number(enrollment.total_score || 0) >= 60;

  if (Number(enrollment.is_current) !== 1 || isCompleted) {
    return res.redirect(redirectPath);
  }

  await withTransaction(async (connection) => {
    await connection.execute(
      `
        UPDATE enrollments
        SET status = '${ENROLLMENT_STATUS.DROPPED}',
            dropped_at = NOW()
        WHERE id = ?
      `,
      [enrollmentId]
    );

    await connection.execute(
      `
        UPDATE grades
        SET usual_score = NULL,
            final_exam_score = NULL,
            total_score = NULL,
            grade_point = NULL,
            letter_grade = NULL,
            status = '${GRADE_STATUS.PENDING}',
            teacher_comment = NULL
        WHERE enrollment_id = ?
      `,
      [enrollmentId]
    );
  });

  req.flash('success', '课程已退选。');
  return res.redirect(redirectPath);
});

router.get('/enrollments', async (req, res) => {
  const studentId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;
  const terms = await getTerms();
  const { keyword = '', term_id = '', progress = '', course_type = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 8);
  const activeProgress = progress === '已修' ? '已修' : progress === '已选' ? '已选' : '';

  const filters = [
    'enrollments.student_id = ?',
    `enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'`,
    `(
      terms.is_current = 1
      OR (grades.status = '${GRADE_STATUS.PUBLISHED}' AND grades.total_score >= 60)
    )`
  ];
  const params = [studentId];

  if (keyword) {
    filters.push('(courses.course_name LIKE ? OR courses.course_code LIKE ? OR course_sections.section_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (term_id) {
    filters.push('terms.id = ?');
    params.push(Number(term_id));
  }

  if (course_type) {
    filters.push('courses.course_type = ?');
    params.push(course_type);
  }

  const effectiveFilters = [...filters];

  if (activeProgress === '已选') {
    effectiveFilters.push('terms.is_current = 1');
  }

  if (activeProgress === '已修') {
    effectiveFilters.push(`grades.status = '${GRADE_STATUS.PUBLISHED}' AND grades.total_score >= 60`);
  }

  const whereClause = effectiveFilters.join(' AND ');

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
    `,
    params
  );

  const enrollments = await query(
    `
      SELECT
        enrollments.*,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        course_sections.section_code,
        course_sections.selection_status,
        terms.id AS term_real_id,
        terms.name AS term_name,
        terms.selection_start,
        terms.selection_end,
        terms.is_current,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.label,
        course_sections.weeks_text,
        course_sections.usual_weight,
        course_sections.final_weight,
        courses.assessment_method,
        users.full_name AS teacher_name,
        grades.status AS grade_status,
        grades.total_score
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
      ORDER BY terms.start_date DESC, time_slots.weekday ASC, time_slots.start_period ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  const summaryRows = await query(
    `
      SELECT
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND terms.is_current = 1 THEN 1 END) AS active_count,
        ROUND(COALESCE(SUM(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND terms.is_current = 1 THEN courses.credits ELSE 0 END), 0), 1) AS active_credits,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND grades.status = '${GRADE_STATUS.PUBLISHED}' AND grades.total_score >= 60 THEN 1 END) AS completed_count,
        ROUND(COALESCE(SUM(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND grades.status = '${GRADE_STATUS.PUBLISHED}' AND grades.total_score >= 60 THEN courses.credits ELSE 0 END), 0), 1) AS completed_credits
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
    `,
    [studentId]
  );

  const rows = enrollments.map((item) => {
    const isCompleted = item.grade_status === GRADE_STATUS.PUBLISHED && Number(item.total_score || 0) >= 60;
    const canDrop =
      item.status === ENROLLMENT_STATUS.SELECTED &&
      Number(item.is_current) === 1 &&
      !isCompleted;

    return {
      ...item,
      canDrop,
      progressLabel: isCompleted ? '已修' : '已选'
    };
  });

  return res.render('pages/student/enrollments', {
    pageTitle: '我的课程',
    enrollments: rows,
    terms,
    filters: { keyword, term_id, progress: activeProgress, course_type },
    summary: summaryRows[0] || {},
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize),
    currentTerm
  });
});

router.get('/grades', async (req, res) => {
  const studentId = req.session.user.profileId;
  const { term_id = '', keyword = '', course_type = '' } = req.query;
  const terms = await getTerms();
  const { page, pageSize, offset } = getPagination(req.query, 6);

  const filters = [
    'enrollments.student_id = ?',
    `enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'`,
    `grades.status = '${GRADE_STATUS.PUBLISHED}'`
  ];
  const params = [studentId];

  if (keyword) {
    filters.push('(courses.course_name LIKE ? OR courses.course_code LIKE ? OR course_sections.section_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (term_id) {
    filters.push('terms.id = ?');
    params.push(Number(term_id));
  }

  if (course_type) {
    filters.push('courses.course_type = ?');
    params.push(course_type);
  }

  const whereClause = filters.join(' AND ');

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
    `,
    params
  );

  const grades = await query(
    `
      SELECT
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        course_sections.section_code,
        course_sections.usual_weight,
        course_sections.final_weight,
        terms.name AS term_name,
        users.full_name AS teacher_name,
        grades.usual_score,
        grades.final_exam_score,
        grades.total_score,
        grades.grade_point
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
      ORDER BY terms.start_date DESC, courses.course_code ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  const summaryRows = await query(
    `
      SELECT
        ROUND(COALESCE(AVG(grades.total_score), 0), 1) AS average_score,
        ROUND(COALESCE(AVG(grades.grade_point), 0), 1) AS average_gpa,
        ROUND(
          COALESCE(
            SUM(grades.grade_point * courses.credits) /
            NULLIF(SUM(courses.credits), 0),
            0
          ),
          1
        ) AS weighted_gpa,
        ROUND(COALESCE(SUM(CASE WHEN grades.total_score >= 60 THEN courses.credits ELSE 0 END), 0), 1) AS earned_credits,
        COUNT(*) AS published_count,
        COUNT(CASE WHEN grades.total_score < 60 THEN 1 END) AS warning_count
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
    `,
    params
  );

  return res.render('pages/student/grades', {
    pageTitle: '成绩查询',
    grades,
    terms,
    filters: { term_id, keyword, course_type },
    summary: summaryRows[0] || {},
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/schedule', async (req, res) => {
  const studentId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;
  const { campus_keyword = '', campus_weekday = '', campus_course_type = '' } = req.query;
  const scheduleItems = currentTerm
    ? await query(
        `
          SELECT
            courses.course_name,
            courses.course_type,
            course_sections.section_code,
            users.full_name AS teacher_name,
            classrooms.building_name,
            classrooms.room_number,
            time_slots.weekday,
            time_slots.start_period,
            time_slots.end_period,
            time_slots.label
          FROM enrollments
          INNER JOIN course_sections ON course_sections.id = enrollments.section_id
          INNER JOIN courses ON courses.id = course_sections.course_id
          INNER JOIN teachers ON teachers.id = course_sections.teacher_id
          INNER JOIN users ON users.id = teachers.user_id
          INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
          INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
          WHERE enrollments.student_id = ?
            AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
            AND course_sections.term_id = ?
          ORDER BY time_slots.weekday ASC, time_slots.start_period ASC
        `,
        [studentId, currentTerm.id]
      )
    : [];

  return res.render('pages/student/schedule', {
    pageTitle: '我的课表',
    scheduleRows: buildScheduleGrid(scheduleItems),
    scheduleItems
  });
});

router.get('/campus-schedule', async (req, res) => {
  const currentTerm = res.locals.currentTerm;
  const majors = await getMajors();
  const { keyword = '', weekday = '', major_id = '', course_type = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 8);
  const filters = [
    currentTerm ? 'course_sections.term_id = ?' : '1 = 0',
    `course_sections.selection_status <> '${SECTION_STATUS.ARCHIVED}'`
  ];
  const params = currentTerm ? [currentTerm.id] : [];

  if (keyword) {
    filters.push('(courses.course_name LIKE ? OR courses.course_code LIKE ? OR course_sections.section_code LIKE ? OR users.full_name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (weekday) {
    filters.push('time_slots.weekday = ?');
    params.push(Number(weekday));
  }

  if (major_id) {
    filters.push('courses.major_id = ?');
    params.push(Number(major_id));
  }

  if (course_type) {
    filters.push('courses.course_type = ?');
    params.push(course_type);
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN majors ON majors.id = courses.major_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      WHERE ${whereClause}
    `,
    params
  );

  const campusSections = currentTerm
    ? await query(
        `
          SELECT
            course_sections.id,
            courses.course_code,
            courses.course_name,
            courses.course_type,
            courses.credits,
            courses.assessment_method,
            majors.name AS major_name,
            course_sections.section_code,
            course_sections.weeks_text,
            course_sections.capacity,
            course_sections.selection_status,
            time_slots.weekday,
            time_slots.start_period,
            time_slots.end_period,
            time_slots.label,
            classrooms.building_name,
            classrooms.room_number,
            users.full_name AS teacher_name,
            COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count
          FROM course_sections
          INNER JOIN courses ON courses.id = course_sections.course_id
          INNER JOIN majors ON majors.id = courses.major_id
          INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
          INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
          INNER JOIN teachers ON teachers.id = course_sections.teacher_id
          INNER JOIN users ON users.id = teachers.user_id
          LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
          WHERE ${whereClause}
          GROUP BY course_sections.id
          ORDER BY time_slots.weekday ASC, time_slots.start_period ASC, courses.course_code ASC
          LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      )
    : [];

  return res.render('pages/student/campus-schedule', {
    pageTitle: '全校课表查询',
    campusSections,
    majors,
    filters: { keyword, weekday, major_id, course_type },
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize),
    currentTerm
  });
});

router.get('/campus-schedule/:sectionId', async (req, res) => {
  const currentTerm = res.locals.currentTerm;
  const sectionId = Number(req.params.sectionId);
  const backHref = getSafeStudentReturnPath(req.query.back, '/student/campus-schedule');
  const rows = await query(
    `
      SELECT
        course_sections.id,
        course_sections.section_code,
        course_sections.capacity,
        course_sections.selection_status,
        course_sections.weeks_text,
        course_sections.notes,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.assessment_method,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period,
        time_slots.label,
        users.full_name AS teacher_name,
        terms.name AS term_name,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      WHERE course_sections.id = ?
        AND course_sections.term_id = ?
      GROUP BY course_sections.id
      LIMIT 1
    `,
    [sectionId, currentTerm?.id || 0]
  );

  const section = rows[0];

  if (!section) {
    return res.status(404).render('pages/errors/404', {
      layout: 'layout',
      pageTitle: '开课信息不存在'
    });
  }

  return res.render('pages/student/campus-schedule-detail', {
    section,
    scheduleRows: buildScheduleGrid([section]),
    backHref
  });
});

router.get('/sections/:sectionId', async (req, res) => {
  const studentId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;
  const sectionId = Number(req.params.sectionId);
  const backHref = getSafeStudentReturnPath(req.query.back, '/student/courses');
  const section = await getStudentSectionDetail(sectionId, studentId, currentTerm?.id || null);

  if (!section) {
    return res.status(404).render('pages/errors/404', {
      layout: 'layout',
      pageTitle: '开课信息不存在'
    });
  }

  return res.render('pages/student/section-detail', {
    pageTitle: `${section.course_name} 详情`,
    section,
    scheduleRows: buildScheduleGrid([section]),
    backHref
  });
});

router.get('/program-plan', async (req, res) => {
  const studentId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;
  const programPlan = await getStudentTrainingPlan(studentId, currentTerm?.id || null);

  return res.render('pages/student/program-plan', {
    pageTitle: '我的培养方案',
    programPlan
  });
});

router.get('/evaluations', async (req, res) => {
  const studentId = req.session.user.profileId;
  const currentTerm = res.locals.currentTerm;
  const { page, pageSize, offset } = getPagination(req.query, 6);
  const rows = await query(
    `
      SELECT
        enrollments.id AS enrollment_id,
        terms.id AS term_id,
        terms.name AS term_name,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        course_sections.section_code,
        users.full_name AS teacher_name,
        grades.status AS grade_status,
        grades.total_score,
        teaching_evaluations.rating,
        teaching_evaluations.content,
        teaching_evaluations.created_at AS evaluated_at
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      LEFT JOIN teaching_evaluations ON teaching_evaluations.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
      ORDER BY terms.start_date DESC, courses.course_code ASC
    `,
    [studentId]
  );

  const evaluations = rows
      .map((item) => ({
        ...item,
        canEvaluate:
          item.grade_status === GRADE_STATUS.PUBLISHED ||
          (currentTerm && Number(item.term_id) !== Number(currentTerm.id))
      }))
      .filter((item) => item.canEvaluate);

  const pagedEvaluations = evaluations.slice(offset, offset + pageSize);

  return res.render('pages/student/evaluations', {
    pageTitle: '教学评价',
    evaluations: pagedEvaluations,
    pagination: buildPagination(evaluations.length, page, pageSize),
    currentPageUrl: req.originalUrl
  });
});

router.get('/learning-profile', async (req, res) => {
  const studentId = req.session.user.profileId;
  const { term_id = '', mode = 'gpa' } = req.query;
  const profile = await getLearningProfile(studentId, term_id, mode);

  return res.render('pages/student/learning-profile', {
    pageTitle: '学习画像',
    profile
  });
});

router.post('/evaluations/:enrollmentId', async (req, res) => {
  const studentId = req.session.user.profileId;
  const enrollmentId = Number(req.params.enrollmentId);
  const rating = Number(req.body.rating);
  const content = req.body.content?.trim() || '';
  const currentTerm = res.locals.currentTerm;
  const redirectPath = getSafeStudentReturnPath(req.body.return_to, '/student/evaluations');

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !content) {
    return res.redirect(redirectPath);
  }

  const rows = await query(
    `
      SELECT
        enrollments.id,
        course_sections.id AS section_id,
        course_sections.term_id,
        course_sections.teacher_id,
        courses.course_name,
        grades.status AS grade_status
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.id = ?
        AND enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
      LIMIT 1
    `,
    [enrollmentId, studentId]
  );

  const record = rows[0];

  if (!record) {
    return res.redirect(redirectPath);
  }

  const canEvaluate =
    record.grade_status === GRADE_STATUS.PUBLISHED ||
    (currentTerm && Number(record.term_id) !== Number(currentTerm.id));

  if (!canEvaluate) {
    return res.redirect(redirectPath);
  }

  await query(
    `
      INSERT INTO teaching_evaluations (
        enrollment_id,
        section_id,
        student_id,
        teacher_id,
        rating,
        content
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        content = VALUES(content),
        updated_at = NOW()
    `,
    [enrollmentId, record.section_id, studentId, record.teacher_id, rating, content]
  );

  return res.redirect(redirectPath);
});

module.exports = router;







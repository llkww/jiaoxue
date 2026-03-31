const express = require('express');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/database');
const { requireRoles } = require('../middlewares/auth');
const {
  getDepartments,
  getMajors,
  getClasses,
  getTeachers,
  getCourses,
  getTerms,
  getClassrooms,
  getTimeSlots
} = require('../services/referenceService');
const {
  getTrainingPlanDetail,
  syncTrainingPlanCredits,
  syncTrainingPlanCreditsByCourse,
  syncStudentsCreditsRequiredByClass,
  syncStudentsCreditsRequiredByMajor
} = require('../services/programPlanService');
const { recalculateSectionGrades } = require('../services/gradeService');
const { getPagination, buildPagination } = require('../utils/pagination');
const { AUTH_DEFAULT_PASSWORDS, getRoleColor } = require('../utils/auth');
const {
  resolveStudentNumber,
  resolveTeacherNo,
  resolveCourseCode,
  resolveSectionCode
} = require('../utils/identity');
const {
  ANNOUNCEMENT_CATEGORY,
  ANNOUNCEMENT_PRIORITY,
  COURSE_TYPE,
  ENROLLMENT_STATUS,
  GRADE_STATUS,
  SECTION_STATUS,
  TERM_STATUS,
  USER_STATUS
} = require('../utils/system');

const router = express.Router();

router.use((req, res, next) => {
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return next();
  }

  const originalRedirect = res.redirect.bind(res);

  res.redirect = (statusOrUrl, maybeUrl) => {
    const statusCode = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
    const location = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;

    if (!location) {
      return originalRedirect(statusOrUrl, maybeUrl);
    }

    const finishRedirectResponse = () => {
      res.status(200);
      res.set('X-Redirect-To', location);
      res.set('X-Redirect-Status', String(statusCode));
      return res.end();
    };

    if (req.session && typeof req.session.save === 'function') {
      return req.session.save((error) => {
        if (error) {
          return next(error);
        }

        return finishRedirectResponse();
      });
    }

    return finishRedirectResponse();
  };

  return next();
});

async function hashDefaultPassword(role) {
  return bcrypt.hash(AUTH_DEFAULT_PASSWORDS[role] || '123456', 10);
}

async function ensureSectionConflict({ termId, timeSlotId, teacherId, classroomId, excludeId = 0 }) {
  const rows = await query(
    `
      SELECT
        section_code,
        CASE
          WHEN teacher_id = ? THEN 'teacher'
          WHEN classroom_id = ? THEN 'classroom'
        END AS conflict_type
      FROM course_sections
      WHERE term_id = ?
        AND time_slot_id = ?
        AND id <> ?
        AND (teacher_id = ? OR classroom_id = ?)
      LIMIT 1
    `,
    [teacherId, classroomId, termId, timeSlotId, excludeId, teacherId, classroomId]
  );

  return rows[0] || null;
}

async function getSectionSelectableTerms() {
  return query(
    `
      SELECT *
      FROM terms
      WHERE is_current = 1
         OR status = ?
      ORDER BY is_current DESC, start_date DESC, id DESC
    `,
    [TERM_STATUS.PLANNING]
  );
}

async function isSectionSelectableTerm(termId) {
  if (!termId) {
    return false;
  }

  const rows = await query(
    `
      SELECT id
      FROM terms
      WHERE id = ?
        AND (
          is_current = 1
          OR status = ?
        )
      LIMIT 1
    `,
    [Number(termId), TERM_STATUS.PLANNING]
  );

  return rows.length > 0;
}

function getSafeReturnPath(value, fallback) {
  if (typeof value === 'string' && value.startsWith('/admin/')) {
    return value;
  }

  return fallback;
}

function renderMissingPage(res, pageTitle) {
  return res.status(404).render('pages/errors/404', {
    layout: 'layout',
    pageTitle
  });
}

async function resolveAdmissionTermId(entryYear, connection = null) {
  if (!entryYear) {
    return null;
  }

  const rows = connection
    ? await connection
        .query(
          `
            SELECT id
            FROM terms
            WHERE YEAR(start_date) = ?
            ORDER BY start_date ASC
            LIMIT 1
          `,
          [Number(entryYear)]
        )
        .then(([result]) => result)
    : await query(
        `
          SELECT id
          FROM terms
          WHERE YEAR(start_date) = ?
          ORDER BY start_date ASC
          LIMIT 1
        `,
        [Number(entryYear)]
      );

  const term = rows[0];
  return term?.id || null;
}

async function getCreditsRequiredForClass(classId, connection = null) {
  if (!classId) {
    return 160;
  }

  const rows = connection
    ? await connection
        .query(
          `
            SELECT COALESCE(training_plans.total_credits, 160) AS credits_required
            FROM classes
            INNER JOIN majors ON majors.id = classes.major_id
            LEFT JOIN training_plans ON training_plans.major_id = majors.id
            WHERE classes.id = ?
            LIMIT 1
          `,
          [Number(classId)]
        )
        .then(([result]) => result)
    : await query(
        `
          SELECT COALESCE(training_plans.total_credits, 160) AS credits_required
          FROM classes
          INNER JOIN majors ON majors.id = classes.major_id
          LEFT JOIN training_plans ON training_plans.major_id = majors.id
          WHERE classes.id = ?
          LIMIT 1
        `,
        [Number(classId)]
      );

  const row = rows[0];
  return Number(row?.credits_required || 160);
}

async function getMajorByDepartment(departmentId, majorId) {
  if (!departmentId || !majorId) {
    return null;
  }

  const rows = await query(
    `
      SELECT id, name
      FROM majors
      WHERE id = ?
        AND department_id = ?
      LIMIT 1
    `,
    [Number(majorId), Number(departmentId)]
  );

  return rows[0] || null;
}

async function getMajorById(majorId, connection = null) {
  if (!majorId) {
    return null;
  }

  const runner = connection
    ? {
        async query(sql, params = []) {
          const [rows] = await connection.query(sql, params);
          return rows;
        }
      }
    : { query };

  const rows = await runner.query(
    `
      SELECT id, name, department_id
      FROM majors
      WHERE id = ?
      LIMIT 1
    `,
    [Number(majorId)]
  );

  return rows[0] || null;
}

function normalizeRequiredText(value) {
  return String(value || '').trim();
}

function normalizePositiveId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeSemesterNo(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 8 ? numeric : null;
}

function normalizeTermPayload(body = {}) {
  return {
    name: normalizeRequiredText(body.name),
    academicYear: normalizeRequiredText(body.academic_year),
    semesterLabel: normalizeRequiredText(body.semester_label),
    startDate: normalizeRequiredText(body.start_date),
    endDate: normalizeRequiredText(body.end_date),
    selectionStart: normalizeRequiredText(body.selection_start),
    selectionEnd: normalizeRequiredText(body.selection_end),
    isCurrent: Number(body.is_current) === 1 ? 1 : 0,
    status: body.status || TERM_STATUS.ACTIVE
  };
}

function validateTermPayload(payload) {
  const {
    name,
    academicYear,
    semesterLabel,
    startDate,
    endDate,
    selectionStart,
    selectionEnd,
    isCurrent,
    status
  } = payload;

  if (!name || !academicYear || !semesterLabel || !startDate || !endDate || !selectionStart || !selectionEnd) {
    return '请完整填写学期名称、学年、标签和时间范围。';
  }

  const parsedStartDate = new Date(`${startDate}T00:00:00`);
  const parsedEndDate = new Date(`${endDate}T00:00:00`);
  const parsedSelectionStart = new Date(`${selectionStart}T00:00:00`);
  const parsedSelectionEnd = new Date(`${selectionEnd}T00:00:00`);

  if (
    Number.isNaN(parsedStartDate.getTime()) ||
    Number.isNaN(parsedEndDate.getTime()) ||
    Number.isNaN(parsedSelectionStart.getTime()) ||
    Number.isNaN(parsedSelectionEnd.getTime())
  ) {
    return '学期日期格式不正确，请重新选择。';
  }

  if (parsedStartDate > parsedEndDate) {
    return '教学周期开始日期不能晚于结束日期。';
  }

  if (parsedSelectionStart > parsedSelectionEnd) {
    return '选课开始日期不能晚于选课结束日期。';
  }

  if (parsedSelectionStart > parsedEndDate || parsedSelectionEnd < parsedStartDate) {
    return '选课时间需要与教学周期有交集，请重新设置。';
  }

  if (isCurrent && status !== TERM_STATUS.ACTIVE) {
    return '当前学期的状态必须为进行中。';
  }

  return null;
}

async function getTrainingPlanById(planId) {
  if (!planId) {
    return null;
  }

  const rows = await query(
    `
      SELECT *
      FROM training_plans
      WHERE id = ?
      LIMIT 1
    `,
    [Number(planId)]
  );

  return rows[0] || null;
}

async function getTrainingPlanModuleById(planId, moduleId) {
  if (!planId || !moduleId) {
    return null;
  }

  const rows = await query(
    `
      SELECT *
      FROM training_plan_modules
      WHERE id = ?
        AND training_plan_id = ?
      LIMIT 1
    `,
    [Number(moduleId), Number(planId)]
  );

  return rows[0] || null;
}

async function getTrainingPlanCourseMappingById(planId, moduleId, planCourseId) {
  if (!planId || !moduleId || !planCourseId) {
    return null;
  }

  const rows = await query(
    `
      SELECT *
      FROM training_plan_courses
      WHERE id = ?
        AND training_plan_id = ?
        AND module_id = ?
      LIMIT 1
    `,
    [Number(planCourseId), Number(planId), Number(moduleId)]
  );

  return rows[0] || null;
}

async function getCourseById(courseId) {
  if (!courseId) {
    return null;
  }

  const rows = await query(
    `
      SELECT id, course_name, course_code
      FROM courses
      WHERE id = ?
      LIMIT 1
    `,
    [Number(courseId)]
  );

  return rows[0] || null;
}

async function findDuplicatePlanCourse(planId, courseId, excludePlanCourseId = 0) {
  if (!planId || !courseId) {
    return null;
  }

  const rows = await query(
    `
      SELECT id, module_id
      FROM training_plan_courses
      WHERE training_plan_id = ?
        AND course_id = ?
        AND id <> ?
      LIMIT 1
    `,
    [Number(planId), Number(courseId), Number(excludePlanCourseId) || 0]
  );

  return rows[0] || null;
}

function normalizeClassCode(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  const numeric = Number(raw);
  const normalized = Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : raw;
  return normalized.padStart(2, '0').slice(-2);
}

function getClassDisplayNo(classCode) {
  const numeric = Number(String(classCode || '').trim());
  return Number.isFinite(numeric) && numeric > 0 ? String(Math.trunc(numeric)) : String(classCode || '').trim();
}

async function buildClassName({ majorId, gradeYear, classCode }, connection = null) {
  const major = await getMajorById(majorId, connection);

  if (!major) {
    return null;
  }

  return `${major.name} ${Number(gradeYear)}级${getClassDisplayNo(classCode)}班`;
}

async function findDepartmentClassCodeConflict({ majorId, gradeYear, classCode, excludeClassId = 0 }, connection = null) {
  const major = await getMajorById(majorId, connection);

  if (!major) {
    return { major: null, conflict: null };
  }

  const runner = connection
    ? {
        async query(sql, params = []) {
          const [rows] = await connection.query(sql, params);
          return rows;
        }
      }
    : { query };

  const rows = await runner.query(
    `
      SELECT
        classes.id,
        classes.class_name,
        majors.name AS major_name,
        departments.name AS department_name
      FROM classes
      INNER JOIN majors ON majors.id = classes.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      WHERE majors.department_id = ?
        AND classes.grade_year = ?
        AND classes.class_code = ?
        AND classes.id <> ?
      LIMIT 1
    `,
    [Number(major.department_id), Number(gradeYear), classCode, Number(excludeClassId) || 0]
  );

  return {
    major,
    conflict: rows[0] || null
  };
}

async function getClassEntryYear(classId, connection = null) {
  if (!classId) {
    return null;
  }

  const runner = connection
    ? {
        async query(sql, params = []) {
          const [rows] = await connection.query(sql, params);
          return rows;
        }
      }
    : { query };

  const rows = await runner.query(
    `
      SELECT grade_year
      FROM classes
      WHERE id = ?
      LIMIT 1
    `,
    [Number(classId)]
  );

  return rows[0]?.grade_year ? Number(rows[0].grade_year) : null;
}

async function getCount(sql, params = []) {
  const rows = await query(sql, params);
  return Number(rows[0]?.total || 0);
}

function summarizeDependencies(items) {
  return items
    .filter((item) => Number(item.total || 0) > 0)
    .map((item) => `${item.label}${item.total}项`)
    .join('、');
}

async function getSectionDeleteSummary(sectionId) {
  const rows = await query(
    `
      SELECT
        selection_status,
        (SELECT COUNT(*) FROM enrollments WHERE section_id = course_sections.id) AS enrollment_count,
        (
          SELECT COUNT(*)
          FROM grades
          INNER JOIN enrollments ON enrollments.id = grades.enrollment_id
          WHERE enrollments.section_id = course_sections.id
        ) AS grade_count,
        (SELECT COUNT(*) FROM teaching_evaluations WHERE section_id = course_sections.id) AS evaluation_count
      FROM course_sections
      WHERE id = ?
      LIMIT 1
    `,
    [sectionId]
  );

  return rows[0] || null;
}

async function getOutstandingRequiredCourses(studentId) {
  return query(
    `
      SELECT
        courses.id AS course_id,
        courses.course_code,
        courses.course_name,
        COUNT(*) AS failed_attempts,
        MAX(terms.start_date) AS latest_term_start,
        GROUP_CONCAT(DISTINCT terms.name ORDER BY terms.start_date DESC SEPARATOR '、') AS failed_terms
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND courses.course_type = '${COURSE_TYPE.REQUIRED}'
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
        AND grades.total_score < 60
        AND NOT EXISTS (
          SELECT 1
          FROM enrollments AS pass_enrollments
          INNER JOIN course_sections AS pass_sections ON pass_sections.id = pass_enrollments.section_id
          INNER JOIN grades AS pass_grades ON pass_grades.enrollment_id = pass_enrollments.id
          WHERE pass_enrollments.student_id = enrollments.student_id
            AND pass_enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
            AND pass_sections.course_id = courses.id
            AND pass_grades.status = '${GRADE_STATUS.PUBLISHED}'
            AND pass_grades.total_score >= 60
        )
      GROUP BY courses.id
      ORDER BY failed_attempts DESC, latest_term_start DESC
    `,
    [studentId]
  );
}

router.use(requireRoles('admin'));

router.get('/preview/student-number', async (req, res) => {
  const { class_id = '' } = req.query;

  if (!class_id) {
    return res.status(400).json({ message: 'missing_required_params' });
  }

  const entryYear = await getClassEntryYear(class_id);

  if (!entryYear) {
    return res.status(404).json({ message: 'class_not_found' });
  }

  const payload = await resolveStudentNumber({
    classId: Number(class_id),
    entryYear
  });

  if (!payload) {
    return res.status(404).json({ message: 'class_not_found' });
  }

  return res.json({
    classSerial: payload.classSerial,
    studentNo: payload.studentNo
  });
});

router.get('/preview/teacher-no', async (req, res) => {
  const { department_id = '' } = req.query;

  if (!department_id) {
    return res.status(400).json({ message: 'missing_required_params' });
  }

  const payload = await resolveTeacherNo({ departmentId: Number(department_id) });

  if (!payload) {
    return res.status(404).json({ message: 'department_not_found' });
  }

  return res.json({
    teacherNo: payload.teacherNo
  });
});

router.get('/preview/course-code', async (req, res) => {
  const { major_id = '', course_type = COURSE_TYPE.REQUIRED } = req.query;

  if (!major_id) {
    return res.status(400).json({ message: 'missing_required_params' });
  }

  const payload = await resolveCourseCode({
    majorId: Number(major_id),
    courseType: course_type
  });

  if (!payload) {
    return res.status(404).json({ message: 'major_not_found' });
  }

  return res.json({
    courseCode: payload.courseCode
  });
});

router.get('/preview/section-code', async (req, res) => {
  const { term_id = '', course_id = '' } = req.query;

  if (!term_id || !course_id) {
    return res.status(400).json({ message: 'missing_required_params' });
  }

  const payload = await resolveSectionCode({
    termId: Number(term_id),
    courseId: Number(course_id)
  });

  if (!payload) {
    return res.status(404).json({ message: 'section_context_not_found' });
  }

  return res.json({
    sectionCode: payload.sectionCode
  });
});

router.get('/users', async (req, res) => {
  const { keyword = '', role = '', status = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 6);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(users.username LIKE ? OR users.full_name LIKE ? OR COALESCE(students.student_no, teachers.teacher_no, admins.admin_no, "") LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (role) {
    filters.push('users.role = ?');
    params.push(role);
  }

  if (status) {
    filters.push('users.status = ?');
    params.push(status);
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM users
      LEFT JOIN students ON students.user_id = users.id
      LEFT JOIN teachers ON teachers.user_id = users.id
      LEFT JOIN admins ON admins.user_id = users.id
      WHERE ${whereClause}
    `,
    params
  );

  const users = await query(
    `
      SELECT
        users.*,
        students.student_no,
        teachers.teacher_no,
        teachers.title,
        admins.admin_no,
        admins.position
      FROM users
      LEFT JOIN students ON students.user_id = users.id
      LEFT JOIN teachers ON teachers.user_id = users.id
      LEFT JOIN admins ON admins.user_id = users.id
      WHERE ${whereClause}
      ORDER BY users.role ASC, users.id ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/users', {
    pageTitle: '账号管理',
    users,
    filters: { keyword, role, status },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.post('/users/:userId/status', async (req, res) => {
  const userId = Number(req.params.userId);
  const { status } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/users');

  try {
    const result = await query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);

    if (!result.affectedRows) {
      req.flash('danger', '账号不存在。');
      return res.redirect(redirectPath);
    }

    req.flash('success', `账号状态已更新为${status}。`);
  } catch (error) {
    req.flash('danger', '账号状态更新失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.post('/users/:userId/reset-password', async (req, res) => {
  const userId = Number(req.params.userId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/users');
  const rows = await query('SELECT id, role, username FROM users WHERE id = ? LIMIT 1', [userId]);
  const targetUser = rows[0];

  if (!targetUser) {
    req.flash('danger', '账号不存在。');
    return res.redirect(redirectPath);
  }

  try {
    const passwordHash = await hashDefaultPassword(targetUser.role);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    req.flash('success', `${targetUser.username} 的密码已重置为默认密码。`);
  } catch (error) {
    req.flash('danger', '密码重置失败，请稍后重试。');
  }
  return res.redirect(redirectPath);
});

router.get('/students', async (req, res) => {
  const [majors, allClasses] = await Promise.all([getMajors(), getClasses()]);
  const { keyword = '', major_id = '', class_id = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const filters = ['1 = 1'];
  const params = [];
  const classes = major_id
    ? allClasses.filter((item) => String(item.major_id) === String(major_id))
    : allClasses;

  if (keyword) {
    filters.push('(students.student_no LIKE ? OR users.full_name LIKE ? OR users.username LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (major_id) {
    filters.push('classes.major_id = ?');
    params.push(Number(major_id));
  }

  if (class_id) {
    filters.push('students.class_id = ?');
    params.push(Number(class_id));
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM students
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN classes ON classes.id = students.class_id
      WHERE ${whereClause}
    `,
    params
  );

  const students = await query(
    `
      SELECT
        students.*,
        students.gender,
        users.username,
        users.full_name,
        users.email,
        users.phone,
        users.status AS user_status,
        classes.class_code,
        classes.class_name,
        majors.name AS major_name,
        departments.name AS department_name,
        departments.department_no
      FROM students
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN classes ON classes.id = students.class_id
      INNER JOIN majors ON majors.id = classes.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      WHERE ${whereClause}
      ORDER BY students.student_no ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/students', {
    pageTitle: '学生管理',
    students,
    majors,
    classes,
    filters: { keyword, major_id, class_id },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/students/new', async (req, res) => {
  const classes = await getClasses();

  return res.render('pages/admin/student-form', {
    pageTitle: '新增学生',
    mode: 'create',
    student: null,
    classes,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/students')
  });
});

router.get('/students/:studentId/edit', async (req, res) => {
  const studentId = Number(req.params.studentId);
  const classes = await getClasses();
  const student = (
    await query(
      `
        SELECT
          students.*,
          users.username,
          users.full_name,
          users.email,
          users.phone
        FROM students
        INNER JOIN users ON users.id = students.user_id
        WHERE students.id = ?
        LIMIT 1
      `,
      [studentId]
    )
  )[0];

  if (!student) {
    return renderMissingPage(res, '学生不存在');
  }

  return res.render('pages/admin/student-form', {
    pageTitle: '编辑学生',
    mode: 'edit',
    student,
    classes,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/students')
  });
});

router.post('/students', async (req, res) => {
  const { username, full_name, class_id } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/students');

  if (!username || !full_name || !class_id) {
    req.flash('danger', '请填写用户名、姓名并选择所属班级。');
    return res.redirect(redirectPath);
  }

  try {
    const passwordHash = await hashDefaultPassword('student');

    await withTransaction(async (connection) => {
      const entryYear = await getClassEntryYear(Number(class_id), connection);

      if (!entryYear) {
        throw new Error('class_not_found');
      }

      const studentNumberPayload = await resolveStudentNumber(
        {
          classId: Number(class_id),
          entryYear
        },
        connection
      );
      if (!studentNumberPayload) {
        throw new Error('student_identity_unavailable');
      }

      const admissionTermId = await resolveAdmissionTermId(entryYear, connection);
      const creditsRequired = await getCreditsRequiredForClass(class_id, connection);

      const [userResult] = await connection.execute(
        `
          INSERT INTO users (username, password_hash, role, full_name, email, phone, avatar_color, status)
          VALUES (?, ?, 'student', ?, ?, ?, ?, ?)
        `,
        [
          username.trim(),
          passwordHash,
          full_name.trim(),
          null,
          null,
          getRoleColor('student'),
          USER_STATUS.ENABLED
        ]
      );

      await connection.execute(
        `
          INSERT INTO students (
            user_id,
            student_no,
            gender,
            class_id,
            class_serial,
            entry_year,
            admission_term_id,
            birth_date,
            address,
            credits_required
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userResult.insertId,
          studentNumberPayload.studentNo,
          null,
          Number(class_id),
          studentNumberPayload.classSerial,
          entryYear,
          admissionTermId,
          null,
          null,
          creditsRequired
        ]
      );
    });

    req.flash('success', '学生已创建。');
  } catch (error) {
    if (error.message === 'class_not_found') {
      req.flash('danger', '所选班级不存在或缺少年级信息。');
    } else if (error.message === 'student_identity_unavailable') {
      req.flash('danger', '学号生成失败，请检查班级配置后重试。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '用户名或学号已存在，请检查后重试。');
    } else {
      req.flash('danger', '学生创建失败，请检查表单内容后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/students/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  const { class_id } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/students');

  if (!class_id) {
    req.flash('danger', '请选择所属班级。');
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      const [studentRows] = await connection.query('SELECT id FROM students WHERE id = ? LIMIT 1', [studentId]);
      const student = studentRows[0];

      if (!student) {
        throw new Error('student_not_found');
      }

      const creditsRequired = await getCreditsRequiredForClass(class_id, connection);

      await connection.execute(
        `
          UPDATE students
          SET class_id = ?, credits_required = ?
          WHERE id = ?
        `,
        [Number(class_id), creditsRequired, studentId]
      );
    });

    req.flash('success', '学生所属班级已更新。');
  } catch (error) {
    if (error.message === 'student_not_found') {
      req.flash('danger', '学生记录不存在。');
    } else {
      req.flash('danger', '学生信息更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/students/:studentId/legacy-edit', async (req, res) => {
  return res.redirect(307, `/admin/students/${req.params.studentId}`);
});

router.delete('/students/:studentId', async (req, res) => {
  const studentId = Number(req.params.studentId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/students');
  const studentRows = await query('SELECT user_id FROM students WHERE id = ? LIMIT 1', [studentId]);
  const student = studentRows[0];

  if (!student) {
    req.flash('danger', '学生记录不存在。');
    return res.redirect(redirectPath);
  }

  const [enrollmentCount, evaluationCount, warningCount, announcementCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM enrollments WHERE student_id = ?', [studentId]),
    getCount('SELECT COUNT(*) AS total FROM teaching_evaluations WHERE student_id = ?', [studentId]),
    getCount('SELECT COUNT(*) AS total FROM academic_warnings WHERE student_id = ?', [studentId]),
    getCount('SELECT COUNT(*) AS total FROM announcements WHERE target_student_id = ?', [studentId])
  ]);
  const dependencySummary = summarizeDependencies([
    { label: '选课记录', total: enrollmentCount },
    { label: '教学评价', total: evaluationCount },
    { label: '学业预警', total: warningCount },
    { label: '定向公告', total: announcementCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `学生仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      await connection.execute('DELETE FROM students WHERE id = ?', [studentId]);
      await connection.execute('DELETE FROM users WHERE id = ?', [student.user_id]);
    });

    req.flash('success', '学生记录已删除。');
  } catch (error) {
    req.flash('danger', '学生记录删除失败，请确认不存在关联数据后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/students/:studentId/academics', async (req, res) => {
  const studentId = Number(req.params.studentId);
  const { page, pageSize, offset } = getPagination(req.query, 6);
  const returnTo = getSafeReturnPath(req.query.return_to, '/admin/students');
  const currentTermId = res.locals.currentTerm?.id || null;
  const [student, recordCountRows, records, warningHistory, outstandingCourses] = await Promise.all([
    query(
      `
        SELECT
          students.id,
          students.student_no,
          users.full_name,
          classes.class_name,
          majors.name AS major_name,
          users.email,
          users.phone
        FROM students
        INNER JOIN users ON users.id = students.user_id
        INNER JOIN classes ON classes.id = students.class_id
        INNER JOIN majors ON majors.id = classes.major_id
        WHERE students.id = ?
        LIMIT 1
      `,
      [studentId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT COUNT(*) AS total
        FROM enrollments
        WHERE enrollments.student_id = ?
      `,
      [studentId]
    ),
    query(
      `
        SELECT
          courses.course_code,
          courses.course_name,
          courses.course_type,
          course_sections.section_code,
          terms.name AS term_name,
          users.full_name AS teacher_name,
          enrollments.status AS enrollment_status,
          grades.total_score,
          grades.grade_point,
          grades.status AS grade_status
        FROM enrollments
        INNER JOIN course_sections ON course_sections.id = enrollments.section_id
        INNER JOIN courses ON courses.id = course_sections.course_id
        INNER JOIN terms ON terms.id = course_sections.term_id
        INNER JOIN teachers ON teachers.id = course_sections.teacher_id
        INNER JOIN users ON users.id = teachers.user_id
        LEFT JOIN grades ON grades.enrollment_id = enrollments.id
        WHERE enrollments.student_id = ?
        ORDER BY terms.start_date DESC, courses.course_code ASC
        LIMIT ? OFFSET ?
      `,
      [studentId, pageSize, offset]
    ),
    query(
      `
        SELECT
          academic_warnings.term_id,
          academic_warnings.required_failed_count,
          academic_warnings.created_at,
          terms.name AS term_name,
          announcements.title
        FROM academic_warnings
        INNER JOIN terms ON terms.id = academic_warnings.term_id
        LEFT JOIN announcements ON announcements.id = academic_warnings.announcement_id
        WHERE academic_warnings.student_id = ?
        ORDER BY academic_warnings.created_at DESC
      `,
      [studentId]
    ),
    getOutstandingRequiredCourses(studentId)
  ]);

  if (!student) {
    return renderMissingPage(res, '学生不存在');
  }

  return res.render('pages/admin/student-academics', {
    pageTitle: '学业详情',
    student,
    records,
    warningHistory,
    outstandingCourses,
    currentWarningCount: outstandingCourses.length,
    totalRecords: recordCountRows[0]?.total || 0,
    returnTo,
    warningReturnTo: req.originalUrl,
    hasCurrentTermWarning: currentTermId ? warningHistory.some((item) => Number(item.term_id) === Number(currentTermId)) : false,
    pagination: buildPagination(recordCountRows[0]?.total || 0, page, pageSize)
  });
});

router.post('/students/:studentId/warnings', async (req, res, next) => {
  const studentId = Number(req.params.studentId);
  const currentTerm = res.locals.currentTerm;
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/students/${studentId}/academics`);

  if (!currentTerm) {
    req.flash('warning', '当前未设置进行中的学期，暂时无法发起学业预警。');
    return res.redirect(redirectPath);
  }

  const [student, existingWarning, outstandingCourses] = await Promise.all([
    query(
      `
        SELECT students.id, users.full_name
        FROM students
        INNER JOIN users ON users.id = students.user_id
        WHERE students.id = ?
        LIMIT 1
      `,
      [studentId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT id
        FROM academic_warnings
        WHERE student_id = ?
          AND term_id = ?
        LIMIT 1
      `,
      [studentId, currentTerm.id]
    ).then((rows) => rows[0] || null),
    getOutstandingRequiredCourses(studentId)
  ]);

  if (!student) {
    return renderMissingPage(res, '学生不存在');
  }

  if (existingWarning) {
    req.flash('warning', '该学生在当前学期已经发送过学业预警。');
    return res.redirect(redirectPath);
  }

  if (outstandingCourses.length <= 5) {
    req.flash('warning', '当前未达到学业预警触发条件。');
    return res.redirect(redirectPath);
  }

  const adminProfileId =
    req.session.user.profileId ||
    (
      await query('SELECT id FROM admins WHERE user_id = ? LIMIT 1', [req.session.user.id]).then(
        (rows) => rows[0]?.id || null
      )
    );

  if (!adminProfileId) {
    req.flash('danger', '未找到当前管理员档案，无法发送学业预警。');
    return res.redirect(redirectPath);
  }

  const content = `系统检测到你当前仍有 ${outstandingCourses.length} 门必修课程未通过：${outstandingCourses
    .slice(0, 8)
    .map((item) => `${item.course_name}（${item.failed_attempts} 次）`)
    .join('、')}。请尽快联系辅导员和任课教师，制定重修与复习计划。`;

  try {
    await withTransaction(async (connection) => {
      const [announcementResult] = await connection.execute(
        `
          INSERT INTO announcements (
            title,
            content,
            category,
            target_role,
            target_student_id,
            priority,
            published_by,
            published_at
          )
          VALUES (?, ?, ?, 'student', ?, ?, ?, NOW())
        `,
        [
          `学业预警通知 · ${student.full_name}`,
          content,
          ANNOUNCEMENT_CATEGORY.WARNING,
          studentId,
          ANNOUNCEMENT_PRIORITY.URGENT,
          req.session.user.id
        ]
      );

      await connection.execute(
        `
          INSERT INTO academic_warnings (
            student_id,
            term_id,
            issued_by,
            announcement_id,
            required_failed_count,
            content
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [studentId, currentTerm.id, adminProfileId, announcementResult.insertId, outstandingCourses.length, content]
      );
    });

    req.flash('success', '学业预警已发送。');
  } catch (error) {
    req.flash('danger', '学业预警发送失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/teachers', async (req, res) => {
  const departments = await getDepartments();
  const { keyword = '', department_id = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(teachers.teacher_no LIKE ? OR users.full_name LIKE ? OR users.username LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (department_id) {
    filters.push('teachers.department_id = ?');
    params.push(Number(department_id));
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM teachers
      INNER JOIN users ON users.id = teachers.user_id
      WHERE ${whereClause}
    `,
    params
  );

  const teachers = await query(
    `
      SELECT
        teachers.*,
        users.username,
        users.full_name,
        users.email,
        users.phone,
        users.status AS user_status,
        departments.name AS department_name
      FROM teachers
      INNER JOIN users ON users.id = teachers.user_id
      INNER JOIN departments ON departments.id = teachers.department_id
      WHERE ${whereClause}
      ORDER BY teachers.teacher_no ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/teachers', {
    pageTitle: '教师管理',
    teachers,
    departments,
    filters: { keyword, department_id },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/teachers/new', async (req, res) => {
  const departments = await getDepartments();

  return res.render('pages/admin/teacher-form', {
    pageTitle: '新增教师',
    mode: 'create',
    teacher: null,
    departments,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/teachers')
  });
});

router.get('/teachers/:teacherId/edit', async (req, res) => {
  const teacherId = Number(req.params.teacherId);
  const departments = await getDepartments();
  const teacher = (
    await query(
      `
        SELECT
          teachers.*,
          users.username,
          users.full_name,
          users.email,
          users.phone
        FROM teachers
        INNER JOIN users ON users.id = teachers.user_id
        WHERE teachers.id = ?
        LIMIT 1
      `,
      [teacherId]
    )
  )[0];

  if (!teacher) {
    return renderMissingPage(res, '教师不存在');
  }

  return res.render('pages/admin/teacher-form', {
    pageTitle: '编辑教师',
    mode: 'edit',
    teacher,
    departments,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/teachers')
  });
});

router.post('/teachers', async (req, res) => {
  const { username, full_name, department_id, title, office_location } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/teachers');

  if (!username || !full_name || !department_id) {
    req.flash('danger', '请完整填写教师账号、姓名和所属院系。');
    return res.redirect(redirectPath);
  }

  try {
    const passwordHash = await hashDefaultPassword('teacher');

    await withTransaction(async (connection) => {
      const teacherNoPayload = await resolveTeacherNo({ departmentId: Number(department_id) }, connection);

      if (!teacherNoPayload) {
        throw new Error('teacher_identity_unavailable');
      }

      const [userResult] = await connection.execute(
        `
          INSERT INTO users (username, password_hash, role, full_name, email, phone, avatar_color, status)
          VALUES (?, ?, 'teacher', ?, ?, ?, ?, ?)
        `,
        [
          username.trim(),
          passwordHash,
          full_name.trim(),
          null,
          null,
          getRoleColor('teacher'),
          USER_STATUS.ENABLED
        ]
      );

      await connection.execute(
        `
          INSERT INTO teachers (
            user_id,
            teacher_no,
            gender,
            birth_date,
            address,
            department_id,
            title,
            office_location,
            specialty_text
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userResult.insertId,
          teacherNoPayload.teacherNo,
          null,
          null,
          null,
          Number(department_id),
          title?.trim() || null,
          office_location?.trim() || null,
          null
        ]
      );
    });

    req.flash('success', '教师档案已创建。');
  } catch (error) {
    if (error.message === 'teacher_identity_unavailable') {
      req.flash('danger', '工号生成失败，请检查院系配置后重试。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '教师账号或工号已存在，请检查后重试。');
    } else {
      req.flash('danger', '教师档案创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/teachers/:teacherId', async (req, res) => {
  const teacherId = Number(req.params.teacherId);
  const { username, full_name, department_id, title, office_location } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/teachers');

  try {
    await withTransaction(async (connection) => {
      const [teacherRows] = await connection.query('SELECT user_id FROM teachers WHERE id = ? LIMIT 1', [teacherId]);
      const teacher = teacherRows[0];

      if (!teacher) {
        throw new Error('teacher_not_found');
      }

      await connection.execute(
        `
          UPDATE users
          SET username = ?, full_name = ?
          WHERE id = ?
        `,
        [username.trim(), full_name.trim(), teacher.user_id]
      );

      await connection.execute(
        `
          UPDATE teachers
          SET department_id = ?, title = ?, office_location = ?
          WHERE id = ?
        `,
        [
          Number(department_id),
          title?.trim() || null,
          office_location?.trim() || null,
          teacherId
        ]
      );
    });

    req.flash('success', '教师信息已更新。');
  } catch (error) {
    if (error.message === 'teacher_not_found') {
      req.flash('danger', '教师记录不存在。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '教师账号或工号已存在，请检查后重试。');
    } else {
      req.flash('danger', '教师信息更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/teachers/:teacherId', async (req, res) => {
  const teacherId = Number(req.params.teacherId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/teachers');
  const teacherRows = await query('SELECT user_id FROM teachers WHERE id = ? LIMIT 1', [teacherId]);
  const teacher = teacherRows[0];

  if (!teacher) {
    req.flash('danger', '教师记录不存在。');
    return res.redirect(redirectPath);
  }

  const [sectionCount, evaluationCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM course_sections WHERE teacher_id = ?', [teacherId]),
    getCount('SELECT COUNT(*) AS total FROM teaching_evaluations WHERE teacher_id = ?', [teacherId])
  ]);
  const dependencySummary = summarizeDependencies([
    { label: '开课记录', total: sectionCount },
    { label: '教学评价', total: evaluationCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `该教师仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      await connection.execute('DELETE FROM teachers WHERE id = ?', [teacherId]);
      await connection.execute('DELETE FROM users WHERE id = ?', [teacher.user_id]);
    });

    req.flash('success', '教师记录已删除。');
  } catch (error) {
    req.flash('danger', '教师记录删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/courses', async (req, res) => {
  const [departments, majors] = await Promise.all([getDepartments(), getMajors()]);
  const { keyword = '', department_id = '', course_type = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(courses.course_code LIKE ? OR courses.course_name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (department_id) {
    filters.push('courses.department_id = ?');
    params.push(Number(department_id));
  }

  if (course_type) {
    filters.push('courses.course_type = ?');
    params.push(course_type);
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM courses
      WHERE ${whereClause}
    `,
    params
  );

  const courses = await query(
    `
      SELECT
        courses.*,
        departments.name AS department_name,
        majors.name AS major_name
      FROM courses
      INNER JOIN departments ON departments.id = courses.department_id
      INNER JOIN majors ON majors.id = courses.major_id
      WHERE ${whereClause}
      ORDER BY courses.course_code ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/courses', {
    pageTitle: '课程管理',
    departments,
    majors,
    courses,
    filters: { keyword, department_id, course_type },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/courses/new', async (req, res) => {
  const [departments, majors] = await Promise.all([getDepartments(), getMajors()]);

  return res.render('pages/admin/course-form', {
    pageTitle: '新增课程',
    mode: 'create',
    course: null,
    departments,
    majors,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/courses')
  });
});

router.get('/courses/:courseId/edit', async (req, res) => {
  const courseId = Number(req.params.courseId);
  const [departments, majors] = await Promise.all([getDepartments(), getMajors()]);
  const course = (
    await query(
      `
        SELECT *
        FROM courses
        WHERE id = ?
        LIMIT 1
      `,
      [courseId]
    )
  )[0];

  if (!course) {
    return renderMissingPage(res, '课程不存在');
  }

  return res.render('pages/admin/course-form', {
    pageTitle: '编辑课程',
    mode: 'edit',
    course,
    departments,
    majors,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/courses')
  });
});

router.post('/courses', async (req, res) => {
  const { department_id, major_id, course_name, course_type, credits, total_hours, assessment_method, description } =
    req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/courses');
  const major = await getMajorByDepartment(department_id, major_id);

  if (!major) {
    req.flash('danger', '所属专业与院系不匹配，请重新选择。');
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      const courseCodePayload = await resolveCourseCode(
        {
          majorId: Number(major_id),
          courseType: course_type || COURSE_TYPE.REQUIRED
        },
        connection
      );

      if (!courseCodePayload) {
        throw new Error('course_identity_unavailable');
      }

      await connection.execute(
        `
          INSERT INTO courses (
            department_id,
            major_id,
            course_code,
            course_name,
            course_type,
            credits,
            total_hours,
            assessment_method,
            description
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(department_id),
          Number(major_id),
          courseCodePayload.courseCode,
          course_name.trim(),
          course_type || COURSE_TYPE.REQUIRED,
          Number(credits),
          Number(total_hours),
          assessment_method.trim(),
          description?.trim() || null
        ]
      );
    });

    req.flash('success', '课程已创建。');
  } catch (error) {
    if (error.message === 'course_identity_unavailable') {
      req.flash('danger', '课程号生成失败，请检查专业和课程性质后重试。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '课程号已存在，请检查后重试。');
    } else {
      req.flash('danger', '课程创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/courses/:courseId', async (req, res) => {
  const courseId = Number(req.params.courseId);
  const { department_id, major_id, course_name, course_type, credits, total_hours, assessment_method, description } =
    req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/courses');
  const major = await getMajorByDepartment(department_id, major_id);

  if (!major) {
    req.flash('danger', '所属专业与院系不匹配，请重新选择。');
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      await connection.execute(
        `
          UPDATE courses
          SET department_id = ?,
              major_id = ?,
              course_name = ?,
              course_type = ?,
              credits = ?,
              total_hours = ?,
              assessment_method = ?,
              description = ?
          WHERE id = ?
        `,
        [
          Number(department_id),
          Number(major_id),
          course_name.trim(),
          course_type || COURSE_TYPE.REQUIRED,
          Number(credits),
          Number(total_hours),
          assessment_method.trim(),
          description?.trim() || null,
          courseId
        ]
      );

      await syncTrainingPlanCreditsByCourse(courseId, connection);
    });

    req.flash('success', '课程已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '课程编码已存在，请检查后重试。');
    } else {
      req.flash('danger', '课程更新失败，请检查表单内容后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/courses/:courseId', async (req, res) => {
  const courseId = Number(req.params.courseId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/courses');

  const [sectionCount, planCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM course_sections WHERE course_id = ?', [courseId]),
    getCount('SELECT COUNT(*) AS total FROM training_plan_courses WHERE course_id = ?', [courseId])
  ]);

  const dependencySummary = summarizeDependencies([
    { label: '开课记录', total: sectionCount },
    { label: '培养方案映射', total: planCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `课程仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM courses WHERE id = ?', [courseId]);
    req.flash('success', '课程已删除。');
  } catch (error) {
    req.flash('danger', '课程删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/sections', async (req, res) => {
  const [departments, courses, teachers, terms, classrooms, timeSlots] = await Promise.all([
    getDepartments(),
    getCourses(),
    getTeachers(),
    getTerms(),
    getClassrooms(),
    getTimeSlots()
  ]);
  const { keyword = '', term_id = '', status = '', course_type = '', department_id = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(courses.course_name LIKE ? OR course_sections.section_code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
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

  if (department_id) {
    filters.push('courses.department_id = ?');
    params.push(Number(department_id));
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
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
        departments.name AS department_name,
        users.full_name AS teacher_name,
        terms.name AS term_name,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.label,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN departments ON departments.id = courses.department_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      WHERE ${whereClause}
      GROUP BY course_sections.id
      ORDER BY terms.start_date DESC, time_slots.weekday ASC, time_slots.start_period ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/sections', {
    pageTitle: '开课管理',
    sections,
    departments,
    courses,
    teachers,
    terms,
    classrooms,
    timeSlots,
    filters: { keyword, term_id, status, course_type, department_id },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});
router.get('/sections/new', async (req, res) => {
  const [courses, teachers, terms, classrooms, timeSlots] = await Promise.all([
    getCourses(),
    getTeachers(),
    getSectionSelectableTerms(),
    getClassrooms(),
    getTimeSlots()
  ]);

  return res.render('pages/admin/section-form', {
    mode: 'create',
    section: null,
    courses,
    teachers,
    terms,
    classrooms,
    timeSlots,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/sections')
  });
});

router.get('/sections/:sectionId/edit', async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  const [courses, teachers, terms, classrooms, timeSlots, section] = await Promise.all([
    getCourses(),
    getTeachers(),
    getSectionSelectableTerms(),
    getClassrooms(),
    getTimeSlots(),
    query(
      `
        SELECT *
        FROM course_sections
        WHERE id = ?
        LIMIT 1
      `,
      [sectionId]
    ).then((rows) => rows[0] || null)
  ]);

  if (!section) {
    return renderMissingPage(res, '开课记录不存在');
  }

  if (section.selection_status === SECTION_STATUS.ARCHIVED) {
    req.flash('danger', '已归档的开课记录不能编辑。');
    return res.redirect(getSafeReturnPath(req.query.return_to, '/admin/sections'));
  }

  return res.render('pages/admin/section-form', {
    mode: 'edit',
    section,
    courses,
    teachers,
    terms,
    classrooms,
    timeSlots,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/sections')
  });
});

router.post('/sections', async (req, res) => {
  const {
    course_id,
    teacher_id,
    term_id,
    classroom_id,
    time_slot_id,
    weeks_text,
    capacity,
    selection_status,
    usual_weight,
    final_weight,
    notes
  } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/sections');

  if (Number(usual_weight) + Number(final_weight) !== 100) {
    req.flash('danger', '平时成绩占比与期末成绩占比之和必须为 100%。');
    return res.redirect(redirectPath);
  }

  if (!(await isSectionSelectableTerm(term_id))) {
    req.flash('danger', '开课学期仅允许选择当前学期或规划中的学期。');
    return res.redirect(redirectPath);
  }

  const conflict = await ensureSectionConflict({
    termId: Number(term_id),
    timeSlotId: Number(time_slot_id),
    teacherId: Number(teacher_id),
    classroomId: Number(classroom_id)
  });

  if (conflict) {
    req.flash(
      'danger',
      conflict.conflict_type === 'teacher'
        ? `任课教师在同一时段已安排 ${conflict.section_code}。`
        : `教室在同一时段已被 ${conflict.section_code} 占用。`
    );
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      const sectionCodePayload = await resolveSectionCode(
        {
          termId: Number(term_id),
          courseId: Number(course_id)
        },
        connection
      );

      if (!sectionCodePayload) {
        throw new Error('section_identity_unavailable');
      }

      await connection.execute(
        `
          INSERT INTO course_sections (
            course_id,
            teacher_id,
            term_id,
            classroom_id,
            time_slot_id,
            section_code,
            weeks_text,
            capacity,
            selection_status,
            usual_weight,
            final_weight,
            notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(course_id),
          Number(teacher_id),
          Number(term_id),
          Number(classroom_id),
          Number(time_slot_id),
          sectionCodePayload.sectionCode,
          weeks_text?.trim() || '1-16周',
          Number(capacity),
          selection_status || SECTION_STATUS.OPEN,
          Number(usual_weight),
          Number(final_weight),
          notes?.trim() || null
        ]
      );
    });

    req.flash('success', '开课记录已创建。');
  } catch (error) {
    if (error.message === 'section_identity_unavailable') {
      req.flash('danger', '开课编号生成失败，请检查课程和学期后重试。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '开课编号已存在，请检查后重试。');
    } else {
      req.flash('danger', '开课记录创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/sections/:sectionId', async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  const {
    course_id,
    teacher_id,
    term_id,
    classroom_id,
    time_slot_id,
    weeks_text,
    capacity,
    selection_status,
    usual_weight,
    final_weight,
    notes
  } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/sections');

  if (Number(usual_weight) + Number(final_weight) !== 100) {
    req.flash('danger', '平时成绩占比与期末成绩占比之和必须为 100%。');
    return res.redirect(redirectPath);
  }

  if (!(await isSectionSelectableTerm(term_id))) {
    req.flash('danger', '开课学期仅允许选择当前学期或规划中的学期。');
    return res.redirect(redirectPath);
  }

  const conflict = await ensureSectionConflict({
    termId: Number(term_id),
    timeSlotId: Number(time_slot_id),
    teacherId: Number(teacher_id),
    classroomId: Number(classroom_id),
    excludeId: sectionId
  });

  if (conflict) {
    req.flash(
      'danger',
      conflict.conflict_type === 'teacher'
        ? `任课教师在同一时段已安排 ${conflict.section_code}。`
        : `教室在同一时段已被 ${conflict.section_code} 占用。`
    );
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      const [sectionRows] = await connection.query(
        `
          SELECT id, selection_status
          FROM course_sections
          WHERE id = ?
          LIMIT 1
        `,
        [sectionId]
      );

      const section = sectionRows[0];

      if (!section) {
        throw new Error('section_not_found');
      }

      if (section.selection_status === SECTION_STATUS.ARCHIVED) {
        throw new Error('section_archived');
      }

      await connection.execute(
        `
          UPDATE course_sections
          SET course_id = ?,
              teacher_id = ?,
              term_id = ?,
              classroom_id = ?,
              time_slot_id = ?,
              weeks_text = ?,
              capacity = ?,
              selection_status = ?,
              usual_weight = ?,
              final_weight = ?,
              notes = ?
          WHERE id = ?
        `,
        [
          Number(course_id),
          Number(teacher_id),
          Number(term_id),
          Number(classroom_id),
          Number(time_slot_id),
          weeks_text?.trim() || '1-16周',
          Number(capacity),
          selection_status || SECTION_STATUS.OPEN,
          Number(usual_weight),
          Number(final_weight),
          notes?.trim() || null,
          sectionId
        ]
      );

      await recalculateSectionGrades(connection, sectionId, Number(usual_weight), Number(final_weight));
    });

    req.flash('success', '开课记录已更新。');
  } catch (error) {
    if (error.message === 'section_not_found') {
      req.flash('danger', '开课记录不存在。');
    } else if (error.message === 'section_archived') {
      req.flash('danger', '已归档的开课记录不能编辑。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '开课编号已存在，请检查后重试。');
    } else {
      req.flash('danger', '开课记录更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/sections/:sectionId', async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/sections');
  const section = await getSectionDeleteSummary(sectionId);

  if (!section) {
    req.flash('danger', '开课记录不存在。');
    return res.redirect(redirectPath);
  }

  if (section.selection_status === SECTION_STATUS.ARCHIVED) {
    req.flash('danger', '已归档的开课记录不能删除。');
    return res.redirect(redirectPath);
  }

  const dependencySummary = summarizeDependencies([
    { label: '选课记录', total: section.enrollment_count },
    { label: '成绩记录', total: section.grade_count },
    { label: '教学评价', total: section.evaluation_count }
  ]);

  if (dependencySummary) {
    req.flash('danger', `开课记录仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM course_sections WHERE id = ?', [sectionId]);
    req.flash('success', '开课记录已删除。');
  } catch (error) {
    req.flash('danger', '开课记录删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.delete('/sections/:sectionId/legacy-delete', async (req, res) => {
  const sectionId = Number(req.params.sectionId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/sections');
  const section = await getSectionDeleteSummary(sectionId);

  if (!section) {
    req.flash('danger', '开课记录不存在。');
    return res.redirect(redirectPath);
  }

  if (section.selection_status === SECTION_STATUS.ARCHIVED) {
    req.flash('danger', '已归档的开课记录不能删除。');
    return res.redirect(redirectPath);
  }

  const dependencySummary = summarizeDependencies([
    { label: '选课记录', total: section.enrollment_count },
    { label: '成绩记录', total: section.grade_count },
    { label: '教学评价', total: section.evaluation_count }
  ]);

  if (dependencySummary) {
    req.flash('danger', `开课记录仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM course_sections WHERE id = ?', [sectionId]);
    req.flash('success', '开课记录已删除。');
  } catch (error) {
    req.flash('danger', '开课记录删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/terms', async (req, res) => {
  const { keyword = '', status = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 8);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(terms.name LIKE ? OR terms.academic_year LIKE ? OR terms.semester_label LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (status) {
    filters.push('terms.status = ?');
    params.push(status);
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(`SELECT COUNT(*) AS total FROM terms WHERE ${whereClause}`, params);
  const terms = await query(
    `
      SELECT *
      FROM terms
      WHERE ${whereClause}
      ORDER BY start_date DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/terms', {
    pageTitle: '学期管理',
    terms,
    filters: { keyword, status },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/terms/new', async (req, res) => {
  return res.render('pages/admin/term-form', {
    pageTitle: '新增学期',
    mode: 'create',
    term: null,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/terms')
  });
});

router.get('/terms/:termId/edit', async (req, res) => {
  const termId = Number(req.params.termId);
  const term = (
    await query(
      `
        SELECT *
        FROM terms
        WHERE id = ?
        LIMIT 1
      `,
      [termId]
    )
  )[0];

  if (!term) {
    return renderMissingPage(res, '学期不存在');
  }

  return res.render('pages/admin/term-form', {
    pageTitle: '编辑学期',
    mode: 'edit',
    term,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/terms')
  });
});

router.post('/terms', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/terms');
  const payload = normalizeTermPayload(req.body);
  const validationMessage = validateTermPayload(payload);

  if (validationMessage) {
    req.flash('danger', validationMessage);
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      if (payload.isCurrent === 1) {
        await connection.execute('UPDATE terms SET is_current = 0');
      }

      await connection.execute(
        `
          INSERT INTO terms (name, academic_year, semester_label, start_date, end_date, selection_start, selection_end, is_current, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          payload.name,
          payload.academicYear,
          payload.semesterLabel,
          payload.startDate,
          payload.endDate,
          payload.selectionStart,
          payload.selectionEnd,
          payload.isCurrent,
          payload.status
        ]
      );
    });

    req.flash('success', '学期已创建。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '学期名称或学年信息重复，请检查后重试。');
    } else if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      req.flash('danger', '学期时间范围不符合系统规则，请检查教学周期和选课窗口。');
    } else {
      req.flash('danger', '学期创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/terms/:termId', async (req, res) => {
  const termId = Number(req.params.termId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/terms');
  const payload = normalizeTermPayload(req.body);
  const validationMessage = validateTermPayload(payload);

  if (validationMessage) {
    req.flash('danger', validationMessage);
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      if (payload.isCurrent === 1) {
        await connection.execute('UPDATE terms SET is_current = 0 WHERE id <> ?', [termId]);
      }

      const [result] = await connection.execute(
        `
          UPDATE terms
          SET name = ?, academic_year = ?, semester_label = ?, start_date = ?, end_date = ?, selection_start = ?, selection_end = ?, is_current = ?, status = ?
          WHERE id = ?
        `,
        [
          payload.name,
          payload.academicYear,
          payload.semesterLabel,
          payload.startDate,
          payload.endDate,
          payload.selectionStart,
          payload.selectionEnd,
          payload.isCurrent,
          payload.status,
          termId
        ]
      );

      if (!result.affectedRows) {
        throw new Error('term_not_found');
      }
    });

    req.flash('success', '学期信息已更新。');
  } catch (error) {
    if (error.message === 'term_not_found') {
      req.flash('danger', '学期不存在。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '学期名称或学年信息重复，请检查后重试。');
    } else if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
      req.flash('danger', '学期时间范围不符合系统规则，请检查教学周期和选课窗口。');
    } else {
      req.flash('danger', '学期信息更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/terms/:termId', async (req, res) => {
  const termId = Number(req.params.termId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/terms');

  const [sectionCount, admissionCount, warningCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM course_sections WHERE term_id = ?', [termId]),
    getCount('SELECT COUNT(*) AS total FROM students WHERE admission_term_id = ?', [termId]),
    getCount('SELECT COUNT(*) AS total FROM academic_warnings WHERE term_id = ?', [termId])
  ]);

  const dependencySummary = summarizeDependencies([
    { label: '开课记录', total: sectionCount },
    { label: '学生入学学期', total: admissionCount },
    { label: '学业预警', total: warningCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `学期仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM terms WHERE id = ?', [termId]);
    req.flash('success', '学期已删除。');
  } catch (error) {
    req.flash('danger', '学期删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/classrooms', async (req, res) => {
  const { keyword = '', building_name = '', room_type = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 12);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(classrooms.building_name LIKE ? OR classrooms.room_number LIKE ? OR classrooms.room_type LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (building_name) {
    filters.push('classrooms.building_name = ?');
    params.push(building_name);
  }

  if (room_type) {
    filters.push('classrooms.room_type = ?');
    params.push(room_type);
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(`SELECT COUNT(*) AS total FROM classrooms WHERE ${whereClause}`, params);
  const classrooms = await query(
    `
      SELECT
        classrooms.*,
        COUNT(DISTINCT course_sections.id) AS section_count
      FROM classrooms
      LEFT JOIN course_sections ON course_sections.classroom_id = classrooms.id
      WHERE ${whereClause}
      GROUP BY classrooms.id
      ORDER BY classrooms.building_name ASC, classrooms.room_number ASC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );
  const [buildings, roomTypes] = await Promise.all([
    query('SELECT DISTINCT building_name FROM classrooms ORDER BY building_name ASC'),
    query('SELECT DISTINCT room_type FROM classrooms ORDER BY room_type ASC')
  ]);

  return res.render('pages/admin/classrooms', {
    pageTitle: '教室管理',
    classrooms,
    buildings,
    roomTypes,
    filters: { keyword, building_name, room_type },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/classrooms/new', async (req, res) => {
  return res.render('pages/admin/classroom-form', {
    pageTitle: '新增教室',
    mode: 'create',
    classroom: null,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/classrooms')
  });
});

router.get('/classrooms/:classroomId/edit', async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  const classroom = (
    await query(
      `
        SELECT *
        FROM classrooms
        WHERE id = ?
        LIMIT 1
      `,
      [classroomId]
    )
  )[0];

  if (!classroom) {
    return renderMissingPage(res, '教室不存在');
  }

  return res.render('pages/admin/classroom-form', {
    pageTitle: '编辑教室',
    mode: 'edit',
    classroom,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/classrooms')
  });
});

router.post('/classrooms', async (req, res) => {
  const { building_name, room_number, capacity, room_type } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/classrooms');
  try {
    await query(
      `
        INSERT INTO classrooms (building_name, room_number, capacity, room_type)
        VALUES (?, ?, ?, ?)
      `,
      [building_name.trim(), room_number.trim(), Number(capacity), room_type?.trim() || '标准教室']
    );
    req.flash('success', '教室已创建。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '该教室房间号已存在，请检查后重试。');
    } else {
      req.flash('danger', '教室创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/classrooms/:classroomId', async (req, res) => {
  const { building_name, room_number, capacity, room_type } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/classrooms');
  try {
    await query(
      `
        UPDATE classrooms
        SET building_name = ?, room_number = ?, capacity = ?, room_type = ?
        WHERE id = ?
      `,
      [building_name.trim(), room_number.trim(), Number(capacity), room_type?.trim() || '标准教室', Number(req.params.classroomId)]
    );
    req.flash('success', '教室信息已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '该教室房间号已存在，请检查后重试。');
    } else {
      req.flash('danger', '教室信息更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/classrooms/:classroomId', async (req, res) => {
  const classroomId = Number(req.params.classroomId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/classrooms');

  const sectionCount = await getCount('SELECT COUNT(*) AS total FROM course_sections WHERE classroom_id = ?', [classroomId]);

  if (sectionCount > 0) {
    req.flash('danger', `教室仍有关联开课记录，暂时无法删除：开课记录${sectionCount}项。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM classrooms WHERE id = ?', [classroomId]);
    req.flash('success', '教室已删除。');
  } catch (error) {
    req.flash('danger', '教室删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/foundations', async (req, res) => {
  const tab = ['departments', 'majors', 'classes'].includes(req.query.tab) ? req.query.tab : 'departments';
  const { keyword = '', department_id = '', major_id = '', grade_year = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const [departments, majors, yearOptions, summaryRows] = await Promise.all([
    getDepartments(),
    getMajors(),
    query('SELECT DISTINCT grade_year FROM classes ORDER BY grade_year DESC'),
    Promise.all([
      query('SELECT COUNT(*) AS total FROM departments'),
      query('SELECT COUNT(*) AS total FROM majors'),
      query('SELECT COUNT(*) AS total FROM classes')
    ])
  ]);

  const filters = ['1 = 1'];
  const params = [];
  let items = [];
  let countRows = [{ total: 0 }];

  if (tab === 'departments') {
    if (keyword) {
      filters.push('(departments.department_no LIKE ? OR departments.code LIKE ? OR departments.name LIKE ? OR COALESCE(departments.description, "") LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = filters.join(' AND ');
    countRows = await query(`SELECT COUNT(*) AS total FROM departments WHERE ${whereClause}`, params);
    items = await query(
      `
        SELECT *
        FROM departments
        WHERE ${whereClause}
        ORDER BY department_no ASC, code ASC
        LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );
  }

  if (tab === 'majors') {
    if (keyword) {
      filters.push('(majors.major_code LIKE ? OR majors.code LIKE ? OR majors.name LIKE ? OR COALESCE(majors.description, "") LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (department_id) {
      filters.push('majors.department_id = ?');
      params.push(Number(department_id));
    }

    const whereClause = filters.join(' AND ');
    countRows = await query(
      `
        SELECT COUNT(*) AS total
        FROM majors
        INNER JOIN departments ON departments.id = majors.department_id
        WHERE ${whereClause}
      `,
      params
    );
    items = await query(
      `
        SELECT majors.*, departments.name AS department_name, departments.department_no
        FROM majors
        INNER JOIN departments ON departments.id = majors.department_id
        WHERE ${whereClause}
        ORDER BY departments.department_no ASC, majors.major_code ASC, majors.code ASC
        LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );
  }

  if (tab === 'classes') {
    if (keyword) {
      filters.push('(classes.class_code LIKE ? OR classes.class_name LIKE ? OR COALESCE(classes.counselor_name, "") LIKE ? OR majors.name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (major_id) {
      filters.push('classes.major_id = ?');
      params.push(Number(major_id));
    }

    if (grade_year) {
      filters.push('classes.grade_year = ?');
      params.push(Number(grade_year));
    }

    const whereClause = filters.join(' AND ');
    countRows = await query(
      `
        SELECT COUNT(*) AS total
        FROM classes
        INNER JOIN majors ON majors.id = classes.major_id
        WHERE ${whereClause}
      `,
      params
    );
    items = await query(
      `
        SELECT
          classes.*,
          majors.name AS major_name,
          departments.name AS department_name,
          departments.department_no
        FROM classes
        INNER JOIN majors ON majors.id = classes.major_id
        INNER JOIN departments ON departments.id = majors.department_id
        WHERE ${whereClause}
        ORDER BY classes.grade_year DESC, classes.class_code ASC, classes.class_name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );
  }

  return res.render('pages/admin/foundations', {
    pageTitle: '基础信息',
    departments,
    majors,
    yearOptions,
    tab,
    items,
    filters: { keyword, department_id, major_id, grade_year },
    summary: {
      departments: summaryRows[0][0]?.total || 0,
      majors: summaryRows[1][0]?.total || 0,
      classes: summaryRows[2][0]?.total || 0
    },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/foundations/departments/new', async (req, res) => {
  return res.render('pages/admin/department-form', {
    pageTitle: '新增院系',
    mode: 'create',
    department: null,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/foundations?tab=departments')
  });
});

router.get('/foundations/departments/:departmentId/edit', async (req, res) => {
  const department = (
    await query(
      `
        SELECT *
        FROM departments
        WHERE id = ?
        LIMIT 1
      `,
      [Number(req.params.departmentId)]
    )
  )[0];

  if (!department) {
    return renderMissingPage(res, '院系不存在');
  }

  return res.render('pages/admin/department-form', {
    pageTitle: '编辑院系',
    mode: 'edit',
    department,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/foundations?tab=departments')
  });
});

router.get('/foundations/majors/new', async (req, res) => {
  return res.render('pages/admin/major-form', {
    pageTitle: '新增专业',
    mode: 'create',
    major: null,
    departments: await getDepartments(),
    backHref: getSafeReturnPath(req.query.return_to, '/admin/foundations?tab=majors')
  });
});

router.get('/foundations/majors/:majorId/edit', async (req, res) => {
  const [departments, major] = await Promise.all([
    getDepartments(),
    query(
      `
        SELECT *
        FROM majors
        WHERE id = ?
        LIMIT 1
      `,
      [Number(req.params.majorId)]
    ).then((rows) => rows[0] || null)
  ]);

  if (!major) {
    return renderMissingPage(res, '专业不存在');
  }

  return res.render('pages/admin/major-form', {
    pageTitle: '编辑专业',
    mode: 'edit',
    major,
    departments,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/foundations?tab=majors')
  });
});

router.get('/foundations/classes/new', async (req, res) => {
  return res.render('pages/admin/class-form', {
    pageTitle: '新增班级',
    mode: 'create',
    classItem: null,
    majors: await getMajors(),
    backHref: getSafeReturnPath(req.query.return_to, '/admin/foundations?tab=classes')
  });
});

router.get('/foundations/classes/:classId/edit', async (req, res) => {
  const [majors, classItem] = await Promise.all([
    getMajors(),
    query(
      `
        SELECT *
        FROM classes
        WHERE id = ?
        LIMIT 1
      `,
      [Number(req.params.classId)]
    ).then((rows) => rows[0] || null)
  ]);

  if (!classItem) {
    return renderMissingPage(res, '班级不存在');
  }

  return res.render('pages/admin/class-form', {
    pageTitle: '编辑班级',
    mode: 'edit',
    classItem,
    majors,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/foundations?tab=classes')
  });
});

router.post('/foundations/departments', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=departments');
  try {
    await query('INSERT INTO departments (department_no, code, name, description) VALUES (?, ?, ?, ?)', [
      req.body.department_no.trim(),
      req.body.code.trim(),
      req.body.name.trim(),
      req.body.description?.trim() || null
    ]);
    req.flash('success', '院系已创建。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '院系编号或代码已存在，请检查后重试。');
    } else {
      req.flash('danger', '院系创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/foundations/departments/:departmentId', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=departments');
  try {
    await query('UPDATE departments SET department_no = ?, code = ?, name = ?, description = ? WHERE id = ?', [
      req.body.department_no.trim(),
      req.body.code.trim(),
      req.body.name.trim(),
      req.body.description?.trim() || null,
      Number(req.params.departmentId)
    ]);
    req.flash('success', '院系信息已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '院系编号或代码已存在，请检查后重试。');
    } else {
      req.flash('danger', '院系信息更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/foundations/departments/:departmentId', async (req, res) => {
  const departmentId = Number(req.params.departmentId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=departments');

  const [majorCount, courseCount, teacherCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM majors WHERE department_id = ?', [departmentId]),
    getCount('SELECT COUNT(*) AS total FROM courses WHERE department_id = ?', [departmentId]),
    getCount('SELECT COUNT(*) AS total FROM teachers WHERE department_id = ?', [departmentId])
  ]);

  const dependencySummary = summarizeDependencies([
    { label: '专业', total: majorCount },
    { label: '课程', total: courseCount },
    { label: '教师', total: teacherCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `院系仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM departments WHERE id = ?', [departmentId]);
    req.flash('success', '院系已删除。');
  } catch (error) {
    req.flash('danger', '院系删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.post('/foundations/majors', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=majors');
  try {
    await query('INSERT INTO majors (department_id, major_code, code, name, description) VALUES (?, ?, ?, ?, ?)', [
      Number(req.body.department_id),
      req.body.major_code?.trim() || null,
      req.body.code.trim(),
      req.body.name.trim(),
      req.body.description?.trim() || null
    ]);
    req.flash('success', '专业已创建。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '专业编号或代码已存在，请检查后重试。');
    } else {
      req.flash('danger', '专业创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/foundations/majors/:majorId', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=majors');
  try {
    await query('UPDATE majors SET department_id = ?, major_code = ?, code = ?, name = ?, description = ? WHERE id = ?', [
      Number(req.body.department_id),
      req.body.major_code?.trim() || null,
      req.body.code.trim(),
      req.body.name.trim(),
      req.body.description?.trim() || null,
      Number(req.params.majorId)
    ]);
    req.flash('success', '专业信息已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '专业编号或代码已存在，请检查后重试。');
    } else {
      req.flash('danger', '专业信息更新失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/foundations/majors/:majorId', async (req, res) => {
  const majorId = Number(req.params.majorId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=majors');

  const [classCount, courseCount, planCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM classes WHERE major_id = ?', [majorId]),
    getCount('SELECT COUNT(*) AS total FROM courses WHERE major_id = ?', [majorId]),
    getCount('SELECT COUNT(*) AS total FROM training_plans WHERE major_id = ?', [majorId])
  ]);

  const dependencySummary = summarizeDependencies([
    { label: '班级', total: classCount },
    { label: '课程', total: courseCount },
    { label: '培养方案', total: planCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `专业仍有关联数据，暂时无法删除：${dependencySummary}。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM majors WHERE id = ?', [majorId]);
    req.flash('success', '专业已删除。');
  } catch (error) {
    req.flash('danger', '专业删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.post('/foundations/classes', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=classes');
  const majorId = Number(req.body.major_id);
  const gradeYear = Number(req.body.grade_year);
  const classCode = normalizeClassCode(req.body.class_code);

  if (!majorId || !gradeYear || !classCode) {
    req.flash('danger', '请选择所属专业，并填写年级和班号。');
    return res.redirect(redirectPath);
  }

  try {
    const { major, conflict } = await findDepartmentClassCodeConflict({
      majorId,
      gradeYear,
      classCode
    });

    if (!major) {
      throw new Error('major_not_found');
    }

    if (conflict) {
      throw new Error('department_class_code_conflict');
    }

    const className = await buildClassName({ majorId, gradeYear, classCode });

    if (!className) {
      throw new Error('major_not_found');
    }

    await query('INSERT INTO classes (major_id, class_code, class_name, grade_year, counselor_name) VALUES (?, ?, ?, ?, ?)', [
      majorId,
      classCode,
      className,
      gradeYear,
      req.body.counselor_name?.trim() || null
    ]);

    req.flash('success', '班级已创建。');
  } catch (error) {
    if (error.message === 'major_not_found') {
      req.flash('danger', '所属专业不存在，请重新选择。');
    } else if (error.message === 'department_class_code_conflict') {
      req.flash('danger', '同学院同年级下班号已存在，请更换班号后重试。');
    } else if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '班级名称已存在，或同学院同年级下班号重复，请检查后重试。');
    } else {
      req.flash('danger', '班级创建失败，请稍后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.put('/foundations/classes/:classId', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=classes');

  try {
    const result = await query('UPDATE classes SET counselor_name = ? WHERE id = ?', [
      req.body.counselor_name?.trim() || null,
      Number(req.params.classId)
    ]);

    if (!result.affectedRows) {
      throw new Error('class_not_found');
    }

    req.flash('success', '班级辅导员已更新。');
  } catch (error) {
    if (error.message === 'class_not_found') {
      req.flash('danger', '班级不存在。');
    } else {
      req.flash('danger', '班级更新失败，请检查表单内容后重试。');
    }
  }

  return res.redirect(redirectPath);
});

router.delete('/foundations/classes/:classId', async (req, res) => {
  const classId = Number(req.params.classId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/foundations?tab=classes');

  const studentCount = await getCount('SELECT COUNT(*) AS total FROM students WHERE class_id = ?', [classId]);

  if (studentCount > 0) {
    req.flash('danger', `班级下仍有关联学生，暂时无法删除：学生${studentCount}项。`);
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM classes WHERE id = ?', [classId]);
    req.flash('success', '班级已删除。');
  } catch (error) {
    req.flash('danger', '班级删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});

router.get('/program-plans', async (req, res) => {
  const majors = await getMajors();
  const { keyword = '', major_id = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(training_plans.plan_name LIKE ? OR majors.name LIKE ? OR departments.name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (major_id) {
    filters.push('training_plans.major_id = ?');
    params.push(Number(major_id));
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM training_plans
      INNER JOIN majors ON majors.id = training_plans.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      WHERE ${whereClause}
    `,
    params
  );

  const plans = await query(
    `
      SELECT
        training_plans.*,
        majors.name AS major_name,
        majors.major_code,
        departments.name AS department_name,
        departments.department_no,
        COUNT(DISTINCT training_plan_modules.id) AS module_count,
        COUNT(DISTINCT training_plan_courses.id) AS course_count
      FROM training_plans
      INNER JOIN majors ON majors.id = training_plans.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      LEFT JOIN training_plan_modules ON training_plan_modules.training_plan_id = training_plans.id
      LEFT JOIN training_plan_courses ON training_plan_courses.module_id = training_plan_modules.id
      WHERE ${whereClause}
      GROUP BY training_plans.id
      ORDER BY departments.department_no ASC, majors.major_code ASC, training_plans.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/program-plans', {
    pageTitle: '培养方案管理',
    plans,
    majors,
    filters: { keyword, major_id },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/program-plans/new', async (req, res) => {
  return res.render('pages/admin/program-plan-form', {
    pageTitle: '新增培养方案',
    mode: 'create',
    plan: null,
    majors: await getMajors(),
    backHref: getSafeReturnPath(req.query.return_to, '/admin/program-plans')
  });
});

router.get('/program-plans/:planId/edit', async (req, res) => {
  const [majors, plan] = await Promise.all([
    getMajors(),
    getTrainingPlanById(Number(req.params.planId))
  ]);

  if (!plan) {
    return renderMissingPage(res, '培养方案不存在');
  }

  return res.render('pages/admin/program-plan-form', {
    pageTitle: '编辑培养方案',
    mode: 'edit',
    plan,
    majors,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/program-plans')
  });
});

router.post('/program-plans', async (req, res) => {
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/program-plans');
  const majorId = normalizePositiveId(req.body.major_id);
  const planName = normalizeRequiredText(req.body.plan_name);

  if (!majorId || !planName) {
    req.flash('danger', '请选择专业并填写培养方案名称。');
    return res.redirect(redirectPath);
  }

  const major = await getMajorById(majorId);

  if (!major) {
    req.flash('danger', '所选专业不存在，请重新选择。');
    return res.redirect(redirectPath);
  }

  try {
    const result = await query(
      `
        INSERT INTO training_plans (major_id, plan_name, total_credits)
        VALUES (?, ?, 0)
      `,
      [majorId, planName]
    );
    await syncTrainingPlanCredits(result.insertId);
    req.flash('success', '培养方案已创建。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '该专业已经存在培养方案，请直接编辑现有方案。');
    } else {
      req.flash('danger', '培养方案创建失败，请稍后重试。');
    }
  }

  return res.redirect(303, redirectPath);
});

router.put('/program-plans/:planId', async (req, res) => {
  const planId = Number(req.params.planId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/program-plans');
  const majorId = normalizePositiveId(req.body.major_id);
  const planName = normalizeRequiredText(req.body.plan_name);

  if (!majorId || !planName) {
    req.flash('danger', '请选择专业并填写培养方案名称。');
    return res.redirect(303, redirectPath);
  }

  const [plan, major] = await Promise.all([getTrainingPlanById(planId), getMajorById(majorId)]);

  if (!plan) {
    req.flash('danger', '培养方案不存在。');
    return res.redirect(303, redirectPath);
  }

  if (!major) {
    req.flash('danger', '所选专业不存在，请重新选择。');
    return res.redirect(303, redirectPath);
  }

  try {
    const result = await query(
      `
        UPDATE training_plans
        SET major_id = ?, plan_name = ?
        WHERE id = ?
      `,
      [majorId, planName, planId]
    );

    if (!result.affectedRows) {
      req.flash('danger', '培养方案不存在。');
      return res.redirect(303, redirectPath);
    }

    await syncTrainingPlanCredits(planId);
    req.flash('success', '培养方案已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '该专业已经存在培养方案，请检查后重试。');
    } else {
      req.flash('danger', '培养方案更新失败，请稍后重试。');
    }
  }

  return res.redirect(303, redirectPath);
});

router.delete('/program-plans/:planId', async (req, res) => {
  const planId = Number(req.params.planId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/program-plans');
  const plan = await getTrainingPlanById(planId);

  if (!plan) {
    req.flash('danger', '培养方案不存在。');
    return res.redirect(redirectPath);
  }

  const [moduleCount, mappingCount] = await Promise.all([
    getCount('SELECT COUNT(*) AS total FROM training_plan_modules WHERE training_plan_id = ?', [planId]),
    getCount('SELECT COUNT(*) AS total FROM training_plan_courses WHERE training_plan_id = ?', [planId])
  ]);
  const dependencySummary = summarizeDependencies([
    { label: '方案模块', total: moduleCount },
    { label: '课程映射', total: mappingCount }
  ]);

  if (dependencySummary) {
    req.flash('danger', `培养方案仍有关联数据，暂时无法删除：${dependencySummary}。请先逐项清理后再删除。`);
    return res.redirect(redirectPath);
  }

  try {
    await withTransaction(async (connection) => {
      await connection.execute('DELETE FROM training_plans WHERE id = ?', [planId]);
      await syncStudentsCreditsRequiredByMajor(plan.major_id, connection);
    });

    req.flash('success', '培养方案已删除。');
  } catch (error) {
    req.flash('danger', '培养方案删除失败，请稍后重试。');
  }

  return res.redirect(303, redirectPath);
});

router.get('/program-plans/:planId', async (req, res) => {
  const planId = Number(req.params.planId);
  const planDetail = await getTrainingPlanDetail(planId);

  if (!planDetail) {
    return renderMissingPage(res, '培养方案不存在');
  }

  return res.render('pages/admin/program-plan-detail', {
    pageTitle: '培养方案详情',
    planDetail,
    returnTo: getSafeReturnPath(req.query.return_to, '/admin/program-plans')
  });
});

router.get('/program-plans/:planId/modules/new', async (req, res) => {
  const plan = await query(
    `
      SELECT training_plans.*, majors.name AS major_name
      FROM training_plans
      INNER JOIN majors ON majors.id = training_plans.major_id
      WHERE training_plans.id = ?
      LIMIT 1
    `,
    [Number(req.params.planId)]
  ).then((rows) => rows[0] || null);

  if (!plan) {
    return renderMissingPage(res, '培养方案不存在');
  }

  return res.render('pages/admin/program-plan-module-form', {
    pageTitle: '新增培养方案模块',
    mode: 'create',
    plan,
    moduleItem: null,
    backHref: getSafeReturnPath(req.query.return_to, `/admin/program-plans/${plan.id}`)
  });
});

router.get('/program-plans/:planId/modules/:moduleId/edit', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const [plan, moduleItem] = await Promise.all([
    query(
      `
        SELECT training_plans.*, majors.name AS major_name
        FROM training_plans
        INNER JOIN majors ON majors.id = training_plans.major_id
        WHERE training_plans.id = ?
        LIMIT 1
      `,
      [planId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT *
        FROM training_plan_modules
        WHERE id = ?
          AND training_plan_id = ?
        LIMIT 1
      `,
      [moduleId, planId]
    ).then((rows) => rows[0] || null)
  ]);

  if (!plan || !moduleItem) {
    return renderMissingPage(res, '培养方案模块不存在');
  }

  return res.render('pages/admin/program-plan-module-form', {
    pageTitle: '编辑培养方案模块',
    mode: 'edit',
    plan,
    moduleItem,
    backHref: getSafeReturnPath(req.query.return_to, `/admin/program-plans/${plan.id}`)
  });
});

router.post('/program-plans/:planId/modules', async (req, res) => {
  const planId = Number(req.params.planId);
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/program-plans/${planId}`);
  const semesterNo = normalizeSemesterNo(req.body.semester_no);
  const moduleName = normalizeRequiredText(req.body.module_name);
  const moduleType = normalizeRequiredText(req.body.module_type);

  if (!semesterNo || !moduleName || !moduleType) {
    req.flash('danger', '请填写模块名称、模块类型，并将所属学期设置在 1 到 8 之间。');
    return res.redirect(303, redirectPath);
  }

  const plan = await getTrainingPlanById(planId);

  if (!plan) {
    req.flash('danger', '培养方案不存在。');
    return res.redirect(303, redirectPath);
  }

  const duplicateModule = await query(
    `
      SELECT id
      FROM training_plan_modules
      WHERE training_plan_id = ?
        AND semester_no = ?
        AND module_name = ?
      LIMIT 1
    `,
    [planId, semesterNo, moduleName]
  ).then((rows) => rows[0] || null);

  if (duplicateModule) {
    req.flash('danger', '当前培养方案下已存在同学期同名模块，请直接编辑原模块。');
    return res.redirect(303, redirectPath);
  }

  try {
    await query(
      `
        INSERT INTO training_plan_modules (training_plan_id, semester_no, module_name, module_type, required_credits)
        VALUES (?, ?, ?, ?, 0)
      `,
      [planId, semesterNo, moduleName, moduleType]
    );
    await syncTrainingPlanCredits(planId);
    req.flash('success', '培养方案模块已创建。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '当前培养方案下已存在同学期同名模块，请检查后重试。');
    } else {
      req.flash('danger', '培养方案模块创建失败，请稍后重试。');
    }
  }

  return res.redirect(303, redirectPath);
});

router.put('/program-plans/:planId/modules/:moduleId', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/program-plans/${planId}`);
  const semesterNo = normalizeSemesterNo(req.body.semester_no);
  const moduleName = normalizeRequiredText(req.body.module_name);
  const moduleType = normalizeRequiredText(req.body.module_type);

  if (!semesterNo || !moduleName || !moduleType) {
    req.flash('danger', '请填写模块名称、模块类型，并将所属学期设置在 1 到 8 之间。');
    return res.redirect(303, redirectPath);
  }

  const [plan, moduleItem] = await Promise.all([
    getTrainingPlanById(planId),
    getTrainingPlanModuleById(planId, moduleId)
  ]);

  if (!plan || !moduleItem) {
    req.flash('danger', '培养方案模块不存在。');
    return res.redirect(303, redirectPath);
  }

  const duplicateModule = await query(
    `
      SELECT id
      FROM training_plan_modules
      WHERE training_plan_id = ?
        AND semester_no = ?
        AND module_name = ?
        AND id <> ?
      LIMIT 1
    `,
    [planId, semesterNo, moduleName, moduleId]
  ).then((rows) => rows[0] || null);

  if (duplicateModule) {
    req.flash('danger', '当前培养方案下已存在同学期同名模块，请检查后重试。');
    return res.redirect(303, redirectPath);
  }

  try {
    const result = await query(
      `
        UPDATE training_plan_modules
        SET semester_no = ?, module_name = ?, module_type = ?
        WHERE id = ?
          AND training_plan_id = ?
      `,
      [semesterNo, moduleName, moduleType, moduleId, planId]
    );

    if (!result.affectedRows) {
      req.flash('danger', '培养方案模块不存在。');
      return res.redirect(303, redirectPath);
    }

    await syncTrainingPlanCredits(planId);
    req.flash('success', '培养方案模块已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '当前培养方案下已存在同学期同名模块，请检查后重试。');
    } else {
      req.flash('danger', '培养方案模块更新失败，请稍后重试。');
    }
  }

  return res.redirect(303, redirectPath);
});

router.delete('/program-plans/:planId/modules/:moduleId', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/program-plans/${planId}`);
  const mappingCountRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM training_plan_courses
      WHERE module_id = ?
    `,
    [moduleId]
  );

  if (Number(mappingCountRows[0]?.total || 0) > 0) {
    req.flash('danger', '模块下仍存在课程映射，请先移除课程后再删除模块。');
    return res.redirect(redirectPath);
  }

  try {
    await query('DELETE FROM training_plan_modules WHERE id = ? AND training_plan_id = ?', [moduleId, planId]);
    await syncTrainingPlanCredits(planId);
    req.flash('success', '培养方案模块已删除。');
  } catch (error) {
    req.flash('danger', '培养方案模块删除失败，请稍后重试。');
  }

  return res.redirect(303, redirectPath);
});

router.get('/program-plans/:planId/modules/:moduleId/courses/new', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const [plan, moduleItem, courses] = await Promise.all([
    query(
      `
        SELECT training_plans.*, majors.name AS major_name
        FROM training_plans
        INNER JOIN majors ON majors.id = training_plans.major_id
        WHERE training_plans.id = ?
        LIMIT 1
      `,
      [planId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT *
        FROM training_plan_modules
        WHERE id = ?
          AND training_plan_id = ?
        LIMIT 1
      `,
      [moduleId, planId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT
          courses.id,
          courses.course_code,
          courses.course_name,
          courses.course_type,
          courses.credits,
          majors.name AS major_name,
          departments.name AS department_name
        FROM courses
        INNER JOIN majors ON majors.id = courses.major_id
        INNER JOIN departments ON departments.id = courses.department_id
        ORDER BY courses.course_code ASC
      `
    )
  ]);

  if (!plan || !moduleItem) {
    return renderMissingPage(res, '培养方案模块不存在');
  }

  return res.render('pages/admin/program-plan-course-form', {
    pageTitle: '新增培养方案课程',
    mode: 'create',
    plan,
    moduleItem,
    mapping: null,
    courses,
    backHref: getSafeReturnPath(req.query.return_to, `/admin/program-plans/${plan.id}`)
  });
});

router.get('/program-plans/:planId/modules/:moduleId/courses/:planCourseId/edit', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const planCourseId = Number(req.params.planCourseId);
  const [plan, moduleItem, mapping, courses] = await Promise.all([
    query(
      `
        SELECT training_plans.*, majors.name AS major_name
        FROM training_plans
        INNER JOIN majors ON majors.id = training_plans.major_id
        WHERE training_plans.id = ?
        LIMIT 1
      `,
      [planId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT *
        FROM training_plan_modules
        WHERE id = ?
          AND training_plan_id = ?
        LIMIT 1
      `,
      [moduleId, planId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT *
        FROM training_plan_courses
        WHERE id = ?
          AND module_id = ?
        LIMIT 1
      `,
      [planCourseId, moduleId]
    ).then((rows) => rows[0] || null),
    query(
      `
        SELECT
          courses.id,
          courses.course_code,
          courses.course_name,
          courses.course_type,
          courses.credits,
          majors.name AS major_name,
          departments.name AS department_name
        FROM courses
        INNER JOIN majors ON majors.id = courses.major_id
        INNER JOIN departments ON departments.id = courses.department_id
        ORDER BY courses.course_code ASC
      `
    )
  ]);

  if (!plan || !moduleItem || !mapping) {
    return renderMissingPage(res, '培养方案课程不存在');
  }

  return res.render('pages/admin/program-plan-course-form', {
    pageTitle: '编辑培养方案课程',
    mode: 'edit',
    plan,
    moduleItem,
    mapping,
    courses,
    backHref: getSafeReturnPath(req.query.return_to, `/admin/program-plans/${plan.id}`)
  });
});

router.post('/program-plans/:planId/modules/:moduleId/courses', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/program-plans/${planId}`);
  const courseId = normalizePositiveId(req.body.course_id);
  const recommendedSemester = normalizeSemesterNo(req.body.recommended_semester);

  if (!courseId || !recommendedSemester) {
    req.flash('danger', '请选择课程，并将推荐学期设置在 1 到 8 之间。');
    return res.redirect(303, redirectPath);
  }

  const [plan, moduleItem, course] = await Promise.all([
    getTrainingPlanById(planId),
    getTrainingPlanModuleById(planId, moduleId),
    getCourseById(courseId)
  ]);

  if (!plan || !moduleItem) {
    req.flash('danger', '培养方案模块不存在。');
    return res.redirect(303, redirectPath);
  }

  if (!course) {
    req.flash('danger', '所选课程不存在，请重新选择。');
    return res.redirect(303, redirectPath);
  }

  const duplicateCourse = await findDuplicatePlanCourse(planId, courseId);

  if (duplicateCourse) {
    req.flash('danger', '该课程已存在于当前培养方案中。');
    return res.redirect(303, redirectPath);
  }

  try {
    await query(
      `
        INSERT INTO training_plan_courses (training_plan_id, module_id, course_id, recommended_semester)
        VALUES (?, ?, ?, ?)
      `,
      [planId, moduleId, courseId, recommendedSemester]
    );
    await syncTrainingPlanCredits(planId);
    req.flash('success', '课程已加入培养方案。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '该课程已存在于当前培养方案中。');
    } else {
      req.flash('danger', '课程加入培养方案失败，请稍后重试。');
    }
  }

  return res.redirect(303, redirectPath);
});

router.put('/program-plans/:planId/modules/:moduleId/courses/:planCourseId', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const planCourseId = Number(req.params.planCourseId);
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/program-plans/${planId}`);
  const courseId = normalizePositiveId(req.body.course_id);
  const recommendedSemester = normalizeSemesterNo(req.body.recommended_semester);

  if (!courseId || !recommendedSemester) {
    req.flash('danger', '请选择课程，并将推荐学期设置在 1 到 8 之间。');
    return res.redirect(303, redirectPath);
  }

  const [plan, moduleItem, mapping, course] = await Promise.all([
    getTrainingPlanById(planId),
    getTrainingPlanModuleById(planId, moduleId),
    getTrainingPlanCourseMappingById(planId, moduleId, planCourseId),
    getCourseById(courseId)
  ]);

  if (!plan || !moduleItem || !mapping) {
    req.flash('danger', '培养方案课程映射不存在。');
    return res.redirect(303, redirectPath);
  }

  if (!course) {
    req.flash('danger', '所选课程不存在，请重新选择。');
    return res.redirect(303, redirectPath);
  }

  const duplicateCourse = await findDuplicatePlanCourse(planId, courseId, planCourseId);

  if (duplicateCourse) {
    req.flash('danger', '该课程已存在于当前培养方案中。');
    return res.redirect(303, redirectPath);
  }

  try {
    const result = await query(
      `
        UPDATE training_plan_courses
        SET course_id = ?, recommended_semester = ?, module_id = ?
        WHERE id = ?
          AND training_plan_id = ?
          AND module_id = ?
      `,
      [courseId, recommendedSemester, moduleId, planCourseId, planId, moduleId]
    );

    if (!result.affectedRows) {
      req.flash('danger', '培养方案课程映射不存在。');
      return res.redirect(303, redirectPath);
    }

    await syncTrainingPlanCredits(planId);
    req.flash('success', '培养方案课程映射已更新。');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      req.flash('danger', '该课程已存在于当前培养方案中。');
    } else {
      req.flash('danger', '培养方案课程映射更新失败，请稍后重试。');
    }
  }

  return res.redirect(303, redirectPath);
});

router.delete('/program-plans/:planId/modules/:moduleId/courses/:planCourseId', async (req, res) => {
  const planId = Number(req.params.planId);
  const moduleId = Number(req.params.moduleId);
  const planCourseId = Number(req.params.planCourseId);
  const redirectPath = getSafeReturnPath(req.body.return_to, `/admin/program-plans/${planId}`);

  try {
    const result = await query(
      'DELETE FROM training_plan_courses WHERE id = ? AND training_plan_id = ? AND module_id = ?',
      [planCourseId, planId, moduleId]
    );

    if (!result.affectedRows) {
      req.flash('danger', '培养方案课程映射不存在。');
      return res.redirect(303, redirectPath);
    }

    await syncTrainingPlanCredits(planId);
    req.flash('success', '课程已从培养方案中移除。');
  } catch (error) {
    req.flash('danger', '课程移除失败，请稍后重试。');
  }

  return res.redirect(303, redirectPath);
});

router.get('/announcements', async (req, res) => {
  const { keyword = '', target_role = '', category = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 8);
  const filters = ['1 = 1'];
  const params = [];

  if (keyword) {
    filters.push('(announcements.title LIKE ? OR announcements.content LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (target_role) {
    filters.push('announcements.target_role = ?');
    params.push(target_role);
  }

  if (category) {
    filters.push('announcements.category = ?');
    params.push(category);
  }

  const whereClause = filters.join(' AND ');
  const countRows = await query(`SELECT COUNT(*) AS total FROM announcements WHERE ${whereClause}`, params);
  const announcements = await query(
    `
      SELECT announcements.*, users.full_name AS publisher_name
      FROM announcements
      LEFT JOIN users ON users.id = announcements.published_by
      WHERE ${whereClause}
      ORDER BY announcements.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/announcements', {
    pageTitle: '公告发布',
    announcements,
    filters: { keyword, target_role, category },
    returnTo: req.originalUrl,
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

router.get('/announcements/new', async (req, res) => {
  return res.render('pages/admin/announcement-form', {
    pageTitle: '新增公告',
    mode: 'create',
    announcement: null,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/announcements')
  });
});

router.get('/announcements/:announcementId/edit', async (req, res) => {
  const announcementId = Number(req.params.announcementId);
  const announcement = (
    await query(
      `
        SELECT *
        FROM announcements
        WHERE id = ?
        LIMIT 1
      `,
      [announcementId]
    )
  )[0];

  if (!announcement) {
    return renderMissingPage(res, '公告不存在');
  }

  return res.render('pages/admin/announcement-form', {
    pageTitle: '编辑公告',
    mode: 'edit',
    announcement,
    backHref: getSafeReturnPath(req.query.return_to, '/admin/announcements')
  });
});

router.post('/announcements', async (req, res) => {
  const { title, content, category, target_role, priority } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/announcements');

  await query(
    `
      INSERT INTO announcements (title, content, category, target_role, priority, published_by, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      title.trim(),
      content.trim(),
      category || ANNOUNCEMENT_CATEGORY.GENERAL,
      target_role || 'all',
      priority || ANNOUNCEMENT_PRIORITY.NORMAL,
      req.session.user.id,
      new Date()
    ]
  );

  return res.redirect(redirectPath);
});

router.put('/announcements/:announcementId', async (req, res) => {
  const { title, content, category, target_role, priority } = req.body;
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/announcements');

  await query(
    `
      UPDATE announcements
      SET title = ?, content = ?, category = ?, target_role = ?, priority = ?, published_by = ?, published_at = COALESCE(published_at, NOW())
      WHERE id = ?
    `,
    [
      title.trim(),
      content.trim(),
      category || ANNOUNCEMENT_CATEGORY.GENERAL,
      target_role || 'all',
      priority || ANNOUNCEMENT_PRIORITY.NORMAL,
      req.session.user.id,
      Number(req.params.announcementId)
    ]
  );

  return res.redirect(redirectPath);
});

router.get('/evaluations', async (req, res) => {
  return res.redirect('/admin');
});

router.delete('/announcements/:announcementId', async (req, res) => {
  const announcementId = Number(req.params.announcementId);
  const redirectPath = getSafeReturnPath(req.body.return_to, '/admin/announcements');
  const warningCount = await getCount('SELECT COUNT(*) AS total FROM academic_warnings WHERE announcement_id = ?', [
    announcementId
  ]);

  if (warningCount > 0) {
    req.flash('danger', `公告仍有关联数据，暂时无法删除：学业预警${warningCount}项。`);
    return res.redirect(redirectPath);
  }

  try {
    const result = await query('DELETE FROM announcements WHERE id = ?', [announcementId]);

    if (!result.affectedRows) {
      req.flash('danger', '公告不存在。');
      return res.redirect(redirectPath);
    }

    req.flash('success', '公告已删除。');
  } catch (error) {
    req.flash('danger', '公告删除失败，请稍后重试。');
  }

  return res.redirect(redirectPath);
});
router.get('/enrollments', async (req, res) => {
  const terms = await getTerms();
  const { keyword = '', term_id = '', course_type = '' } = req.query;
  const { page, pageSize, offset } = getPagination(req.query, 10);
  const filters = [`enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'`];
  const params = [];

  if (keyword) {
    filters.push('(users.full_name LIKE ? OR courses.course_name LIKE ? OR course_sections.section_code LIKE ?)');
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
      INNER JOIN students ON students.id = enrollments.student_id
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      WHERE ${whereClause}
    `,
    params
  );

  const enrollments = await query(
    `
      SELECT
        enrollments.*,
        students.student_no,
        users.full_name AS student_name,
        courses.course_name,
        courses.course_type,
        course_sections.section_code,
        terms.name AS term_name,
        grades.status AS grade_status,
        grades.total_score
      FROM enrollments
      INNER JOIN students ON students.id = enrollments.student_id
      INNER JOIN users ON users.id = students.user_id
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN terms ON terms.id = course_sections.term_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE ${whereClause}
      ORDER BY enrollments.selected_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pageSize, offset]
  );

  return res.render('pages/admin/enrollments', {
    pageTitle: '选课数据',
    enrollments,
    terms,
    filters: { keyword, term_id, course_type },
    pagination: buildPagination(countRows[0]?.total || 0, page, pageSize)
  });
});

module.exports = router;












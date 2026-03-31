const { query } = require('../config/database');
const { ENROLLMENT_STATUS, GRADE_STATUS } = require('../utils/system');

function getRunner(connection = null) {
  if (connection) {
    return {
      async query(sql, params = []) {
        const [rows] = await connection.query(sql, params);
        return rows;
      }
    };
  }

  return { query };
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function normalizeScore(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  return Number(Number(value).toFixed(1));
}

function hasOutstandingFailure(progress) {
  return !progress?.passed_count && Number(progress?.failed_attempts || 0) > 0;
}

function buildCourseStatus(progress) {
  if (progress?.passed_count) {
    return '通过';
  }

  if (hasOutstandingFailure(progress)) {
    return '未通过';
  }

  if (progress?.selected_current) {
    return '已选课';
  }

  return '未修读';
}

function getSemesterNoByTerm(entryYear, currentTermStartDate) {
  const numericEntryYear = Number(entryYear);

  if (!numericEntryYear || !currentTermStartDate) {
    return null;
  }

  const termStartDate = new Date(currentTermStartDate);

  if (Number.isNaN(termStartDate.getTime())) {
    return null;
  }

  const yearDiff = termStartDate.getFullYear() - numericEntryYear;
  const month = termStartDate.getMonth() + 1;
  const semesterNo = yearDiff * 2 + (month >= 8 ? 1 : 0);

  return semesterNo >= 1 ? semesterNo : null;
}

async function syncStudentsCreditsRequiredByMajor(majorId, connection = null) {
  if (!majorId) {
    return;
  }

  const runner = getRunner(connection);
  await runner.query(
    `
      UPDATE students
      INNER JOIN classes ON classes.id = students.class_id
      INNER JOIN majors ON majors.id = classes.major_id
      LEFT JOIN training_plans ON training_plans.major_id = majors.id
      SET students.credits_required = COALESCE(training_plans.total_credits, 160)
      WHERE majors.id = ?
    `,
    [Number(majorId)]
  );
}

async function syncStudentsCreditsRequiredByClass(classId, connection = null) {
  if (!classId) {
    return;
  }

  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT major_id
      FROM classes
      WHERE id = ?
      LIMIT 1
    `,
    [Number(classId)]
  );

  if (rows[0]?.major_id) {
    await syncStudentsCreditsRequiredByMajor(rows[0].major_id, connection);
  }
}

async function getTrainingPlanIdsByCourse(courseId, connection = null) {
  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT DISTINCT training_plan_id
      FROM training_plan_courses
      WHERE course_id = ?
      ORDER BY training_plan_id ASC
    `,
    [Number(courseId)]
  );

  return rows.map((item) => Number(item.training_plan_id));
}

async function syncTrainingPlanCredits(planId, connection = null) {
  const runner = getRunner(connection);

  await runner.query(
    `
      UPDATE training_plan_modules
      LEFT JOIN (
        SELECT
          training_plan_courses.module_id,
          ROUND(COALESCE(SUM(courses.credits), 0), 1) AS total_credits
        FROM training_plan_courses
        INNER JOIN courses ON courses.id = training_plan_courses.course_id
        WHERE training_plan_courses.training_plan_id = ?
        GROUP BY training_plan_courses.module_id
      ) AS stats ON stats.module_id = training_plan_modules.id
      SET training_plan_modules.required_credits = COALESCE(stats.total_credits, 0)
      WHERE training_plan_modules.training_plan_id = ?
    `,
    [planId, planId]
  );

  await runner.query(
    `
      UPDATE training_plans
      LEFT JOIN (
        SELECT
          training_plan_courses.training_plan_id,
          ROUND(COALESCE(SUM(courses.credits), 0), 1) AS total_credits
        FROM training_plan_courses
        INNER JOIN courses ON courses.id = training_plan_courses.course_id
        WHERE training_plan_courses.training_plan_id = ?
        GROUP BY training_plan_courses.training_plan_id
      ) AS stats ON stats.training_plan_id = training_plans.id
      SET training_plans.total_credits = COALESCE(stats.total_credits, 0)
      WHERE training_plans.id = ?
    `,
    [planId, planId]
  );

  const planRows = await runner.query(
    `
      SELECT major_id
      FROM training_plans
      WHERE id = ?
      LIMIT 1
    `,
    [Number(planId)]
  );

  if (planRows[0]?.major_id) {
    await syncStudentsCreditsRequiredByMajor(planRows[0].major_id, connection);
  }
}

async function syncTrainingPlanCreditsByCourse(courseId, connection = null) {
  const planIds = await getTrainingPlanIdsByCourse(courseId, connection);

  for (const planId of planIds) {
    await syncTrainingPlanCredits(planId, connection);
  }
}

async function getStudentProgramProfile(studentId) {
  const rows = await query(
    `
      SELECT
        students.id,
        students.student_no,
        students.entry_year,
        students.admission_term_id,
        students.class_id,
        students.credits_required,
        classes.class_name,
        classes.class_code,
        majors.id AS major_id,
        majors.name AS major_name,
        majors.major_code,
        departments.id AS department_id,
        departments.name AS department_name,
        departments.department_no,
        training_plans.id AS training_plan_id,
        training_plans.plan_name,
        training_plans.total_credits
      FROM students
      INNER JOIN classes ON classes.id = students.class_id
      INNER JOIN majors ON majors.id = classes.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      LEFT JOIN training_plans ON training_plans.major_id = majors.id
      WHERE students.id = ?
      LIMIT 1
    `,
    [studentId]
  );

  return rows[0] || null;
}

async function getTrainingPlanCourses(planId) {
  return query(
    `
      SELECT
        training_plan_modules.id AS module_id,
        training_plan_modules.semester_no,
        training_plan_modules.module_name,
        training_plan_modules.module_type,
        training_plan_modules.required_credits AS module_required_credits,
        training_plan_courses.id AS plan_course_id,
        training_plan_courses.course_id,
        training_plan_courses.recommended_semester,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.total_hours,
        courses.assessment_method,
        majors.name AS major_name,
        departments.name AS department_name
      FROM training_plan_modules
      LEFT JOIN training_plan_courses ON training_plan_courses.module_id = training_plan_modules.id
      LEFT JOIN courses ON courses.id = training_plan_courses.course_id
      LEFT JOIN majors ON majors.id = courses.major_id
      LEFT JOIN departments ON departments.id = courses.department_id
      WHERE training_plan_modules.training_plan_id = ?
      ORDER BY
        training_plan_modules.semester_no ASC,
        training_plan_modules.id ASC,
        training_plan_courses.recommended_semester ASC,
        courses.course_code ASC
    `,
    [planId]
  );
}

async function getStudentCourseProgress(studentId, currentTermId = null) {
  const rows = await query(
    `
      SELECT
        course_sections.course_id,
        MAX(CASE WHEN grades.status = ? AND grades.total_score >= 60 THEN 1 ELSE 0 END) AS passed_count,
        SUM(CASE WHEN grades.status = ? AND grades.total_score < 60 THEN 1 ELSE 0 END) AS failed_attempts,
        MAX(
          CASE
            WHEN enrollments.status = ?
              AND (? IS NULL OR course_sections.term_id = ?)
              AND (grades.id IS NULL OR grades.status <> ?)
            THEN 1
            ELSE 0
          END
        ) AS selected_current,
        MAX(CASE WHEN grades.status = ? THEN grades.total_score ELSE NULL END) AS best_score,
        MAX(CASE WHEN grades.status = ? THEN grades.grade_point ELSE NULL END) AS best_grade_point,
        MAX(terms.id) AS latest_term_id,
        MAX(terms.name) AS latest_term_name
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      INNER JOIN terms ON terms.id = course_sections.term_id
      WHERE enrollments.student_id = ?
        AND enrollments.status = ?
      GROUP BY course_sections.course_id
    `,
    [
      GRADE_STATUS.PUBLISHED,
      GRADE_STATUS.PUBLISHED,
      ENROLLMENT_STATUS.SELECTED,
      currentTermId,
      currentTermId,
      GRADE_STATUS.PUBLISHED,
      GRADE_STATUS.PUBLISHED,
      GRADE_STATUS.PUBLISHED,
      studentId,
      ENROLLMENT_STATUS.SELECTED
    ]
  );

  return new Map(rows.map((item) => [Number(item.course_id), item]));
}

async function getTrainingPlanDetail(planId, studentId = null, currentTermId = null) {
  await syncTrainingPlanCredits(planId);

  const planRows = await query(
    `
      SELECT
        training_plans.*,
        majors.major_code,
        majors.name AS major_name,
        departments.department_no,
        departments.name AS department_name
      FROM training_plans
      INNER JOIN majors ON majors.id = training_plans.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      WHERE training_plans.id = ?
      LIMIT 1
    `,
    [planId]
  );

  const plan = planRows[0];

  if (!plan) {
    return null;
  }

  const [moduleCourseRows, progressMap] = await Promise.all([
    getTrainingPlanCourses(planId),
    studentId ? getStudentCourseProgress(studentId, currentTermId) : Promise.resolve(new Map())
  ]);

  const moduleMap = new Map();
  const semesterMap = new Map();
  let completedCredits = 0;
  let selectedCredits = 0;
  let warningCount = 0;

  moduleCourseRows.forEach((row) => {
    if (!moduleMap.has(row.module_id)) {
      const moduleData = {
        id: row.module_id,
        semesterNo: Number(row.semester_no),
        moduleName: row.module_name,
        moduleType: row.module_type,
        requiredCredits: Number(row.module_required_credits || 0),
        courses: []
      };

      moduleMap.set(row.module_id, moduleData);

      if (!semesterMap.has(moduleData.semesterNo)) {
        semesterMap.set(moduleData.semesterNo, []);
      }

      semesterMap.get(moduleData.semesterNo).push(moduleData);
    }

    if (!row.course_id) {
      return;
    }

    const progress = progressMap.get(Number(row.course_id));
    const status = buildCourseStatus(progress);
    const isSelectedCurrent = Boolean(progress?.selected_current);
    const outstandingFailure = hasOutstandingFailure(progress);
    const course = {
      id: Number(row.course_id),
      planCourseId: Number(row.plan_course_id),
      courseCode: row.course_code,
      courseName: row.course_name,
      courseType: row.course_type,
      credits: Number(row.credits || 0),
      totalHours: Number(row.total_hours || 0),
      assessmentMethod: row.assessment_method,
      recommendedSemester: Number(row.recommended_semester || 0),
      status,
      isSelectedCurrent,
      hasOutstandingFailure: outstandingFailure,
      score: normalizeScore(progress?.best_score),
      gradePoint: normalizeScore(progress?.best_grade_point),
      latestTermName: progress?.latest_term_name || null,
      failedAttempts: Number(progress?.failed_attempts || 0),
      majorName: row.major_name,
      departmentName: row.department_name
    };

    if (status === '通过') {
      completedCredits += course.credits;
    }

    if (course.isSelectedCurrent) {
      selectedCredits += course.credits;
    }

    if (course.hasOutstandingFailure) {
      warningCount += 1;
    }

    moduleMap.get(row.module_id).courses.push(course);
  });

  const semesters = Array.from(semesterMap.entries())
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([semesterNo, modules]) => ({
      semesterNo: Number(semesterNo),
      modules
    }));

  const totalCredits = Number(plan.total_credits || 0);

  return {
    plan: {
      ...plan,
      total_credits: totalCredits
    },
    semesters,
    modules: Array.from(moduleMap.values()),
    summary: {
      totalCredits,
      completedCredits: Number(completedCredits.toFixed(1)),
      selectedCredits: Number(selectedCredits.toFixed(1)),
      warningCount,
      completionPercent: clampPercent(totalCredits ? (completedCredits / totalCredits) * 100 : 0)
    },
    currentTermId
  };
}

async function getStudentTrainingPlan(studentId, currentTermId = null) {
  const profile = await getStudentProgramProfile(studentId);

  if (!profile) {
    return null;
  }

  let currentSemesterNo = null;

  if (currentTermId) {
    const termRows = await query(
      `
        SELECT start_date
        FROM terms
        WHERE id = ?
        LIMIT 1
      `,
      [currentTermId]
    );

    currentSemesterNo = getSemesterNoByTerm(profile.entry_year, termRows[0]?.start_date || null);
  }

  if (!profile.training_plan_id) {
    return {
      profile,
      planDetail: null,
      currentSemesterNo
    };
  }

  const planDetail = await getTrainingPlanDetail(profile.training_plan_id, studentId, currentTermId);

  return {
    profile,
    planDetail,
    currentSemesterNo
  };
}

async function getRecommendedCourseIds(studentId, currentTermId) {
  const data = await getStudentTrainingPlan(studentId, currentTermId);

  if (!data?.planDetail) {
    return {
      hasPlan: false,
      currentSemesterNo: data?.currentSemesterNo || null,
      recommendedCourseIds: []
    };
  }

  const currentSemesterNo = Number(data.currentSemesterNo || 0);
  const ids = new Set();

  data.planDetail.modules.forEach((module) => {
    module.courses.forEach((course) => {
      if (course.recommendedSemester === currentSemesterNo) {
        ids.add(course.id);
      }

      if (Number(course.failedAttempts || 0) > 0 && course.status !== '通过') {
        ids.add(course.id);
      }
    });
  });

  return {
    hasPlan: true,
    currentSemesterNo,
    recommendedCourseIds: Array.from(ids)
  };
}

module.exports = {
  getStudentProgramProfile,
  getStudentTrainingPlan,
  getTrainingPlanDetail,
  getRecommendedCourseIds,
  syncTrainingPlanCredits,
  syncTrainingPlanCreditsByCourse,
  syncStudentsCreditsRequiredByClass,
  syncStudentsCreditsRequiredByMajor
};

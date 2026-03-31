const { query } = require('../config/database');
const {
  ENROLLMENT_STATUS,
  GRADE_STATUS,
  SECTION_STATUS
} = require('../utils/system');

async function getAnnouncementCount(role, profileId = null) {
  const filters = ["target_role IN (?, 'all')"];
  const params = [role];

  if (profileId) {
    filters.push('(target_student_id IS NULL OR target_student_id = ?)');
    params.push(profileId);
  } else {
    filters.push('target_student_id IS NULL');
  }

  const rows = await query(
    `
      SELECT COUNT(*) AS total
      FROM announcements
      WHERE ${filters.join(' AND ')}
    `,
    params
  );

  return rows[0]?.total || 0;
}

async function getStudentDashboard(studentId, currentTermId, role) {
  const [summary] = await query(
    `
      SELECT
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND course_sections.term_id = ? THEN 1 END) AS current_course_count,
        ROUND(COALESCE(SUM(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' AND grades.total_score >= 60 THEN courses.credits ELSE 0 END), 0), 1) AS earned_credits,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND (grades.id IS NULL OR grades.status = '${GRADE_STATUS.PENDING}') THEN 1 END) AS pending_grade_count,
        ROUND(COALESCE(AVG(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' THEN grades.total_score END), 0), 1) AS average_score,
        ROUND(COALESCE(AVG(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' THEN grades.grade_point END), 0), 1) AS average_gpa,
        ROUND(
          COALESCE(
            SUM(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' THEN grades.grade_point * courses.credits ELSE 0 END) /
            NULLIF(SUM(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' THEN courses.credits ELSE 0 END), 0),
            0
          ),
          1
        ) AS weighted_gpa
      FROM students
      LEFT JOIN enrollments ON enrollments.student_id = students.id
      LEFT JOIN course_sections ON course_sections.id = enrollments.section_id
      LEFT JOIN courses ON courses.id = course_sections.course_id
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE students.id = ?
    `,
    [currentTermId || 0, studentId]
  );

  const upcomingCourses = await query(
    `
      SELECT
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.assessment_method,
        course_sections.section_code,
        course_sections.weeks_text,
        classrooms.building_name,
        classrooms.room_number,
        time_slots.weekday,
        time_slots.start_period,
        time_slots.end_period,
        time_slots.label,
        users.full_name AS teacher_name
      FROM enrollments
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN classrooms ON classrooms.id = course_sections.classroom_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      INNER JOIN teachers ON teachers.id = course_sections.teacher_id
      INNER JOIN users ON users.id = teachers.user_id
      WHERE enrollments.student_id = ?
        AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
        AND course_sections.term_id = ?
      ORDER BY time_slots.weekday ASC, time_slots.start_period ASC
      LIMIT 6
    `,
    [studentId, currentTermId || 0]
  );

  const gradeDistribution = await query(
    `
      SELECT
        courses.course_name,
        grades.total_score,
        grades.grade_point
      FROM enrollments
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      INNER JOIN course_sections ON course_sections.id = enrollments.section_id
      INNER JOIN courses ON courses.id = course_sections.course_id
      WHERE enrollments.student_id = ?
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
      ORDER BY course_sections.id ASC
      LIMIT 6
    `,
    [studentId]
  );

  return {
    summary: summary || {},
    upcomingCourses,
    announcementCount: await getAnnouncementCount(role, studentId),
    chartData: {
      labels: gradeDistribution.map((item) => item.course_name),
      values: gradeDistribution.map((item) => item.total_score),
      gpaValues: gradeDistribution.map((item) => item.grade_point || 0)
    }
  };
}

async function getTeacherDashboard(teacherId, currentTermId, role) {
  const [summary] = await query(
    `
      SELECT
        COUNT(DISTINCT CASE WHEN course_sections.term_id = ? THEN course_sections.id END) AS section_count,
        COUNT(DISTINCT CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' AND course_sections.term_id = ? THEN enrollments.student_id END) AS student_count,
        COUNT(CASE WHEN grades.status = '${GRADE_STATUS.PUBLISHED}' THEN grades.id END) AS published_grade_count,
        COUNT(CASE WHEN grades.id IS NULL OR grades.status = '${GRADE_STATUS.PENDING}' THEN enrollments.id END) AS pending_grade_count
      FROM teachers
      LEFT JOIN course_sections ON course_sections.teacher_id = teachers.id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id AND enrollments.status = '${ENROLLMENT_STATUS.SELECTED}'
      LEFT JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE teachers.id = ?
    `,
    [currentTermId || 0, currentTermId || 0, teacherId]
  );

  const recentSections = await query(
    `
      SELECT
        course_sections.id,
        courses.course_name,
        courses.course_type,
        course_sections.section_code,
        time_slots.label,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN time_slots ON time_slots.id = course_sections.time_slot_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      WHERE course_sections.teacher_id = ?
        AND course_sections.term_id = ?
      GROUP BY course_sections.id
      ORDER BY time_slots.weekday ASC, time_slots.start_period ASC
      LIMIT 6
    `,
    [teacherId, currentTermId || 0]
  );

  const sectionScores = await query(
    `
      SELECT
        courses.course_name,
        ROUND(AVG(grades.total_score), 1) AS average_score
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      INNER JOIN enrollments ON enrollments.section_id = course_sections.id
      INNER JOIN grades ON grades.enrollment_id = enrollments.id
      WHERE course_sections.teacher_id = ?
        AND grades.status = '${GRADE_STATUS.PUBLISHED}'
      GROUP BY course_sections.id
      ORDER BY course_sections.id ASC
      LIMIT 6
    `,
    [teacherId]
  );

  return {
    summary: summary || {},
    recentSections,
    announcementCount: await getAnnouncementCount(role),
    chartData: {
      labels: sectionScores.map((item) => item.course_name),
      values: sectionScores.map((item) => item.average_score || 0)
    }
  };
}

async function getAdminDashboard(role) {
  const [summary] = await query(
    `
      SELECT
        (SELECT COUNT(*) FROM users) AS user_count,
        (SELECT COUNT(*) FROM courses) AS course_count,
        (SELECT COUNT(*) FROM course_sections WHERE selection_status = '${SECTION_STATUS.OPEN}') AS open_section_count,
        (SELECT COUNT(*) FROM enrollments WHERE status = '${ENROLLMENT_STATUS.SELECTED}') AS active_enrollment_count
    `
  );

  const roleBreakdown = await query(
    `
      SELECT role, COUNT(*) AS total
      FROM users
      GROUP BY role
      ORDER BY role ASC
    `
  );

  const currentLoads = await query(
    `
      SELECT
        courses.course_name,
        courses.course_type,
        course_sections.section_code,
        COUNT(CASE WHEN enrollments.status = '${ENROLLMENT_STATUS.SELECTED}' THEN 1 END) AS selected_count,
        course_sections.capacity
      FROM course_sections
      INNER JOIN courses ON courses.id = course_sections.course_id
      LEFT JOIN enrollments ON enrollments.section_id = course_sections.id
      GROUP BY course_sections.id
      ORDER BY selected_count DESC, courses.course_name ASC
      LIMIT 5
    `
  );

  return {
    summary: summary || {},
    currentLoads,
    announcementCount: await getAnnouncementCount(role),
    chartData: {
      labels: roleBreakdown.map((item) => item.role),
      values: roleBreakdown.map((item) => item.total)
    }
  };
}

module.exports = {
  getStudentDashboard,
  getTeacherDashboard,
  getAdminDashboard
};

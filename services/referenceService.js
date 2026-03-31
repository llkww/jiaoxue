const { query } = require('../config/database');

async function getCurrentTerm() {
  const rows = await query(
    `
      SELECT *
      FROM terms
      WHERE is_current = 1
      ORDER BY id DESC
      LIMIT 1
    `
  );

  return rows[0] || null;
}

async function getDepartments() {
  return query(
    `
      SELECT id, department_no, code, name
      FROM departments
      ORDER BY department_no ASC, code ASC
    `
  );
}

async function getMajors() {
  return query(
    `
      SELECT
        majors.id,
        majors.major_code,
        majors.code,
        majors.name,
        majors.department_id,
        departments.name AS department_name,
        departments.department_no
      FROM majors
      INNER JOIN departments ON departments.id = majors.department_id
      ORDER BY departments.department_no ASC, majors.major_code ASC, majors.code ASC
    `
  );
}

async function getClasses() {
  return query(
    `
      SELECT
        classes.id,
        classes.class_code,
        classes.class_name,
        classes.grade_year,
        classes.major_id,
        majors.name AS major_name,
        departments.name AS department_name,
        departments.department_no
      FROM classes
      INNER JOIN majors ON majors.id = classes.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      ORDER BY classes.grade_year DESC, classes.class_code ASC, classes.class_name ASC
    `
  );
}

async function getTeachers() {
  return query(
    `
      SELECT
        teachers.id,
        teachers.teacher_no,
        users.full_name,
        teachers.title
      FROM teachers
      INNER JOIN users ON users.id = teachers.user_id
      ORDER BY teachers.teacher_no ASC
    `
  );
}

async function getCourses() {
  return query(
    `
      SELECT
        courses.id,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.credits,
        courses.total_hours,
        courses.assessment_method,
        courses.department_id,
        courses.major_id,
        departments.name AS department_name,
        majors.name AS major_name
      FROM courses
      INNER JOIN departments ON departments.id = courses.department_id
      INNER JOIN majors ON majors.id = courses.major_id
      ORDER BY courses.course_code ASC
    `
  );
}

async function getTerms() {
  return query(
    `
      SELECT *
      FROM terms
      ORDER BY start_date DESC
    `
  );
}

async function getClassrooms() {
  return query(
    `
      SELECT id, building_name, room_number, capacity
      FROM classrooms
      ORDER BY building_name ASC, room_number ASC
    `
  );
}

async function getTimeSlots() {
  return query(
    `
      SELECT *
      FROM time_slots
      ORDER BY weekday ASC, start_period ASC
    `
  );
}

module.exports = {
  getCurrentTerm,
  getDepartments,
  getMajors,
  getClasses,
  getTeachers,
  getCourses,
  getTerms,
  getClassrooms,
  getTimeSlots
};

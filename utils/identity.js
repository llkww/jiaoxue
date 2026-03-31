const { query } = require('../config/database');
const { COURSE_TYPE } = require('./system');

function pad(value, size = 2) {
  return String(value).padStart(size, '0');
}

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

function buildStudentNo({ departmentNo, entryYear, classCode, classSerial }) {
  return `${departmentNo}${String(entryYear).slice(-2)}${classCode}${pad(classSerial)}`;
}

async function getStudentNumberContext(classId, connection = null) {
  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT
        classes.id,
        classes.class_code,
        classes.grade_year,
        majors.id AS major_id,
        majors.name AS major_name,
        departments.id AS department_id,
        departments.department_no
      FROM classes
      INNER JOIN majors ON majors.id = classes.major_id
      INNER JOIN departments ON departments.id = majors.department_id
      WHERE classes.id = ?
      LIMIT 1
    `,
    [Number(classId)]
  );

  return rows[0] || null;
}

async function getNextClassSerial(classId, excludeStudentId = 0, connection = null) {
  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT COALESCE(MAX(CAST(class_serial AS UNSIGNED)), 0) AS max_serial
      FROM students
      WHERE class_id = ?
        AND id <> ?
    `,
    [Number(classId), Number(excludeStudentId)]
  );

  return pad(Number(rows[0]?.max_serial || 0) + 1);
}

async function resolveStudentNumber({ classId, entryYear, classSerial = null, excludeStudentId = 0 }, connection = null) {
  const context = await getStudentNumberContext(classId, connection);

  if (!context || !entryYear) {
    return null;
  }

  const serial = classSerial ? pad(classSerial) : await getNextClassSerial(classId, excludeStudentId, connection);

  return {
    classSerial: serial,
    studentNo: buildStudentNo({
      departmentNo: context.department_no,
      entryYear,
      classCode: context.class_code,
      classSerial: serial
    }),
    context
  };
}

async function getDepartmentContext(departmentId, connection = null) {
  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT id, department_no, code, name
      FROM departments
      WHERE id = ?
      LIMIT 1
    `,
    [Number(departmentId)]
  );

  return rows[0] || null;
}

async function resolveTeacherNo({ departmentId }, connection = null) {
  const runner = getRunner(connection);
  const context = await getDepartmentContext(departmentId, connection);

  if (!context) {
    return null;
  }

  const year = String(new Date().getFullYear()).slice(-2);
  const prefix = `T${context.department_no}${year}`;
  const rows = await runner.query(
    `
      SELECT COALESCE(MAX(CAST(SUBSTRING(teacher_no, ?) AS UNSIGNED)), 0) AS max_serial
      FROM teachers
      WHERE teacher_no LIKE ?
    `,
    [prefix.length + 1, `${prefix}%`]
  );

  return {
    teacherNo: `${prefix}${pad(Number(rows[0]?.max_serial || 0) + 1)}`,
    context
  };
}

async function getMajorContext(majorId, connection = null) {
  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT
        majors.id,
        majors.major_code,
        majors.code,
        majors.name,
        majors.department_id,
        departments.department_no,
        departments.code AS department_code,
        departments.name AS department_name
      FROM majors
      INNER JOIN departments ON departments.id = majors.department_id
      WHERE majors.id = ?
      LIMIT 1
    `,
    [Number(majorId)]
  );

  return rows[0] || null;
}

async function resolveCourseCode({ majorId, courseType }, connection = null) {
  const runner = getRunner(connection);
  const context = await getMajorContext(majorId, connection);

  if (!context) {
    return null;
  }

  const majorCode = String(context.code || context.major_code || '').toUpperCase();
  const typeCode = courseType === COURSE_TYPE.ELECTIVE ? 'E' : 'R';
  const prefix = `${majorCode}${typeCode}`;
  const rows = await runner.query(
    `
      SELECT COALESCE(MAX(CAST(SUBSTRING(course_code, ?) AS UNSIGNED)), 0) AS max_serial
      FROM courses
      WHERE course_code LIKE ?
    `,
    [prefix.length + 1, `${prefix}%`]
  );

  return {
    courseCode: `${prefix}${pad(Number(rows[0]?.max_serial || 0) + 1, 3)}`,
    context
  };
}

async function getCourseContext(courseId, connection = null) {
  const runner = getRunner(connection);
  const rows = await runner.query(
    `
      SELECT
        courses.id,
        courses.course_code,
        courses.course_name,
        courses.course_type,
        courses.major_id,
        majors.code AS major_code,
        majors.name AS major_name
      FROM courses
      INNER JOIN majors ON majors.id = courses.major_id
      WHERE courses.id = ?
      LIMIT 1
    `,
    [Number(courseId)]
  );

  return rows[0] || null;
}

async function resolveSectionCode({ termId, courseId }, connection = null) {
  const runner = getRunner(connection);
  const course = await getCourseContext(courseId, connection);

  if (!course || !termId) {
    return null;
  }

  const prefix = `T${pad(termId)}-${course.course_code}-`;
  const rows = await runner.query(
    `
      SELECT COALESCE(MAX(CAST(SUBSTRING(section_code, ?) AS UNSIGNED)), 0) AS max_serial
      FROM course_sections
      WHERE section_code LIKE ?
    `,
    [prefix.length + 1, `${prefix}%`]
  );

  return {
    sectionCode: `${prefix}${pad(Number(rows[0]?.max_serial || 0) + 1)}`,
    context: course
  };
}

module.exports = {
  buildStudentNo,
  getStudentNumberContext,
  getNextClassSerial,
  resolveStudentNumber,
  resolveTeacherNo,
  resolveCourseCode,
  resolveSectionCode
};

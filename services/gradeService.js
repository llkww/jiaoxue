const { calculateTotalScore } = require('../utils/score');
const { ENROLLMENT_STATUS } = require('../utils/system');

async function recalculateSectionGrades(connection, sectionId, usualWeight, finalWeight) {
  const [gradeRows] = await connection.query(
    `
      SELECT grades.id, grades.usual_score, grades.final_exam_score
      FROM grades
      INNER JOIN enrollments ON enrollments.id = grades.enrollment_id
      WHERE enrollments.section_id = ?
        AND enrollments.status = ?
    `,
    [Number(sectionId), ENROLLMENT_STATUS.SELECTED]
  );

  for (const grade of gradeRows) {
    const result = calculateTotalScore(
      grade.usual_score,
      grade.final_exam_score,
      usualWeight,
      finalWeight
    );

    await connection.execute(
      `
        UPDATE grades
        SET total_score = ?,
            grade_point = ?,
            letter_grade = ?
        WHERE id = ?
      `,
      [result.totalScore, result.gradePoint, result.letterGrade, grade.id]
    );
  }
}

module.exports = {
  recalculateSectionGrades
};

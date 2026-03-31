function normaliseNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function getLetterGrade(score) {
  if (score === null || score === undefined) {
    return null;
  }

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getGradePoint(score) {
  if (score === null || score === undefined) {
    return null;
  }

  if (score >= 90) {
    return 4.0;
  }

  if (score < 60) {
    return 0.0;
  }

  return Number((1 + Math.floor(score - 60) * 0.1).toFixed(1));
}

function calculateTotalScore(usualScore, finalScore, usualWeight, finalWeight) {
  const usual = normaliseNumber(usualScore);
  const finalExam = normaliseNumber(finalScore);

  if (usual === null || finalExam === null) {
    return {
      totalScore: null,
      letterGrade: null,
      gradePoint: null
    };
  }

  const totalScore = Number(
    ((usual * Number(usualWeight) + finalExam * Number(finalWeight)) / 100).toFixed(1)
  );

  return {
    totalScore,
    letterGrade: getLetterGrade(totalScore),
    gradePoint: getGradePoint(totalScore)
  };
}

module.exports = {
  calculateTotalScore,
  getLetterGrade,
  getGradePoint
};

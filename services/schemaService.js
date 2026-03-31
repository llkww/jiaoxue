const { query } = require('../config/database');

async function ensureClassesClassCodeScope() {
  const tableRows = await query(`SHOW TABLES LIKE 'classes'`);

  if (!tableRows.length) {
    return false;
  }

  const indexRows = await query('SHOW INDEX FROM classes');
  const hasLegacyUniqueConstraint = indexRows.some(
    (row) => row.Key_name === 'uk_classes_code' && Number(row.Non_unique) === 0
  );
  const hasGradeCodeIndex = indexRows.some((row) => row.Key_name === 'idx_classes_grade_code');

  if (!hasLegacyUniqueConstraint && hasGradeCodeIndex) {
    return false;
  }

  const alterClauses = [];

  if (hasLegacyUniqueConstraint) {
    alterClauses.push('DROP INDEX uk_classes_code');
  }

  if (!hasGradeCodeIndex) {
    alterClauses.push('ADD KEY idx_classes_grade_code (grade_year, class_code)');
  }

  if (!alterClauses.length) {
    return false;
  }

  await query(`ALTER TABLE classes ${alterClauses.join(', ')}`);
  return true;
}

async function ensureRuntimeSchema() {
  const classesClassCodeScopeUpdated = await ensureClassesClassCodeScope();

  return {
    classesClassCodeScopeUpdated
  };
}

module.exports = {
  ensureRuntimeSchema
};

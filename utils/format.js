function formatDecimal(value, digits = 1) {
  if (value === undefined || value === null || value === '') {
    return '--';
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return '--';
  }

  const fixed = number.toFixed(digits);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatScore(value) {
  return formatDecimal(value, 1);
}

function formatGpa(value) {
  return formatDecimal(value, 1);
}

function formatCompactCount(value) {
  if (value === undefined || value === null || value === '') {
    return '0';
  }

  return String(Number(value) || 0);
}

module.exports = {
  formatDecimal,
  formatScore,
  formatGpa,
  formatCompactCount
};

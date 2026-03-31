function getPagination(query, defaultPageSize = 10) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || defaultPageSize), 1), 30);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function buildPagination(total, page, pageSize) {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const pages = [];
  const windowSize = 6;
  let start = Math.max(page - Math.floor(windowSize / 2), 1);
  let end = Math.min(start + windowSize - 1, totalPages);

  if (end - start + 1 < windowSize) {
    start = Math.max(end - windowSize + 1, 1);
  }

  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }

  return {
    total,
    page,
    pageSize,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    showFirst: page > 1,
    showLast: page < totalPages,
    pages
  };
}

module.exports = {
  getPagination,
  buildPagination
};

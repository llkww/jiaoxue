const dayjs = require('dayjs');
const { getNavigation } = require('../utils/navigation');
const { getCurrentTerm } = require('../services/referenceService');
const {
  ROLE_LABELS,
  LOGIN_ROLE_OPTIONS,
  TARGET_ROLE_LABELS,
  getRoleLabel,
  getTargetRoleLabel,
  getBadgeClass
} = require('../utils/system');
const { formatDecimal, formatScore, formatGpa, formatCompactCount } = require('../utils/format');

async function localsMiddleware(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.dayjs = dayjs;
  res.locals.bodyClass = '';
  res.locals.currentYear = new Date().getFullYear();
  res.locals.navItems = getNavigation(req.session.user);
  res.locals.pageTitle = '教学管理系统';
  res.locals.currentQuery = req.query || {};
  res.locals.roleLabels = ROLE_LABELS;
  res.locals.loginRoles = LOGIN_ROLE_OPTIONS;
  res.locals.targetRoleLabels = TARGET_ROLE_LABELS;
  res.locals.roleLabel = getRoleLabel;
  res.locals.targetRoleLabel = getTargetRoleLabel;
  res.locals.badgeClass = getBadgeClass;
  res.locals.formatDecimal = formatDecimal;
  res.locals.formatScore = formatScore;
  res.locals.formatGpa = formatGpa;
  res.locals.formatCompactCount = formatCompactCount;
  res.locals.gpaRule = {
    title: '绩点计算规则',
    lines: ['90 分及以上：4.0', '60 到 89 分：从 1.0 到 3.9，每增加 1 分增加 0.1', '不及格：0', '平均绩点按课程学分加权计算']
  };
  res.locals.buildQuery = (overrides = {}) => {
    const params = new URLSearchParams();
    const merged = { ...req.query, ...overrides };

    Object.entries(merged).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, value);
      }
    });

    return params.toString();
  };

  try {
    res.locals.currentTerm = await getCurrentTerm();
  } catch (error) {
    res.locals.currentTerm = null;
  }

  next();
}

module.exports = localsMiddleware;

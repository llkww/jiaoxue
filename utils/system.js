const ROLE = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin'
};

const TARGET_ROLE = {
  ALL: 'all',
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin'
};

const USER_STATUS = {
  ENABLED: '启用',
  DISABLED: '停用'
};

const TERM_STATUS = {
  PLANNING: '规划中',
  ACTIVE: '进行中',
  ARCHIVED: '已归档'
};

const COURSE_TYPE = {
  REQUIRED: '必修',
  ELECTIVE: '选修'
};

const SECTION_STATUS = {
  OPEN: '开放选课',
  CLOSED: '暂停选课',
  ARCHIVED: '已归档'
};

const ENROLLMENT_STATUS = {
  SELECTED: '已选',
  DROPPED: '已退课'
};

const GRADE_STATUS = {
  PENDING: '待录入',
  PUBLISHED: '已发布'
};

const ANNOUNCEMENT_PRIORITY = {
  NORMAL: '普通',
  IMPORTANT: '重要',
  URGENT: '紧急'
};

const ANNOUNCEMENT_CATEGORY = {
  GENERAL: '系统公告',
  WARNING: '学业预警',
  TEACHING: '教学通知'
};

const ROLE_LABELS = {
  [ROLE.STUDENT]: '学生',
  [ROLE.TEACHER]: '教师',
  [ROLE.ADMIN]: '管理员'
};

const LOGIN_ROLE_OPTIONS = Object.freeze([
  Object.freeze({
    value: ROLE.STUDENT,
    label: ROLE_LABELS[ROLE.STUDENT],
    icon: 'solar:user-id-linear',
    order: '01'
  }),
  Object.freeze({
    value: ROLE.TEACHER,
    label: ROLE_LABELS[ROLE.TEACHER],
    icon: 'solar:case-round-linear',
    order: '02'
  }),
  Object.freeze({
    value: ROLE.ADMIN,
    label: ROLE_LABELS[ROLE.ADMIN],
    icon: 'solar:shield-user-linear',
    order: '03'
  })
]);

const LOGIN_ROLE_VALUES = Object.freeze(LOGIN_ROLE_OPTIONS.map((item) => item.value));

const TARGET_ROLE_LABELS = {
  [TARGET_ROLE.ALL]: '全体',
  [TARGET_ROLE.STUDENT]: '学生',
  [TARGET_ROLE.TEACHER]: '教师',
  [TARGET_ROLE.ADMIN]: '管理员'
};

const BADGE_CLASS_MAP = {
  [USER_STATUS.ENABLED]: 'is-positive',
  [USER_STATUS.DISABLED]: 'is-negative',
  [TERM_STATUS.PLANNING]: 'is-warning',
  [TERM_STATUS.ACTIVE]: 'is-positive',
  [TERM_STATUS.ARCHIVED]: 'is-muted',
  [COURSE_TYPE.REQUIRED]: 'is-positive',
  [COURSE_TYPE.ELECTIVE]: 'is-neutral',
  [SECTION_STATUS.OPEN]: 'is-positive',
  [SECTION_STATUS.CLOSED]: 'is-warning',
  [SECTION_STATUS.ARCHIVED]: 'is-muted',
  [ENROLLMENT_STATUS.SELECTED]: 'is-positive',
  [ENROLLMENT_STATUS.DROPPED]: 'is-muted',
  [GRADE_STATUS.PENDING]: 'is-warning',
  [GRADE_STATUS.PUBLISHED]: 'is-positive',
  [ANNOUNCEMENT_PRIORITY.NORMAL]: 'is-neutral',
  [ANNOUNCEMENT_PRIORITY.IMPORTANT]: 'is-warning',
  [ANNOUNCEMENT_PRIORITY.URGENT]: 'is-negative',
  [ANNOUNCEMENT_CATEGORY.GENERAL]: 'is-neutral',
  [ANNOUNCEMENT_CATEGORY.WARNING]: 'is-negative',
  [ANNOUNCEMENT_CATEGORY.TEACHING]: 'is-warning'
};

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function getTargetRoleLabel(role) {
  return TARGET_ROLE_LABELS[role] || role;
}

function getBadgeClass(value) {
  return BADGE_CLASS_MAP[value] || 'is-neutral';
}

module.exports = {
  ROLE,
  TARGET_ROLE,
  USER_STATUS,
  TERM_STATUS,
  COURSE_TYPE,
  SECTION_STATUS,
  ENROLLMENT_STATUS,
  GRADE_STATUS,
  ANNOUNCEMENT_PRIORITY,
  ANNOUNCEMENT_CATEGORY,
  ROLE_LABELS,
  LOGIN_ROLE_OPTIONS,
  LOGIN_ROLE_VALUES,
  TARGET_ROLE_LABELS,
  getRoleLabel,
  getTargetRoleLabel,
  getBadgeClass
};

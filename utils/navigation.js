function getNavigation(user) {
  if (!user) {
    return [];
  }

  const common = [
    {
      path: '/dashboard',
      match: '/dashboard',
      label: '总览',
      icon: 'solar:widget-2-linear'
    },
    {
      path: '/profile',
      match: '/profile',
      label: '个人资料',
      icon: 'solar:user-circle-linear'
    }
  ];

  const roleNavigation = {
    student: [
      {
        path: '/announcements',
        match: '/announcements',
        label: '公告中心',
        icon: 'solar:bell-bing-linear'
      },
      {
        path: '/student/courses',
        match: '/student/courses',
        label: '在线选课',
        icon: 'solar:book-bookmark-linear'
      },
      {
        path: '/student/enrollments',
        match: '/student/enrollments',
        label: '我的课程',
        icon: 'solar:bookmark-square-linear'
      },
      {
        path: '/student/schedule',
        match: '/student/schedule',
        label: '我的课表',
        icon: 'solar:calendar-linear'
      },
      {
        path: '/student/campus-schedule',
        match: '/student/campus-schedule',
        label: '全校课表查询',
        icon: 'solar:calendar-search-linear'
      },
      {
        path: '/student/program-plan',
        match: '/student/program-plan',
        label: '我的培养方案',
        icon: 'solar:square-academic-cap-linear'
      },
      {
        path: '/student/grades',
        match: '/student/grades',
        label: '成绩查询',
        icon: 'solar:chart-linear'
      },
      {
        path: '/student/evaluations',
        match: '/student/evaluations',
        label: '教学评价',
        icon: 'solar:chat-square-like-linear'
      }
    ],
    teacher: [
      {
        path: '/announcements',
        match: '/announcements',
        label: '公告中心',
        icon: 'solar:bell-bing-linear'
      },
      {
        path: '/teacher/sections',
        match: '/teacher/sections',
        label: '教学任务',
        icon: 'solar:case-round-linear'
      },
      {
        path: '/teacher/schedule',
        match: '/teacher/schedule',
        label: '教师课表',
        icon: 'solar:calendar-search-linear'
      },
      {
        path: '/teacher/evaluations',
        match: '/teacher/evaluations',
        label: '评价反馈',
        icon: 'solar:chat-round-like-linear'
      }
    ],
    admin: [
      {
        path: '/admin/courses',
        match: '/admin/courses',
        label: '课程管理',
        icon: 'solar:library-linear'
      },
      {
        path: '/admin/sections',
        match: '/admin/sections',
        label: '开课管理',
        icon: 'solar:course-up-linear'
      },
      {
        path: '/admin/students',
        match: '/admin/students',
        label: '学生管理',
        icon: 'solar:users-group-rounded-linear'
      },
      {
        path: '/admin/teachers',
        match: '/admin/teachers',
        label: '教师管理',
        icon: 'solar:user-id-linear'
      },
      {
        path: '/admin/users',
        match: '/admin/users',
        label: '账号管理',
        icon: 'solar:key-linear'
      },
      {
        path: '/admin/foundations',
        match: '/admin/foundations',
        label: '基础信息',
        icon: 'solar:settings-linear'
      },
      {
        path: '/admin/classrooms',
        match: '/admin/classrooms',
        label: '教室管理',
        icon: 'solar:buildings-2-linear'
      },
      {
        path: '/admin/terms',
        match: '/admin/terms',
        label: '学期管理',
        icon: 'solar:calendar-mark-linear'
      },
      {
        path: '/admin/program-plans',
        match: '/admin/program-plans',
        label: '培养方案',
        icon: 'solar:square-academic-cap-linear'
      },
      {
        path: '/admin/announcements',
        match: '/admin/announcements',
        label: '公告发布',
        icon: 'solar:chat-round-call-linear'
      },
      {
        path: '/admin/enrollments',
        match: '/admin/enrollments',
        label: '选课数据',
        icon: 'solar:list-check-linear'
      }
    ]
  };

  return [...common, ...(roleNavigation[user.role] || [])];
}

module.exports = {
  getNavigation
};

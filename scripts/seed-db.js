const { calculateTotalScore } = require('../utils/score');
const {
  TARGET_ROLE,
  USER_STATUS,
  TERM_STATUS,
  COURSE_TYPE,
  SECTION_STATUS,
  ENROLLMENT_STATUS,
  GRADE_STATUS,
  ANNOUNCEMENT_PRIORITY,
  ANNOUNCEMENT_CATEGORY
} = require('../utils/system');

const ADMIN_HASH = '$2a$10$4yHWAUZxeLomRdY0qASzpeiLL7rz1Y4zylhcDYqqxEZbxXE5RtVkC';
const TEACHER_HASH = '$2a$10$gPEwwusL6U0E.cs4UFvcb.rlrE1vehsDMTdiaLOVV9XFTUWjp/PEG';
const STUDENT_HASH = '$2a$10$9Zq3PZ3QpUwQMSWdWrQVVu.ZXbrAh6vgawiclb/ZKPtLJ3nX4Shq.';

const CURRENT_TERM_ID = 6;
const WARNING_TERM_ID = 5;

const DEPARTMENTS = [
  [1, '21', 'CST', '计算机科学与技术学院', '承担计算机科学与技术、软件工程、人工智能等本科专业建设与人才培养。'],
  [2, '31', 'MATH', '数学与统计学院', '承担高等数学、线性代数、概率统计等公共基础课程。'],
  [3, '41', 'GE', '通识教育中心', '承担思想政治、大学英语、体育、职业发展等通识课程。']
].map(([id, departmentNo, code, name, description]) => ({ id, departmentNo, code, name, description }));

const MAJORS = [
  [1, 1, '01', 'CS', '计算机科学与技术', '培养具备系统能力、工程实践能力与算法分析能力的复合型计算机人才。'],
  [2, 1, '02', 'SE', '软件工程', '聚焦软件开发、测试、交付与项目管理。'],
  [3, 1, '03', 'AI', '人工智能', '面向智能系统建模、机器学习与智能应用开发。'],
  [4, 2, '01', 'MATH', '公共数学', '承载数学类公共课程资源。'],
  [5, 3, '01', 'GE', '通识教育', '承载通识与公共课程资源。']
].map(([id, departmentId, majorCode, code, name, description]) => ({ id, departmentId, majorCode, code, name, description }));

const CLASSES = [
  [1, 1, '01', '计算机科学与技术 2023级1班', 2023, '王悦'],
  [2, 1, '02', '计算机科学与技术 2023级2班', 2023, '李青'],
  [3, 2, '03', '软件工程 2023级3班', 2023, '周宁'],
  [4, 3, '04', '人工智能 2023级4班', 2023, '赵岚']
].map(([id, majorId, classCode, className, gradeYear, counselorName]) => ({ id, majorId, classCode, className, gradeYear, counselorName }));

const TEACHERS = [
  [1, 't_chen', '陈知远', '13900000002', 'T20201', '男', '1987-03-18', '教师公寓1栋201', 1, '副教授', '信息楼101', '计算机系统与体系结构', '#1f6f5f'],
  [2, 't_liu', '刘青川', '13900000003', 'T20202', '男', '1990-07-26', '教师公寓2栋305', 1, '讲师', '信息楼208', '软件工程与 Web 开发', '#245c73'],
  [3, 't_zhao', '赵以恒', '13900000004', 'T20203', '男', '1989-12-09', '教师公寓2栋108', 1, '讲师', '信息楼306', '数据库与数据工程', '#8b5e34'],
  [4, 't_sun', '孙明哲', '13900000005', 'T20204', '男', '1986-04-12', '创新楼教师周转房506', 1, '副教授', '创新楼210', '机器学习与推荐系统', '#5f0f40'],
  [5, 't_he', '何安澜', '13900000006', 'T20205', '女', '1988-09-03', '教师公寓3栋402', 1, '副教授', '信息楼318', '图形学、移动开发与云计算', '#4d908e'],
  [6, 't_ma', '马会宇', '13900000007', 'T20206', '男', '1985-01-29', '理学楼教师公寓212', 2, '副教授', '理学楼209', '高等数学与概率统计', '#2d6a4f'],
  [7, 't_zhou', '周雅宁', '13900000008', 'T20207', '女', '1984-11-17', '博雅楼教工宿舍107', 3, '副教授', '博雅楼102', '思想政治教育与职业发展', '#7a3f2e'],
  [8, 't_lin', '林卓然', '13900000009', 'T20208', '女', '1991-05-22', '教师公寓4栋206', 3, '讲师', '博雅楼203', '大学英语与科技写作', '#4361ee']
].map(([
  id,
  username,
  fullName,
  phone,
  teacherNo,
  gender,
  birthDate,
  address,
  departmentId,
  title,
  officeLocation,
  specialtyText,
  avatarColor
]) => ({
  id,
  username,
  fullName,
  phone,
  teacherNo,
  gender,
  birthDate,
  address,
  departmentId,
  title,
  officeLocation,
  specialtyText,
  avatarColor
}));

const STUDENTS = [
  [1, 's_2023001', '张晨曦', 1, '01', '男', '2005-01-18', '北苑1舍101', '#146356'],
  [2, 's_2023002', '李若彤', 1, '02', '女', '2005-05-09', '北苑1舍102', '#274c77'],
  [3, 's_2023003', '周景川', 1, '03', '男', '2005-02-11', '北苑1舍103', '#6d597a'],
  [4, 's_2023004', '沈知夏', 1, '04', '女', '2005-08-21', '北苑1舍105', '#9a3412'],
  [5, 's_2023005', '王可凡', 2, '01', '男', '2005-03-06', '北苑2舍201', '#3d405b'],
  [6, 's_2023006', '程雨桐', 2, '02', '女', '2005-10-17', '北苑2舍202', '#4d908e'],
  [7, 's_2023007', '许嘉树', 3, '01', '男', '2005-07-13', '东苑3舍308', '#577590'],
  [8, 's_2023008', '顾念安', 3, '02', '女', '2005-11-25', '东苑3舍310', '#7f5539'],
  [9, 's_2023009', '韩予墨', 4, '01', '男', '2005-04-16', '知新楼401', '#386641'],
  [10, 's_2023010', '宋知言', 4, '02', '女', '2005-06-28', '知新楼402', '#bc4749']
].map(([id, username, fullName, classId, classSerial, gender, birthDate, address, avatarColor]) => ({
  id,
  username,
  fullName,
  classId,
  classSerial,
  gender,
  birthDate,
  address,
  avatarColor
}));

const TERMS = [
  [1, '2023-2024 学年第一学期', '2023-2024', '第一学期', '2023-09-04', '2024-01-21', '2023-08-28', '2023-09-22', 0, TERM_STATUS.ARCHIVED],
  [2, '2023-2024 学年第二学期', '2023-2024', '第二学期', '2024-02-26', '2024-07-07', '2024-02-20', '2024-03-15', 0, TERM_STATUS.ARCHIVED],
  [3, '2024-2025 学年第一学期', '2024-2025', '第一学期', '2024-09-02', '2025-01-19', '2024-08-26', '2024-09-20', 0, TERM_STATUS.ARCHIVED],
  [4, '2024-2025 学年第二学期', '2024-2025', '第二学期', '2025-02-24', '2025-07-06', '2025-02-18', '2025-03-21', 0, TERM_STATUS.ARCHIVED],
  [5, '2025-2026 学年第一学期', '2025-2026', '第一学期', '2025-09-01', '2026-01-18', '2025-08-25', '2025-09-26', 0, TERM_STATUS.ARCHIVED],
  [6, '2025-2026 学年第二学期', '2025-2026', '第二学期', '2026-02-24', '2026-07-05', '2026-02-20', '2026-04-18', 1, TERM_STATUS.ACTIVE],
  [7, '2026-2027 学年第一学期', '2026-2027', '第一学期', '2026-09-07', '2027-01-24', '2026-08-31', '2026-09-25', 0, TERM_STATUS.PLANNING],
  [8, '2026-2027 学年第二学期', '2026-2027', '第二学期', '2027-02-22', '2027-07-04', '2027-02-18', '2027-03-19', 0, TERM_STATUS.PLANNING]
].map(([id, name, academicYear, semesterLabel, startDate, endDate, selectionStart, selectionEnd, isCurrent, status]) => ({
  id,
  name,
  academicYear,
  semesterLabel,
  startDate,
  endDate,
  selectionStart,
  selectionEnd,
  isCurrent,
  status
}));

const CLASSROOMS = [
  [1, '信息楼', '101', 70, '标准教室'],
  [2, '信息楼', '201', 64, '标准教室'],
  [3, '信息楼', '301', 64, '机房'],
  [4, '信息楼', '401', 56, '研讨教室'],
  [5, '创新楼', '202', 60, '标准教室'],
  [6, '创新楼', '305', 56, '研讨教室'],
  [7, '理学楼', '210', 80, '标准教室'],
  [8, '理学楼', '312', 72, '标准教室'],
  [9, '博雅楼', '108', 90, '标准教室'],
  [10, '博雅楼', '204', 64, '标准教室'],
  [11, '图文中心', '210', 48, '研讨教室'],
  [12, '工程训练中心', '103', 48, '实验室']
].map(([id, buildingName, roomNumber, capacity, roomType]) => ({ id, buildingName, roomNumber, capacity, roomType }));

const COURSE_CATALOG = [
  ['GE1001', '思想道德与法治', 3, 5, COURSE_TYPE.REQUIRED, 3, 48, '考查'],
  ['GE1002', '军事理论', 3, 5, COURSE_TYPE.REQUIRED, 1, 16, '考查'],
  ['MA1101', '高等数学A1', 2, 4, COURSE_TYPE.REQUIRED, 5, 80, '考试'],
  ['CS1101', '程序设计基础（C语言）', 1, 1, COURSE_TYPE.REQUIRED, 4, 64, '考试'],
  ['CS1102', '计算机导论', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['GE1101', '大学英语1', 3, 5, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['GE1102', '体育1', 3, 5, COURSE_TYPE.REQUIRED, 1, 32, '考查'],
  ['GE1201', '中国近现代史纲要', 3, 5, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['MA1201', '高等数学A2', 2, 4, COURSE_TYPE.REQUIRED, 5, 80, '考试'],
  ['CS1201', '面向对象程序设计', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['CS1202', '数据结构', 1, 1, COURSE_TYPE.REQUIRED, 4, 64, '考试'],
  ['MA1202', '离散数学', 2, 4, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['GE1202', '大学英语2', 3, 5, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['GE1203', '体育2', 3, 5, COURSE_TYPE.REQUIRED, 1, 32, '考查'],
  ['MA2101', '概率论与数理统计', 2, 4, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['MA2102', '线性代数', 2, 4, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['CS2101', '计算机组成原理', 1, 1, COURSE_TYPE.REQUIRED, 4, 64, '考试'],
  ['CS2102', '操作系统', 1, 1, COURSE_TYPE.REQUIRED, 4, 64, '考试'],
  ['CS2103', '数据库系统原理', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['GE2101', '大学英语3', 3, 5, COURSE_TYPE.REQUIRED, 2, 32, '考试'],
  ['GE2102', '体育3', 3, 5, COURSE_TYPE.REQUIRED, 1, 32, '考查'],
  ['CS2201', '计算机网络', 1, 1, COURSE_TYPE.REQUIRED, 4, 64, '考试'],
  ['CS2202', '软件工程', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '项目制'],
  ['CS2203', '算法设计与分析', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['CS2204', 'Java Web开发', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '项目制'],
  ['CS2205', 'Python程序设计', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考试'],
  ['GE2201', '马克思主义基本原理', 3, 5, COURSE_TYPE.REQUIRED, 3, 48, '考查'],
  ['GE2202', '体育4', 3, 5, COURSE_TYPE.REQUIRED, 1, 32, '考查'],
  ['CS3101', '编译原理', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['CS3102', 'Linux系统管理', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['CS3103', 'Web前端开发', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '项目制'],
  ['CS3104', '软件测试', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['CS3105', '信息安全基础', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考试'],
  ['CS3106', '人工智能导论', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考试'],
  ['GE3101', '毛泽东思想和中国特色社会主义理论体系概论', 3, 5, COURSE_TYPE.REQUIRED, 4, 64, '考查'],
  ['GE3102', '创新创业基础', 3, 5, COURSE_TYPE.REQUIRED, 1, 16, '考查'],
  ['CS3201', '计算机图形学', 1, 1, COURSE_TYPE.REQUIRED, 2.5, 40, '考试'],
  ['CS3202', '数据挖掘基础', 1, 1, COURSE_TYPE.REQUIRED, 2.5, 40, '考试'],
  ['CS3203', '机器学习导论', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考试'],
  ['CS3204', '云计算基础', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['CS3205', '移动应用开发', 1, 1, COURSE_TYPE.REQUIRED, 2.5, 40, '项目制'],
  ['CS3206', '推荐系统实践', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '项目制'],
  ['CS3207', '数据库课程设计', 1, 1, COURSE_TYPE.REQUIRED, 1.5, 24, '课程设计'],
  ['GE3201', '大学生职业发展与就业指导', 3, 5, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['CS4101', '深度学习基础', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '考试'],
  ['CS4102', '大数据处理框架', 1, 1, COURSE_TYPE.REQUIRED, 3, 48, '项目制'],
  ['CS4103', '区块链技术导论', 1, 1, COURSE_TYPE.ELECTIVE, 2, 32, '考查'],
  ['CS4104', '项目管理与工程伦理', 1, 1, COURSE_TYPE.REQUIRED, 2, 32, '考查'],
  ['CS4105', '专业实习', 1, 1, COURSE_TYPE.REQUIRED, 5, 160, '实习考核'],
  ['CS4106', '智能计算专题', 1, 1, COURSE_TYPE.ELECTIVE, 2, 32, '课程论文'],
  ['CS4201', '毕业实习', 1, 1, COURSE_TYPE.REQUIRED, 4, 128, '实习考核'],
  ['CS4202', '毕业设计', 1, 1, COURSE_TYPE.REQUIRED, 12, 384, '毕业设计'],
  ['CS4203', '学术前沿讲座', 1, 1, COURSE_TYPE.REQUIRED, 1, 16, '考查'],
  ['CS4204', '创业实践', 3, 5, COURSE_TYPE.REQUIRED, 2, 64, '实践考核'],
  ['SE3301', 'DevOps实践', 1, 2, COURSE_TYPE.ELECTIVE, 2.5, 40, '项目制'],
  ['AI3301', '数据可视化应用', 1, 3, COURSE_TYPE.ELECTIVE, 2, 32, '项目制'],
  ['GE3301', '科技论文写作', 3, 5, COURSE_TYPE.ELECTIVE, 1.5, 24, '考查'],
  ['MA3302', '数值分析', 2, 4, COURSE_TYPE.ELECTIVE, 3, 48, '考试'],
  ['MA3303', '应用统计学', 2, 4, COURSE_TYPE.ELECTIVE, 2.5, 40, '考试'],
  ['MA3304', '运筹学', 2, 4, COURSE_TYPE.ELECTIVE, 2.5, 40, '考试'],
  ['MA3305', '数学建模基础', 2, 4, COURSE_TYPE.ELECTIVE, 2, 32, '项目制'],
  ['MA3306', 'MATLAB科学计算', 2, 4, COURSE_TYPE.ELECTIVE, 2, 32, '上机考核'],
  ['GE2301', '形势与政策', 3, 5, COURSE_TYPE.REQUIRED, 1, 16, '考查'],
  ['GE2302', '大学生心理健康教育', 3, 5, COURSE_TYPE.ELECTIVE, 2, 32, '考查'],
  ['GE2303', '劳动教育', 3, 5, COURSE_TYPE.REQUIRED, 1, 16, '实践考核'],
  ['GE2304', '学术写作与表达', 3, 5, COURSE_TYPE.ELECTIVE, 2, 32, '课程论文'],
  ['GE2305', '跨文化沟通英语', 3, 5, COURSE_TYPE.ELECTIVE, 2, 32, '考查']
].map(([code, name, departmentId, majorId, type, credits, hours, assessment]) => ({
  code,
  name,
  departmentId,
  majorId,
  type,
  credits,
  hours,
  assessment
}));

const PROGRAM_PLAN = {
  id: 1,
  majorId: 1,
  name: '计算机科学与技术专业本科培养方案（2023版）',
  semesters: [
    { semesterNo: 1, modules: [{ moduleName: '通识素养与军体', moduleType: '通识基础', courses: ['GE1001', 'GE1002', 'GE1101', 'GE1102'] }, { moduleName: '数学与程序设计基础', moduleType: '专业基础', courses: ['MA1101', 'CS1101', 'CS1102'] }] },
    { semesterNo: 2, modules: [{ moduleName: '通识素养提升', moduleType: '通识基础', courses: ['GE1201', 'GE1202', 'GE1203'] }, { moduleName: '程序设计与离散基础', moduleType: '专业基础', courses: ['MA1201', 'CS1201', 'CS1202', 'MA1202'] }] },
    { semesterNo: 3, modules: [{ moduleName: '数学与外语进阶', moduleType: '通识基础', courses: ['MA2101', 'MA2102', 'GE2101', 'GE2102'] }, { moduleName: '系统能力基础', moduleType: '专业核心', courses: ['CS2101', 'CS2102', 'CS2103'] }] },
    { semesterNo: 4, modules: [{ moduleName: '马克思主义与体育', moduleType: '通识基础', courses: ['GE2201', 'GE2202'] }, { moduleName: '软件与网络核心', moduleType: '专业核心', courses: ['CS2201', 'CS2202', 'CS2203', 'CS2204', 'CS2205'] }] },
    { semesterNo: 5, modules: [{ moduleName: '理论素养与创新创业', moduleType: '通识基础', courses: ['GE3101', 'GE3102'] }, { moduleName: '系统进阶与专业拓展', moduleType: '专业核心', courses: ['CS3101', 'CS3102', 'CS3103', 'CS3104', 'CS3105', 'CS3106'] }] },
    { semesterNo: 6, modules: [{ moduleName: '职业发展与工程实践', moduleType: '实践拓展', courses: ['GE3201', 'CS3207'] }, { moduleName: '智能应用与平台能力', moduleType: '专业核心', courses: ['CS3201', 'CS3202', 'CS3203', 'CS3204', 'CS3205', 'CS3206'] }] },
    { semesterNo: 7, modules: [{ moduleName: '工程实践与伦理', moduleType: '实践拓展', courses: ['CS4104', 'CS4105'] }, { moduleName: '前沿技术选修', moduleType: '专业选修', courses: ['CS4101', 'CS4102', 'CS4103', 'CS4106'] }] },
    { semesterNo: 8, modules: [{ moduleName: '毕业实践', moduleType: '实践拓展', courses: ['CS4201', 'CS4202'] }, { moduleName: '综合素养收官', moduleType: '专业拓展', courses: ['CS4203', 'CS4204'] }] }
  ]
};

const FAILED_COURSE_CODES = ['MA1101', 'CS1202', 'MA2102', 'CS2101', 'CS2201', 'CS3101'];
const CURRENT_SELECTED_CODES = ['CS3201', 'CS3202', 'CS3204', 'CS3207'];
const CURRENT_EXTRA_CODES = ['SE3301', 'AI3301', 'GE3301'];
const CURRENT_NON_CS_CODES = ['MA3302', 'MA3303', 'MA3304', 'MA3305', 'MA3306', 'GE2301', 'GE2302', 'GE2303', 'GE2304', 'GE2305'];
const CURRENT_TERM_TEACHER_OVERRIDES = {
  CS3201: 1,
  CS3204: 1,
  CS3205: 1
};
const FAILED_SCORE_MAP = {
  MA1101: { usual: 55, final: 53 },
  CS1202: { usual: 58, final: 54 },
  MA2102: { usual: 57, final: 54 },
  CS2101: { usual: 58, final: 55 },
  CS2201: { usual: 56, final: 53 },
  CS3101: { usual: 54, final: 52 }
};

const TEACHER_BY_COURSE = {
  GE1001: 7, GE1002: 7, MA1101: 6, CS1101: 1, CS1102: 1, GE1101: 8, GE1102: 7,
  GE1201: 7, MA1201: 6, CS1201: 2, CS1202: 1, MA1202: 6, GE1202: 8, GE1203: 7,
  MA2101: 6, MA2102: 6, CS2101: 1, CS2102: 1, CS2103: 3, GE2101: 8, GE2102: 7,
  CS2201: 1, CS2202: 2, CS2203: 1, CS2204: 2, CS2205: 2, GE2201: 7, GE2202: 7,
  CS3101: 1, CS3102: 2, CS3103: 2, CS3104: 2, CS3105: 3, CS3106: 4, GE3101: 7, GE3102: 7,
  CS3201: 5, CS3202: 3, CS3203: 4, CS3204: 5, CS3205: 5, CS3206: 4, CS3207: 3, GE3201: 7,
  CS4101: 4, CS4102: 3, CS4103: 4, CS4104: 2, CS4105: 2, CS4106: 4,
  CS4201: 2, CS4202: 1, CS4203: 1, CS4204: 7, SE3301: 2, AI3301: 4, GE3301: 8,
  MA3302: 6, MA3303: 6, MA3304: 6, MA3305: 6, MA3306: 6,
  GE2301: 7, GE2302: 7, GE2303: 7, GE2304: 8, GE2305: 8
};

const SLOT_BLOCKS = [
  { startPeriod: 1, endPeriod: 2, startTime: '08:00:00', endTime: '09:35:00' },
  { startPeriod: 3, endPeriod: 4, startTime: '10:00:00', endTime: '11:35:00' },
  { startPeriod: 5, endPeriod: 6, startTime: '14:00:00', endTime: '15:35:00' },
  { startPeriod: 7, endPeriod: 8, startTime: '16:00:00', endTime: '17:35:00' },
  { startPeriod: 9, endPeriod: 10, startTime: '19:00:00', endTime: '20:35:00' }
];

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function insertRows(connection, table, columns, rows) {
  if (!rows.length) {
    return Promise.resolve();
  }

  return connection.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [rows]);
}

function buildTimeSlots() {
  const rows = [];
  let id = 1;

  for (let weekday = 1; weekday <= 5; weekday += 1) {
    SLOT_BLOCKS.forEach((block) => {
      rows.push([
        id,
        weekday,
        block.startPeriod,
        block.endPeriod,
        block.startTime,
        block.endTime,
        `${WEEKDAY_LABELS[weekday - 1]} 第${block.startPeriod}-${block.endPeriod}节`
      ]);
      id += 1;
    });
  }

  return rows;
}

function buildCourseRows() {
  return COURSE_CATALOG.map((course, index) => [
    index + 1,
    course.departmentId,
    course.majorId,
    course.code,
    course.name,
    course.type,
    course.credits,
    course.hours,
    course.assessment,
    `${course.name}课程说明`
  ]);
}

function buildCourseMap() {
  return new Map(COURSE_CATALOG.map((course, index) => [course.code, { ...course, id: index + 1 }]));
}

function buildClassMap() {
  return new Map(CLASSES.map((item) => [item.id, item]));
}

function buildMajorMap() {
  return new Map(MAJORS.map((item) => [item.id, item]));
}

function buildDepartmentMap() {
  return new Map(DEPARTMENTS.map((item) => [item.id, item]));
}

function buildStudentNo(classId, classSerial, entryYear = 2023) {
  const classMap = buildClassMap();
  const majorMap = buildMajorMap();
  const departmentMap = buildDepartmentMap();
  const classItem = classMap.get(classId);
  const major = majorMap.get(classItem.majorId);
  const department = departmentMap.get(major.departmentId);
  return `${department.departmentNo}${String(entryYear).slice(-2)}${classItem.classCode}${classSerial}`;
}

function buildUsers() {
  const rows = [
    [1, 'admin01', ADMIN_HASH, 'admin', '周岚', 'admin01@northlake.edu.cn', '13900000001', '#8b5e34', USER_STATUS.ENABLED, null]
  ];

  TEACHERS.forEach((teacher, index) => {
    rows.push([
      index + 2,
      teacher.username,
      TEACHER_HASH,
      'teacher',
      teacher.fullName,
      `${teacher.username}@northlake.edu.cn`,
      teacher.phone,
      teacher.avatarColor,
      USER_STATUS.ENABLED,
      null
    ]);
  });

  const studentUserOffset = TEACHERS.length + 2;
  STUDENTS.forEach((student, index) => {
    rows.push([
      studentUserOffset + index,
      student.username,
      STUDENT_HASH,
      'student',
      student.fullName,
      `${student.username}@northlake.edu.cn`,
      `1380000${pad2(index + 1)}${pad2(index + 11)}`,
      student.avatarColor,
      USER_STATUS.ENABLED,
      null
    ]);
  });

  return rows;
}

function getCreditsRequiredByClass(classId) {
  return buildClassMap().get(classId).majorId === PROGRAM_PLAN.majorId ? 150 : 160;
}

function buildStudentRows() {
  const studentUserOffset = TEACHERS.length + 2;
  return STUDENTS.map((student, index) => [
    student.id,
    studentUserOffset + index,
    buildStudentNo(student.classId, student.classSerial),
    student.gender,
    student.classId,
    student.classSerial,
    2023,
    1,
    student.birthDate,
    student.address,
    getCreditsRequiredByClass(student.classId)
  ]);
}

function buildTeacherRows() {
  return TEACHERS.map((teacher, index) => [
    teacher.id,
    index + 2,
    teacher.teacherNo,
    teacher.gender,
    teacher.birthDate,
    teacher.address,
    teacher.departmentId,
    teacher.title,
    teacher.officeLocation,
    teacher.specialtyText
  ]);
}

function buildPlanRows(courseMap) {
  const modules = [];
  const mappings = [];
  let moduleId = 1;
  let mappingId = 1;
  let totalCredits = 0;

  PROGRAM_PLAN.semesters.forEach((semester) => {
    semester.modules.forEach((module) => {
      const requiredCredits = module.courses.reduce((sum, courseCode) => sum + Number(courseMap.get(courseCode).credits), 0);
      totalCredits += requiredCredits;
      modules.push([moduleId, PROGRAM_PLAN.id, semester.semesterNo, module.moduleName, module.moduleType, requiredCredits.toFixed(1)]);

      module.courses.forEach((courseCode) => {
        mappings.push([mappingId, PROGRAM_PLAN.id, moduleId, courseMap.get(courseCode).id, semester.semesterNo]);
        mappingId += 1;
      });

      moduleId += 1;
    });
  });

  return {
    plans: [[PROGRAM_PLAN.id, PROGRAM_PLAN.majorId, PROGRAM_PLAN.name, totalCredits.toFixed(1)]],
    modules,
    mappings
  };
}

function buildAnnouncements() {
  const list = [
    [1, '2025-2026 学年第二学期选课安排', '本学期学生选课与退课演示窗口已开放，请在系统中直接完成选课、退课与推荐课程查看。', ANNOUNCEMENT_CATEGORY.TEACHING, TARGET_ROLE.ALL, null, ANNOUNCEMENT_PRIORITY.IMPORTANT, 1, '2026-02-18 09:00:00'],
    [2, '培养方案地图已升级为学期分组视图', '学生端培养方案地图现按学期与模块双层结构展示，并同步课程通过、在修、未通过状态。', ANNOUNCEMENT_CATEGORY.GENERAL, TARGET_ROLE.STUDENT, null, ANNOUNCEMENT_PRIORITY.NORMAL, 1, '2026-03-05 10:00:00'],
    [3, '教学评价支持返回原分页位置', '提交或修改评价后，系统会恢复到离开前的列表页码、筛选条件与滚动位置。', ANNOUNCEMENT_CATEGORY.TEACHING, TARGET_ROLE.STUDENT, null, ANNOUNCEMENT_PRIORITY.NORMAL, 1, '2026-03-08 14:30:00'],
    [4, '全校课表查询支持单课课表视图', '查看详情后可直接查看该课程在课表中的独立排布，便于比较时段与教室安排。', ANNOUNCEMENT_CATEGORY.GENERAL, TARGET_ROLE.ALL, null, ANNOUNCEMENT_PRIORITY.NORMAL, 1, '2026-03-11 09:40:00'],
    [5, '教师成绩册开启自动保存', '教师端成绩册支持自动保存，并联动计算总评、等级与绩点。', ANNOUNCEMENT_CATEGORY.TEACHING, TARGET_ROLE.TEACHER, null, ANNOUNCEMENT_PRIORITY.IMPORTANT, 1, '2026-03-13 15:10:00'],
    [6, '管理端删除校验已与数据库约束统一', '管理端删除前会先检查关联数据，数据库层使用外键与限制性约束，避免误删。', ANNOUNCEMENT_CATEGORY.GENERAL, TARGET_ROLE.ADMIN, null, ANNOUNCEMENT_PRIORITY.IMPORTANT, 1, '2026-03-16 11:20:00'],
    [7, '在线选课推荐课程规则更新', '推荐课程仅显示当前学期开设、且属于本学期培养方案要求或历史未通过且当前学期已开放重修的课程。', ANNOUNCEMENT_CATEGORY.TEACHING, TARGET_ROLE.STUDENT, null, ANNOUNCEMENT_PRIORITY.IMPORTANT, 1, '2026-03-20 08:30:00'],
    [8, '教学系统演示数据已重置', '当前演示账号已按 2023 级培养方案重置，推荐课程、学业预警、成绩发布与培养方案地图均可直接演示。', ANNOUNCEMENT_CATEGORY.GENERAL, TARGET_ROLE.ALL, null, ANNOUNCEMENT_PRIORITY.NORMAL, 1, '2026-03-24 16:00:00'],
    [9, '学业预警通知 · 张晨曦', '系统检测到你在 2025-2026 学年第一学期结束后仍有 6 门必修课程未通过，请尽快联系辅导员并制定重修计划。', ANNOUNCEMENT_CATEGORY.WARNING, TARGET_ROLE.STUDENT, 1, ANNOUNCEMENT_PRIORITY.URGENT, 1, '2026-01-20 10:30:00'],
    [10, '重修课程开放提醒 · 张晨曦', '你名下的《编译原理》等历史未通过课程已在当前学期开放重修选课，请及时确认课表并安排学习进度。', ANNOUNCEMENT_CATEGORY.TEACHING, TARGET_ROLE.STUDENT, 1, ANNOUNCEMENT_PRIORITY.IMPORTANT, 1, '2026-02-25 08:45:00']
  ];

  return list;
}

const CURRENT_ROSTER_MAP = {
  CS3201: [1, 2, 5], CS3202: [1, 2, 3], CS3203: [2, 3, 6], CS3204: [1, 3, 5],
  CS3205: [2, 4, 6], CS3206: [3, 4, 5], CS3207: [1, 2, 4], GE3201: [2, 3, 4, 5, 6],
  MA1101: [2], CS1202: [2], MA2102: [], CS2101: [5], CS2201: [6], CS3101: [1, 3],
  SE3301: [7, 8], AI3301: [9, 10], GE3301: [7, 8, 9, 10],
  MA3302: [7, 8, 9], MA3303: [7, 8, 10], MA3304: [7, 9, 10], MA3305: [8, 9, 10], MA3306: [7, 8, 9, 10],
  GE2301: [1, 2, 7, 8, 9, 10], GE2302: [2, 4, 7, 8, 10], GE2303: [1, 3, 7, 9, 10],
  GE2304: [5, 6, 8, 9, 10], GE2305: [3, 4, 7, 8, 9]
};

const EVALUATION_SEED = [
  ['CS1101', 1, 5, '课程讲解清晰，案例充分，实验安排紧凑。'],
  ['CS2102', 1, 4, '操作系统实验有挑战，但和课堂内容衔接很好。'],
  ['CS2103', 1, 5, '数据库原理与 SQL 实训结合紧密，收获很大。'],
  ['CS2202', 1, 4, '课程项目驱动明显，团队协作训练充分。'],
  ['CS3105', 1, 5, '安全基础内容系统，平时作业与课堂重点一致。'],
  ['CS1101', 2, 5, '老师示例丰富，课后答疑很及时，实验节奏也比较合理。'],
  ['CS2101', 3, 4, '硬件原理比较抽象，但课堂板书和实验指导很到位。'],
  ['CS2201', 2, 4, '网络实验安排合理，抓包练习对理解协议很有帮助。'],
  ['CS2203', 5, 5, '算法题讲评细致，平时训练与考试方向贴合度很高。'],
  ['CS3101', 4, 4, '编译原理难度高，但阶段作业反馈及时，能跟上学习节奏。']
];

function buildAdminRows() {
  return [[1, 1, 'A2026001', '教务处管理员']];
}

function getSemesterCourseCodes(semesterNo) {
  const semester = PROGRAM_PLAN.semesters.find((item) => item.semesterNo === semesterNo);
  return semester ? semester.modules.flatMap((module) => module.courses) : [];
}

function getSectionTeacherId(courseCode, termId) {
  if (termId === CURRENT_TERM_ID && CURRENT_TERM_TEACHER_OVERRIDES[courseCode]) {
    return CURRENT_TERM_TEACHER_OVERRIDES[courseCode];
  }

  return TEACHER_BY_COURSE[courseCode];
}

function buildSections(courseMap) {
  const classroomMap = new Map(CLASSROOMS.map((room) => [room.id, room]));
  const timeSlotIds = buildTimeSlots().map((item) => item[0]);
  const currentTermCourseCodes = Array.from(
    new Set([...getSemesterCourseCodes(6), ...FAILED_COURSE_CODES, ...CURRENT_EXTRA_CODES, ...CURRENT_NON_CS_CODES])
  );
  const termCourseMap = new Map([
    [1, getSemesterCourseCodes(1)],
    [2, getSemesterCourseCodes(2)],
    [3, getSemesterCourseCodes(3)],
    [4, getSemesterCourseCodes(4)],
    [5, getSemesterCourseCodes(5)],
    [CURRENT_TERM_ID, currentTermCourseCodes]
  ]);

  const rows = [];
  const sections = [];
  let sectionId = 1;

  termCourseMap.forEach((courseCodes, termId) => {
    courseCodes.forEach((courseCode, index) => {
      const course = courseMap.get(courseCode);
      const classroom = CLASSROOMS[index % CLASSROOMS.length];
      const capacity = Math.min(classroomMap.get(classroom.id).capacity, 60);
      const sectionCode = `T${pad2(termId)}-${courseCode}-01`;
      const teacherId = getSectionTeacherId(courseCode, termId);

      rows.push([
        sectionId,
        course.id,
        teacherId,
        termId,
        classroom.id,
        timeSlotIds[index % timeSlotIds.length],
        sectionCode,
        '1-16周',
        capacity,
        termId === CURRENT_TERM_ID ? SECTION_STATUS.OPEN : SECTION_STATUS.ARCHIVED,
        40,
        60,
        termId === CURRENT_TERM_ID && FAILED_COURSE_CODES.includes(courseCode) ? '本学期开放重修选课' : null
      ]);

      sections.push({
        id: sectionId,
        sectionId,
        courseCode,
        courseId: course.id,
        teacherId,
        termId,
        usualWeight: 40,
        finalWeight: 60
      });

      sectionId += 1;
    });
  });

  return {
    rows,
    list: sections
  };
}

function historicalRosterForCourse() {
  return [1, 2, 3, 4, 5, 6];
}

function currentRosterForCourse(courseCode) {
  return CURRENT_ROSTER_MAP[courseCode] || [];
}

function buildEnrollments(sectionPayload) {
  const termMap = new Map(TERMS.map((term) => [term.id, term]));
  const rows = [];
  const enrollments = [];
  let enrollmentId = 1;

  sectionPayload.list.forEach((section) => {
    const roster = section.termId === CURRENT_TERM_ID ? currentRosterForCourse(section.courseCode) : historicalRosterForCourse(section.courseCode);
    const term = termMap.get(section.termId);

    roster.forEach((studentId) => {
      rows.push([
        enrollmentId,
        section.sectionId,
        studentId,
        ENROLLMENT_STATUS.SELECTED,
        `${term.selectionStart} 09:${pad2(studentId)}:00`,
        null
      ]);

      enrollments.push({
        id: enrollmentId,
        sectionId: section.sectionId,
        studentId,
        courseCode: section.courseCode,
        termId: section.termId,
        teacherId: section.teacherId,
        usualWeight: section.usualWeight,
        finalWeight: section.finalWeight
      });

      enrollmentId += 1;
    });
  });

  return {
    rows,
    list: enrollments,
    byStudentCourse: new Map(enrollments.map((item) => [`${item.studentId}:${item.courseCode}`, item]))
  };
}

function buildHistoricalScores(courseCode, studentId) {
  if (studentId === 1 && FAILED_COURSE_CODES.includes(courseCode)) {
    return FAILED_SCORE_MAP[courseCode];
  }

  const seed = courseCode.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) + studentId * 7;
  return {
    usual: 75 + (seed % 12),
    final: 74 + (seed % 15)
  };
}

function buildGrades(enrollmentPayload) {
  const rows = [];
  let gradeId = 1;

  enrollmentPayload.list.forEach((enrollment) => {
    if (enrollment.termId === CURRENT_TERM_ID) {
      rows.push([gradeId, enrollment.id, null, null, null, null, null, GRADE_STATUS.PENDING, null]);
      gradeId += 1;
      return;
    }

    const score = buildHistoricalScores(enrollment.courseCode, enrollment.studentId);
    const result = calculateTotalScore(score.usual, score.final, enrollment.usualWeight, enrollment.finalWeight);
    rows.push([
      gradeId,
      enrollment.id,
      score.usual,
      score.final,
      result.totalScore,
      result.gradePoint,
      result.letterGrade,
      GRADE_STATUS.PUBLISHED,
      Number(result.totalScore || 0) >= 60 ? '已完成课程学习。' : '需参加后续重修。'
    ]);
    gradeId += 1;
  });

  return rows;
}

function buildEvaluations(enrollmentPayload) {
  const rows = [];
  let evaluationId = 1;

  EVALUATION_SEED.forEach(([courseCode, studentId, rating, content]) => {
    const enrollment = enrollmentPayload.byStudentCourse.get(`${studentId}:${courseCode}`);

    if (!enrollment) {
      return;
    }

    rows.push([evaluationId, enrollment.id, enrollment.sectionId, studentId, enrollment.teacherId, rating, content]);
    evaluationId += 1;
  });

  return rows;
}

function buildAcademicWarnings() {
  return [[
    1,
    1,
    WARNING_TERM_ID,
    1,
    9,
    FAILED_COURSE_CODES.length,
    '系统检测到该生在 2025-2026 学年第一学期结束后仍有 6 门必修课程未通过，已自动生成学业预警通知。'
  ]];
}

async function seedDatabase(connection) {
  const courseMap = buildCourseMap();
  const planRows = buildPlanRows(courseMap);
  const sectionPayload = buildSections(courseMap);
  const enrollmentPayload = buildEnrollments(sectionPayload);
  const gradeRows = buildGrades(enrollmentPayload);
  const evaluationRows = buildEvaluations(enrollmentPayload);
  const warningRows = buildAcademicWarnings();

  await insertRows(connection, 'terms', ['id', 'name', 'academic_year', 'semester_label', 'start_date', 'end_date', 'selection_start', 'selection_end', 'is_current', 'status'], TERMS.map((term) => [term.id, term.name, term.academicYear, term.semesterLabel, term.startDate, term.endDate, term.selectionStart, term.selectionEnd, term.isCurrent, term.status]));
  await insertRows(connection, 'departments', ['id', 'department_no', 'code', 'name', 'description'], DEPARTMENTS.map((item) => [item.id, item.departmentNo, item.code, item.name, item.description]));
  await insertRows(connection, 'majors', ['id', 'department_id', 'major_code', 'code', 'name', 'description'], MAJORS.map((item) => [item.id, item.departmentId, item.majorCode, item.code, item.name, item.description]));
  await insertRows(connection, 'classes', ['id', 'major_id', 'class_code', 'class_name', 'grade_year', 'counselor_name'], CLASSES.map((item) => [item.id, item.majorId, item.classCode, item.className, item.gradeYear, item.counselorName]));
  await insertRows(connection, 'users', ['id', 'username', 'password_hash', 'role', 'full_name', 'email', 'phone', 'avatar_color', 'status', 'last_login_at'], buildUsers());
  await insertRows(connection, 'students', ['id', 'user_id', 'student_no', 'gender', 'class_id', 'class_serial', 'entry_year', 'admission_term_id', 'birth_date', 'address', 'credits_required'], buildStudentRows());
  await insertRows(
    connection,
    'teachers',
    ['id', 'user_id', 'teacher_no', 'gender', 'birth_date', 'address', 'department_id', 'title', 'office_location', 'specialty_text'],
    buildTeacherRows()
  );
  await insertRows(connection, 'admins', ['id', 'user_id', 'admin_no', 'position'], buildAdminRows());
  await insertRows(connection, 'classrooms', ['id', 'building_name', 'room_number', 'capacity', 'room_type'], CLASSROOMS.map((item) => [item.id, item.buildingName, item.roomNumber, item.capacity, item.roomType]));
  await insertRows(connection, 'time_slots', ['id', 'weekday', 'start_period', 'end_period', 'start_time', 'end_time', 'label'], buildTimeSlots());
  await insertRows(connection, 'courses', ['id', 'department_id', 'major_id', 'course_code', 'course_name', 'course_type', 'credits', 'total_hours', 'assessment_method', 'description'], buildCourseRows());
  await insertRows(connection, 'training_plans', ['id', 'major_id', 'plan_name', 'total_credits'], planRows.plans);
  await insertRows(connection, 'training_plan_modules', ['id', 'training_plan_id', 'semester_no', 'module_name', 'module_type', 'required_credits'], planRows.modules);
  await insertRows(connection, 'training_plan_courses', ['id', 'training_plan_id', 'module_id', 'course_id', 'recommended_semester'], planRows.mappings);
  await insertRows(connection, 'announcements', ['id', 'title', 'content', 'category', 'target_role', 'target_student_id', 'priority', 'published_by', 'published_at'], buildAnnouncements());
  await insertRows(connection, 'course_sections', ['id', 'course_id', 'teacher_id', 'term_id', 'classroom_id', 'time_slot_id', 'section_code', 'weeks_text', 'capacity', 'selection_status', 'usual_weight', 'final_weight', 'notes'], sectionPayload.rows);
  await insertRows(connection, 'enrollments', ['id', 'section_id', 'student_id', 'status', 'selected_at', 'dropped_at'], enrollmentPayload.rows);
  await insertRows(connection, 'grades', ['id', 'enrollment_id', 'usual_score', 'final_exam_score', 'total_score', 'grade_point', 'letter_grade', 'status', 'teacher_comment'], gradeRows);
  await insertRows(connection, 'teaching_evaluations', ['id', 'enrollment_id', 'section_id', 'student_id', 'teacher_id', 'rating', 'content'], evaluationRows);
  await insertRows(connection, 'academic_warnings', ['id', 'student_id', 'term_id', 'issued_by', 'announcement_id', 'required_failed_count', 'content'], warningRows);
}

module.exports = {
  seedDatabase
};

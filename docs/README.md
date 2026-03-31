# 教学管理系统文档总览

## 1. 项目简介

本项目是一个基于 `Node.js + Express + EJS + MySQL 8.0` 实现的教学管理系统，面向学生、教师、管理员三类角色，采用服务端渲染方案，覆盖课程、开课、选课、成绩、评价、培养方案、公告和基础教务数据维护等核心场景。

当前代码已经形成一套可直接演示、可直接初始化数据库、可本地运行的完整系统，而不是单纯的静态页面集合。系统重点体现以下能力：

- 基于角色的 RBAC 权限控制
- 真实教学业务链路建模
- MySQL 约束、外键、索引与数据一致性设计
- 前后端统一的表单、提示、分页、筛选和状态展示
- 三端共用的基础数据和统一的数据库事实来源
- 面向演示账号的完整样例数据与可复现实验环境

## 2. 当前实现状态

截至当前代码版本，系统已经具备以下实现特征：

- 使用 `express-session + express-mysql-session` 持久化登录态
- 使用 `mysql2/promise` 连接池和事务管理数据库写操作
- 使用 `express-ejs-layouts` 统一布局
- 使用 `method-override` 支持 HTML 表单的 `PUT` / `DELETE`
- 使用 `Chart.js` 展示工作台和学习画像图表
- 使用统一的 Flash 提示、确认弹层、空状态、分页组件
- 管理端支持弹窗式编辑表单，并支持违法操作后的即时错误提示
- 培养方案支持模块化展示与学生端思维导图视图
- 种子数据已经覆盖三端演示，包括：
  - 演示管理员 `admin01`
  - 演示教师 `t_chen`
  - 演示学生 `s_2023001`
  - 当前学期开课、成绩、评价、学业预警、培养方案映射
  - 数学与统计学院、通识教育中心的新增真实课程与本学期开课数据

## 3. 技术栈

### 3.1 后端

- Node.js
- Express 4
- express-async-errors
- mysql2
- bcryptjs
- express-session
- express-mysql-session
- method-override
- dotenv

### 3.2 前端

- EJS 模板
- Bootstrap 5 CDN
- 原生 JavaScript
- Iconify 图标
- Chart.js 图表
- 自定义 CSS 设计系统

### 3.3 数据库

- MySQL 8.0
- UTF-8 / `utf8mb4`
- 显式外键、检查约束、唯一约束、辅助索引
- 默认禁止级联删除，核心关系以 `RESTRICT` 为主

## 4. 系统角色与功能概览

### 4.1 学生端

学生端当前包含以下页面和能力：

- 登录、退出登录
- 个人资料查看与修改
- 密码修改
- 公告中心与公告详情
- 在线选课
- 我的课程
- 我的课表
- 全校课表查询
- 开课详情查看
- 我的培养方案
- 成绩查询
- 学习画像
- 教学评价提交与修改

学生端的几个关键业务规则：

- 只能选择当前学期且处于“开放选课”状态的开课
- 选课前检查容量、时间冲突、当前学期有效性
- 已通过课程不会作为新的“未通过”课程继续计入培养方案预警
- 退课仅允许针对当前学期且尚未形成已发布及格成绩的课程
- 教学评价仅允许在课程成绩已发布后，或课程已成为历史学期后提交
- 培养方案中的推荐课程基于“当前应修学期 + 历史未通过课程”生成

### 4.2 教师端

教师端当前包含以下页面和能力：

- 登录、退出登录
- 个人资料查看与修改
- 教学任务列表
- 单门课程成绩册
- 平时分 / 期末分占比设置
- 成绩录入与自动计算
- 成绩发布
- 评价反馈查看
- 教师课表

教师端的关键特征：

- 成绩支持 AJAX 保存，保存后自动回填总评和绩点
- 成绩占比修改后会立即重算该开课下全部学生总评
- 发布成绩时只发布已有总评的记录
- 发布按钮不再依赖“先触发前端报错提示”才能使用，而是直接按当前数据状态执行
- 成绩、占比和已发布状态都以数据库为唯一事实来源

### 4.3 管理员端

管理员端当前包含以下页面和能力：

- 账号管理
- 学生管理
- 学生学业详情
- 学业预警发送
- 教师管理
- 课程管理
- 开课管理
- 学期管理
- 教室管理
- 基础信息管理
  - 院系
  - 专业
  - 班级
- 培养方案管理
  - 培养方案
  - 模块
  - 课程映射
- 公告发布
- 教学评价查看
- 选课数据查看

管理员端的实现重点：

- 新增、编辑大量使用统一的弹窗编辑器
- 违法操作统一通过 Flash 提示反馈
- XHR 弹窗提交时，服务端返回 `X-Redirect-To`，保证错误提示不会被隐藏请求提前消费
- 开课维护时会检查教师与教室在同学期同时间段的占用冲突
- 删除前先做依赖检查，避免删除异常
- 培养方案课程映射禁止重复课程进入同一培养方案
- 编号预览接口支持学号、工号、课程号、开课编号的即时生成预览

## 5. 运行方式

### 5.1 安装依赖

```bash
npm install
```

### 5.2 初始化数据库

```bash
npm run init-db
```

该命令会执行以下步骤：

1. 读取 `sql/database.sql` 创建数据库
2. 读取 `sql/schema.sql` 创建表、索引、约束
3. 调用 `scripts/seed-db.js` 写入演示数据

注意：

- `sql/seed.sql` 目前只保留说明，真实种子数据统一维护在 `scripts/seed-db.js`
- 这是为了确保示例数据始终与最新 schema 和业务规则同步

### 5.3 启动项目

```bash
npm start
```

开发模式：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

## 6. 默认演示账号

- 管理员：`admin01` / `admin123`
- 教师：`t_chen` / `teacher123`
- 学生：`s_2023001` / `student123`

除上述账号外，种子数据还包含多位教师和学生，用于支撑：

- 课程冲突判断
- 教师课表与学生课表
- 培养方案完成度
- 学业预警
- 教学评价
- 非计算机学院课程演示

## 7. 环境变量

项目支持 `.env`、本地 MySQL 参数，以及 Railway /托管环境常见变量名。

### 7.1 `.env.example`

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=teaching_management
DB_USER=root
DB_PASSWORD=123456
DB_SSL=false
PORT=3000
SESSION_SECRET=teaching_management_secret
NODE_ENV=development
```

### 7.2 兼容变量

`config/env.js` 同时兼容以下来源：

- `DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME`
- `MYSQLHOST / MYSQLPORT / MYSQLUSER / MYSQLPASSWORD / MYSQLDATABASE`
- `DATABASE_URL`
- `MYSQL_URL`

## 8. 数据库设计要点

当前系统的数据库设计遵循以下原则：

- 所有主实体均有独立主键
- 关键业务关系均使用外键维护
- 默认禁止级联删除
- 常用检索字段建立索引
- 枚举字段统一限制合法状态
- 成绩、开课、培养方案等关键业务采用唯一约束防止重复数据

核心表包括：

- `terms`
- `departments`
- `majors`
- `classes`
- `users`
- `students`
- `teachers`
- `admins`
- `classrooms`
- `time_slots`
- `courses`
- `training_plans`
- `training_plan_modules`
- `training_plan_courses`
- `announcements`
- `course_sections`
- `enrollments`
- `grades`
- `teaching_evaluations`
- `academic_warnings`

其中几个特别重要的完整性设计：

- `courses (major_id, department_id)` 通过组合外键保证课程所属专业与院系一致
- `training_plan_courses` 同时约束：
  - 培养方案内课程唯一
  - 模块内课程唯一
  - 推荐学期必须在 1 到 8 之间
- `course_sections` 用唯一键防止：
  - 同一学期教师同时间重复占用
  - 同一学期教室同时间重复占用
- `grades` 对分数范围与绩点范围设置检查约束
- `teaching_evaluations` 通过组合外键确保评价上下文与选课记录一致

## 9. 当前前端交互特征

系统并非简单表单堆叠，而是已经形成统一前端交互层：

- 统一确认弹层
- 统一加载按钮状态
- 成功提交后的按钮状态回放
- 分页与滚动位置恢复
- Flash 提示自动消退
- 自定义可搜索筛选下拉
- 管理端弹窗编辑器
- 学生端培养方案模块详情弹窗
- 学生端教学评价弹窗
- Chart.js 图表初始化
- 动态编号预览

这些交互逻辑主要集中在：

- `public/js/app.js`
- `public/css/app.css`
- `views/layout.ejs`

## 10. 项目目录说明

```text
.
├─ app.js                        # Express 应用入口
├─ config/
│  ├─ env.js                     # 环境变量解析与兼容逻辑
│  ├─ database.js                # MySQL 连接池与事务封装
│  └─ session.js                 # Session 持久化配置
├─ middlewares/
│  ├─ auth.js                    # requireAuth / requireRoles
│  ├─ flash.js                   # Flash 提示写入与消费
│  └─ locals.js                  # EJS 全局变量、导航、格式化函数
├─ public/
│  ├─ css/app.css                # 全局设计系统与页面样式
│  ├─ js/app.js                  # 全局前端交互
│  ├─ images/                    # 登录页与静态资源图片
│  └─ favicon.svg                # 站点图标
├─ routes/
│  ├─ auth.js                    # 登录、登出
│  ├─ dashboard.js               # 工作台
│  ├─ profile.js                 # 个人资料与密码
│  ├─ announcements.js           # 公告中心
│  ├─ student.js                 # 学生业务
│  ├─ teacher.js                 # 教师业务
│  └─ admin.js                   # 管理端业务
├─ services/
│  ├─ dashboardService.js        # 三类角色工作台统计
│  ├─ userService.js             # 会话用户装配
│  ├─ referenceService.js        # 基础下拉数据读取
│  ├─ gradeService.js            # 成绩重算
│  └─ programPlanService.js      # 培养方案聚合与学分同步
├─ utils/
│  ├─ system.js                  # 枚举与标签
│  ├─ auth.js                    # 默认密码与角色色
│  ├─ format.js                  # 数值格式化
│  ├─ identity.js                # 学号/工号/课程号/开课编号生成
│  ├─ pagination.js              # 分页工具
│  ├─ schedule.js                # 课表网格构建
│  └─ score.js                   # 成绩与绩点计算
├─ sql/
│  ├─ database.sql               # 数据库创建
│  ├─ schema.sql                 # 全部表结构与约束
│  └─ seed.sql                   # 种子说明占位文件
├─ scripts/
│  ├─ init-db.js                 # 初始化入口脚本
│  └─ seed-db.js                 # 示例数据写入脚本
├─ views/
│  ├─ layout.ejs                 # 主布局
│  ├─ auth-layout.ejs            # 登录布局
│  ├─ partials/                  # 公共局部模板
│  └─ pages/                     # 三端页面模板
├─ docs/
│  ├─ README.md
│  ├─ 系统设计说明.md
│  ├─ 数据库设计与ER说明.md
│  ├─ 本地运行指南.md
│  ├─ 总体要求.md
│  └─ 前端设计要求.md
├─ package.json
├─ package-lock.json
└─ nixpacks.toml                 # Nixpacks / 部署启动配置
```

## 11. 与当前代码强相关的实现说明

以下几点是本仓库当前版本中最容易和旧文档不一致的地方：

- 管理端很多编辑表单是通过弹窗异步载入，不是整页跳转
- 管理端 XHR 提交后的重定向由 `X-Redirect-To` 协议头完成，目的是保留 Flash 提示
- 培养方案不仅有管理端维护页面，也有学生端的进度地图与模块详情弹窗
- 学习画像已经是独立页面，不再只是工作台的一部分
- 全校课表查询是学生端正式功能
- 演示数据不只包含计算机学院，还扩展了数学与统计学院、通识教育中心本学期课程
- 数据库初始化逻辑以 `scripts/seed-db.js` 为准，不再依赖手写静态插入 SQL

## 12. 推荐阅读顺序

如果你第一次接手这个项目，建议按以下顺序阅读：

1. [本地运行指南](./本地运行指南.md)
2. [系统设计说明](./系统设计说明.md)
3. [数据库设计与ER说明](./数据库设计与ER说明.md)
4. [总体要求](./总体要求.md)
5. [前端设计要求](./前端设计要求.md)

## 13. 适用场景

本项目适合以下用途：

- 数据库课程设计展示
- Web 课程设计展示
- 教学管理系统原型演示
- Express + EJS + MySQL 分层项目参考
- 教务类系统的业务建模与页面交互参考

如果后续继续扩展，推荐优先方向包括：

- 更细粒度的审计日志
- 更完整的班级/专业/培养方案多版本管理
- 更强的 API 化能力
- 自动化测试和 CI
- 角色权限的菜单与操作点位进一步细分

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS training_plan_courses;
DROP TABLE IF EXISTS training_plan_modules;
DROP TABLE IF EXISTS training_plans;
DROP TABLE IF EXISTS academic_warnings;
DROP TABLE IF EXISTS teaching_evaluations;
DROP TABLE IF EXISTS grades;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS course_sections;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS time_slots;
DROP TABLE IF EXISTS classrooms;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS majors;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS terms;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS terms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  academic_year VARCHAR(20) NOT NULL,
  semester_label VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  selection_start DATE NOT NULL,
  selection_end DATE NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('规划中', '进行中', '已归档') NOT NULL DEFAULT '进行中',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_terms_year_label (academic_year, semester_label),
  KEY idx_terms_current_start (is_current, start_date),
  CONSTRAINT chk_terms_date_order CHECK (start_date <= end_date),
  CONSTRAINT chk_terms_selection_order CHECK (selection_start <= selection_end),
  CONSTRAINT chk_terms_selection_range CHECK (selection_start <= end_date AND selection_end >= start_date)
);

CREATE TABLE IF NOT EXISTS departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  department_no CHAR(2) NOT NULL UNIQUE,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS majors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  department_id INT NOT NULL,
  major_code CHAR(2) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_majors_department_code (department_id, major_code),
  KEY idx_majors_department_name (department_id, name),
  KEY idx_majors_id_department (id, department_id),
  CONSTRAINT fk_majors_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS classes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  major_id INT NOT NULL,
  class_code CHAR(2) NOT NULL,
  class_name VARCHAR(80) NOT NULL,
  grade_year INT NOT NULL,
  counselor_name VARCHAR(80) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_classes_name (major_id, grade_year, class_name),
  UNIQUE KEY uk_classes_code (grade_year, class_code),
  KEY idx_classes_major_grade (major_id, grade_year),
  CONSTRAINT fk_classes_major
    FOREIGN KEY (major_id) REFERENCES majors (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'teacher', 'admin') NOT NULL,
  full_name VARCHAR(80) NOT NULL,
  email VARCHAR(100) NULL,
  phone VARCHAR(20) NULL,
  status ENUM('启用', '停用') NOT NULL DEFAULT '启用',
  avatar_color VARCHAR(20) NOT NULL DEFAULT '#146356',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_users_role_status (role, status),
  KEY idx_users_full_name (full_name)
);

CREATE TABLE IF NOT EXISTS students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  student_no CHAR(8) NOT NULL UNIQUE,
  gender ENUM('男', '女', '其他') NULL DEFAULT NULL,
  class_id INT NOT NULL,
  class_serial CHAR(2) NOT NULL,
  entry_year INT NOT NULL,
  admission_term_id INT NULL,
  birth_date DATE NULL,
  address VARCHAR(255) NULL,
  credits_required DECIMAL(5, 1) NOT NULL DEFAULT 150.0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_students_class_entry (class_id, entry_year),
  KEY idx_students_class_serial (class_id, class_serial),
  KEY idx_students_admission_term (admission_term_id),
  CONSTRAINT fk_students_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_students_class
    FOREIGN KEY (class_id) REFERENCES classes (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_students_admission_term
    FOREIGN KEY (admission_term_id) REFERENCES terms (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  teacher_no VARCHAR(20) NOT NULL UNIQUE,
  gender ENUM('男', '女', '其他') NULL DEFAULT NULL,
  birth_date DATE NULL,
  address VARCHAR(255) NULL,
  department_id INT NOT NULL,
  title VARCHAR(40) NULL,
  office_location VARCHAR(80) NULL,
  specialty_text VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_teachers_department (department_id),
  CONSTRAINT fk_teachers_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_teachers_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  admin_no VARCHAR(20) NOT NULL UNIQUE,
  position VARCHAR(80) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_admins_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS classrooms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  building_name VARCHAR(80) NOT NULL,
  room_number VARCHAR(20) NOT NULL,
  capacity INT NOT NULL,
  room_type VARCHAR(40) NOT NULL DEFAULT '标准教室',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_classrooms_room (building_name, room_number),
  CONSTRAINT chk_classrooms_capacity CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS time_slots (
  id INT PRIMARY KEY AUTO_INCREMENT,
  weekday TINYINT NOT NULL,
  start_period TINYINT NOT NULL,
  end_period TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  label VARCHAR(50) NOT NULL,
  UNIQUE KEY uk_time_slots (weekday, start_period, end_period),
  CONSTRAINT chk_time_slots_range CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_period_range CHECK (start_period BETWEEN 1 AND 12 AND end_period BETWEEN 1 AND 12),
  CONSTRAINT chk_period_order CHECK (start_period <= end_period)
);

CREATE TABLE IF NOT EXISTS courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  department_id INT NOT NULL,
  major_id INT NOT NULL,
  course_code VARCHAR(20) NOT NULL UNIQUE,
  course_name VARCHAR(100) NOT NULL,
  course_type ENUM('必修', '选修') NOT NULL DEFAULT '必修',
  credits DECIMAL(3, 1) NOT NULL,
  total_hours INT NOT NULL,
  assessment_method VARCHAR(40) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_courses_department_major (department_id, major_id),
  KEY idx_courses_major_department (major_id, department_id),
  KEY idx_courses_type (course_type),
  KEY idx_courses_name (course_name),
  CONSTRAINT fk_courses_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_courses_major
    FOREIGN KEY (major_id) REFERENCES majors (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_courses_major_department
    FOREIGN KEY (major_id, department_id) REFERENCES majors (id, department_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_courses_credits CHECK (credits > 0),
  CONSTRAINT chk_courses_hours CHECK (total_hours > 0)
);

CREATE TABLE IF NOT EXISTS training_plans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  major_id INT NOT NULL UNIQUE,
  plan_name VARCHAR(120) NOT NULL,
  total_credits DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_training_plans_major
    FOREIGN KEY (major_id) REFERENCES majors (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_training_plans_total_credits CHECK (total_credits >= 0)
);

CREATE TABLE IF NOT EXISTS training_plan_modules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  training_plan_id INT NOT NULL,
  semester_no TINYINT NOT NULL,
  module_name VARCHAR(100) NOT NULL,
  module_type VARCHAR(40) NOT NULL,
  required_credits DECIMAL(5, 1) NOT NULL DEFAULT 0.0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_training_plan_module_name (training_plan_id, semester_no, module_name),
  KEY idx_training_plan_modules_plan_semester (training_plan_id, semester_no, id),
  KEY idx_training_plan_modules_id_plan (id, training_plan_id),
  CONSTRAINT fk_training_plan_modules_plan
    FOREIGN KEY (training_plan_id) REFERENCES training_plans (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_training_plan_modules_semester CHECK (semester_no BETWEEN 1 AND 8),
  CONSTRAINT chk_training_plan_modules_credits CHECK (required_credits >= 0)
);

CREATE TABLE IF NOT EXISTS training_plan_courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  training_plan_id INT NOT NULL,
  module_id INT NOT NULL,
  course_id INT NOT NULL,
  recommended_semester TINYINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_training_plan_course (training_plan_id, course_id),
  UNIQUE KEY uk_training_plan_module_course (module_id, course_id),
  KEY idx_training_plan_courses_semester (training_plan_id, recommended_semester),
  KEY idx_training_plan_courses_module_plan (module_id, training_plan_id),
  CONSTRAINT fk_training_plan_courses_plan
    FOREIGN KEY (training_plan_id) REFERENCES training_plans (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_training_plan_courses_module_plan
    FOREIGN KEY (module_id, training_plan_id) REFERENCES training_plan_modules (id, training_plan_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_training_plan_courses_course
    FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_training_plan_courses_semester CHECK (recommended_semester BETWEEN 1 AND 8)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  category ENUM('系统公告', '学业预警', '教学通知') NOT NULL DEFAULT '系统公告',
  target_role ENUM('all', 'student', 'teacher', 'admin') NOT NULL DEFAULT 'all',
  target_student_id INT NULL,
  priority ENUM('普通', '重要', '紧急') NOT NULL DEFAULT '普通',
  published_by INT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_announcements_target (target_role, priority),
  KEY idx_announcements_student (target_student_id),
  KEY idx_announcements_published (published_at),
  CONSTRAINT fk_announcements_user
    FOREIGN KEY (published_by) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_announcements_student
    FOREIGN KEY (target_student_id) REFERENCES students (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS course_sections (
  id INT PRIMARY KEY AUTO_INCREMENT,
  course_id INT NOT NULL,
  teacher_id INT NOT NULL,
  term_id INT NOT NULL,
  classroom_id INT NOT NULL,
  time_slot_id INT NOT NULL,
  section_code VARCHAR(30) NOT NULL UNIQUE,
  weeks_text VARCHAR(40) NOT NULL DEFAULT '1-16周',
  capacity INT NOT NULL,
  selection_status ENUM('开放选课', '暂停选课', '已归档') NOT NULL DEFAULT '开放选课',
  usual_weight DECIMAL(5, 2) NOT NULL DEFAULT 40.00,
  final_weight DECIMAL(5, 2) NOT NULL DEFAULT 60.00,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sections_term_status (term_id, selection_status),
  KEY idx_sections_course_term (course_id, term_id),
  KEY idx_sections_teacher_term (teacher_id, term_id),
  KEY idx_sections_id_teacher (id, teacher_id),
  UNIQUE KEY uk_sections_teacher_slot (term_id, teacher_id, time_slot_id),
  UNIQUE KEY uk_sections_classroom_slot (term_id, classroom_id, time_slot_id),
  CONSTRAINT fk_sections_course
    FOREIGN KEY (course_id) REFERENCES courses (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_sections_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_sections_term
    FOREIGN KEY (term_id) REFERENCES terms (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_sections_classroom
    FOREIGN KEY (classroom_id) REFERENCES classrooms (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_sections_time_slot
    FOREIGN KEY (time_slot_id) REFERENCES time_slots (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_sections_capacity CHECK (capacity > 0),
  CONSTRAINT chk_sections_weight_range CHECK (
    usual_weight >= 0 AND usual_weight <= 100 AND final_weight >= 0 AND final_weight <= 100
  ),
  CONSTRAINT chk_sections_weight_sum CHECK (ROUND(usual_weight + final_weight, 2) = 100.00)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  section_id INT NOT NULL,
  student_id INT NOT NULL,
  status ENUM('已选', '已退课') NOT NULL DEFAULT '已选',
  selected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dropped_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_enrollment_section_student (section_id, student_id),
  KEY idx_enrollments_student_status (student_id, status),
  KEY idx_enrollments_section_status (section_id, status),
  KEY idx_enrollments_id_section_student (id, section_id, student_id),
  CONSTRAINT fk_enrollments_section
    FOREIGN KEY (section_id) REFERENCES course_sections (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_enrollments_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS grades (
  id INT PRIMARY KEY AUTO_INCREMENT,
  enrollment_id INT NOT NULL UNIQUE,
  usual_score DECIMAL(5, 2) NULL,
  final_exam_score DECIMAL(5, 2) NULL,
  total_score DECIMAL(5, 2) NULL,
  grade_point DECIMAL(3, 1) NULL,
  letter_grade VARCHAR(2) NULL,
  status ENUM('待录入', '已发布') NOT NULL DEFAULT '待录入',
  teacher_comment VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_grades_status_total (status, total_score),
  CONSTRAINT fk_grades_enrollment
    FOREIGN KEY (enrollment_id) REFERENCES enrollments (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_grades_usual_score CHECK (usual_score IS NULL OR (usual_score >= 0 AND usual_score <= 100)),
  CONSTRAINT chk_grades_final_score CHECK (
    final_exam_score IS NULL OR (final_exam_score >= 0 AND final_exam_score <= 100)
  ),
  CONSTRAINT chk_grades_total_score CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= 100)),
  CONSTRAINT chk_grades_grade_point CHECK (grade_point IS NULL OR (grade_point >= 0 AND grade_point <= 4))
);

CREATE TABLE IF NOT EXISTS teaching_evaluations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  enrollment_id INT NOT NULL UNIQUE,
  section_id INT NOT NULL,
  student_id INT NOT NULL,
  teacher_id INT NOT NULL,
  rating TINYINT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_evaluations_teacher (teacher_id, created_at),
  KEY idx_evaluations_section (section_id, created_at),
  KEY idx_evaluations_student (student_id, created_at),
  KEY idx_evaluations_enrollment_context (enrollment_id, section_id, student_id),
  KEY idx_evaluations_section_teacher (section_id, teacher_id),
  CONSTRAINT chk_evaluations_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_evaluations_enrollment
    FOREIGN KEY (enrollment_id) REFERENCES enrollments (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_evaluations_section
    FOREIGN KEY (section_id) REFERENCES course_sections (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_evaluations_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_evaluations_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_evaluations_enrollment_context
    FOREIGN KEY (enrollment_id, section_id, student_id) REFERENCES enrollments (id, section_id, student_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_evaluations_section_teacher
    FOREIGN KEY (section_id, teacher_id) REFERENCES course_sections (id, teacher_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS academic_warnings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  term_id INT NOT NULL,
  issued_by INT NOT NULL,
  announcement_id INT NULL,
  required_failed_count INT NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_warning_student_term (student_id, term_id),
  KEY idx_warnings_student_created (student_id, created_at),
  CONSTRAINT fk_warnings_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_warnings_term
    FOREIGN KEY (term_id) REFERENCES terms (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_warnings_admin
    FOREIGN KEY (issued_by) REFERENCES admins (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_warnings_announcement
    FOREIGN KEY (announcement_id) REFERENCES announcements (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_warnings_failed_count CHECK (required_failed_count >= 0)
);

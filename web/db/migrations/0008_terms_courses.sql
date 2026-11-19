-- 0008 学期、课程与终结性评语
-- 学期定义起止日期（成长报告按学期切分时间窗口）；课程属于某个学期，并关联若干班级（班级沿用 profiles.class）。
-- 教师对学生的终结性评语按“学生 × 课程”保存，只存文字，不作分数、不进入任何计分。
create table if not exists terms (
  id text primary key default (lower(hex(randomblob(8)))),
  name text not null unique,                 -- 如“2026–2027 学年第一学期”
  start_date text not null,                  -- YYYY-MM-DD（北京时间）
  end_date text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists courses (
  id text primary key default (lower(hex(randomblob(8)))),
  term_id text not null references terms(id) on delete cascade,
  name text not null,                        -- 如“创新创业基础”
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (term_id, name)
);

create table if not exists course_classes (
  course_id text not null references courses(id) on delete cascade,
  class text not null,
  primary key (course_id, class)
);
create index if not exists idx_course_classes_class on course_classes(class);

create table if not exists student_comments (
  user_id text not null references users(id) on delete cascade,
  course_id text not null references courses(id) on delete cascade,
  comment text not null default '',
  author_id text references users(id) on delete set null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, course_id)
);

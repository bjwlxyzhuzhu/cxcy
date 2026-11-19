-- 0006 班级与授课教师关联：学生按 profiles.class 归班，教师按本表认领班级。
-- 教师在工作台、授课大屏只看到自己班级的学生项目；未认领任何班级的教师看全部（兼容旧数据）。
create table if not exists class_teachers (
  class text not null,                                         -- 班级名称（与 profiles.class 一致）
  teacher_id text not null references users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (class, teacher_id)
);
create index if not exists idx_class_teachers_teacher on class_teachers(teacher_id);
create index if not exists idx_profiles_class on profiles(class);

-- 0007 授课记录：教师在授课工作台“开始上课”生成一条记录，课上按教学环节打点（导入 / 讲解 / AI 工具使用 / 对局 / 思政 / 总结）。
-- 打点时间轴用于课堂实录视频的进度条与教案对应、参赛材料里的“课堂实录”栏；只记时间与环节，不记学生个人信息。
create table if not exists lesson_sessions (
  id text primary key default (lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))),
  teacher_id text not null references users(id) on delete cascade,
  class text not null default '',                 -- 授课班级（空 = 未指定）
  unit_no integer not null default 1,             -- 课程单元 1–8（lib/course.ts）
  match_id text references arena_matches(id) on delete set null, -- 本节课使用的虚实对局
  marks jsontext not null default '[]',           -- [{ key, label, at }]
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at text
);
create index if not exists idx_lessons_teacher on lesson_sessions(teacher_id, started_at desc);

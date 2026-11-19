// 命令行批量导入名册并建号（与管理端「名册导入」同一套规则：账号=学号，每人随机临时密码）。
// 用法：node --env-file-if-exists=.env.local scripts/import120.mjs <名册.csv> [积分=120]
// 名册列：学号,姓名,班级,学院,专业（首行为表头，UTF-8）
// 输出：凭据表写到 data/账号凭据_<时间>.csv（data/ 不提交），只按个人逐一发放，不要发群里。
import fs from "node:fs";
import path from "node:path";
import { openDatabase, migrate } from "../db/migrate.mjs";
import { hashPassword, makeTempPassword } from "../db/password.mjs";

const [csvPath, creditsArg] = process.argv.slice(2);
if (!csvPath) { console.error("用法：node --env-file-if-exists=.env.local scripts/import120.mjs <名册.csv> [积分]"); process.exit(1); }
const credits = Number.isFinite(Number(creditsArg)) ? Math.max(0, Math.floor(Number(creditsArg))) : 120;

const lines = fs.readFileSync(csvPath, "utf8").replace(/^\ufeff/, "").trim().split(/\r?\n/);
const rows = lines.slice(1).map((l) => {
  const [student_no, name, klass, college, major] = l.split(",").map((x) => (x || "").trim());
  return { student_no, name, class: klass, college, major };
}).filter((r) => r.student_no);

const db = openDatabase();
migrate(db);
const find = db.prepare("select id from users where account = ?");
const out = [];
let created = 0, exists = 0;
db.exec("begin immediate");
try {
  for (const r of rows) {
    const pwd = makeTempPassword();
    let id = find.get(r.student_no)?.id;
    if (id) {
      db.prepare("update users set password_hash = ?, session_version = session_version + 1 where id = ?").run(hashPassword(pwd), id);
      exists++;
    } else {
      id = db.prepare("insert into users (account, password_hash) values (?, ?) returning id").get(r.student_no, hashPassword(pwd)).id;
      db.prepare("insert into profiles (id) values (?)").run(id);
      created++;
    }
    db.prepare("update profiles set student_no = ?, name = ?, class = ?, college = ?, major = ?, role = 'student', credits = ? where id = ?")
      .run(r.student_no, r.name || r.student_no, r.class || null, r.college || null, r.major || null, credits, id);
    db.prepare(
      "insert into rosters (class, student_no, name, college, major) values (?, ?, ?, ?, ?) on conflict (class, student_no) do update set name = excluded.name, college = excluded.college, major = excluded.major"
    ).run(r.class || "", r.student_no, r.name || r.student_no, r.college || null, r.major || null);
    out.push(`${r.student_no},${pwd}`);
  }
  db.exec("commit");
} catch (e) {
  db.exec("rollback");
  console.error("导入失败，已全部回滚：" + (e?.message || e));
  process.exit(1);
}
db.close();

const dir = path.resolve("data");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `账号凭据_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
fs.writeFileSync(file, "\ufeff账号,临时密码\n" + out.join("\n") + "\n");
console.log(`新建 ${created}，已存在并重置密码 ${exists}；凭据表：${file}`);

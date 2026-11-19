// 建号 / 重置密码（命令行，不经网页）。首个教师账号用它创建。
// 用法：
//   node --env-file-if-exists=.env.local scripts/create-user.mjs <账号> <密码> [teacher|admin|student] [显示名]
// 账号已存在时：重置密码（旧会话失效），并把角色改成指定角色。
import { openDatabase, migrate } from "../db/migrate.mjs";
import { hashPassword } from "../db/password.mjs";

const [account, password, role = "teacher", name] = process.argv.slice(2);
if (!account || !password) {
  console.error("用法：node --env-file-if-exists=.env.local scripts/create-user.mjs <账号> <密码> [teacher|admin|student] [显示名]");
  process.exit(1);
}
if (password.length < 6) { console.error("密码至少 6 位"); process.exit(1); }
if (!["teacher", "admin", "student"].includes(role)) { console.error("角色只能是 teacher / admin / student"); process.exit(1); }

const db = openDatabase();
migrate(db);
const found = db.prepare("select id from users where account = ?").get(account);
db.exec("begin immediate");
try {
  if (found) {
    db.prepare("update users set password_hash = ?, session_version = session_version + 1 where id = ?").run(hashPassword(password), found.id);
    db.prepare("update profiles set role = ? where id = ?").run(role, found.id);
    console.log(`已重置账号 ${account} 的密码，角色：${role}`);
  } else {
    const r = db.prepare("insert into users (account, password_hash) values (?, ?) returning id").get(account, hashPassword(password));
    db.prepare("insert into profiles (id, name, student_no, role) values (?, ?, ?, ?)")
      .run(r.id, name || account, role === "student" ? account : null, role);
    console.log(`已创建账号 ${account}，角色：${role}`);
  }
  db.exec("commit");
} catch (e) {
  db.exec("rollback");
  console.error("失败：" + (e?.message || e));
  process.exit(1);
}
db.close();

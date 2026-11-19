// 创建本机演示账号（管理员 + 1 名学生），密码随机生成并只在终端打印一次。
// 用法：node --env-file-if-exists=.env.local scripts/seed.mjs
// 可重复运行：账号已存在时重置为新的随机密码。
import { openDatabase, migrate } from "../db/migrate.mjs";
import { hashPassword, makeTempPassword } from "../db/password.mjs";

const db = openDatabase();
migrate(db);

function ensure(account, name, role, credits) {
  const pwd = makeTempPassword();
  const found = db.prepare("select id from users where account = ?").get(account);
  let id = found?.id;
  if (id) {
    db.prepare("update users set password_hash = ?, session_version = session_version + 1 where id = ?").run(hashPassword(pwd), id);
  } else {
    id = db.prepare("insert into users (account, password_hash) values (?, ?) returning id").get(account, hashPassword(pwd)).id;
    db.prepare("insert into profiles (id) values (?)").run(id);
  }
  db.prepare("update profiles set student_no = ?, name = ?, role = ?, credits = ? where id = ?")
    .run(role === "student" ? account : null, name, role, credits, id);
  console.log(`✓ ${role.padEnd(7)} 账号:${account}  密码:${pwd}`);
}

console.log("== 创建演示账号 ==");
ensure("admin", "课程管理员", "admin", 9999);
ensure("demo001", "演示学生", "student", 120);
console.log("== 完成。登录页用「账号 + 密码」登录 ==");
db.close();

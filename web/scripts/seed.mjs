import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("缺少 DATABASE_URL。请先在环境变量或 Portainer Stack 中配置 PostgreSQL 连接串。");
  process.exit(1);
}
const pool = new Pool({ connectionString: databaseUrl });

async function ensureUser({ studentNo, name, role, password, credits }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO public.users (student_no, password_hash, name, role)
       VALUES ($1, $2, $3, $4::public.user_role)
       ON CONFLICT (student_no) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name, role = EXCLUDED.role RETURNING id`,
      [studentNo, passwordHash, name, role],
    );
    const userId = result.rows[0].id;
    await client.query(
      `INSERT INTO public.profiles (id, student_no, name, role, credits)
       VALUES ($1, $2, $3, $4::public.user_role, $5)
       ON CONFLICT (id) DO UPDATE SET student_no = EXCLUDED.student_no,
         name = EXCLUDED.name, role = EXCLUDED.role, credits = EXCLUDED.credits`,
      [userId, studentNo, name, role, credits],
    );
    await client.query("DELETE FROM public.sessions WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    console.log(`✓ ${role.padEnd(7)} 学号:${studentNo}  密码:${password}  (${name})`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  console.log("== 创建演示账号（本地 PostgreSQL） ==");
  await ensureUser({ studentNo: "admin", name: "课程管理员", role: "admin", password: "Admin@2026", credits: 9999 });
  await ensureUser({ studentNo: "202596057038", name: "演示学生", role: "student", password: "Student@2026", credits: 120 });
  console.log("== 完成。登录页使用学号 + 密码登录 ==");
} finally {
  await pool.end();
}

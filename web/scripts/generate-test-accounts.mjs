import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$%";
const pass = () => Array.from(randomBytes(12), b => alphabet[b % alphabet.length]).join("");
const rows = Array.from({length:120}, (_,i) => ({ account: `TEST${String(i+1).padStart(3,"0")}`, password: pass() }));
const csv = "账号,临时密码,用途\n" + rows.map(r => `${r.account},${r.password},测试账号（不能作为真实学生样本）`).join("\n");
writeFileSync(new URL("../测试账号凭据_120个.csv", import.meta.url), "\ufeff" + csv);
console.log("已生成 120 个测试账号凭据");

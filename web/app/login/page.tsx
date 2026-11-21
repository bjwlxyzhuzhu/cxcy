import { redirect } from "next/navigation";

/** 旧登录地址：统一到首页的登录 */
export default function LoginPage() {
  redirect("/");
}

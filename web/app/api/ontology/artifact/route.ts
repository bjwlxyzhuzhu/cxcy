import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync, projectRole } from "@/lib/ontology/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 预览 / 下载项目成果（路演页、项目档案）：?id=…&download=1（项目成员或教师可看） */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const c = sqlite();
  const a = c.prepare("select project_id, kind, title, html from project_artifacts where id = ?").get(url.searchParams.get("id") || "") as
    { project_id: string; kind: string; title: string; html: string } | undefined;
  if (!a) return Response.json({ error: "成果不存在" }, { status: 404 });
  if (!projectRole(c, user.id, a.project_id) && !isTeacherSync(c, user.id)) return Response.json({ error: "无权查看" }, { status: 403 });
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    // 自包含页面：禁止加载任何外部资源
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
  };
  if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(a.title)}.html`;
  return new Response(a.html, { headers });
}

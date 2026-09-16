/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { getParticipant, joinRun, makeCode, requireTeacher, recordEvent, nowStage, CASE_TEXT, EXPERT_ROLES } from "@/lib/experiment";
import { query } from "@/lib/db";
import { cookies } from "next/headers";
import { EXP_COOKIE } from "@/lib/experiment";
export const runtime = "nodejs";
export async function GET() { const p=await getParticipant(); if(!p) return NextResponse.json({participant:null}); const events=(await query("select event_type,stage,payload,created_at from experiment_events where participant_id=$1 order by created_at",[p.id])).rows; return NextResponse.json({participant:p,stage:nowStage(p),caseText:CASE_TEXT,expertRoles:EXPERT_ROLES,events}); }
export async function POST(req:Request) {
  let b:Record<string,any>; try { b=await req.json(); } catch { return NextResponse.json({error:"请求格式错误"},{status:400}); }
  try {
    if(b.action === "join") return NextResponse.json({participant:await joinRun(String(b.joinCode||""),b.consent===true)});
    if(b.action === "teacher_create") { const u=await requireTeacher(); const code=makeCode(6); const r=(await query("insert into experiment_runs(join_code,title,created_by) values($1,$2,$3) returning id,join_code,title,status",[code,String(b.title||"AI双创课堂实验").slice(0,120),u.id])).rows[0]; return NextResponse.json(r); }
    if(b.action === "teacher_start") { await requireTeacher(); const id=String(b.runId||""); const r=(await query("update experiment_runs set starts_at=coalesce(starts_at,now()),status='active' where id=$1 returning *",[id])).rows[0]; return NextResponse.json(r); }
    const p=await getParticipant(); if(!p) return NextResponse.json({error:"请先用实验码加入"},{status:401});
    const type=String(b.action||""); const actual=nowStage(p).key; const stage=String(b.stage||actual); const allowed=new Set(["t0","cockpit_v0","cockpit_challenge","cockpit_decision","cockpit_v1","expert_reply","expert_v2","defense_reply","t1","survey"]); if(!allowed.has(type)) return NextResponse.json({error:"不支持的实验动作"},{status:400});
    const bucket = type==="t0"?"t0":type.startsWith("cockpit")?"cockpit":type.startsWith("expert")?"expert":type.startsWith("defense")?"defense":type; if(actual!==bucket) return NextResponse.json({error:`当前时间段是“${actual}”，不能提交“${bucket}”阶段数据`},{status:409});
    if(type==="cockpit_v1") { const prior=(await query<{n:number}>("select count(*)::int as n from experiment_events where participant_id=$1 and event_type='cockpit_challenge'",[p.id])).rows[0]?.n||0; if(prior<2) return NextResponse.json({error:"V1 前至少需要两条不同角度的专家质疑"},{status:400}); }
    if(type==="defense_reply" && (!Number.isInteger(Number(b.round)) || Number(b.round)<1 || Number(b.round)>5)) return NextResponse.json({error:"模拟答辩需要完成第1—5个核心问题"},{status:400});
    await recordEvent(p,type,actual,{text:String(b.text||"").slice(0,12000),decision:b.decision||null,role:b.role||null,round:b.round||null}); await query("update experiment_participants set stage=$1 where id=$2",[actual,p.id]); if(type==="survey") cookies().set(EXP_COOKIE,"",{path:"/",expires:new Date(0)}); return NextResponse.json({ok:true,stage:nowStage(p)});
  } catch(e) { const msg=e instanceof Error?e.message:"操作失败"; return NextResponse.json({error:msg},{status:msg.includes("TEACHER")?403:400}); }
}

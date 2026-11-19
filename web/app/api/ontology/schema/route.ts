import { NextResponse } from "next/server";
import { OBJECT_TYPES, LINK_TYPES, PIPELINE, STATUS_LABEL, ORIGIN_LABEL, SOURCE_KINDS } from "@/lib/ontology/schema";
import { listActions } from "@/lib/ontology";

export const runtime = "nodejs";

/** 本体定义（对象类型、关系类型、产品线步骤、动作清单），供界面渲染 */
export async function GET() {
  return NextResponse.json({
    objects: OBJECT_TYPES.map((o) => ({ key: o.key, label: o.label, step: o.step, titleField: o.titleField, fields: o.fields, certifiable: o.certifiable, requireSourceToCertify: !!o.requireSourceToCertify })), links: LINK_TYPES, pipeline: PIPELINE,
    status: STATUS_LABEL, origin: ORIGIN_LABEL, sourceKinds: SOURCE_KINDS, actions: listActions(),
  });
}

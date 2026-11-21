"use client";
// 班级园区（three.js · 等距视角）：每个项目团队一块平台，成员是卡通小人（只显示席位号，不显示姓名）。
// 平台颜色 = 当前所处阶段；前沿 8 盏灯 = 8 步进度（绿=完成，蓝色闪烁=当前步）；橙色菱形 = 有卡点。
// 小人只在该团队今天真的有学习记录 / AI 使用 / 在对局中时才“打字”，否则安静坐着——画面不演示假数据。
// 点平台：镜头推近并回调 onPick；点空白处：回到全景。WebGL 不可用时回调 onFail，由页面退回二维席位图。
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type CampusTeam = {
  id: string; name: string; seats: number[]; avatars: number[]; done: number; current: number;
  steps: string[]; blockers: number; active: boolean; online: number;
};

const STAGE = [ // 按当前所在步给平台上色（柔和色），全部完成为绿色
  { top: "#BAE6FD", side: "#7DD3FC" }, { top: "#BAE6FD", side: "#7DD3FC" }, { top: "#C7D2FE", side: "#A5B4FC" }, { top: "#DDD6FE", side: "#C4B5FD" },
  { top: "#FDE68A", side: "#FCD34D" }, { top: "#FED7AA", side: "#FDBA74" }, { top: "#FBCFE8", side: "#F9A8D4" }, { top: "#FBCFE8", side: "#F9A8D4" },
];
const DONE = { top: "#BBF7D0", side: "#86EFAC" };
const SHIRT = ["#6366F1", "#EC4899", "#0EA5E9", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444", "#14B8A6"];
const SKIN = ["#F2C9A0", "#E8B48A", "#D9A074", "#F5D2B0"];

export default function Campus3D({ teams, loners, selected, onPick, onFail }: {
  teams: CampusTeam[]; loners: number; selected: string | null; onPick: (id: string | null) => void; onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ focus: (id: string | null) => void } | null>(null);
  const pickRef = useRef(onPick); pickRef.current = onPick;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch { onFail(); return; }
    const W = () => el.clientWidth, H = () => el.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor("#EEF2F7");
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.setSize(W(), H());
    Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const aspect = W() / H();
    const view = 16;
    const camera = new THREE.OrthographicCamera(-view * aspect, view * aspect, view, -view, 0.1, 400);
    camera.position.set(40, 38, 40);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight("#ffffff", "#CBD5E1", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(18, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 100 });
    scene.add(sun);

    const disposables: { dispose: () => void }[] = [];
    const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02, ...extra }); disposables.push(m); return m;
    };
    const geo = <T extends THREE.BufferGeometry>(g: T) => { disposables.push(g); return g; };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true) => {
      const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x;
    };

    // 地面与中央广场（教师讲台）
    const ground = mesh(geo(new THREE.PlaneGeometry(400, 400)), mat("#E7ECF3"), false);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);
    const plaza = mesh(geo(new THREE.CylinderGeometry(4.2, 4.4, 0.4, 48)), mat("#FFFFFF"));
    plaza.position.y = 0.2; scene.add(plaza);
    const podium = mesh(geo(new RoundedBoxGeometry(2.4, 1.0, 1.2, 3, 0.12)), mat("#1E3A8A"));
    podium.position.set(0, 0.9, 0); scene.add(podium);
    const teacher = makePerson("#1E3A8A", SKIN[0]); teacher.position.set(0, 0.4, -1.3); scene.add(teacher);

    // 平台排布：围绕广场一圈，团队多时外扩
    const n = Math.max(1, teams.length);
    const R = n <= 6 ? 12 : n <= 10 ? 15 : 18;
    type Pad = { id: string; group: THREE.Group; top: THREE.Mesh; base: THREE.Color; people: THREE.Group[]; lamps: THREE.Mesh[]; current: number; active: boolean; marker?: THREE.Mesh; pos: THREE.Vector3 };
    const pads: Pad[] = [];
    const roadMat = mat("#D6DEE9");
    teams.forEach((t, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 4;
      const pos = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
      // 通往广场的小路
      const len = R - 4.5;
      const road = mesh(geo(new THREE.BoxGeometry(1.4, 0.06, len)), roadMat, false);
      road.position.set(Math.cos(a) * (4.2 + len / 2), 0.03, Math.sin(a) * (4.2 + len / 2));
      road.rotation.y = -a + Math.PI / 2; scene.add(road);

      const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = -a - Math.PI / 2; scene.add(g);
      const col = t.done >= 8 ? DONE : STAGE[Math.max(0, Math.min(7, (t.current || 1) - 1))];
      const W0 = 7, D0 = 5.4;
      const side = mesh(geo(new RoundedBoxGeometry(W0, 0.9, D0, 4, 0.25)), mat(col.side));
      side.position.y = 0.45; g.add(side);
      const top = mesh(geo(new RoundedBoxGeometry(W0 - 0.3, 0.12, D0 - 0.3, 3, 0.05)), mat(col.top));
      top.position.y = 0.92; g.add(top);
      top.userData.team = t.id; side.userData.team = t.id;

      // 工位：每人一张桌子 + 显示器 + 小人（最多 8 人，按两排摆）
      const people: THREE.Group[] = [];
      const m = Math.min(8, Math.max(t.seats.length, 1));
      for (let k = 0; k < m; k++) {
        const row = k < 4 ? 0 : 1, colI = k % 4, cols = Math.min(4, m - row * 4);
        const x = (colI - (cols - 1) / 2) * 1.55, z = row === 0 ? -0.7 : 1.1;
        const desk = mesh(geo(new RoundedBoxGeometry(1.2, 0.12, 0.7, 2, 0.04)), mat("#F5E6CC"));
        desk.position.set(x, 1.45, z - 0.55); g.add(desk);
        for (const lx of [-0.5, 0.5]) { const leg = mesh(geo(new THREE.BoxGeometry(0.06, 0.48, 0.06)), mat("#B8A27E")); leg.position.set(x + lx, 1.17, z - 0.55); g.add(leg); }
        const screen = mesh(geo(new THREE.BoxGeometry(0.62, 0.42, 0.05)), [mat("#334155"), mat("#334155"), mat("#334155"), mat("#334155"),
          mat(t.active ? "#60A5FA" : "#94A3B8", { emissive: t.active ? "#3B82F6" : "#000000", emissiveIntensity: t.active ? 0.6 : 0 }), mat("#334155")]);
        screen.position.set(x, 1.75, z - 0.75); screen.rotation.y = Math.PI; g.add(screen);
        if (k < t.seats.length) {
          const p = makePerson(SHIRT[(t.avatars[k] ?? k) % SHIRT.length], SKIN[(t.avatars[k] ?? k) % SKIN.length]);
          p.position.set(x, 0.98, z); g.add(p); people.push(p);
        }
      }
      // 8 盏进度灯
      const lamps: THREE.Mesh[] = [];
      for (let s = 0; s < 8; s++) {
        const st = t.steps[s];
        const on = st === "done", cur = s + 1 === t.current && t.done < 8;
        const lamp = mesh(geo(new THREE.SphereGeometry(0.17, 16, 12)), mat(on ? "#22C55E" : cur ? "#3B82F6" : "#CBD5E1", { emissive: on ? "#16A34A" : cur ? "#2563EB" : "#000000", emissiveIntensity: on ? 0.5 : cur ? 0.8 : 0 }));
        lamp.position.set((s - 3.5) * 0.72, 1.12, D0 / 2 - 0.35); g.add(lamp); lamps.push(lamp);
      }
      // 卡点标记
      let marker: THREE.Mesh | undefined;
      if (t.blockers > 0) {
        // 放在名牌右侧（屏幕右方 = 世界坐标 (1,0,-1) 方向），不被名牌挡住
        marker = mesh(geo(new THREE.OctahedronGeometry(1.1)), mat("#F97316", { emissive: "#EA580C", emissiveIntensity: 0.6 }));
        marker.position.set(pos.x + 3.2, 4.4, pos.z - 3.2); scene.add(marker);
      }
      // 名牌（HTML，不随缩放模糊）
      const tag = document.createElement("div");
      tag.className = "campus-tag" + (t.blockers ? " warn" : "");
      tag.innerHTML = `<b></b><span></span>${t.blockers ? "<i></i>" : ""}`;
      (tag.querySelector("b") as HTMLElement).textContent = t.name;
      (tag.querySelector("span") as HTMLElement).textContent = `${t.done >= 8 ? "已完成 8 步" : `第 ${t.current} / 8 步`} · ${t.seats.length} 人`;
      if (t.blockers) (tag.querySelector("i") as HTMLElement).textContent = `⚠ ${t.blockers} 个卡点`;
      tag.style.pointerEvents = "auto";
      tag.addEventListener("click", (e) => { e.stopPropagation(); pickRef.current(t.id); });
      const label = new CSS2DObject(tag); label.position.set(0, 3.9, 0); g.add(label);

      pads.push({ id: t.id, group: g, top, base: new THREE.Color(col.top), people, lamps, current: t.current, active: t.active, marker, pos });
    });

    // 还没加入项目的同学：站在广场边上
    for (let k = 0; k < Math.min(loners, 12); k++) {
      const p = makePerson("#94A3B8", SKIN[k % SKIN.length]);
      const a = (k / Math.max(1, Math.min(loners, 12))) * Math.PI * 1.2 + Math.PI * 0.9;
      p.position.set(Math.cos(a) * 3.3, 0.4, Math.sin(a) * 3.3); p.scale.setScalar(0.85); scene.add(p);
    }
    if (loners > 0) {
      const tip = document.createElement("div"); tip.className = "campus-tag muted";
      tip.textContent = `${loners} 人还没加入项目`;
      const l = new CSS2DObject(tip); l.position.set(0, 3.2, 0); scene.add(l);
    }

    function makePerson(shirt: string, skin: string) {
      const p = new THREE.Group();
      const body = mesh(geo(new THREE.CapsuleGeometry(0.28, 0.42, 4, 12)), mat(shirt)); body.position.y = 0.62; p.add(body);
      const head = mesh(geo(new THREE.SphereGeometry(0.26, 20, 16)), mat(skin)); head.position.y = 1.22; p.add(head);
      const hair = mesh(geo(new THREE.SphereGeometry(0.27, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2.1)), mat("#3F3A36")); hair.position.y = 1.25; p.add(hair);
      p.userData.body = body; p.userData.head = head;
      return p;
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minZoom = 0.6; controls.maxZoom = 3.2;
    controls.minPolarAngle = Math.PI / 6; controls.maxPolarAngle = Math.PI / 2.6;
    controls.screenSpacePanning = true;

    // 镜头动画：推近某个团队 / 回到全景
    const goal = { target: new THREE.Vector3(0, 0, 0), zoom: 1 };
    // 按场景实际投影范围算缩放：所有平台（含名牌高度）刚好占满画面约 85%
    const fitZoom = () => {
      const pts: THREE.Vector3[] = [];
      const ext = [...pads.map((p) => p.pos), new THREE.Vector3()];
      for (const c of ext) for (const dx of [-4.5, 4.5]) for (const dz of [-4.5, 4.5]) for (const y of [0, 5]) pts.push(new THREE.Vector3(c.x + dx, y, c.z + dz));
      const z0 = camera.zoom; camera.zoom = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      let mx = 0.01, my = 0.01;
      for (const v of pts) { const q = v.clone().sub(controls.target).add(goal.target).project(camera); mx = Math.max(mx, Math.abs(q.x)); my = Math.max(my, Math.abs(q.y)); }
      camera.zoom = z0; camera.updateProjectionMatrix();
      return Math.min(3, 0.88 / Math.max(mx, my));
    };
    let baseZoom = fitZoom(); goal.zoom = baseZoom; camera.zoom = goal.zoom; camera.updateProjectionMatrix();
    let animating = true;
    api.current = {
      focus: (id) => {
        const pad = pads.find((p) => p.id === id);
        goal.target.copy(pad ? pad.pos : new THREE.Vector3());
        goal.zoom = pad ? Math.min(3.2, baseZoom * 2.5) : baseZoom;
        animating = true;
      },
    };
    controls.addEventListener("start", () => { animating = false; });

    // 悬停高亮与点击
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let hover: Pad | null = null, downAt = 0, downXY = [0, 0];
    const padAt = (ev: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(pads.flatMap((p) => p.group.children), false).find((h) => h.object.userData.team || h.object.parent?.parent);
      if (!hit) return null;
      let o: THREE.Object3D | null = hit.object;
      while (o && !pads.some((p) => p.group === o)) o = o.parent;
      return pads.find((p) => p.group === o) || null;
    };
    const onMove = (ev: PointerEvent) => {
      const p = padAt(ev);
      if (p !== hover) {
        hover?.group.position.setY(0); hover = p; hover?.group.position.setY(0.25);
        renderer.domElement.style.cursor = p ? "pointer" : "grab";
      }
    };
    const onDown = (ev: PointerEvent) => { downAt = performance.now(); downXY = [ev.clientX, ev.clientY]; };
    const onUp = (ev: PointerEvent) => {
      if (performance.now() - downAt > 350 || Math.hypot(ev.clientX - downXY[0], ev.clientY - downXY[1]) > 6) return; // 拖动不算点击
      const p = padAt(ev); pickRef.current(p ? p.id : null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const ro = new ResizeObserver(() => {
      const a = W() / H();
      Object.assign(camera, { left: -view * a, right: view * a, top: view, bottom: -view });
      camera.updateProjectionMatrix(); renderer.setSize(W(), H()); labels.setSize(W(), H());
      if (!pads.some((p) => p.pos.equals(goal.target)) || goal.target.lengthSq() === 0) { const t0 = controls.target.clone(); controls.target.set(0, 0, 0); baseZoom = fitZoom(); controls.target.copy(t0); goal.zoom = baseZoom; animating = true; }
    });
    ro.observe(el);

    const clock = new THREE.Clock();
    let raf = 0, stopped = false;
    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const t = clock.getElapsedTime();
      for (const p of pads) {
        p.people.forEach((pp, k) => {
          const body = pp.userData.body as THREE.Mesh, head = pp.userData.head as THREE.Mesh;
          if (p.active) { body.rotation.x = -0.12 + Math.sin(t * 6 + k) * 0.05; head.position.y = 1.22 + Math.abs(Math.sin(t * 6 + k)) * 0.04; }
        });
        const cur = p.lamps[p.current - 1];
        if (cur && p.current >= 1) (cur.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.4;
        if (p.marker) { p.marker.position.y = 4.4 + Math.sin(t * 2.4) * 0.25; p.marker.rotation.y = t * 1.5; }
      }
      if (animating) {
        controls.target.lerp(goal.target, 0.08);
        const off = new THREE.Vector3(40, 38, 40);
        camera.position.lerp(goal.target.clone().add(off), 0.08);
        camera.zoom += (goal.zoom - camera.zoom) * 0.08; camera.updateProjectionMatrix();
        if (camera.position.distanceTo(goal.target.clone().add(off)) < 0.05 && Math.abs(goal.zoom - camera.zoom) < 0.005) animating = false;
      }
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    loop();

    return () => {
      stopped = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      disposables.forEach((d) => d.dispose()); renderer.dispose();
      el.innerHTML = "";
      api.current = null;
    };
    // 数据变化时整个场景重建（每 8 秒刷新一次的数据量很小）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(teams), loners]);

  useEffect(() => { api.current?.focus(selected); }, [selected]);

  return (
    <div ref={host} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <style>{`
        .campus-tag{background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:5px 10px;box-shadow:0 4px 12px rgba(15,23,42,.12);text-align:center;cursor:pointer;white-space:nowrap;font-family:inherit}
        .campus-tag b{display:block;font-size:14px;color:#111827;max-width:180px;overflow:hidden;text-overflow:ellipsis}
        .campus-tag span{display:block;font-size:12.5px;color:#475569}
        .campus-tag.muted{cursor:default;font-size:13px;color:#475569}
        .campus-tag.warn{border:2px solid #F97316}
        .campus-tag i{display:block;font-style:normal;font-size:12.5px;font-weight:700;color:#C2410C}
      `}</style>
    </div>
  );
}

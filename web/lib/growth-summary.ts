export type GrowthEvent = {
  id: number;
  kind: string;
  project_id: string | null;
  created_at: string;
  dims: {
    key?: string;
    axes: { dim: string; score: number; max: number }[];
    total: number;
  } | null;
};
export function comparableGroups<T extends GrowthEvent>(events: T[]) {
  const groups = new Map<string, { label: string; events: T[] }>();
  for (const e of [...events].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  )) {
    if (e.kind !== "defense_radar" || !e.dims?.axes?.length) continue;
    if (
      e.dims.axes.some(
        (a) =>
          !Number.isFinite(a.score) ||
          !Number.isFinite(a.max) ||
          a.max <= 0 ||
          a.score < 0 ||
          a.score > a.max,
      )
    )
      continue;
    const signature = JSON.stringify([
      e.project_id,
      e.dims.key || `unknown-${e.id}`,
      e.dims.axes
        .map((a) => [a.dim, a.max])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ]);
    if (!groups.has(signature))
      groups.set(signature, {
        label: e.dims.key || "历史记录（缺少赛道，单独展示）",
        events: [],
      });
    groups.get(signature)!.events.push(e);
  }
  return [...groups.entries()].map(([id, g]) => ({ id, ...g }));
}
export function dimensionSummary(events: GrowthEvent[]) {
  const first = events[0]?.dims,
    last = events[events.length - 1]?.dims;
  if (!last) return [];
  return last.axes.map((a) => {
    const before = first?.axes.find((x) => x.dim === a.dim && x.max === a.max);
    return {
      name: a.dim,
      score: a.score,
      max: a.max,
      percent: Math.round((a.score / a.max) * 100),
      delta:
        events.length > 1 && before
          ? Math.round(((a.score - before.score) / a.max) * 100)
          : null,
    };
  });
}

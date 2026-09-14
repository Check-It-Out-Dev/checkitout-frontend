/** A readable form of a test identity for tables and diagrams — never a key. */
export function short(id) {
  const m = id.match(/\[method:([^\]]+)\]/);
  const cls = id.match(/\[class:([^\]]+)\]/);
  if (m && cls) {
    const nested = [...id.matchAll(/\[nested-class:([^\]]+)\]/g)].map((x) => x[1]).join('$');
    const inv = [...id.matchAll(/invocation:#(\d+)\]/g)].map((x) => `[${x[1]}]`).join('');
    return `${cls[1].split('.').pop()}${nested ? '$' + nested : ''}#${m[1]}${inv}`;
  }
  const j = id.split(' :: ');
  return j.length === 2 ? `${j[0].split('/').pop()} :: ${j[1]}` : id;
}

/** Small original DOM helpers. User-provided strings always become text nodes. */
export function element<K extends keyof HTMLElementTagNameMap>(
  document: Document, tag: K, className = '', text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type IconName = 'spark' | 'note' | 'bookmark' | 'settings' | 'close' | 'pin' | 'plus' | 'back' | 'refresh' | 'arrow' | 'trash';
const paths: Record<IconName, string[]> = {
  spark: ['M12 2c2 6 4 8 10 10-6 2-8 4-10 10C10 16 8 14 2 12c6-2 8-4 10-10Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  note: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z', 'M14 3v6h6', 'M8 13h8', 'M8 17h5'],
  bookmark: ['M6 4h12v17l-6-4-6 4Z'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'm5 5 2 2', 'm17 17 2 2', 'm5 19 2-2', 'm17 7 2-2'],
  close: ['m6 6 12 12', 'M6 18 18 6'],
  pin: ['m8 3 8 0-1 7 3 3v2H6v-2l3-3Z', 'M12 15v6'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['m14 5-7 7 7 7'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6 7a7 7 0 0 1 12-1l2 3', 'M18 17a7 7 0 0 1-12 1l-2-3'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'm5 6 1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
};

export function icon(document: Document, name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const d of paths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function button(document: Document, label: string, testId: string, iconName?: IconName, className = 'button'): HTMLButtonElement {
  const node = element(document, 'button', className);
  node.type = 'button';
  node.dataset.testid = testId;
  node.setAttribute('aria-label', label);
  node.title = label;
  if (iconName) node.append(icon(document, iconName));
  if (!className.includes('icon-button')) node.append(element(document, 'span', '', label));
  return node;
}

export function validLink(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return !!url.hostname && !url.username && !url.password;
    return url.protocol === 'codex:' && url.hostname === 'threads' && /^\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/?$/i.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function currentThreadUrl(location: Location): string | undefined {
  const href = location.href;
  return href.startsWith('codex://threads/') && validLink(href) ? href : undefined;
}

export function periodLabel(minutes: number | null, fallback: string, chinese: boolean): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes % 1440 === 0) return `${minutes / 1440}${chinese ? ' 天' : 'd'}`;
  if (minutes % 60 === 0) return `${minutes / 60}${chinese ? ' 小时' : 'h'}`;
  return `${minutes}${chinese ? ' 分钟' : 'm'}`;
}

export function dateLabel(value: string | number | null, locale: string): string {
  if (value === null || value === '') return locale === 'zh-CN' ? '未知' : 'Unknown';
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? (locale === 'zh-CN' ? '未知' : 'Unknown') : date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

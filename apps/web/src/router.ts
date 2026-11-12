export const views = ['orders', 'pack', 'disputes', 'shared-causes', 'store-report'] as const;
export type View = (typeof views)[number];
export interface Route {
  view: View;
  id?: string;
}
export function parseRoute(pathname: string): Route | null {
  const parts = pathname.replace(/\/$/, '').split('/');
  if (parts[1] !== 'console' || parts.length > 4) return null;
  const view = parts[2] as View;
  if (!views.includes(view)) return null;
  if (view === 'store-report' && parts[3]) return null;
  try {
    const id = parts[3] ? decodeURIComponent(parts[3]) : undefined;
    if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
    return { view, ...(id ? { id } : {}) };
  } catch {
    return null;
  }
}
export function routePath(route: Route): string {
  return `/console/${route.view}${route.id ? '/' + encodeURIComponent(route.id) : ''}`;
}

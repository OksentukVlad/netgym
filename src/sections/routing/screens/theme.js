// The routing screen's colours by level and router. The palette itself is in
// src/ui/tokens.css (--ng-router-N, --ng-level-N, both themes); a class here
// picks the shade, and routing.css applies it as --ng-rc / --ng-lv.

export const ROUTER_COLOURS = 8;

/** A router's colour class: by its position among the task's routers. */
export function routerClass(routerNames, name) {
  return `ng-rc-${Math.max(0, routerNames.indexOf(name)) % ROUTER_COLOURS}`;
}

/** A level's colour class (levels 1–5; 0 is «Всі»). */
export const levelClass = level => `ng-lv-${level}`;

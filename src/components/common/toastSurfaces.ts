/**
 * Android: 열린 모달 안의 토스트 표시 위치 목록 (ToastHost/AppModal 내부용)
 *
 * Android의 RN Modal은 앱 창 위에 뜨는 별도 Dialog 창이라 앱 루트에 그린 토스트를
 * 가린다. 열린 AppModal마다 표시 위치를 등록하고, 토스트는 맨 위 모달 안에 그린다.
 * 맨 위 = 가장 깊이 중첩된 모달, 깊이가 같으면 나중에 등록된 모달. (React 효과는 자식부터
 * 실행되므로 등록 순서만으로는 중첩된 모달이 부모보다 먼저 등록될 수 있다.)
 * 알림·타이머는 앱 루트의 ToastHost 하나가 계속 담당한다.
 */

interface Surface {
  id: number;
  depth: number;
}

let nextSurfaceId = 1;
let surfaces: readonly Surface[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

/** depth: 모달 중첩 깊이 (루트 모달 0) */
export function registerToastSurface(depth: number): number {
  const id = nextSurfaceId++;
  surfaces = [...surfaces, { id, depth }];
  emit();
  return id;
}

export function unregisterToastSurface(id: number): void {
  const next = surfaces.filter(surface => surface.id !== id);
  if (next.length === surfaces.length) return;
  surfaces = next;
  emit();
}

/** 맨 위 모달의 표시 위치. 열린 모달이 없으면 null (앱 루트에 그린다) */
export function topToastSurface(): number | null {
  let top: Surface | null = null;
  for (const surface of surfaces) {
    if (!top || surface.depth >= top.depth) top = surface;
  }
  return top ? top.id : null;
}

export function subscribeToastSurfaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

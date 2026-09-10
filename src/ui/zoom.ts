/** 图表缩放：按钮 + Ctrl/⌘+滚轮，用 CSS zoom 作用于 SVG */

const MIN = 0.25;
const MAX = 4;
const STEP = 0.25;

export interface ZoomController {
  /** 重新渲染后调用，把当前缩放应用到新的 SVG */
  apply(): void;
}

export function createZoom(opts: {
  diagramEl: HTMLElement;
  levelEl: HTMLElement;
  inBtn: HTMLElement;
  outBtn: HTMLElement;
  resetBtn: HTMLElement;
}): ZoomController {
  const { diagramEl, levelEl, inBtn, outBtn, resetBtn } = opts;
  let level = 1;

  function apply() {
    const svg = diagramEl.querySelector('svg') as unknown as SVGSVGElement | null;
    if (svg && svg.viewBox && svg.viewBox.baseVal) {
      const { width, height } = svg.viewBox.baseVal;
      if (width && height) {
        svg.style.width = `${width * level}px`;
        svg.style.height = `${height * level}px`;
      }
    }
    levelEl.textContent = `${Math.round(level * 100)}%`;
  }

  function set(next: number) {
    level = Math.min(MAX, Math.max(MIN, next));
    apply();
  }

  inBtn.addEventListener('click', () => set(level + STEP));
  outBtn.addEventListener('click', () => set(level - STEP));
  resetBtn.addEventListener('click', () => set(1));

  // Ctrl/⌘ + 滚轮缩放；普通滚轮保持滚动行为
  diagramEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    set(level + (e.deltaY < 0 ? STEP : -STEP));
  }, { passive: false });

  return { apply };
}

/** 按住鼠标中键拖拽平移画面（类建模软件） */
export function createPan(diagramEl: HTMLElement): void {
  let panning = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  diagramEl.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return; // 仅鼠标中键
    e.preventDefault();         // 阻止中键默认的自动滚动
    panning = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = diagramEl.scrollLeft;
    startTop = diagramEl.scrollTop;
    diagramEl.classList.add('panning');
  });

  // 监听 window，拖出容器后仍可继续移动
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    diagramEl.scrollLeft = startLeft - (e.clientX - startX);
    diagramEl.scrollTop = startTop - (e.clientY - startY);
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 1 || !panning) return;
    panning = false;
    diagramEl.classList.remove('panning');
  });
}

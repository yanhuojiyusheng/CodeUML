/** 可拖拽分栏：编辑区/图表区、文件栏宽度 */

// 分栏宽度常量（纯函数与交互代码共用）
const RESIZER_W = 5;      // #sidebar-resizer
const DIVIDER_W = 6;      // #divider
const EDITOR_MIN = 240;   // 编辑区最少保留
const RIGHT_MIN = 280;    // 图表区最少保留
const SIDEBAR_MIN = 120;
const SIDEBAR_MAX = 600;
const SIDEBAR_FLOOR = 180;

/**
 * 文件栏宽度上限。
 * 只接受「右侧面板的固定宽度」——绝不能把 flex 伸缩后测得的宽度传进来，
 * 否则上限会被算成负数、被兜底值卡死（历史上两次同一个坑）。
 */
export function maxSidebarWidth(mainW: number, rightW: number): number {
  return Math.max(SIDEBAR_FLOOR, Math.min(SIDEBAR_MAX, mainW - RESIZER_W - DIVIDER_W - rightW - EDITOR_MIN));
}

export function clampSidebarWidth(width: number, mainW: number, rightW: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(maxSidebarWidth(mainW, rightW), width));
}

/** 图表区宽度上限（给编辑区留出最小宽度） */
export function maxRightWidth(mainW: number, sidebarW: number): number {
  return Math.max(RIGHT_MIN, mainW - sidebarW - RESIZER_W - DIVIDER_W - EDITOR_MIN);
}

export function clampRightWidth(width: number, mainW: number, sidebarW: number): number {
  return Math.max(RIGHT_MIN, Math.min(maxRightWidth(mainW, sidebarW), width));
}

export function createSplitPanes(opts: {
  rightPane: HTMLElement;
  divider: HTMLElement;
  fileSidebar: HTMLElement;
  sidebarResizer: HTMLElement;
  sidebarToggle: HTMLButtonElement;
  editorPane: HTMLElement;
  editorToggle: HTMLButtonElement;
}): void {
  const { rightPane, divider, fileSidebar, sidebarResizer, sidebarToggle, editorPane, editorToggle } = opts;

  // ---------------- 右侧图表区宽度 ----------------
  let dividerDragging = false;
  let dividerStartX = 0;
  let dividerStartWidth = 0;

  // 右侧面板的“固定宽度”；0 表示未手动调整过（用 CSS 默认的 50%）。
  // 这是唯一事实来源：文件栏上限也用它，避免去测 flex 伸缩后的宽度。
  let rightPaneWidth = 0;

  function applyRightWidth() {
    if (rightPaneWidth > 0) {
      rightPane.style.flex = `0 0 ${rightPaneWidth}px`;
      rightPane.style.width = `${rightPaneWidth}px`;
    } else {
      rightPane.style.flex = '';
      rightPane.style.width = '';
    }
  }

  function setRightWidth(width: number) {
    const mainEl = rightPane.parentElement;
    if (!mainEl) return;
    const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
    const sidebarW = fileSidebar.getBoundingClientRect().width || 170;
    rightPaneWidth = clampRightWidth(width, mainW, sidebarW);
    applyRightWidth();
  }

  divider.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    dividerDragging = true;
    dividerStartX = e.clientX;
    dividerStartWidth = rightPane.getBoundingClientRect().width;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dividerDragging) return;
    // 向右拖动 -> 右侧图表区变窄
    setRightWidth(dividerStartWidth - (e.clientX - dividerStartX));
  });

  document.addEventListener('mouseup', () => {
    if (!dividerDragging) return;
    dividerDragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // 触摸设备支持
  let touchDragging = false;
  let touchStartX = 0;
  let touchStartWidth = 0;

  divider.addEventListener('touchstart', (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchDragging = true;
    touchStartX = touch.clientX;
    touchStartWidth = rightPane.getBoundingClientRect().width;
    divider.classList.add('dragging');
  }, { passive: true });

  divider.addEventListener('touchmove', (e: TouchEvent) => {
    if (!touchDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    setRightWidth(touchStartWidth - (touch.clientX - touchStartX));
    e.preventDefault();
  }, { passive: false });

  divider.addEventListener('touchend', () => {
    touchDragging = false;
    divider.classList.remove('dragging');
  });

  // ---------------- 文件栏宽度 ----------------
  let sidebarDragging = false;
  let sidebarStartX = 0;
  let sidebarStartWidth = 0;

  // 编辑区收起前右侧图表区的固定宽度就存在 rightPaneWidth 里，这里直接用它，
  // 不依赖任何“收起那一刻的快照”，所以窗口尺寸变化也不会失效
  function setSidebarWidth(width: number) {
    const mainEl = fileSidebar.parentElement;
    if (!mainEl) return;
    const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
    const rightW = rightPaneWidth > 0 ? rightPaneWidth : mainW * 0.5;
    fileSidebar.style.setProperty('--sidebar-width', `${clampSidebarWidth(width, mainW, rightW)}px`);
  }

  sidebarResizer.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    sidebarDragging = true;
    sidebarStartX = e.clientX;
    sidebarStartWidth = fileSidebar.getBoundingClientRect().width;
    fileSidebar.classList.add('resizing');
    sidebarResizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!sidebarDragging) return;
    setSidebarWidth(sidebarStartWidth + (e.clientX - sidebarStartX));
  });

  document.addEventListener('mouseup', () => {
    if (!sidebarDragging) return;
    sidebarDragging = false;
    fileSidebar.classList.remove('resizing');
    sidebarResizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  // 文件栏触摸拖动
  let sidebarTouchDragging = false;
  let sidebarTouchStartX = 0;
  let sidebarTouchStartWidth = 0;

  sidebarResizer.addEventListener('touchstart', (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    sidebarTouchDragging = true;
    sidebarTouchStartX = touch.clientX;
    sidebarTouchStartWidth = fileSidebar.getBoundingClientRect().width;
    fileSidebar.classList.add('resizing');
    sidebarResizer.classList.add('dragging');
  }, { passive: true });

  sidebarResizer.addEventListener('touchmove', (e: TouchEvent) => {
    if (!sidebarTouchDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    setSidebarWidth(sidebarTouchStartWidth + (touch.clientX - sidebarTouchStartX));
    e.preventDefault();
  }, { passive: false });

  sidebarResizer.addEventListener('touchend', () => {
    sidebarTouchDragging = false;
    fileSidebar.classList.remove('resizing');
    sidebarResizer.classList.remove('dragging');
  });

  // 窗口缩放时，重新约束右侧面板与文件栏宽度
  window.addEventListener('resize', () => {
    if (rightPane.style.flex && !editorPane.classList.contains('collapsed')) {
      setRightWidth(rightPane.getBoundingClientRect().width);
    }
    if (!fileSidebar.classList.contains('collapsed') && fileSidebar.style.getPropertyValue('--sidebar-width')) {
      setSidebarWidth(fileSidebar.getBoundingClientRect().width);
    }
  });

  // ---------------- 折叠 / 展开（文件栏、编辑区共用同一套交互） ----------------
  function bindCollapse(
    pane: HTMLElement,
    btn: HTMLButtonElement,
    labels: { expand: string; collapse: string },
    onToggle?: (collapsed: boolean) => void,
  ) {
    const toggle = () => {
      const collapsed = pane.classList.toggle('collapsed');
      btn.textContent = collapsed ? '»' : '«';
      btn.title = collapsed ? labels.expand : labels.collapse;
      onToggle?.(collapsed);
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    // 折叠状态下点击整条竖栏可展开
    pane.addEventListener('click', () => {
      if (pane.classList.contains('collapsed')) toggle();
    });
  }

  bindCollapse(fileSidebar, sidebarToggle, { expand: '展开文件栏', collapse: '折叠文件栏' });

  // 编辑区收起时把空间让给图表区，展开时按 rightPaneWidth 恢复
  bindCollapse(editorPane, editorToggle, { expand: '展开编辑区', collapse: '收起编辑区' }, (collapsed) => {
    if (collapsed) {
      // basis 用 0：若用 auto，基准会变成图表内容宽度，撑爆整行并反过来压缩文件栏
      rightPane.style.flex = '1 1 0';
      rightPane.style.width = 'auto';
    } else {
      applyRightWidth();
      // 收起期间文件栏可能被拖宽，展开后按当前布局重新约束图表区，避免溢出
      setRightWidth(rightPane.getBoundingClientRect().width);
    }
  });
}

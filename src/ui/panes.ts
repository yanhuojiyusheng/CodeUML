/** 可拖拽分栏：编辑区/图表区、文件栏宽度 */

export function createSplitPanes(opts: {
  rightPane: HTMLElement;
  divider: HTMLElement;
  fileSidebar: HTMLElement;
  sidebarResizer: HTMLElement;
  sidebarToggle: HTMLButtonElement;
}): void {
  const { rightPane, divider, fileSidebar, sidebarResizer, sidebarToggle } = opts;

  // ---------------- 右侧图表区宽度 ----------------
  let dividerDragging = false;
  let dividerStartX = 0;
  let dividerStartWidth = 0;

  function setRightWidth(width: number) {
    const mainEl = rightPane.parentElement;
    if (!mainEl) return;
    const sidebarW = fileSidebar.getBoundingClientRect().width || 170;
    const resizerW = sidebarResizer.getBoundingClientRect().width || 5;
    const dividerW = divider.getBoundingClientRect().width || 6;
    const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
    const maxW = Math.max(280, mainW - sidebarW - resizerW - dividerW - 240); // 编辑器至少保留 240px
    const minW = 280;
    const clamped = Math.max(minW, Math.min(maxW, width));
    rightPane.style.flex = `0 0 ${clamped}px`;
    rightPane.style.width = `${clamped}px`;
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

  function setSidebarWidth(width: number) {
    const mainEl = fileSidebar.parentElement;
    if (!mainEl) return;
    const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
    const resizerW = sidebarResizer.getBoundingClientRect().width || 5;
    const dividerW = divider.getBoundingClientRect().width || 6;
    const rightW = rightPane.getBoundingClientRect().width || 0;
    // 保证：文件栏 + 编辑器(>=240) + 分隔条 + 右侧面板 不超出主区域
    const maxW = Math.max(180, Math.min(600, mainW - resizerW - dividerW - rightW - 240));
    const minW = 120;
    const clamped = Math.max(minW, Math.min(maxW, width));
    fileSidebar.style.setProperty('--sidebar-width', `${clamped}px`);
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
    if (rightPane.style.flex) {
      setRightWidth(rightPane.getBoundingClientRect().width);
    }
    if (!fileSidebar.classList.contains('collapsed') && fileSidebar.style.getPropertyValue('--sidebar-width')) {
      setSidebarWidth(fileSidebar.getBoundingClientRect().width);
    }
  });

  // ---------------- 文件栏折叠/展开 ----------------
  function toggleSidebar() {
    const collapsed = fileSidebar.classList.toggle('collapsed');
    sidebarToggle.textContent = collapsed ? '»' : '«';
    sidebarToggle.title = collapsed ? '展开文件栏' : '折叠文件栏';
  }

  sidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  // 折叠状态下点击整条竖栏可展开
  fileSidebar.addEventListener('click', () => {
    if (fileSidebar.classList.contains('collapsed')) {
      toggleSidebar();
    }
  });
}

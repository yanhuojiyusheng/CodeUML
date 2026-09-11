/** 可拖拽分栏：编辑区/图表区、文件栏宽度 */

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

  // 编辑区收起前右侧图表区的固定宽度（收起后它变成 flex:1，测得的宽度不再代表它占用的固定空间）
  let collapsedRightWidth = 0;

  function setSidebarWidth(width: number) {
    const mainEl = fileSidebar.parentElement;
    if (!mainEl) return;
    const mainW = mainEl.getBoundingClientRect().width || window.innerWidth;
    const resizerW = sidebarResizer.getBoundingClientRect().width || 5;
    const dividerW = divider.getBoundingClientRect().width || 6;
    // 编辑区收起时图表区会吃满剩余空间，若仍按当前测得宽度扣减，maxW 会被算成负数，
    // 文件栏就被卡死在 180px；这里改用收起前的固定宽度
    const rightW = editorPane.classList.contains('collapsed')
      ? collapsedRightWidth
      : (rightPane.getBoundingClientRect().width || 0);
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

  // 编辑区收起时把空间让给图表区，展开时恢复原宽度
  let savedRightWidth: { flex: string; width: string } | null = null;
  bindCollapse(editorPane, editorToggle, { expand: '展开编辑区', collapse: '收起编辑区' }, (collapsed) => {
    if (collapsed) {
      collapsedRightWidth = rightPane.getBoundingClientRect().width || 0;
      savedRightWidth = { flex: rightPane.style.flex, width: rightPane.style.width };
      rightPane.style.flex = '1 1 auto';
      rightPane.style.width = 'auto';
    } else if (savedRightWidth) {
      rightPane.style.flex = savedRightWidth.flex;
      rightPane.style.width = savedRightWidth.width;
      savedRightWidth = null;
      // 收起期间文件栏可能被拖宽，展开后按当前布局重新约束图表区，避免溢出
      setRightWidth(rightPane.getBoundingClientRect().width);
    }
  });
}

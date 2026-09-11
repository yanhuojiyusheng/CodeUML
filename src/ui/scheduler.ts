/**
 * 更新调度：去抖 + 可挂起。
 *
 * 用途：拖入大量文件时会分批 flush（每 25 个一批），如果每批都触发解析，
 * 全局类型集合一直在变 → 解析缓存整批失效 → 1000 个文件要重复解析 ~40 次。
 * 用挂起把这段时间的请求合并，导入结束（resume）时只跑一次。
 */

export interface UpdateScheduler {
  /** 请求一次更新（去抖） */
  schedule(): void;
  /** 开始挂起：期间的请求只记标记，不排定时器 */
  suspend(): void;
  /** 结束挂起：若期间有请求，立即跑一次（不再等去抖） */
  resume(): void;
  readonly suspended: boolean;
}

export function createUpdateScheduler(opts: { run: () => void; delay: number }): UpdateScheduler {
  const { run, delay } = opts;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let depth = 0; // 支持嵌套挂起

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return {
    schedule() {
      pending = true;
      if (depth > 0) return; // 挂起中：只记标记
      clearTimer();
      timer = setTimeout(() => {
        timer = undefined;
        pending = false;
        run();
      }, delay);
    },

    suspend() {
      depth++;
      clearTimer(); // 挂起时先取消已排的定时器（pending 标记保留）
    },

    resume() {
      if (depth > 0) depth--;
      if (depth > 0) return;
      if (!pending) return;
      clearTimer();
      pending = false;
      run();
    },

    get suspended() {
      return depth > 0;
    },
  };
}

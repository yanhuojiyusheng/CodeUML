/**
 * 更新调度：去抖 + 挂起（导入期间不解析）
 */

import { createUpdateScheduler } from '../src/ui/scheduler';

describe('UpdateScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('去抖：连续请求只跑一次', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.schedule();
    s.schedule();
    s.schedule();
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(249);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('挂起期间完全不跑，即使超过去抖时间', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.suspend();
    s.schedule();
    jest.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    expect(s.suspended).toBe(true);
  });

  test('挂起期间多次请求合并成一次，resume 时立即跑', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.suspend();
    for (let i = 0; i < 40; i++) s.schedule(); // 模拟每批 flush
    expect(run).not.toHaveBeenCalled();
    s.resume();
    expect(run).toHaveBeenCalledTimes(1); // 不再等去抖
    jest.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1); // 也不会再多跑一次
  });

  test('挂起开始前已排的定时器会被推迟到 resume', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.schedule();
    s.suspend();
    jest.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    s.resume();
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('resume 时没有待处理则不跑', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.suspend();
    s.resume();
    jest.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
    expect(s.suspended).toBe(false);
  });

  test('嵌套挂起：全部 resume 后才跑一次', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.suspend();
    s.suspend();
    s.schedule();
    s.resume();
    expect(run).not.toHaveBeenCalled();
    expect(s.suspended).toBe(true);
    s.resume();
    expect(run).toHaveBeenCalledTimes(1);
    expect(s.suspended).toBe(false);
  });

  test('resume 之后恢复正常的去抖行为', () => {
    const run = jest.fn();
    const s = createUpdateScheduler({ run, delay: 250 });
    s.suspend();
    s.resume();
    s.schedule();
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(250);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

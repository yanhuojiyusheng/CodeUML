/**
 * 成员标记：{static} / {abstract} / {readonly}
 *
 * 这三个标记同时影响 SVG、Draw.io 与 PlantUML 三处渲染，
 * 所以统一以 utils.memberText 为准做断言。
 */

import { memberText } from '../src/core/utils';
import { formatMember } from '../src/core/plantuml';
import { parseCode } from '../src/core/parser';
import { Member } from '../src/core/types';

const prop = (extra: Partial<Member> = {}): Member => ({
  kind: 'property',
  modifier: '+',
  name: 'id',
  type: 'string',
  ...extra,
});

describe('memberText 的标记', () => {
  test('普通属性没有标记', () => {
    expect(memberText(prop())).toBe('+ id: string');
  });

  test('readonly 属性带 {readonly}', () => {
    expect(memberText(prop({ isReadonly: true }))).toBe('{readonly} + id: string');
  });

  test('static readonly 两个标记都有，且 static 在前', () => {
    expect(memberText(prop({ isStatic: true, isReadonly: true })))
      .toBe('{static} {readonly} + id: string');
  });

  test('abstract 与 readonly 共存', () => {
    expect(memberText(prop({ isAbstract: true, isReadonly: true })))
      .toBe('{abstract} {readonly} + id: string');
  });

  test('方法不受 readonly 影响', () => {
    expect(memberText({ kind: 'method', modifier: '+', name: 'run', type: 'void', params: '', isReadonly: true }))
      .toBe('+ run(): void');
  });
});

describe('PlantUML 成员标记', () => {
  test('readonly 属性输出 {readonly}', () => {
    expect(formatMember(prop({ isReadonly: true }))).toBe('{readonly} + id : string');
  });

  test('枚举值形式不受影响', () => {
    expect(formatMember({ kind: 'property', modifier: '+', name: 'A', type: '= 1', isStatic: true }))
      .toBe('{static} + A = 1');
  });
});

describe('从源码识别 readonly', () => {
  test('类里的 readonly 属性', () => {
    const r = parseCode('class A { readonly id: string = ""; }');
    const m = r.classes[0].members.find(x => x.name === 'id')!;
    expect(m.isReadonly).toBe(true);
  });

  test('static readonly', () => {
    const r = parseCode('class A { static readonly VERSION: string = "1"; }');
    const m = r.classes[0].members.find(x => x.name === 'VERSION')!;
    expect(m.isStatic).toBe(true);
    expect(m.isReadonly).toBe(true);
  });

  test('接口里的 readonly 属性', () => {
    const r = parseCode('interface I { readonly id: string; }');
    expect(r.classes[0].members.find(x => x.name === 'id')!.isReadonly).toBe(true);
  });

  test('构造函数参数属性 readonly', () => {
    const r = parseCode('class A { constructor(readonly x: string) {} }');
    const m = r.classes[0].members.find(x => x.name === 'x')!;
    expect(m.isReadonly).toBe(true);
    expect(m.modifier).toBe('+');
  });

  test('普通属性不带 readonly', () => {
    const r = parseCode('class A { id: string = ""; }');
    expect(r.classes[0].members.find(x => x.name === 'id')!.isReadonly).toBeFalsy();
  });
});

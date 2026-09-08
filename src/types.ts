/** TypeScript → UML 类图转换器 类型定义 */

export interface Member {
  kind: 'property' | 'method';
  modifier: '+' | '-' | '#';
  name: string;
  type: string;
  params?: string;
}

export interface ClassInfo {
  name: string;
  isInterface: boolean;
  isAbstract: boolean;
  members: Member[];
}

export type RelationType = 'extends' | 'implements' | 'association' | 'aggregation' | 'composition' | 'dependency';

export interface Relation {
  from: string;
  to: string;
  type: RelationType;
  label?: string;        // 关联名称
  fromMultiplicity?: string; // 源端多重性
  toMultiplicity?: string;   // 目标端多重性
}

export interface ParsedData {
  classes: ClassInfo[];
  relations: Relation[];
}

export interface Box extends ClassInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: { text: string; cls: string }[];
  props: Member[];
  meths: Member[];
}

export interface Line extends Relation {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export interface Diagram {
  boxes: Box[];
  lines: Line[];
  width: number;
  height: number;
}

export interface DrawioCell {
  id: number;
  value: string;
  style: string;
  vertex?: number;
  edge?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  source?: number;
  target?: number;
  parent?: string;
}
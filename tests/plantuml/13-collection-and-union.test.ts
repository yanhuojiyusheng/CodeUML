/**
 * 关系判断难点 - 集合与联合类型
 */

import { parseCode } from '../../src/core/parser';

describe('关系判断难点 - 集合与联合类型', () => {

  describe('集合类型指向', () => {
    
    test('Array<T> → 关联 T', () => {
      const code = `
        class Item { id: number; }
        class Container {
          items: Array<Item>;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Container' && r.to === 'Item');
      expect(r).toBeDefined();
    });

    test('T[] → 关联 T', () => {
      const code = `
        class Item { id: number; }
        class Container {
          items: Item[];
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Container' && r.to === 'Item');
      expect(r).toBeDefined();
      expect(r?.toMultiplicity).toBe('*');
    });

    test('ReadonlyArray<T> → 关联 T', () => {
      const code = `
        class Item { id: number; }
        class Container {
          items: ReadonlyArray<Item>;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Container' && r.to === 'Item');
      expect(r).toBeDefined();
    });

    test('Set<T> → 关联 T', () => {
      const code = `
        class Entry { id: number; }
        class Cache {
          entries: Set<Entry>;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Cache' && r.to === 'Entry');
      expect(r).toBeDefined();
    });

    test('Record<K, V> → 关联 V', () => {
      const code = `
        class Config { debug: boolean; }
        class Store {
          configs: Record<string, Config>;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Store' && r.to === 'Config');
      expect(r).toBeDefined();
    });
  });

  describe('联合类型和可选类型', () => {
    
    test('A | B → 关联 A 和 B', () => {
      const code = `
        class Cat { purr(): void {} }
        class Dog { bark(): void {} }
        class Owner {
          pet: Cat | Dog;
        }
      `;
      const result = parseCode(code);
      
      // 应该关联 Cat 和 Dog
      const catR = result.relations.find(r => r.from === 'Owner' && r.to === 'Cat');
      const dogR = result.relations.find(r => r.from === 'Owner' && r.to === 'Dog');
      expect(catR).toBeDefined();
      expect(dogR).toBeDefined();
    });

    test('A | null → 关联 A，忽略 null', () => {
      const code = `
        class Address { city: string; }
        class Person {
          address: Address | null;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Person' && r.to === 'Address');
      expect(r).toBeDefined();
    });

    test('A | undefined → 关联 A', () => {
      const code = `
        class Config { }
        class App {
          config: Config | undefined;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'App' && r.to === 'Config');
      expect(r).toBeDefined();
    });

    test('string | number → 无关联', () => {
      const code = `
        class Data {
          value: string | number;
        }
      `;
      const result = parseCode(code);
      
      expect(result.relations).toHaveLength(0);
    });

    test('? 标记 → 多重性 0..1', () => {
      const code = `
        class Ref { }
        class Container {
          ref?: Ref;
        }
      `;
      const result = parseCode(code);
      
      const r = result.relations.find(r => r.from === 'Container' && r.to === 'Ref');
      expect(r?.toMultiplicity).toBe('0..1');
    });
  });
});

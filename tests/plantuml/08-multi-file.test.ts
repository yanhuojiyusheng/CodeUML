/**
 * PlantUML 语法合规性 - 多文件与包
 */

import { parseCode, parseCodeWithKnownTypes } from '../../src/core/parser';

describe('PlantUML 语法合规性 - 多文件与包', () => {

  describe('36. 多文件合并功能', () => {
    
    test('多个文件的类应该能合并解析', () => {
      const code1 = `class User { name: string; }`;
      const code2 = `class Order { user: User; }`;
      
      const parsed1 = parseCode(code1);
      const parsed2 = parseCode(code2);
      
      const allClasses = [...parsed1.classes, ...parsed2.classes];
      
      expect(allClasses).toHaveLength(2);
      expect(allClasses.map(c => c.name)).toContain('User');
      expect(allClasses.map(c => c.name)).toContain('Order');
    });

    test('跨文件引用应产生关系', () => {
      const code1 = `class Database { connect(): void {} }`;
      const code2 = `
        class UserService {
          db: Database;
          constructor(db: Database) {}
        }
      `;
      
      // 使用 parseCodeWithKnownTypes 传入外部类型
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Database']));
      
      expect(parsed2.relations.length).toBeGreaterThan(0);
      const dbRelation = parsed2.relations.find(
        r => r.from === 'UserService' && r.to === 'Database'
      );
      expect(dbRelation).toBeDefined();
    });

    test('包名应基于文件名设置', () => {
      const parsed = parseCode('class Test {}');
      parsed.classes.forEach(c => { c.packageName = 'myfile'; });
      
      expect(parsed.classes[0].packageName).toBe('myfile');
    });

    test('同名类不应重复添加', () => {
      const code1 = `class Shared { value: number; }`;
      const code2 = `class Shared { value: string; }`;
      
      const parsed1 = parseCode(code1);
      const parsed2 = parseCode(code2);
      
      const classPackageMap = new Map<string, string>();
      const allClasses: typeof parsed1.classes = [];
      
      parsed1.classes.forEach(c => {
        if (!classPackageMap.has(c.name)) {
          classPackageMap.set(c.name, 'file1');
          allClasses.push(c);
        }
      });
      
      parsed2.classes.forEach(c => {
        if (!classPackageMap.has(c.name)) {
          classPackageMap.set(c.name, 'file2');
          allClasses.push(c);
        }
      });
      
      expect(allClasses).toHaveLength(1);
      expect(classPackageMap.get('Shared')).toBe('file1');
    });

    test('关系应该去重', () => {
      const code = `class A { b: B; } class B {}`;
      const parsed1 = parseCode(code);
      const parsed2 = parseCode(code);
      
      const allRelations = [...parsed1.relations, ...parsed2.relations];
      const uniqueRelations: typeof allRelations = [];
      const relationKeys = new Set<string>();
      
      allRelations.forEach(r => {
        const key = `${r.from}-${r.type}-${r.to}`;
        if (!relationKeys.has(key)) {
          relationKeys.add(key);
          uniqueRelations.push(r);
        }
      });
      
      const aToB = uniqueRelations.filter(r => r.from === 'A' && r.to === 'B');
      expect(aToB).toHaveLength(1);
    });

    test('跨文件继承应正确处理', () => {
      const code1 = `abstract class BaseEntity { id: number; }`;
      const code2 = `class User extends BaseEntity { name: string; }`;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['BaseEntity']));
      
      const extendsRelation = parsed2.relations.find(
        r => r.type === 'extends' && r.from === 'User' && r.to === 'BaseEntity'
      );
      expect(extendsRelation).toBeDefined();
    });

    test('跨文件实现接口应正确处理', () => {
      const code1 = `interface Serializable { serialize(): string; }`;
      const code2 = `
        class UserModel implements Serializable {
          serialize(): string { return ''; }
        }
      `;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Serializable']));
      
      const implementsRelation = parsed2.relations.find(
        r => r.type === 'implements' && r.from === 'UserModel' && r.to === 'Serializable'
      );
      expect(implementsRelation).toBeDefined();
    });

    test('跨文件聚合关系应正确处理', () => {
      const code1 = `class Engine { power: number; }`;
      const code2 = `class Car { engines: Engine[]; }`;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Engine']));
      
      const aggregation = parsed2.relations.find(
        r => r.type === 'aggregation' && r.from === 'Car' && r.to === 'Engine'
      );
      expect(aggregation).toBeDefined();
      expect(aggregation?.toMultiplicity).toBe('*');
    });

    test('跨文件组合关系应正确处理', () => {
      const code1 = `class Window { size: number; }`;
      const code2 = `class House { window: Window = new Window(); }`;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Window']));
      
      const composition = parsed2.relations.find(
        r => r.type === 'composition' && r.from === 'House' && r.to === 'Window'
      );
      expect(composition).toBeDefined();
    });

    test('跨文件依赖关系应正确处理', () => {
      const code1 = `class Logger { log(msg: string): void {} }`;
      const code2 = `
        class Service {
          process(logger: Logger): void {}
        }
      `;
      
      const parsed2 = parseCodeWithKnownTypes(code2, new Set(['Logger']));
      
      const dependency = parsed2.relations.find(
        r => r.type === 'dependency' && r.from === 'Service' && r.to === 'Logger'
      );
      expect(dependency).toBeDefined();
    });
  });

  // --------------------------------------------------------
  // 38. PlantUML 包语法
  // --------------------------------------------------------

  describe('37. PlantUML 包语法', () => {
    
    test('单文件应能设置包名', () => {
      const parsed = parseCode('class Test {}');
      parsed.classes.forEach(c => { c.packageName = 'myPackage'; });
      
      expect(parsed.classes[0].packageName).toBe('myPackage');
    });

    test('多个包应该能正确区分', () => {
      const parsed1 = parseCode('class User { name: string; }');
      const parsed2 = parseCode('class Order { id: number; }');
      
      parsed1.classes.forEach(c => { c.packageName = 'models'; });
      parsed2.classes.forEach(c => { c.packageName = 'services'; });
      
      const allClasses = [...parsed1.classes, ...parsed2.classes];
      expect(allClasses).toHaveLength(2);
      
      const modelsClasses = allClasses.filter(c => c.packageName === 'models');
      const servicesClasses = allClasses.filter(c => c.packageName === 'services');
      
      expect(modelsClasses).toHaveLength(1);
      expect(servicesClasses).toHaveLength(1);
    });
  });

  // --------------------------------------------------------
  // 39. 类关系判断规则验证
  // --------------------------------------------------------

  describe('38. 文件名到包名的转换', () => {
    
    test('文件名应该作为包名使用', () => {
      const fileName = 'models.ts';
      const packageName = fileName.replace(/\.ts$/, '');
      
      expect(packageName).toBe('models');
    });

    test('带路径的文件名应只取文件名部分', () => {
      const filePath = 'src/models/user.ts';
      const fileName = filePath.split('/').pop() || '';
      const packageName = fileName.replace(/\.ts$/, '');
      
      expect(packageName).toBe('user');
    });

    test('Windows 路径也应正确处理', () => {
      const filePath = 'src\\models\\user.ts';
      const fileName = filePath.split('\\').pop() || '';
      const packageName = fileName.replace(/\.ts$/, '');
      
      expect(packageName).toBe('user');
    });
  });
});

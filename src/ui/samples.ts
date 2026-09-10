/** 默认示例代码（首次打开时加载） */

// 默认示例代码
export const DEFAULT_CODE = `// 领域模型与设计模式示例 - models.ts
// 覆盖：枚举、接口、继承/实现、组合/聚合/关联/依赖、构造函数参数属性、getter/setter

// 枚举：数字枚举 + 字符串枚举
enum Gender {
  MALE,
  FEMALE,
  UNKNOWN
}

enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  SHIPPED = "shipped",
  CANCELLED = "cancelled"
}

// 接口：可选的动物、可飞行的、可序列化的
interface Pet {
  name: string;
  owner?: Person;
  play(): void;
}

interface Flyable {
  fly(): void;
}

interface Serializable {
  serialize(): string;
}

// 抽象基类
abstract class Animal implements Serializable {
  private id: string;
  public name: string;
  protected age: number;
  private gender: Gender;
  // 组合关系：内部 new 创建
  private heart = new Heart();

  constructor(name: string, age: number, gender: Gender) {
    this.name = name;
    this.age = age;
    this.gender = gender;
  }

  abstract makeSound(): void;
  abstract serialize(): string;

  getAge(): number {
    return this.age;
  }
}

class Heart {
  public bpm: number = 72;
  beat(): void {}
}

// 继承 + 多接口实现
class Dog extends Animal implements Pet, Flyable {
  private breed: string;
  // 关联关系：普通引用类型
  public owner: Person;
  // 聚合关系：数组/集合
  private toys: Toy[] = [];

  constructor(name: string, age: number, gender: Gender, breed: string, owner: Person) {
    super(name, age, gender);
    this.breed = breed;
    this.owner = owner;
  }

  makeSound(): void { console.log("Woof!"); }
  serialize(): string { return JSON.stringify({ name: this.name, breed: this.breed }); }
  play(): void { console.log("playing fetch"); }
  // 依赖关系：方法参数与返回类型
  fetch(toy: Toy): Toy | null {
    return toy;
  }
}

class Bird extends Animal implements Pet {
  private wingSpan: number;

  constructor(name: string, age: number, gender: Gender, wingSpan: number) {
    super(name, age, gender);
    this.wingSpan = wingSpan;
  }

  makeSound(): void { console.log("Chirp!"); }
  serialize(): string { return this.name; }
  play(): void { console.log("hopping"); }
  fly(): void { console.log("flying"); }
}

class Cat extends Animal implements Pet {
  private indoor: boolean;

  constructor(name: string, age: number, gender: Gender, indoor: boolean) {
    super(name, age, gender);
    this.indoor = indoor;
  }

  makeSound(): void { console.log("Meow!"); }
  serialize(): string { return this.name; }
  play(): void { console.log("playing with string"); }
}

class Toy {
  public name: string;
  constructor(name: string) {
    this.name = name;
  }
}

// 人：getter/setter + 可选属性 + 聚合
class Person {
  public name: string;
  private email?: string;
  private pets: Pet[];

  constructor(name: string) {
    this.name = name;
    this.pets = [];
  }

  get id(): string {
    return this.name.toLowerCase();
  }

  set displayEmail(value: string) {
    this.email = value;
  }

  adopt(pet: Pet): void {
    this.pets.push(pet);
  }
}
`;

export const DEFAULT_CODE_2 = `// 服务层与数据访问 - services.ts
// 覆盖：跨文件依赖/关联、构造函数参数属性、可选返回、泛型剥壳

class UserService {
  // 关联：字段引用
  private database: Database;
  private logger: Logger;

  // 构造函数参数属性：public/private/readonly 自动成为字段
  constructor(private repo: UserRepository, db: Database, logger: Logger) {
    this.database = db;
    this.logger = logger;
  }

  findUser(id: string): User | null {
    return this.repo.findById(id);
  }

  listUsers(): Promise<User[]> {
    return this.repo.list();
  }

  createUser(data: UserData): User {
    return {} as User;
  }

  // 依赖：参数 + 返回值
  deleteUser(deleter: UserDeleter, id: string): boolean {
    return deleter.delete(id);
  }
}

interface UserRepository {
  findById(id: string): User | null;
  list(): Promise<User[]>;
}

interface UserDeleter {
  delete(id: string): boolean;
}

class Database {
  private connectionString: string;

  constructor(connStr: string) {
    this.connectionString = connStr;
  }

  query(sql: string): any[] {
    return [];
  }
}

class Logger {
  private level: string = "info";
  log(message: string): void {}
  error(message: string): void {}
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserData {
  name: string;
  email: string;
}
`;

export const DEFAULT_CODE_3 = `// 第三方库与工具 - utils.ts
// 覆盖：工具类型剥壳（Partial/Required/Record/Map/Set）、单例模式、静态成员、抽象静态

// 泛型仓库：泛型参数 + Map 值类型关联
class Repository<T> {
  protected items: Map<string, T> = new Map();
  private cache: Map<number, CacheEntry<T>> = new Map();

  put(key: string, value: T): void {
    this.items.set(key, value);
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }

  list(): T[] {
    return Array.from(this.items.values());
  }
}

class CacheEntry<V> {
  public value: V;
  public timestamp: number;
  constructor(value: V) {
    this.value = value;
    this.timestamp = Date.now();
  }
}

// 单例模式 + 静态成员
class Config {
  private static instance: Config;
  public static readonly VERSION: string = "1.0.0";
  private constructor(public data: Record<string, Partial<User>>) {}

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config({});
    }
    return Config.instance;
  }

  get(key: string): Partial<User> | undefined {
    return this.data[key];
  }
}

// 工具类型剥壳
class UserStore {
  private users: Required<Record<string, User>> = {} as any;
  private partials: Partial<User>[] = [];
  private ids: Set<string> = new Set();

  save(user: User): void {
    this.ids.add(user.id);
    this.partials.push(user);
  }
}
`;


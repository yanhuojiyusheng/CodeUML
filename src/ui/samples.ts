/** 默认示例代码（首次打开时加载） */
//
// 示例是一个多文件夹的小项目，用来覆盖解析器的全部能力：
//   - 文件夹分组：src/domain、src/infra、src/service、src/config
//   - 跨包（跨文件）关系：继承、实现、关联、聚合、组合、依赖
//   - 类/接口/抽象类/枚举、泛型、静态成员、getter/setter、
//     构造函数参数属性、可选属性、只读属性、工具类型
// 每个文件的注释会标注它负责覆盖的点，方便对照类图检查。

export interface SampleFile {
  folder: string;
  name: string;
  content: string;
}

const PERSON = `// src/domain/person.ts
// 覆盖：字符串枚举、接口、抽象类 implements 接口、构造函数参数属性、getter、抽象方法

export enum UserRole {
  ADMIN = "admin",
  MEMBER = "member",
  GUEST = "guest",
}

export interface Identifiable {
  readonly id: string;
  equalTo(other: Identifiable): boolean;
}

export abstract class Person implements Identifiable {
  protected constructor(
    public readonly id: string,
    public name: string,
    protected role: UserRole,
  ) {}

  abstract greet(): string;

  get isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  equalTo(other: Identifiable): boolean {
    return this.id === other.id;
  }
}

export class Address {
  constructor(
    public street: string,
    public city: string,
    public zip: string,
  ) {}
}
`;

const USER = `// src/domain/user.ts
// 覆盖：跨文件继承（Person）、接口实现（Contact）、跨文件聚合（Address）、
//       组合（Preferences, new 创建）、可选属性

import { Address, Person, UserRole } from './person';

export interface Contact {
  email: string;
  phone?: string;
}

export class Preferences {
  public theme: string = "light";
  public locale: string = "zh-CN";
}

export class User extends Person implements Contact {
  public email: string;
  public phone?: string;
  // 聚合：来自 person.ts 的 Address（一对多）
  private addresses: Address[] = [];
  // 组合：内部 new 创建
  private preferences = new Preferences();

  constructor(id: string, name: string, role: UserRole, email: string) {
    super(id, name, role);
    this.email = email;
  }

  greet(): string {
    return "Hi, " + this.name;
  }

  addAddress(address: Address): void {
    this.addresses.push(address);
  }
}
`;

const ORDER = `// src/domain/order.ts
// 覆盖：数字枚举、接口实现（Coupon -> Promotion）、跨文件关联（User）、
//       聚合（OrderLine / Promotion）、组合（ShippingInfo）、依赖（throw new OrderError）

import { User } from './user';

export enum OrderStatus {
  PENDING,
  PAID,
  SHIPPED,
  CANCELLED,
}

export interface Promotion {
  discount(total: number): number;
}

export class Coupon implements Promotion {
  constructor(public code: string, private amount: number) {}

  discount(total: number): number {
    return Math.max(0, total - this.amount);
  }
}

export class OrderLine {
  constructor(public product: string, public quantity: number, public price: number) {}

  get subtotal(): number {
    return this.quantity * this.price;
  }
}

export class ShippingInfo {
  public carrier: string = "SF";
  public trackingNo?: string;
}

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

export class Order {
  // 关联：跨文件引用 User（可选 -> 0..1）
  private customer?: User;
  // 聚合：一对多
  private lines: OrderLine[] = [];
  private promotions: Promotion[] = [];
  // 组合：内部 new 创建
  private shipping = new ShippingInfo();
  private status: OrderStatus = OrderStatus.PENDING;

  constructor(public readonly id: string, customer: User) {
    this.customer = customer;
  }

  get total(): number {
    return this.lines.reduce((sum, line) => sum + line.subtotal, 0);
  }

  submit(): OrderStatus {
    if (this.lines.length === 0) {
      // 依赖：方法体内 throw new
      throw new OrderError("empty order");
    }
    this.status = OrderStatus.PAID;
    return this.status;
  }

  applyPromotion(promotion: Promotion): void {
    this.promotions.push(promotion);
  }
}
`;

const LOGGER = `// src/infra/logger.ts
// 覆盖：数字枚举、静态只读/静态可变成员、带默认值的构造函数

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  ERROR = 2,
}

export class Logger {
  private static instances = 0;
  public static readonly DEFAULT_LEVEL: LogLevel = LogLevel.INFO;
  private level: LogLevel;

  constructor(level: LogLevel = Logger.DEFAULT_LEVEL) {
    this.level = level;
    Logger.instances++;
  }

  log(level: LogLevel, message: string): void {}

  error(message: string): void {
    this.log(LogLevel.ERROR, message);
  }
}
`;

const DATABASE = `// src/infra/database.ts
// 覆盖：普通类、泛型类（CacheEntry<V>）、构造函数参数属性

export class Database {
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  query(sql: string): any[] {
    return [];
  }

  execute(sql: string): number {
    return 0;
  }
}

export class CacheEntry<V> {
  public hits: number = 0;

  constructor(public value: V, public key: string) {}
}
`;

const REPOSITORY = `// src/infra/repository.ts
// 覆盖：泛型抽象类、跨文件组合（Database）、Map/CacheEntry 泛型脱壳、
//       抽象方法、泛型继承（InMemoryRepository<T> extends Repository<T>）

import { CacheEntry, Database } from './database';

export abstract class Repository<T> {
  protected items: Map<string, T> = new Map();
  // 组合：内部 new 创建（跨文件）
  private db = new Database("sqlite://memory");
  // 泛型聚合：CacheEntry<T>[] -> CacheEntry
  private cache: CacheEntry<T>[] = [];

  abstract findById(id: string): T | undefined;

  put(key: string, value: T): void {
    this.items.set(key, value);
  }

  list(): T[] {
    return Array.from(this.items.values());
  }
}

export class InMemoryRepository<T> extends Repository<T> {
  findById(id: string): T | undefined {
    return this.items.get(id);
  }
}
`;

const USER_SERVICE = `// src/service/user-service.ts
// 覆盖：跨文件接口继承（UserRepository extends Repository<User>）、
//       构造函数参数属性关联（UserRepository / Logger）、跨文件依赖（User）

import { User } from '../domain/user';
import { LogLevel, Logger } from '../infra/logger';
import { InMemoryRepository, Repository } from '../infra/repository';

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): User | null;
}

// 跨包继承 InMemoryRepository<User> + 本包接口实现 UserRepository
export class MemoryUserRepository extends InMemoryRepository<User> implements UserRepository {
  findByEmail(email: string): User | null {
    return this.list().find(user => user.email === email) || null;
  }
}

export class UserService {
  constructor(
    private repository: UserRepository,
    private logger: Logger,
  ) {}

  find(id: string): User | undefined {
    return this.repository.findById(id);
  }

  register(user: User): void {
    this.repository.put(user.id, user);
    this.logger.log(LogLevel.INFO, "registered " + user.name);
  }
}
`;

const ORDER_SERVICE = `// src/service/order-service.ts
// 覆盖：跨包关联（Repository / UserService / Logger）、跨文件依赖（Order / Promotion）

import { Order, Promotion } from '../domain/order';
import { LogLevel, Logger } from '../infra/logger';
import { Repository } from '../infra/repository';
import { UserService } from './user-service';

export class OrderService {
  constructor(
    private orders: Repository<Order>,
    private users: UserService,
    private logger: Logger,
  ) {}

  // 依赖：方法参数类型（Order / Promotion 都不在本类字段里）
  checkout(order: Order, promotion: Promotion): number {
    this.logger.log(LogLevel.INFO, "checkout " + order.id);
    return promotion.discount(order.total);
  }

  countOrdersFor(userId: string): number {
    const user = this.users.find(userId);
    return user ? this.orders.list().length : 0;
  }
}
`;

const APP_CONFIG = `// src/config/app-config.ts
// 覆盖：单例（private 构造函数 + static 实例）、静态只读、getter、
//       工具类型脱壳（Partial/Record）、跨文件关联（LogLevel）

import { LogLevel } from '../infra/logger';

export interface AppSettings {
  theme: string;
  logLevel: LogLevel;
  features?: Partial<Record<string, boolean>>;
}

export class Config {
  private static instance: Config | undefined;
  public static readonly VERSION: string = "1.0.0";

  private constructor(public readonly settings: AppSettings) {}

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config({ theme: "light", logLevel: LogLevel.INFO });
    }
    return Config.instance;
  }

  get logLevel(): LogLevel {
    return this.settings.logLevel;
  }
}
`;

/** 首次打开时加载的示例文件（包名 = folder + / + name） */
export const DEFAULT_FILES: SampleFile[] = [
  { folder: 'src/domain', name: 'person.ts', content: PERSON },
  { folder: 'src/domain', name: 'user.ts', content: USER },
  { folder: 'src/domain', name: 'order.ts', content: ORDER },
  { folder: 'src/infra', name: 'logger.ts', content: LOGGER },
  { folder: 'src/infra', name: 'database.ts', content: DATABASE },
  { folder: 'src/infra', name: 'repository.ts', content: REPOSITORY },
  { folder: 'src/service', name: 'user-service.ts', content: USER_SERVICE },
  { folder: 'src/service', name: 'order-service.ts', content: ORDER_SERVICE },
  { folder: 'src/config', name: 'app-config.ts', content: APP_CONFIG },
];

# CodeUML

**把 TypeScript 源码直接生成 UML 类图 —— 在浏览器里完成，代码不上传、不联网也能用。**

[English](README.md) | **简体中文**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![运行时依赖: 0](https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E6%97%B6%E4%BE%9D%E8%B5%96-0-brightgreen.svg)](#技术栈)
[![可离线使用](https://img.shields.io/badge/%E7%A6%BB%E7%BA%BF-%E5%8F%AF%E7%94%A8-brightgreen.svg)](#常见问题)

![CodeUML 截图](docs/screenshot.png)

CodeUML 读取真实的 **TypeScript / TSX** 源码，画出 **UML 类图**：类、接口、抽象类、枚举、泛型、
`{readonly}` / `{static}` / `{abstract}` 成员，以及六种 UML 关系。拖入一个文件夹（整个 **monorepo** 也行）
就会按文件夹分组成包，并用 TypeScript 编译器自身的模块解析把跨包引用定位到正确的类，最后可导出
**Draw.io XML**、**SVG** 或 **PlantUML**。

> 关键词：TypeScript 类图 · UML 类图生成器 · 代码生成类图 · 代码可视化 · 类图在线生成 ·
> PlantUML 导出 · drawio 导出 · monorepo 多包项目 · 离线运行 · 自托管 · 开源

## 为什么做这个

现成的方案通常要你自己**手写**图形描述：

| | CodeUML | Mermaid / PlantUML | IDE 插件 |
|---|---|---|---|
| **输入** | 你真实的 `.ts` / `.tsx` 文件 | 自己手写的图形源码 | 取决于插件 |
| **跨文件引用** | ✅ 由 TypeScript 编译器解析（import、再导出、`tsconfig` 的 `paths`、workspace 包名） | ❌ 需要你手动连 | ⚠️ 参差不齐 |
| **运行位置** | 浏览器里，代码不离开本机 | 浏览器 / 服务端 / 插件 | IDE 内部 |
| **导出** | Draw.io XML、SVG、PlantUML | SVG / PNG 等 | 多数只能截图 |

典型用途：接手陌生代码库时快速摸清结构、评审 PR 的结构性影响、写设计文档、
检查包与包之间是不是依赖错了方向。

## 快速开始

```bash
git clone https://github.com/yanhuojiyusheng/CodeUML.git
cd CodeUML
npm install
npm start          # 构建 + 启动服务 + 打开 http://localhost:3000
```

需要 **Node.js 18+**。换端口用 `PORT=8080 npm start`；打印每条请求用 `npm start -- --debug`。

## 功能

- 🔄 **实时解析** —— 边写边更新（去抖 + 按文件缓存）
- 📊 **类 / 接口 / 抽象类 / 枚举** —— 支持泛型（`Repository<T>`）、`{static}` / `{abstract}` /
  `{readonly}` 标记，类上的装饰器会渲染成 `«stereotype»`
- 🔗 **六种 UML 关系全覆盖** —— 继承、实现、关联、聚合、组合、依赖，并带多重性
- 🗂️ **文件夹 / 包** —— 拖入文件夹递归读取 `.ts` / `.tsx`，也可手动新建文件夹；
  包名 = 文件夹路径 + 文件名
- 🌐 **跨包解析** —— `import`、barrel 再导出（`export *`）、重命名导入、`import * as NS`、
  `tsconfig` 的 `paths` 别名、来自 `package.json` 的 workspace 包名
- 🧩 **多个包里同名类** —— 不会丢：两个类都画出来并带上包名区分，引用按 import 精确定位，
  真正无法判定的会在提示条里报出来（绝不静默乱猜）
- 👁 **可见性** —— 用 👁 开关隐藏某个文件或文件夹，它会同时从类图、Draw.io XML、PlantUML 中排除
- 🔍 **缩放、平移、高亮、关系强弱模式**
- 📥 **导出** Draw.io XML、SVG、PlantUML
- ⚪ 白色主题、**零运行时依赖**、完全**可离线**使用

## 使用

1. 在左侧编辑区粘贴 TypeScript 代码，或把 `.ts` / `.tsx` 文件 / 整个文件夹拖进去。
2. 右侧实时显示 UML 类图。
3. 切换标签：**图表 / Draw.io XML / PlantUML**（后两者按需生成，切到那一页才算）。

### 文件栏

- **拖入文件夹**：递归读取其中的 `.ts` / `.tsx`，相对路径作为文件夹（包名 = 文件夹路径 + 文件名）。
- **跳过规则**：名为 `dist` 和 `node_modules` 的目录**整个跳过**（不读取、不显示）。
  `package.json` 与 `tsconfig*.json` 只作为**解析元数据**读取，不会作为文件出现在图里。
- **文件夹**：选中文件夹后点 `+ 文件夹` 新建子文件夹；双击重命名；`×` 删除（连同其下所有文件）。
- **批量加载**：分批读取、导入结束只解析一次，所以大文件夹是"边读边出现"，不会反复重解析整包。
- **跨包同名类**：两个类都会画出来，标题带上包名区分（如 `Config (src/api/config.ts)`）。
  引用由 TypeScript 自身的模块解析定位，所以 `import { Config } from './config'` 会精确连到对应的类；
  没有 import 可用时，歧义引用会连到全部候选，提示条会明确告诉你是哪个文件、有哪些候选。
- 顶部的 `⊟` 按钮可一键**折叠 / 展开所有文件夹**。
- **可见性**：点击文件或文件夹右侧的 👁 图标可将其从解析中排除。
  点击文件夹的 👁 会把同一状态一次性写给其下所有子文件夹与文件；单独切换文件或文件夹互不影响，
  也不会改变上层文件夹或顶部按钮的状态。顶部 `👁` 按钮只是纯粹的“全部隐藏 / 全部显示”。

### 图表操作

| 操作 | 方式 |
|------|------|
| 缩放 | Ctrl/⌘ + 滚轮，或 `−` / `+` / `重置` |
| 平移 | 按住鼠标中键拖动 |
| 高亮类 | 单击该类 |
| 高亮关系 | 单击线附近，或双击把该线固定高亮 |
| 关系强弱 | `关系: 全部 / 较强 / 最强` |

## 常见问题

**怎么从 TypeScript 项目生成 UML 类图？**
把代码粘进去，或直接把文件夹拖进来（推荐拖**仓库根目录**，这样 `package.json` / `tsconfig.json`
会被一起读到，跨包解析才准确）。不需要构建步骤，也不需要 IDE 插件。

**代码会被上传到某个服务吗？**
不会。TypeScript 编译器、解析器、布局与 SVG 渲染全部在浏览器里跑，
自带的 `server.js` 只负责发静态文件。

**能处理有多个包的 monorepo 吗？**
可以。文件按文件夹路径成为"包"；`@scope/pkg` 这类 import 通过你拖入的 `package.json` 的
`name` 字段解析；每份 `tsconfig.json` 的 `paths` 只对它目录下最近的文件生效。

**出现两个同名类时画哪一个？**
两个都画。各自带包名限定标题（如 `Config (src/b.ts)`）和唯一的 PlantUML 别名。
引用优先按该文件自己的 `import` 定位；若仍无法判定，就连到全部候选并在提示条里报告。

**支持 `.tsx` / JSX 吗？**
支持，会按扩展名选择对应的解析模式。`.d.ts` 与普通 `.ts` 一样处理。

**可以不起服务直接用吗？**
可以：`npm run build` 之后直接用浏览器打开 `index.html`。TypeScript 编译器已经打包进
`dist/typescript.min.js`，无需联网。

**能导出 PlantUML / Draw.io 吗？**
能，工具栏可导出 `.puml`、`.drawio` 和纯 SVG。**不支持 Mermaid**（Mermaid 是手写图形源码，见上面的对比表）。

**已知限制**
- 类型别名会被解析而不是画成独立节点；联合类型别名会展开为指向各成员的依赖关系。
- 泛型参数（`T`）不会产生关系，但继承/实现中的类型实参会产生（`Repository<User>` → 依赖 `User`）。
- 布局是确定性的，不支持手工摆放：类框不能拖动位置。

## 项目结构

```
CodeUML/
├── server.js               # 静态文件服务器（零依赖，启动后打开浏览器）
├── index.html              # 页面骨架（引入 styles/app.css、dist/typescript.min.js 与 dist/bundle.js）
├── styles/
│   └── app.css             # 页面样式
├── src/
│   ├── main.ts             # 入口：组装 core 能力与 ui 交互，启动应用
│   │
│   ├── core/               # 纯逻辑层（零 DOM，可独立测试）
│   │   ├── types.ts        # 核心类型定义
│   │   ├── utils.ts        # 转义 / 文本宽度 / 几何 / 路径工具
│   │   ├── members.ts      # 成员筛选（布局与渲染共用）
│   │   ├── parser.ts       # 语法解析：声明、成员、关系
│   │   ├── resolver.ts     # 语义解析：TypeScript Program + 模块解析
│   │   ├── merge.ts        # 多文件合并：身份、端点、诊断
│   │   ├── layout.ts       # 布局引擎
│   │   ├── relations.ts    # 关系强弱分级与显示模式
│   │   ├── svg.ts          # SVG 渲染器
│   │   ├── drawio.ts       # Draw.io XML 导出器
│   │   └── plantuml.ts     # PlantUML 文本生成
│   │
│   └── ui/                 # DOM 交互层
│       ├── dom.ts          # 元素获取 / HTML 转义
│       ├── samples.ts      # 默认示例项目
│       ├── highlight.ts    # 类图高亮 + 命中测试
│       ├── tabs.ts         # 文件标签与文件夹
│       ├── panes.ts        # 分栏拖拽
│       ├── actions.ts      # 导出动作
│       ├── scheduler.ts    # 去抖 / 可挂起的更新调度
│       ├── warnings.ts     # 诊断提示条
│       └── zoom.ts         # 缩放与平移
│
├── tests/                  # Jest 测试（单元 + PlantUML 语法自检）
└── dist/                   # 构建输出（bundle.js + 本地化的 typescript.min.js）
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `core/parser.ts` | 语法解析：提取类 / 接口 / 枚举 / 成员 / 关系 |
| `core/resolver.ts` | 语义解析：用内存版 TypeScript `Program` 把每个类型名定位到声明它的包 |
| `core/merge.ts` | 多文件合并：按包唯一化类身份、解析关系端点、产出诊断 |
| `core/layout.ts` | 定位类框，并挑选接近正方形的包排布 |
| `core/svg.ts` | 将布局渲染成 SVG（类框与关系箭头） |
| `core/drawio.ts` | 生成 Draw.io 兼容的 mxfile XML |
| `core/plantuml.ts` | 生成 PlantUML 文本 |
| `core/members.ts` | 成员筛选规则（布局算高度与渲染画内容共用） |
| `ui/*` | DOM 事件、文件栏、分栏、导出等交互 |
| `main.ts` | 组装与启动 |

### 开发命令

```bash
npm run dev            # 监听构建
npm run build          # 打包到 dist/bundle.js + 本地化 TypeScript 编译器
npm test               # 运行测试（默认不收集覆盖率）
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run typecheck      # 类型检查
node server.js --check # 服务器自检
```

## 支持的 UML 关系

| 关系 | 判定依据 | 箭头样式 |
|------|---------|---------|
| 继承 | `extends` | 实线 + 空心三角 ▷ |
| 实现 | `implements` | 虚线 + 空心三角 ▷ |
| 关联 | 普通属性引用 | 实线 + 实心三角 ▶ |
| 聚合 | 数组 / 集合属性（`T[]`、`Array<T>`、`Set<T>` 等） | 实线 + 空心菱形 ◇ |
| 组合 | 用 `new` 初始化的属性 | 实线 + 实心菱形 ◆ |
| 依赖 | 方法参数 / 返回值 / 方法体内的 `new` | 虚线 + 开放箭头 → |

多重性：数组/集合为 `*`，可选或可空类型为 `0..1`，其余为 `1`。
当别名展开成联合类型（`type Entry = A | B`）时，成员会成为**依赖**而不是"持有"关系 ——
别名不是图上的盒子。

## 支持的语言

- TypeScript / JavaScript（当前）
- 更多语言 planned

## 技术栈

- **TypeScript Compiler API** — 语法解析 + 语义符号解析
- **SVG** — 图表渲染
- **esbuild** — 构建打包
- **Node 内置 `http`** — 静态文件服务器（无运行时依赖）
- **Jest** — 测试
- 纯前端，无需后端服务

## License

MIT

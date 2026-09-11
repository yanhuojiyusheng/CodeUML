# CodeUML

把 TypeScript 源码转换成 UML 类图，直接在浏览器里可视化。

[English](README.md) | **简体中文**

## 功能

- 🔄 **实时解析** —— 边写边更新类图
- 📊 支持**类、接口、抽象类、枚举**
- 🔗 自动检测**继承、实现、关联、聚合、组合、依赖**关系
- 🗂️ **多文件项目** —— 拖入文件夹即可，文件按包分组（包名 = 文件夹路径 + 文件名）
- 🔍 **缩放与平移** —— Ctrl/⌘ + 滚轮或工具栏按钮，按住鼠标中键拖动平移
- 🎯 **高亮** —— 单击类高亮其所有关系，双击关系高亮该线及两端
- 🎚️ **关系强弱模式** —— 显示全部，或只显示较强的关系
- 📥 **导出** Draw.io XML、SVG、PlantUML
- ⚪ 默认白色主题
- 🚀 **零依赖**静态文件服务器（Node 内置 `http`）

## 开始使用

### 环境要求

- Node.js 18+

### 安装

```bash
git clone https://github.com/yanhuojiyusheng/CodeUML.git
cd CodeUML
npm install
```

### 以网页服务启动

```bash
npm start          # 构建 + 启动服务器 + 自动打开浏览器
```

默认地址 `http://localhost:3000`（可用 `PORT` 环境变量修改）。

```bash
PORT=8080 npm start
npm start -- --debug   # 打印每条 HTTP 请求
```

### 不用服务器

```bash
npm run build      # 打包到 dist/bundle.js + dist/typescript.min.js
# 然后直接用浏览器打开 index.html
```

> TypeScript 编译器由 `npm run build` 打包到本地 `dist/typescript.min.js`，无需联网。

## 使用

1. 在左侧编辑区粘贴 TypeScript 代码（或拖入 `.ts` / `.tsx` 文件）。
2. 右侧实时显示 UML 类图。
3. 切换标签：**图表 / Draw.io XML / PlantUML**。

### 文件栏

- **拖入文件夹**：递归读取其中的 `.ts` / `.tsx`，相对路径作为文件夹（包名 = 文件夹路径 + 文件名）。
- **跳过规则**：名为 `dist` 和 `node_modules` 的目录**整个跳过**（不读取、不显示）。
- **文件夹**：选中文件夹后点 `+ 文件夹` 新建子文件夹；双击重命名；`×` 删除（连同其下所有文件）。
- **批量加载**采用分批读取 + 解析去抖，边读边显示，页面不会卡住。
- 顶部的 `⊟` 按钮可一键**折叠 / 展开所有文件夹**。

### 图表操作

| 操作 | 方式 |
|------|------|
| 缩放 | Ctrl/⌘ + 滚轮，或 `−` / `+` / `重置` |
| 平移 | 按住鼠标中键拖动 |
| 高亮类 | 单击该类 |
| 高亮关系 | 双击该连线 |
| 关系强弱 | `关系: 全部 / 较强 / 最强` |

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
│   │   ├── utils.ts        # 转义 / 文本宽度 / LAYOUT 常量
│   │   ├── members.ts      # 成员筛选（布局与渲染共用）
│   │   ├── parser.ts       # 代码解析器
│   │   ├── layout.ts       # 布局引擎
│   │   ├── merge.ts        # 多文件合并 / 跨文件类型感知
│   │   ├── relations.ts    # 关系强弱分级与显示模式
│   │   ├── svg.ts          # SVG 渲染器
│   │   ├── drawio.ts       # Draw.io XML 导出器
│   │   └── plantuml.ts     # PlantUML 文本生成
│   │
│   └── ui/                 # DOM 交互层
│       ├── dom.ts          # 元素获取 / HTML 转义
│       ├── samples.ts      # 默认示例代码
│       ├── highlight.ts    # 类图高亮
│       ├── tabs.ts         # 文件标签与文件夹
│       ├── panes.ts        # 分栏拖拽
│       ├── actions.ts      # 导出动作
│       └── zoom.ts         # 缩放与平移
│
├── tests/                  # 测试
└── dist/                   # 构建输出（bundle.js + 本地化的 typescript.min.js）
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `core/parser.ts` | 解析代码，提取类 / 接口 / 关系 |
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
npm run build          # 打包到 dist/bundle.js + dist/typescript.min.js
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

## 支持的语言

- TypeScript / JavaScript（当前）
- 更多语言 planned

## 技术栈

- **TypeScript Compiler API** — 代码解析
- **SVG** — 图表渲染
- **esbuild** — 构建打包
- **Node 内置 `http`** — 静态文件服务器
- **Jest** — 测试
- 纯前端，无需后端服务

## License

MIT

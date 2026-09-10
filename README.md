# CodeUML

代码转 UML 类图可视化工具

## 功能

- 🔄 实时解析代码生成 UML 类图
- 📊 支持类、接口、抽象类、枚举
- 🔗 自动检测继承、实现、关联、聚合、组合、依赖关系
- 📥 导出 Draw.io XML 格式
- 📥 导出 SVG 图片
- 📝 生成 PlantUML 语法

## 使用方法

### 安装

```bash
git clone https://github.com/your-username/codeuml.git
cd codeuml
npm install
```

### 开发

```bash
npm run dev    # 监听模式，自动编译
```

### 启动网页服务

```bash
npm start      # 构建并启动服务器，自动打开浏览器
```

默认地址 `http://localhost:3000`（可用 `PORT` 环境变量修改）。
零依赖，使用 Node 内置 `http` 提供静态文件服务。

### 使用

1. 左侧粘贴代码
2. 右侧实时显示 UML 类图
3. 点击标签切换：图表 / Draw.io XML / PlantUML

> 也可不用服务器，直接用浏览器打开 `index.html`（需先 `npm run build`）。

## 项目结构

```
codeuml/
├── server.js               # 静态文件服务器（零依赖，启动后打开浏览器）
├── index.html              # 页面骨架（引入 styles/app.css 与 dist/bundle.js）
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
│   │   ├── layout.ts       # 分层布局引擎
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
│       ├── tabs.ts         # 文件标签管理
│       ├── panes.ts        # 分栏拖拽
│       └── actions.ts      # 导出动作
│
├── tests/                  # 测试
└── dist/                   # 构建输出（bundle.js）
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `core/parser.ts` | 解析代码，提取类/接口/关系 |
| `core/layout.ts` | 分层布局算法，按继承关系组织类的位置 |
| `core/svg.ts` | 将布局结果渲染为 SVG，绘制类框和关系箭头 |
| `core/drawio.ts` | 生成 Draw.io 兼容的 mxfile XML 格式 |
| `core/plantuml.ts` | 生成 PlantUML 文本 |
| `core/members.ts` | 成员筛选规则（布局算高度与渲染画内容共用，保证一致） |
| `ui/*` | DOM 事件绑定、文件标签、分栏、导出等交互 |
| `main.ts` | 组装与启动 |

### 开发命令

```bash
npm run dev            # 监听构建
npm run build          # 打包到 dist/bundle.js
npm test               # 运行测试（默认不收集覆盖率）
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run typecheck      # 类型检查
```

## 支持的 UML 关系

| 关系 | 语法 | 箭头样式 |
|------|------|---------|
| 继承 | `extends` | 实线 + 空心三角 ▷ |
| 实现 | `implements` | 虚线 + 空心三角 ▷ |
| 关联 | 属性引用 | 实线 + 实心三角 ▶ |
| 聚合 | 构造函数参数 | 实线 + 空心菱形 ◇ |
| 组合 | `new` 初始化 | 实线 + 实心菱形 ◆ |
| 依赖 | 仅函数参数 | 虚线 + 开放箭头 → |

## 支持的语言

- TypeScript / JavaScript (当前)
- 更多语言 planned...

## 技术栈

- TypeScript Compiler API — 代码解析
- SVG — 图表渲染
- esbuild — 构建打包
- 纯前端，无需后端服务

## License

MIT
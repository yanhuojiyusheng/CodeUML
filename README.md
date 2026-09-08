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

### 构建

```bash
npm run build  # 编译到 dist/bundle.js
```

### 使用

直接在浏览器中打开 `index.html` 即可使用。

1. 左侧粘贴代码
2. 右侧实时显示 UML 类图
3. 点击标签切换：图表 / Draw.io XML / 解析结果

## 项目结构

```
codeuml/
├── index.html              # 入口页面
├── package.json            # 依赖配置
├── tsconfig.json           # TypeScript 配置
├── .gitignore
│
├── src/                    # 源代码
│   ├── types.ts            # 类型定义
│   ├── parser.ts           # 代码解析器
│   ├── layout.ts           # 分层布局引擎
│   ├── renderer.ts         # SVG 渲染器
│   ├── exporter.ts         # Draw.io XML 导出器
│   └── main.ts             # 主入口
│
└── dist/                   # 构建输出
    └── bundle.js           # 打包后的 JS
```

### 核心模块

| 模块 | 职责 |
|------|------|
| `types.ts` | 定义 ClassInfo、Relation、Box、Line 等核心类型 |
| `parser.ts` | 解析代码，提取类/接口/关系 |
| `layout.ts` | 分层布局算法，按继承关系组织类的位置 |
| `renderer.ts` | 将布局结果渲染为 SVG，绘制类框和关系箭头 |
| `exporter.ts` | 生成 Draw.io 兼容的 mxfile XML 格式 |
| `main.ts` | 事件绑定、视图切换、导出功能 |

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
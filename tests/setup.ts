/**
 * Jest 全局初始化：把 TypeScript 编译器挂到全局 `ts`。
 * 生产代码（src/core/parser.ts）通过全局 `ts` 使用 TS Compiler API，
 * 浏览器端由 index.html 引入 dist/typescript.min.js 提供，测试端在此注入。
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).ts = require('typescript');

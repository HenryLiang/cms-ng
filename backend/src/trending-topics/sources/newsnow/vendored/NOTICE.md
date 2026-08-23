# Vendored sources from newsnow

本目录的抓取器移植自 [ourongxing/newsnow](https://github.com/ourongxing/newsnow)
(`server/sources/`,v0.0.41,2026-06-30),按 MIT License 引入:

> MIT License
>
> Copyright (c) ourongxing
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## 与上游的差异(统一约定)

- 上游通过 `unimport` 注入的全局(`defineSource`/`myFetch`/`parseRelativeDate` 等)
  替换为显式 import;`defineSource` 是恒等函数,直接去掉。
- 上游 `export default defineSource({...})` 的 Record 形状拆为多个具名 getter。
- HTTP 层统一走 `../newsnow-http.client.ts`(超时 10s、重试 1 次、按域名挂
  undici ProxyAgent),替代上游 `myFetch`(重试 3 次、无代理)。
- 日期解析用本地 `../newsnow-date.util.ts`(仅覆盖实际用到的模式,上海时区),
  不引入 dayjs。
- 各文件头的「偏差」注释列出该文件的具体改动。

## 同步上游

上游已宣布停止接受贡献(新版本重写中),本目录视为稳定快照;若上游有反爬
修复,按文件 diff 手工同步,保持上述约定。

## 已移除的上游源

- `fastbull.ts`(法布财经快讯/要闻):目标站已改为纯客户端渲染,HTML 不再
  含列表数据,上游抓取器实际已失效(2026-08-23 冒烟确认),故未纳入注册表。

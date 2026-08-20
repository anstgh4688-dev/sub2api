# 用户生图小页面实现说明

## 目标

在用户后台增加一个简单的“图像生成”页面，界面参考 Cherry Studio 的绘画输入方式，但完全沿用 Sub2API 现有后台风格。

页面只做一件事：用户选择自己的 Sub2API Key 和图片模型，输入提示词，生成图片并下载。

## 功能范围

必须实现：

- 支持 GPT Image、Gemini Image、Grok Image。
- Key 只能从当前登录用户已有的 Key 列表中选择。
- 不提供手工输入 Key、上游 Key 或 Base URL 的输入框。
- 支持选择模型、输入提示词、少量模型参数、生成、取消和下载。
- 图片和页面状态只保留在浏览器内存中。
- 刷新或离开页面后，提示词和图片全部消失。
- 页面风格与现有用户后台一致，支持亮色、暗色和移动端。

不做：

- 不保存生图历史、提示词或图片。
- 不新增数据库表、Redis 任务、对象存储或后端任务。
- 不做批量生图、异步任务、收藏、模板、图生图、图片编辑。
- 不改造现有 GPT、Gemini、Grok 网关。
- 不为这个页面抽取大型通用框架。

“不保存”指本页面不创建任何图片、提示词或历史数据。现有网关的计费、用量记录和安全审计保持原样，不能为了这个页面绕过。

## 页面布局

使用现有 `AppLayout`，新增用户路由：

```text
/image-generation
```

页面保持简单：

1. 顶部一行：Key 选择器、模型选择器。
2. 中间：图片预览区域；未生成时显示空状态，生成时显示 loading。
3. 底部：提示词输入框、参数按钮、生成按钮。
4. 生成成功后：图片右上角提供下载按钮。

移动端将 Key 和模型选择器改为上下排列，图片区域不得与输入区重叠。

参考 Cherry Studio 的只有“中央图片区域 + 底部提示词输入”这个交互结构，不复制它的历史栏、模板、复杂画布、源码或视觉资产。

## Key 规则

复用现有 `keysAPI.list()` 获取当前用户自己的 Key。

页面只展示：

- Key 状态为启用；
- 分组平台为 `openai`、`gemini` 或 `grok`；
- 分组允许图片生成。

没有可用 Key 时，显示空状态和“前往 API Key”按钮，跳转 `/keys`。

选中的 Key 只放在组件内存中，不写入 localStorage、sessionStorage、IndexedDB、URL、日志或持久化 store。

## 模型与请求

选中 Key 后，使用该 Key 调用现有 `/v1/models` 获取模型列表，并只显示图片模型：

- GPT：`gpt-image-*`
- Gemini：`gemini-*-image*`
- Grok：`grok-imagine*`

模型列表请求失败时直接显示错误，不设置隐藏的默认模型。

### GPT 和 Grok

调用现有同步接口：

```http
POST /v1/images/generations
Authorization: Bearer <用户选择的 Key>
```

请求 `response_format: "b64_json"`，前端读取 `data[].b64_json`。

### Gemini

直接调用现有 Gemini 原生接口，不新增后端 adapter：

```http
POST /v1beta/models/{model}:generateContent
x-goog-api-key: <用户选择的 Key>
```

请求体使用：

```json
{
  "contents": [
    {
      "parts": [{ "text": "用户提示词" }]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "1:1"
    }
  }
}
```

前端读取 `candidates[].content.parts[].inlineData` 或 `inline_data` 中的图片。

开发环境需要在 `frontend/vite.config.ts` 中为 `/v1beta` 增加与 `/v1` 相同的代理配置；生产环境继续使用同源网关。

## 参数

V1 只保留少量参数：

| 平台 | 参数 |
| --- | --- |
| GPT | 尺寸、质量、数量 |
| Gemini | 宽高比 |
| Grok | 宽高比、分辨率、数量 |

参数随平台切换，不支持的参数不要显示，也不要发送。不要加入负向提示词、种子、CFG、步数等高级设置。

## 前端实现

建议只新增：

```text
frontend/src/views/user/ImageGenerationView.vue
frontend/src/api/imageGeneration.ts
frontend/src/i18n/locales/zh/imageGeneration.ts
frontend/src/i18n/locales/en/imageGeneration.ts
```

修改：

```text
frontend/src/router/index.ts
frontend/src/components/layout/AppSidebar.vue
frontend/src/i18n/locales/zh/index.ts
frontend/src/i18n/locales/en/index.ts
frontend/vite.config.ts
```

优先直接复用现有 `Select`、`TextArea`、`PlatformIcon`、`EmptyState`、`LoadingSpinner`、`Icon` 和按钮样式。只有当 view 明显过长时才拆小组件，不要预先创建多层 `features`、provider framework 或状态管理。

API helper 可以在内部按 Key 的平台分成三个小函数，再统一返回：

```ts
interface GeneratedImage {
  base64: string
  mimeType: string
}
```

收到 Base64 后立即转为 `Blob` 和 object URL。替换图片或页面卸载时调用 `URL.revokeObjectURL()`，不要把 Base64 长期保存在响应式状态中。

使用 `AbortController` 实现取消。用户取消不弹错误；其他 HTTP 或解析错误必须正常展示，不能返回空数组伪装成功。

## 最小测试

只需要覆盖这个小页面的关键行为：

- API 测试：GPT/Grok 请求 `/v1/images/generations`，Gemini 请求 `/v1beta/...:generateContent`。
- API 测试：三种响应都能转换为统一图片结果。
- 页面测试：只显示当前用户可用的三类 Key。
- 页面测试：无 Key、生成中、成功、失败、取消状态。
- 页面测试：切换 Key 时清除旧模型、参数和图片。
- 页面测试：离开页面时 revoke object URL。
- 路由、侧栏和中英文文案可正常加载。

验证顺序：

```text
pnpm test:run -- <相关测试>
pnpm typecheck
pnpm lint:check
pnpm build
```

## 验收标准

- [ ] 用户侧有一个风格一致的“图像生成”页面。
- [ ] 用户不能输入任意 Key，只能选择自己的可用 Key。
- [ ] GPT、Gemini、Grok 都能生成并下载图片。
- [ ] 页面不调用异步或批量生图接口。
- [ ] 没有新增后端业务代码、数据库 migration、Redis 或对象存储。
- [ ] 刷新页面后不保留提示词、Key 选择和图片。
- [ ] localStorage、sessionStorage、IndexedDB 和日志中没有 Key、提示词或图片数据。
- [ ] 错误正常显示，取消正常生效，没有静默 fallback。
- [ ] 桌面端、移动端、亮色和暗色模式均无重叠或溢出。

## Agent 执行要求

实现前先检查 `git status`。当前工作区可能已有其他修改，不得回滚、覆盖或格式化无关文件。

严格按“小页面”范围实现。不要把任务升级成 Gemini 网关统一、计费重构、图片任务系统或完整 Cherry Studio 绘画模块。

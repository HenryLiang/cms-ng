# AI 智能资料搜集 — 提测说明

**功能版本**：`main` (基于 commit `59b599b`)  
**提测日期**：2026-05-16  
**测试范围**：前后端完整链路  

---

## 一、功能概述

为记者在选题阶段提供 AI 驱动的结构化背景资料搜集能力。系统调用 Kimi API，基于选题信息（标题、描述、角度、标签）自动生成四维度结构化资料包，帮助记者快速建立对选题的认知框架。

**核心价值**：
- 自动生成事件时间线，梳理关键节点
- 提取关键人物及其角色/背景
- 整理相关核心数据与统计
- 汇总各方观点与立场

---

## 二、实现范围

### 后端

| 文件 | 变更 |
|------|------|
| `backend/src/ai/ai.service.ts` | 新增 `generateResearchKit()` 方法，构建 Prompt 调用 Kimi API |
| `backend/src/ai/dto/writing-operations.dto.ts` | 新增 `ResearchKitInput`、`ResearchKitResult` 及相关子类型 |
| `backend/src/stories/stories.controller.ts` | 新增 `POST /stories/:id/research` 端点 |
| `backend/src/stories/stories.service.ts` | 新增 `generateResearchKit()` 方法，加载 story 信息后调用 AI |
| `backend/src/stories/stories.module.ts` | 导入 `AIModule` 以注入 `AIService` |
| `backend/src/stories/stories.service.spec.ts` | 补充 `AIService` mock，修复测试依赖 |

**API 详情**：
```
POST /stories/:id/research
Authorization: Bearer <jwt_token>
Body: {}  // 无请求体，从 story 记录提取信息

Response:
{
  "timeline": [
    { "date": "2024-01-15", "event": "事件描述", "source": "来源（可选）" }
  ],
  "people": [
    { "name": "姓名", "role": "角色", "background": "背景简介（可选）" }
  ],
  "data": [
    { "label": "数据标签", "value": "数据值", "source": "来源（可选）" }
  ],
  "opinions": [
    { "source": "观点来源", "viewpoint": "观点内容", "stance": "立场（可选）" }
  ]
}
```

### 前端

| 文件 | 变更 |
|------|------|
| `frontend/src/lib/story-api.ts` | 新增 `generateResearchKit()` API + `ResearchKitResult` 等类型 |
| `frontend/src/app/dashboard/stories/[id]/page.tsx` | 新增「AI 资料搜集」按钮 + 结果面板 UI（四 Tab 切换） |

**交互流程**：
1. 记者在选题详情页点击「AI 资料搜集」按钮
2. 按钮进入 loading 状态，下方展开结果面板
3. 结果以 Tab 形式展示四维度资料：
   - **事件时间线**：纵向时间轴，含日期、事件描述、来源
   - **关键人物**：卡片网格，含姓名、角色、背景
   - **核心数据**：标签-数值列表，含来源
   - **各方观点**：来源 badge + 立场 + 观点内容
4. 可点击 X 关闭结果面板，再次点击「重新生成」可重复调用

---

## 三、测试用例

### 3.1 功能测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| RK-01 | 正常选题生成资料包 | 返回 timeline/people/data/opinions 数组，数据有内容 |
| RK-02 | 选题无描述/角度/标签 | API 正常返回，基于标题生成基础资料 |
| RK-03 | 多次点击生成 | 每次独立调用，结果覆盖显示 |
| RK-04 | 切换四个 Tab | 内容正常切换，各维度数据正确展示 |
| RK-05 | 某维度无数据 | 显示「暂无xxx数据」空状态提示 |

### 3.2 权限测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| RK-AUTH-01 | 记者为自己的选题生成 | 200，正常返回 |
| RK-AUTH-02 | 编辑为指派给自己的选题生成 | 200，正常返回 |
| RK-AUTH-03 | ADMIN 为任意选题生成 | 200，正常返回 |
| RK-AUTH-04 | 未授权用户为他人选题生成 | 403 Forbidden |
| RK-AUTH-05 | 未登录用户调用 | 401 Unauthorized |

### 3.3 异常测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| RK-ERR-01 | Kimi API 超时/失败 | 返回空数组（四维度均为空），后端记录失败日志到 AIOperation 表 |
| RK-ERR-02 | 选题不存在 | 404 Not Found |

### 3.4 UI 测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| RK-UI-01 | 生成中状态 | 按钮显示「生成中...」+ spinner，面板内显示加载动画 |
| RK-UI-02 | 首次进入页面 | 面板默认收起，显示「生成资料包」按钮 |
| RK-UI-03 | 生成后关闭再打开 | 保留上次结果，按钮显示「重新生成」 |
| RK-UI-04 | 时间线展示 | 纵向时间轴样式，节点-连线-内容排列 |
| RK-UI-05 | 人物卡片展示 | 网格布局，姓名+角色+背景 |
| RK-UI-06 | 空数据状态 | 各维度显示对应空提示，不崩溃 |

---

## 四、环境要求

- **后端**：Kimi API Key 已配置（`KIMI_API_KEY`）
- **数据库**：AIOperation 表已存在（用于记录 AI 调用日志）
- **前端**：无特殊要求

---

## 五、已知限制

1. **离线分析**：基于 LLM 训练知识，不能实时联网抓取最新资料
2. **信息准确性**：AI 可能输出过时或错误信息，需记者二次核实，不可直接引用
3. **响应时间**：Kimi API 调用约 5-15 秒，超时时间为 60 秒
4. **Token 消耗**：Prompt 较长，单次调用约 2k-4k tokens
5. **中文限制**：所有输出为繁体中文，若选题涉及非中文领域，资料可能不完整

---

## 六、回归范围

- [ ] 选题详情页正常加载
- [ ] 选题 CRUD 操作不受影响
- [ ] 相关稿件列表正常显示
- [ ] AI 事实核查功能不受影响
- [ ] AI 初稿生成功能不受影响
- [ ] 其他 AI 快捷操作不受影响

---

**提测人**：Claude Code  
**分支**：`main`（未单独开分支，基于 `59b599b` 之后修改）

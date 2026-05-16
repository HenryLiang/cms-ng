# AI 事实核查 — 提测说明

**功能版本**：`feat/ai-fact-check` (commit `f36fa08`)  
**提测日期**：2026-05-16  
**测试范围**：前后端完整链路  

---

## 一、功能概述

为记者和编辑提供 AI 驱动的事实核查能力。系统调用 Kimi API 对稿件进行 5 维度分析，返回可信度评分、总体摘要和详细发现列表，帮助记者在发布前识别潜在问题。

**核心价值**：
- 自动标注稿件中的事实性陈述（人名、地名、时间、数据）
- 检查全文内部逻辑一致性
- 标出法律/隐私/表述风险
- 对有争议信息提出核实建议

---

## 二、实现范围

### 后端

| 文件 | 变更 |
|------|------|
| `backend/src/ai/ai.service.ts` | 新增 `factCheck()` 方法，构建 Prompt 调用 Kimi API |
| `backend/src/ai/dto/writing-operations.dto.ts` | 新增 `FactCheckInput`、`FactCheckResult`、`FactCheckFinding` 类型 |
| `backend/src/articles/articles.controller.ts` | 新增 `POST /articles/:id/ai-fact-check` 端点 |
| `backend/src/articles/articles.service.ts` | 新增 `aiFactCheck()` 方法，权限校验 + 调用 AI |
| `backend/src/articles/dto/ai-operations.dto.ts` | 新增 `FactCheckDto` |

**API 详情**：
```
POST /articles/:id/ai-fact-check
Authorization: Bearer <jwt_token>
Body: {}  // FactCheckDto，当前无必填字段

Response:
{
  "score": 85,           // 可信度评分 0-100
  "summary": "总体评估摘要",
  "findings": [
    {
      "type": "fact",     // fact | inconsistency | dispute | source_needed | risk
      "text": "原文片段",
      "message": "AI 提示信息",
      "severity": "info"   // info | warning | critical
    }
  ]
}
```

### 前端

| 文件 | 变更 |
|------|------|
| `frontend/src/lib/article-api.ts` | 新增 `aiFactCheck()` API + `FactCheckResult`/`FactCheckFinding` 类型 |
| `frontend/src/app/dashboard/articles/[id]/page.tsx` | 新增按钮 + 结果面板 UI |

**交互流程**：
1. 记者在编辑器右侧 Quick Actions 点击「AI 事实核查」
2. 按钮进入 loading 状态，调用 API
3. 结果在右侧面板展示：
   - 可信度评分（带颜色：≥80 绿色 / ≥50 琥珀色 / <50 红色）
   - 总体摘要
   - 发现列表（严重度 badge + 类型标签 + 原文片段 + AI 提示）
4. 可点击 X 关闭结果面板

---

## 三、测试用例

### 3.1 功能测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| FC-01 | 正常稿件事实核查 | 返回 score + summary + findings 数组，findings 包含各类 type |
| FC-02 | 含矛盾数据的稿件 | AI 识别 inconsistency，severity 为 warning/critical |
| FC-03 | 含敏感表述的稿件 | AI 识别 risk，severity 为 warning/critical |
| FC-04 | 空/极短稿件 | API 正常返回，score 可能较低，findings 可能为空 |
| FC-05 | 多次点击事实核查 | 每次独立调用，结果覆盖显示 |

### 3.2 权限测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| FC-AUTH-01 | 记者核查自己的稿件 | 200，正常返回结果 |
| FC-AUTH-02 | 编辑核查指派给自己的稿件 | 200，正常返回结果 |
| FC-AUTH-03 | 未授权用户核查他人稿件 | 403 Forbidden |

### 3.3 异常测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| FC-ERR-01 | Kimi API 超时/失败 | 前端 alert「事实核查失败，请稍后重试」，后端记录失败日志到 AIOperation 表 |
| FC-ERR-02 | 稿件不存在 | 404 Not Found |

### 3.4 UI 测试

| 用例 ID | 场景 | 预期结果 |
|---------|------|----------|
| FC-UI-01 | 评分 ≥80 | 分数显示为 emerald（绿色） |
| FC-UI-02 | 评分 50-79 | 分数显示为 amber（琥珀色） |
| FC-UI-03 | 评分 <50 | 分数显示为 red（红色） |
| FC-UI-04 | findings 为空 | 只显示 score 和 summary，不显示发现列表 |

---

## 四、环境要求

- **后端**：Kimi API Key 已配置（`KIMI_API_KEY`）
- **数据库**：AIOperation 表已存在（用于记录 AI 调用日志）
- **前端**：无特殊要求

---

## 五、已知限制

1. **离线分析**：基于 LLM 训练知识，不能实时联网验证具体事实
2. **正文字数限制**：仅分析正文前 3000 字符（去除 HTML 标签后）
3. **响应时间**：Kimi API 调用约 5-15 秒，超时时间为 45 秒
4. **Token 消耗**：事实核查 Prompt 较长，单次调用消耗约 2k-4k tokens

---

## 六、回归范围

- [ ] 文章编辑页面正常加载
- [ ] AI 对话助手不受影响
- [ ] AI 初稿生成功能不受影响
- [ ] 其他 AI 快捷操作（改写/扩写/精简/润色）不受影响

---

**提测人**：Claude Code  
**分支**：`main`（已合并 `feat/ai-fact-check`）

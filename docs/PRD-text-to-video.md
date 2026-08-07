# PRD:文生视频(Text-to-Video / 稿件一键成片)

> 状态:**方案待评审**(未开始编码)
> 日期:2026-08-07
> 前置讨论:借鉴 OpenMontage 的管道思想,不集成其代码(AGPLv3 与 BUSL-1.1 冲突),全部用 CMS-NG 自有技术栈原生实现

## 1. 背景与目标

新媒体机构的核心诉求之一:图文稿件快速视频化。参考 OpenMontage 的管道分层思想(脚本→分镜→素材→配音→字幕→合成),在 CMS-NG 中原生实现:

- **L1 文生视频片段**:prompt → 视频生成 API → 几秒片段入媒体库
- **L2 稿件一键成片**:文章 → 口播脚本 → 分镜 → 素材(视频片段/图片/媒体库已有素材)→ TTS 配音 → 字幕 → FFmpeg 合成 → 成片 mp4 入媒体库

L2 是差异化价值,L1 作为 L2 的素材来源之一先行落地。

### 已确认的约束(用户决策)

| 决策 | 结论 |
|---|---|
| 内容生成(文本/语音/图片/视频) | **全部走云端 AI 模型 API,不依赖任何本地模型能力** |
| 多媒体 provider(图/音/视频) | **首发两家:火山引擎(Ark)+ MiniMax**,双 provider 抽象 |
| 文本生产 | 维持现有 `ChatCompletionProvider` seam(deepseek/kimi/gemini/openai),不在本期扩展 |
| 最终合成(拼接+配音+字幕+音乐→mp4) | **本地 FFmpeg**(独立渲染 worker,纯 CPU,无 GPU,无 AI 模型,零许可成本) |
| **架构红线:解耦** | **底层能力共用,过程逻辑解耦**(见 §3.1) |

### 1.1 解耦原则(架构红线)

视频生成功能按"**共享底层、独立过程**"分层:

- **可以共用(底层能力)**:`ChatCompletionProvider` LLM seam、COS `StorageService`、`MediaAsset` 登记链路、计费(`TransactionType`)、`EventEmitter2`/cron 基础设施、鉴权
- **必须解耦(过程逻辑)**:
  - 视频管道有**自己的** `VideoGenerationJob` 任务表、状态机、step 契约、controller、scheduler——**不 import、不继承** auto-publish pipeline 的任何类(仅借鉴其模式),不改动文章状态机
  - 文章对视频管道只是**可选输入**(`articleId` 仅作溯源引用,外键可空;视频任务失败/进行中对文章工作流零影响)
  - 成片回写文章(插入正文/设为封面)走**现有文章 API** 的用户主动操作,不由视频管道反向驱动文章状态
  - auto-publish 不感知视频任务;视频任务不感知 auto-publish——两者未来若在"自动产出视频并发布"场景相遇,通过**事件/显式编排**连接,不在代码层互相调用
  - 视频模块整体可拔插:`VIDEO_GENERATION_ENABLED=false` 时系统行为与未安装该功能完全一致(现有文章/媒体/计费链路零改动) |

## 2. Provider 能力矩阵(2026-08 经官方文档核实)

### 火山引擎 Ark(base `https://ark.<region>.volces.com/api/v3`,Bearer `ARK_API_KEY`)

| 模态 | 模型/接口 | 形态 | 备注 |
|---|---|---|---|
| 图片 | Seedream(`doubao-seedream-5-0-260128`),`/images/generations` | 同步 | **CMS 已有 Seedream 集成**(`ai.service.ts` ~2090 行 `registerGeneratedImageAsset`),需确认现有 `SEEDREAM_API_BASE` 指向并复用 |
| 视频 | Seedance(`doubao-seedance-1-5-pro-251215` / `seedance-2-0-260128`) | **异步任务**:`create_content_generation_task` → 轮询 `get_content_generation_task` | 支持 T2V / I2V(首帧/首尾帧)/ R2V(参考视频);时长、分辨率、`--camera-fixed` 等参数 |
| 语音 | 豆包语音大模型 HTTP 非流式接口 | 同步 | ⚠️ **字级/句级时间戳支持待 PoC 验证**(见 §8) |

### MiniMax(base `https://api.minimax.io`,Bearer JWT;国内站 `api.minimaxi.com` 需 GroupId——部署区域决定用哪个,做成 env 配置)

| 模态 | 模型/接口 | 形态 | 备注 |
|---|---|---|---|
| 图片 | Image Generation(T2I / I2I) | 同步 | — |
| 视频 | `POST /v1/video_generation`(`MiniMax-Hailuo-2.3` / `Hailuo-02`,T2V;I2V 需 `first_frame_image`) | **异步任务**:`GET /v1/query/video_generation` → `file_id` → File Retrieve API 下载 | 6s/10s,768P/1080P;支持 `[Push in]` 等 15 种运镜指令;**下载 URL 仅 9 小时有效,必须立即转存 COS** |
| 语音 | `POST /v1/t2a_v2`(`speech-02-hd/turbo`、`speech-2.6/2.8`) | 同步(长文本走 T2A Async) | ✅ **`subtitle_enable:true` + `subtitle_type:"word"` 返回词级时间戳 JSON**(`subtitle_file` URL)——字幕方案的关键支撑;注意长文本异步版只支持句级时间戳 |

## 3. 总体架构

```
backend/src/video/                    # 自包含模块:不 import articles/auto-publish 的任何过程逻辑
├── video.module.ts
├── video-job.controller.ts           # POST /video/jobs、GET /video/jobs/:id(自有路由前缀 /video)
├── video-job.service.ts              # 自有任务生命周期 + 状态机
├── video-job.scheduler.ts            # 自有 cron 兜底(复用 @nestjs/schedule 基础设施,不共用 tagging 的任务/队列)
├── pipeline/                         # 自有 VideoStep 契约(借鉴 auto-publish 的模式,但不 import 其类)
│   ├── script.step.ts                # 文章 → 口播脚本(调用底层 LLM seam,不读文章业务状态)
│   ├── storyboard.step.ts            # 脚本 → 分镜 JSON(LLM + Zod 契约校验)
│   ├── assets.step.ts                # 逐镜备料;产物立即转存 COS(底层共用)
│   ├── voice.step.ts                 # TTS 配音 + 词级时间戳
│   └── compose.step.ts               # 调渲染 worker(FFmpeg),成片 → COS → MediaAsset(底层共用)
└── providers/                        # 视频专属的多媒体 provider seam(与 ai/ 文本 seam 平级、互不相依)
    ├── image-gen/                    # ImageGenProvider:volcengine-seedream | minimax
    ├── video-gen/                    # VideoGenProvider:volcengine-seedance | minimax-hailuo(统一"提交→轮询→下载"异步契约)
    └── tts/                          # TtsProvider:volcengine-doubao | minimax-t2a(统一返回 { audioUrl, wordTimestamps? })

scripts/video-render/                 # 独立渲染 worker(Node + FFmpeg),VIDEO_RENDER_ENABLED 开关 gating
```

> 注:`ai.service.ts` 里现有 Seedream 生图逻辑属于"文章 AI 配图"的过程逻辑,**保持原地不动**;`ImageGenProvider` 是对其底层调用(构造请求/存 COS/登记 MediaAsset)的**重新封装**而非复用其函数,避免两个过程逻辑通过共享函数产生演化耦合。重复的底层代码可下沉到共享 helper(如 COS 转存、MediaAsset 登记),helper 不含任何业务流程判断。

### 任务状态机

```
PENDING → SCRIPTING → STORYBOARDING → ASSETS_GENERATING → VOICE_SYNTHESIZING → COMPOSING → SUCCEEDED
                                                                              ↘(任一步) FAILED(记 failedStep + 重试计数)
```

- 每个 step 的输入/输出 JSON 作为 checkpoint 存 `VideoGenerationJob`(等价 OpenMontage 的磁盘 checkpoint,但落库可查)
- step 级重试 + **部分降级**:某镜视频片段生成失败 → 降级为该镜的图卡片(Seedream 生图 + Ken Burns 效果),不阻塞整条任务

## 4. 数据模型

### 新增 `VideoGenerationJob` 表(Prisma migration)

```prisma
model VideoGenerationJob {
  id            String   @id @default(uuid())
  articleId     String?  // L2 来源文章,仅溯源引用(普通字段,不设外键;读写均不触达文章状态机);L1 为空
  userId        String
  mode          String   // 'TEXT_TO_CLIP' (L1) | 'ARTICLE_TO_VIDEO' (L2)
  status        String   // 状态机,见 §3
  failedStep    String?
  prompt        String?  @db.Text // L1 原始 prompt
  script        String?  @db.Text // 口播脚本 checkpoint
  storyboard    Json?    // 分镜 checkpoint(§5)
  providers     Json     // { image: 'volcengine'|'minimax', tts: ..., video: ... } 本次任务实际选用的 provider
  costEstimate  Float?
  costActual    Float?
  retryCount    Int      @default(0)
  resultAssetId String?  // 成片 MediaAsset
  error         String?  @db.Text
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### `MediaAsset` 扩展

- **MIME 白名单**:`MediaService.upload()` 当前硬编码 jpg/png/webp/gif + 10MB 上限 → 扩展 `video/mp4`,上限提升(如 200MB)
- 视频元数据(width/height/**duration**)用 ffprobe 提取;`MediaAsset` 的 width/height 本就可空,**duration 需新增可空字段**(migration)
- `source = AI_GENERATED` + `prompt`/`sourceRef` 字段直接复用

### 计费

`TransactionType` 新增 `AI_VIDEO`(现有 `AI_LLM`/`AI_IMAGE`);按 step 记录实际消耗(视频生成按秒、TTS 按字符、图片按张)。

## 5. 分镜 JSON Schema(LLM 输出契约,Zod 校验)

```jsonc
{
  "title": "成片标题",
  "targetDurationSec": 60,
  "aspectRatio": "9:16",           // 竖屏优先(短视频平台)
  "scenes": [
    {
      "index": 0,
      "narration": "该镜口播文本(送 TTS)",
      "visual": {
        "type": "video_clip | image | media_asset",
        "prompt": "视频/图片生成 prompt(type=media_asset 时为 null)",
        "mediaAssetId": null,      // type=media_asset 时引用媒体库
        "camera": "[Push in]",     // 运镜指令(MiniMax 原生支持;Seedance 走 prompt 内嵌)
        "durationHintSec": 6
      },
      "fallback": "image"          // 视频生成失败时的降级策略
    }
  ],
  "bgm": { "style": "轻快 企业宣传", "volume": 0.15 }
}
```

## 6. Provider 接口签名(新 seam,照 `ChatCompletionProvider` 模式)

```typescript
interface VideoGenProvider {
  readonly name: 'volcengine' | 'minimax';
  submit(req: { prompt: string; firstFrameUrl?: string; durationSec: 6 | 10; resolution: '768P' | '1080P'; aspectRatio: string }): Promise<{ taskId: string }>;
  poll(taskId: string): Promise<{ status: 'pending' | 'processing' | 'succeeded' | 'failed'; videoUrl?: string; error?: string }>;
  // 调用方负责:succeeded 后立即下载转存 COS(URL 有时效,MiniMax 9h)
}

interface TtsProvider {
  readonly name: 'volcengine' | 'minimax';
  synthesize(req: { text: string; voiceId: string; speed?: number }): Promise<{
    audioUrl: string;                 // 已转存 COS
    durationSec: number;
    wordTimestamps?: Array<{ text: string; beginMs: number; endMs: number }>; // minimax 必有;volcengine 待验证
  }>;
}

interface ImageGenProvider { /* 复用/收敛现有 Seedream 实现 + 新增 minimax */ }
```

Provider 选择:env 配置默认值(`VIDEO_IMAGE_PROVIDER` / `VIDEO_TTS_PROVIDER` / `VIDEO_CLIP_PROVIDER`),任务发起时可覆盖,落 `providers` 字段可追溯。

## 7. 合成层(本地 FFmpeg worker)

- 形态:独立进程 `scripts/video-render/`,主服务通过任务目录(job dir:原料文件 + `compose-manifest.json`)交互;`VIDEO_RENDER_ENABLED=true` 才启用,未启用时前端隐藏入口(fail-open,同 Playwright/ES 先例)
- 资源:纯 CPU,2~4GB 内存,无 GPU;1 分钟 1080p 成片约 1~3 分钟 CPU
- P1 合成能力:片段拼接(必要时补黑帧/静帧对齐时长)+ 配音轨 + 背景音混音(`amix`)+ 字幕烧录(ASS,词级时间戳→逐词高亮或句级)+ 片头片尾
- P2 再评估升级 Remotion(动效模板)——渲染层被 compose step 隔离,可整体替换;注意 Remotion 公司 ≥4 人需付费许可(Automators $0.01/渲染、$100/月保底、v5 强制遥测)

## 8. 字幕方案

1. **首选**:TTS 返回词级时间戳 → 生成 ASS/SRT → FFmpeg 烧录。MiniMax `subtitle_type:"word"` 已确认支持
2. **火山 TTS 时间戳支持未确认**(官方文档站点无法抓取核实)→ 列为 **PoC 验证项**;若不支持:该 provider 下退化为"按句切分 + 按字符占比均摊时间"(短视频场景可接受),或字幕需求强时任务级路由到 MiniMax TTS
3. 字幕同时作为独立轨写入 `VideoGenerationJob.storyboard` checkpoint,供前端预览与后续修改重渲染

## 9. 配置(env 新增)

```bash
# 总开关
VIDEO_GENERATION_ENABLED=true
VIDEO_RENDER_ENABLED=true          # 渲染 worker
# 火山引擎
ARK_API_KEY=...
ARK_REGION=cn-beijing
SEEDANCE_MODEL=doubao-seedance-1-5-pro-251215
VOLC_TTS_APP_ID=...                # 豆包语音(接入形式 PoC 确认)
# MiniMax
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.io   # 国内部署改 api.minimaxi.com + MINIMAX_GROUP_ID
MINIMAX_VIDEO_MODEL=MiniMax-Hailuo-2.3
MINIMAX_TTS_MODEL=speech-02-hd
# provider 默认选择
VIDEO_IMAGE_PROVIDER=volcengine
VIDEO_CLIP_PROVIDER=minimax
VIDEO_TTS_PROVIDER=minimax
```

## 10. 前端

入口结构:**一级导航 + 两个场景化快捷入口**(创建任务后统一跳进任务中心):

- **一级导航"视频创作"**(`/dashboard/video`，侧边栏"工作区"组，roles 同媒体库 REPORTER/EDITOR/ADMIN)——**任务中心**:
  - 任务列表：状态机进度（逐步点亮）、失败原因、重试、成本、历史
  - 新建任务:L1 文生片段（纯 prompt)/ L2 选文章成片
  - 成片预览播放、入媒体库、(L2)一键回写文章
- **文章编辑器右侧"生成视频"面板**(同 `seo-panel`/`geo-panel` 模式):以当前文章发起 L2(预填 articleId),仅作快捷入口,任务跟踪跳任务中心
- **媒体库页"文生视频"按钮**:发起 L1,产物自动入库
- 媒体库:`MediaAsset` 支持 mp4 预览(`<video>` 标签)、时长展示
- 所有入口按 `VIDEO_GENERATION_ENABLED` 与服务端能力探测隐藏;**视频中心为独立页面模块,不修改文章/媒体库既有页面的过程逻辑**(快捷入口只做跳转+预填参数)
- AI 治理一致性:成片仅为媒体素材,发布仍走文章审核流,视频无独立发布通道

## 11. 测试策略(QA 视角)

| 层 | 内容 |
|---|---|
| **解耦回归** | `VIDEO_GENERATION_ENABLED=false` 时跑全量现有测试套件,验证文章/媒体/计费/打标链路行为与改造前一致;video 模块不注册时主应用正常 boot;**视频任务 FAILED 时关联文章状态不变的专项断言** |
| 契约 | 分镜 JSON 的 Zod schema 单测(非法 LLM 输出 → 重试/降级);各 provider 的 mock 契约测试(录制的真实 API 响应样本) |
| 状态机 | 视频任务每步成功/失败/重试/僵尸恢复(自有 cron 兜底)路径全覆盖 |
| 降级 | 单镜视频生成失败 → 图卡片降级;provider A 故障 → 切 provider B(任务级) |
| 合成 | ffprobe 断言(时长/分辨率/音轨数/字幕轨)+ 关键帧抽帧比对基线 |
| 回归 | `tests/regression/` 增 30s 样片端到端用例(打标 QA provider mock,不真实烧钱) |
| 时效 | MiniMax 文件 URL 9h 过期 → 转存 COS 逻辑的专项用例 |

## 12. 分阶段计划

| 阶段 | 内容 | 粗估 |
|---|---|---|
| **P0** | L1:`VideoGenProvider` seam + 双 provider + 任务表 + 媒体库 mp4 入库(含 ffprobe/duration 字段)+ 前端文生视频面板 | ~1 周 |
| **P1** | L2 最小闭环:script/storyboard LLM step + 素材 step + TTS + 字幕 + FFmpeg 合成 + 状态机 + 计费 | ~2 周 |
| **P2** | 模板化(Remotion 评估/决策)、多模板、图库素材源、火山 TTS 时间戳结论落地 | ~2–3 周 |
| **P3** | 视频平台分发 adapter(抖音/B站/YouTube,`Platform` 枚举扩展)、成本治理精细化 | 按需 |

## 13. 风险与待验证项

1. **火山 TTS 时间戳**:文档未核实,PoC 第一项;不支持则按 §8 降级
2. **MiniMax 国内/国际站差异**:GroupId 鉴权、模型可用性可能不同,需按部署区域实测
3. **火山现有 Seedream 集成复用**:确认 `SEEDREAM_API_BASE` 当前指向,尽量收敛到统一 `ImageGenProvider`
4. **成本**:AI 视频片段约 $0.2–1.3/60s(OpenMontage 实测口径),成片成本 = 片段×镜数 + TTS + 图;`costEstimate` 在任务发起前展示给用户确认
5. **时长 SLA**:单镜视频生成 1–5 分钟,60s 成片端到端 10–30 分钟属正常,前端进度反馈必须清晰
6. **P2 Remotion 许可**:公司 ≥4 人需付费,决策前不要引入

## 14. P0 实现记录(2026-08-07,分支 feat/text-to-video)

已实现 L1 闭环。与方案的有意偏差:

1. **provider 单选**:P0 的 `VIDEO_CLIP_PROVIDER` 为服务端级单值配置,任务创建时不接受跨 provider 覆盖(传不一致值报 503);任务级双 provider 并存/路由推迟到 P1
2. **用户手动上传 mp4 未开放**:`MediaService.upload()` 白名单仍仅图片(其管线含 sharp/WebP 预览等图片专用处理,贸然放通风险高);P0 视频资产仅由生成管道登记入库(`sourceRef=videoJob:<id>`),用户上传视频放开属 P1
3. **迁移为手写 SQL**:开发机当时连不上 dev MySQL,`20260807120000_add_video_generation/migration.sql` 按既有迁移 DDL 风格手写;有库后应先 `prisma migrate diff` 校验等价性再 `migrate deploy`
4. **数据模型遵循仓库零 Json 字段惯例**:`storyboard`/`providers` 等 P1 字段届时用 `String @db.Text` + `safeJsonParse`,不用 Prisma `Json` 类型;P0 表先只落 `provider` 单字段
5. 视频资产**不发** `media.asset.created` 事件(会误触发图片视觉打标队列);ES 索引由 video 模块直接调 `SearchService.indexAsset`(fail-open)

# PRD:文生视频(Text-to-Video / 稿件一键成片)

> 状态:**P0/P1 已实现**(分支 feat/text-to-video,PR #154);配音通道 2026-08-08 修正为"视频模型原生音频"唯一通道,独立 TTS 已整体移除(见 §17)
> 日期:2026-08-07(最近修订 2026-08-08)
> 前置讨论:借鉴 OpenMontage 的管道思想,不集成其代码(AGPLv3 与 BUSL-1.1 冲突),全部用 CMS-NG 自有技术栈原生实现

## 1. 背景与目标

新媒体机构的核心诉求之一:图文稿件快速视频化。参考 OpenMontage 的管道分层思想(脚本→分镜→素材→配音→字幕→合成),在 CMS-NG 中原生实现:

- **L1 文生视频片段**:prompt → 视频生成 API → 几秒片段入媒体库
- **L2 稿件一键成片**:文章 → 口播脚本 → 分镜 → 素材(视频片段/图片/媒体库已有素材)→ 配音(视频模型原生音频)→ 字幕 → FFmpeg 合成 → 成片 mp4 入媒体库

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
| 视频 | Seedance(`doubao-seedance-1-5-pro-251215` / `seedance-2-0-260128`) | **异步任务**:`create_content_generation_task` → 轮询 `get_content_generation_task` | 支持 T2V / I2V(首帧/首尾帧)/ R2V(参考视频);时长、分辨率、`--camera-fixed` 等参数;1.5+/2.x 支持 `generate_audio` 原生音频(= L2 唯一配音通道,见 §17) |
| ~~语音~~ | — | — | ~~豆包语音大模型~~ **独立 TTS 已于 2026-08-08 移除(见 §17)**,不再接入 |

### MiniMax(base `https://api.minimax.io`,Bearer JWT;国内站 `api.minimaxi.com` 需 GroupId——部署区域决定用哪个,做成 env 配置)

| 模态 | 模型/接口 | 形态 | 备注 |
|---|---|---|---|
| 图片 | Image Generation(T2I / I2I) | 同步 | — |
| 视频 | `POST /v1/video_generation`(`MiniMax-Hailuo-2.3` / `Hailuo-02`,T2V;I2V 需 `first_frame_image`) | **异步任务**:`GET /v1/query/video_generation` → `file_id` → File Retrieve API 下载 | 6s/10s,768P/1080P;支持 `[Push in]` 等 15 种运镜指令;**下载 URL 仅 9 小时有效,必须立即转存 COS**;无原生音频能力(L2 走该 provider 时成片无配音) |
| ~~语音~~ | — | — | ~~`t2a_v2` 词级时间戳~~ **独立 TTS 已于 2026-08-08 移除(见 §17)**,不再接入 |

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
│   ├── assets.step.ts                # 逐镜备料;产物立即转存 COS(底层共用);原生音频模式旁白注入 prompt
│   └── compose.step.ts               # 调渲染(FFmpeg),成片 → COS → MediaAsset(底层共用)
└── providers/                        # 视频专属的多媒体 provider seam(与 ai/ 文本 seam 平级、互不相依)
    ├── image-gen/                    # ImageGenProvider:volcengine-seedream | minimax
    └── video-gen/                    # VideoGenProvider:volcengine-seedance | minimax-hailuo(统一"提交→轮询→下载"异步契约)

scripts/video-render/                 # 独立渲染 worker(Node + FFmpeg),VIDEO_RENDER_ENABLED 开关 gating
```

> 注:`ai.service.ts` 里现有 Seedream 生图逻辑属于"文章 AI 配图"的过程逻辑,**保持原地不动**;`ImageGenProvider` 是对其底层调用(构造请求/存 COS/登记 MediaAsset)的**重新封装**而非复用其函数,避免两个过程逻辑通过共享函数产生演化耦合。重复的底层代码可下沉到共享 helper(如 COS 转存、MediaAsset 登记),helper 不含任何业务流程判断。

### 任务状态机

```
PENDING → SCRIPTING → STORYBOARDING → ASSETS_GENERATING → COMPOSING → UPLOADING → SUCCEEDED
                                                              ↘(任一步) FAILED(记 failedStep + 重试计数)
```

> 配音不单独占状态:原生音频模式在 ASSETS_GENERATING 内随视频素材同生(`generate_audio`),COMPOSING 复用素材原生音轨。`VOICE_SYNTHESIZING` 为已废弃的存量枚举值(2026-08-08 前 TTS 方案残留),仅作兼容直转,新任务不再经过。

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
  providers     Json     // { image: 'volcengine'|'minimax', video: ... } 本次任务实际选用的 provider(实现落 `provider` 单字段 + `ttsProvider` 配音通道标记,见 §15/§17)
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

`TransactionType` 新增 `AI_VIDEO`(现有 `AI_LLM`/`AI_IMAGE`);按 step 记录实际消耗(视频生成按秒、图片按张)。

## 5. 分镜 JSON Schema(LLM 输出契约,Zod 校验)

```jsonc
{
  "title": "成片标题",
  "targetDurationSec": 60,
  "aspectRatio": "9:16",           // 竖屏优先(短视频平台)
  "scenes": [
    {
      "index": 0,
      "narration": "该镜口播文本(原生音频模式确定性注入视频生成 prompt,见 §16.2)",
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
  /** 是否支持原生音频(Seedance 1.5+/2.x generate_audio)= L2 唯一配音通道(§17) */
  readonly supportsNativeAudio: boolean;
  submit(req: { prompt: string; firstFrameUrl?: string; durationSec: number; resolution: '480P' | '768P' | '1080P'; aspectRatio: string; generateAudio?: boolean }): Promise<{ taskId: string }>;
  poll(taskId: string): Promise<{ status: 'pending' | 'processing' | 'succeeded' | 'failed'; videoUrl?: string; error?: string }>;
  // 调用方负责:succeeded 后立即下载转存 COS(URL 有时效,MiniMax 9h)
}

interface ImageGenProvider { /* 复用/收敛现有 Seedream 实现 + 新增 minimax */ }
```

Provider 选择:env 配置默认值(`VIDEO_CLIP_PROVIDER`),任务发起时可覆盖,落 `providers` 字段可追溯。(原 `TtsProvider` seam 与 `VIDEO_TTS_PROVIDER` 已于 2026-08-08 移除,见 §17)

## 7. 合成层(本地 FFmpeg worker)

- 形态:独立进程 `scripts/video-render/`,主服务通过任务目录(job dir:原料文件 + `compose-manifest.json`)交互;`VIDEO_RENDER_ENABLED=true` 才启用,未启用时前端隐藏入口(fail-open,同 Playwright/ES 先例)
- 资源:纯 CPU,2~4GB 内存,无 GPU;1 分钟 1080p 成片约 1~3 分钟 CPU
- P1 合成能力:片段拼接(必要时补黑帧/静帧对齐时长)+ 配音轨(原生音频模式复用素材自带音轨)+ 背景音混音(`amix`)+ 字幕烧录(ASS,整句 cue;无 libass 时降级 `mov_text` 软字幕轨)+ 片头片尾
- P2 再评估升级 Remotion(动效模板)——渲染层被 compose step 隔离,可整体替换;注意 Remotion 公司 ≥4 人需付费许可(Automators $0.01/渲染、$100/月保底、v5 强制遥测)

## 8. 字幕方案

1. **整句 cue(现行唯一方案)**:每镜 `narration` 全文作为一条字幕 cue,时间轴 = 该镜真实时长(原生音频模式取素材 ffprobe 探测时长,否则取 `durationHintSec`)→ 生成 ASS → FFmpeg 烧录;本地 ffmpeg 无 libass 时降级 `mov_text` 软字幕轨(§15.3)
2. ~~词级时间戳逐词高亮~~:原依赖 TTS `wordTimestamps`,随 TTS 链路于 2026-08-08 一并移除(§17);原生音频不返回时间戳,词级高亮无数据来源,如需恢复须另立方案(如 ASR 回扫)
3. 字幕同时作为独立轨写入 `VideoGenerationJob.storyboard` checkpoint,供前端预览与后续修改重渲染

## 9. 配置(env 新增)

```bash
# 总开关
VIDEO_GENERATION_ENABLED=true
VIDEO_RENDER_ENABLED=true          # 渲染(进程内 ffmpeg,§15.1)
# 火山引擎
ARK_API_KEY=...
SEEDANCE_MODEL=doubao-seedance-2-0-mini-260615   # 1.5+/2.x 支持原生音频(= L2 配音)
# MiniMax
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.io   # 国内部署改 api.minimaxi.com + MINIMAX_GROUP_ID
MINIMAX_VIDEO_MODEL=MiniMax-Hailuo-2.3
# provider 默认选择
VIDEO_CLIP_PROVIDER=volcengine
# (VOLC_TTS_*/MINIMAX_TTS_*/VIDEO_TTS_PROVIDER 已于 2026-08-08 随 TTS 链路移除,§17)
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
| **P1** | L2 最小闭环:script/storyboard LLM step + 素材 step + 原生音频配音 + 字幕 + FFmpeg 合成 + 状态机 + 计费 | ~2 周 |
| **P2** | 模板化(Remotion 评估/决策)、多模板、图库素材源 | ~2–3 周 |
| **P3** | 视频平台分发 adapter(抖音/B站/YouTube,`Platform` 枚举扩展)、成本治理精细化 | 按需 |

## 13. 风险与待验证项

1. ~~**火山 TTS 时间戳**~~:随 TTS 移除作废(§17)
2. **MiniMax 国内/国际站差异**:GroupId 鉴权、模型可用性可能不同,需按部署区域实测
3. **火山现有 Seedream 集成复用**:确认 `SEEDREAM_API_BASE` 当前指向,尽量收敛到统一 `ImageGenProvider`
4. **成本**:AI 视频片段约 $0.2–1.3/60s(OpenMontage 实测口径),成片成本 = 片段×镜数 + 图(配音不另计费,含在视频生成内);`costEstimate` 在任务发起前展示给用户确认
5. **时长 SLA**:单镜视频生成 1–5 分钟,60s 成片端到端 10–30 分钟属正常,前端进度反馈必须清晰
6. **P2 Remotion 许可**:公司 ≥4 人需付费,决策前不要引入

## 14. P0 实现记录(2026-08-07,分支 feat/text-to-video)

已实现 L1 闭环。与方案的有意偏差:

1. **provider 单选**:P0 的 `VIDEO_CLIP_PROVIDER` 为服务端级单值配置,任务创建时不接受跨 provider 覆盖(传不一致值报 503);任务级双 provider 并存/路由推迟到 P1
2. **用户手动上传 mp4 未开放**:`MediaService.upload()` 白名单仍仅图片(其管线含 sharp/WebP 预览等图片专用处理,贸然放通风险高);P0 视频资产仅由生成管道登记入库(`sourceRef=videoJob:<id>`),用户上传视频放开属 P1
3. **迁移为手写 SQL**:开发机当时连不上 dev MySQL,`20260807120000_add_video_generation/migration.sql` 按既有迁移 DDL 风格手写;有库后应先 `prisma migrate diff` 校验等价性再 `migrate deploy`
4. **数据模型遵循仓库零 Json 字段惯例**:`storyboard`/`providers` 等 P1 字段届时用 `String @db.Text` + `safeJsonParse`,不用 Prisma `Json` 类型;P0 表先只落 `provider` 单字段
5. 视频资产**不发** `media.asset.created` 事件(会误触发图片视觉打标队列);ES 索引由 video 模块直接调 `SearchService.indexAsset`(fail-open)

## 15. P1 实现记录(2026-08-07,分支 feat/text-to-video)

> ⚠️ 本节为 2026-08-07 时点记录,其中独立 TTS 链路(本条 2/5/10 及状态机中的 `VOICE_SYNTHESIZING`、词级时间戳)**已于 2026-08-08 整体移除**,现行配音方案见 §17;其余结论仍然有效。

已实现 L2(稿件一键成片)闭环:`PENDING → SCRIPTING → STORYBOARDING → ASSETS_GENERATING → VOICE_SYNTHESIZING → COMPOSING → UPLOADING → SUCCEEDED`,全程断点恢复(checkpoint 落在 `storyboard` JSON 的 `scenes[].asset/voice` 上,仅变化时写库避免扰动超时判定)。与方案的有意偏差/新结论:

1. **合成为进程内 spawn 的 ffmpeg**,而非 §7 的独立 worker `scripts/video-render/`:`render/ffmpeg-compose.ts` 是纯函数式 helper(只依赖 jobDir 本地文件,不感知状态机/DB),未来拆 worker 时整体平移即可;jobDir 契约(`os.tmpdir()/cms-ng-video/{jobId}`)保留
2. **火山 TTS 不在 Ark 上**:PoC 实测 `POST {ARK}/audio/speech` 返回 404;该 Ark 账号 `/models` 129 个模型无任何语音类;Ark key 作 `X-Api-Key` 打 openspeech 返回 401 `Invalid X-Api-Key` —— **两套凭证体系确凿不可复用**。已按官方文档(docs/6561/1598757)实现 **V3 HTTP 单向流式** `POST /api/v3/tts/unidirectional`:认证支持新版单 key(`X-Api-Key`=`VOLC_TTS_API_KEY`,推荐)与旧版双凭证(`X-Api-App-Id`+`X-Api-Access-Key`);`X-Api-Resource-Id: seed-tts-2.0`(TTS 2.0 大模型);`enable_subtitle:true` → `TTSSubtitle` 事件返回**字/词级时间戳**(秒,相对 session,基于原文)→ 字幕逐词烧录无需降级;音频为 352/TTSResponse 事件的 base64 分片拼接
3. **字幕烧录双降级链**:词级时间戳 → 整句 cue;ASS 烧录 → `mov_text` 软字幕轨。本地 homebrew ffmpeg 8.0.1 无 libass/drawtext,`supportsAssBurn()` 运行时探测决定烧录或软字幕轨
4. **Ken Burns 正确形态**:图片镜用单帧输入 + 2x 超采样 scale/crop + `zoompan d=总帧数` + `trim`;`-loop 1` 长输入 × zoompan d 会帧数失控(2s 意图产出 121s)
5. **TTS 可选**:凭证不全时 factory 返回 null,`VOICE_SYNTHESIZING` 整步跳过,`ttsProvider='none'`,成片仅字幕;镜长回退 `durationHintSec`
6. **权限**:仅稿件作者本人或 EDITOR/ADMIN 可发起稿件成片(创建时 503);稿件内容通过 Prisma 数据级读取(stripHtml,截 8000 字),不 import 文章模块任何类 —— 过程逻辑解耦红线保持
7. **计费**:新定价项 `ai_video_per_compose`(默认 ¥8/次,seed-billing-config.ts 已加),幂等键 `video-compose:{jobId}`;扣费仅在成片登记入库成功后发生
8. **迁移 `20260807160000_add_video_p1_checkpoints` 同 P0 手写 SQL**(`script`/`storyboard` TEXT + `ttsProvider` VarChar(20)),已 `migrate dev` 应用至 dev 库
9. **超时参数**:`ASSETS_GENERATING` 30min(覆盖逐镜视频片段生成),`UPLOADING` 僵尸清扫 20min(覆盖 L2 合成+上传),submit 孤儿保护窗 2min(P0 双提竞态修复)
10. **跨 tick 重入竞态(e2e 实测抓到)**:cron 每分钟一扫,而 LLM/生图单步常超过 1 分钟 —— 首个真实 L2 任务出现相邻两 tick 重入同一任务,日志可见 8 次 seedream 请求(4 镜任务,重复脚本→分镜→素材,双倍费用)。修复:`VideoJobService.advance()` 加进程内 in-flight Set 互斥(单进程部署主防线),DB 条件 updateMany 抢占保留为多进程兜底;修复后同样任务整链恰好每镜 1 次生图请求。回归测试:并发 advance 时脚本 LLM 仅调用 1 次
11. **前端**:视频创作页加"文生片段 / 稿件一键成片"双 tab(`?mode=article&articleId=` 预选中);文章编辑器"快速操作"加"AI 一键成片"入口(纯导航,编辑器零 API 耦合);任务卡片展示分镜明细(脚本全文 + 逐镜素材/配音状态);capability 返回 `l2/tts/render` 供入口 gating,TTS 缺失时创建表单提示"无配音"

**e2e 验证(2026-08-07,真实火山引擎,无配音降级模式)**:两个真实 L2 任务全链路 SUCCEEDED —— 稿件(滨江步道新闻)→ deepseek 口播脚本 → 4 镜分镜 → Seedream 图片 ×3 + Seedance 视频片段 ×1 → ffmpeg 合成 → COS → 媒体库登记(`sourceRef=videoJob:<id>`)。成片 ffprobe:22s、1080×1920 H.264 + AAC + mov_text 软字幕轨(本地 ffmpeg 无 libass,按设计降级)。**TTS 支路未实测**:火山语音凭证(VOLC_TTS_APP_ID/ACCESS_TOKEN)待开通,到位后补真实配音 e2e;MiniMax 图片/TTS 两个 provider 按官方文档实现但未实测(无凭证)

## 16. 原生音频替代 TTS(2026-08-07,Seedance 2.x `generate_audio`)

> ⚠️ 本节为过渡方案记录:TTS 当时仍保留为可选配音通道(本条 4 的优先级链)。2026-08-08 需求修正后 TTS 链路已删除,**原生音频成为唯一配音通道**(§17);本节其余实现要点(参数形态、原生音轨复用、模型激活前提)仍为现行行为。

用户决策:配音不走独立 TTS,改用 **Seedance 2.x 原生音频**(`generate_audio:true`,视频/音频同一次生成,支持中文对白/旁白、音素级口型同步)。实现要点:

1. **provider seam**:`VideoGenProvider.supportsNativeAudio`(按模型名判定:`seedance-1-5`/`seedance-2-` 支持,1.0 系不支持);`VideoGenSubmitRequest.generateAudio` → 请求体顶层 `generate_audio:true`(仅支持时落参,1.0 系静默忽略)。模型版本感知的参数映射:2.x 时长 4~15s 自由档(1.0 系仍归一 5/10)、2.x 无 768p 档 → 768P 映射 720p、**2.0-mini 仅 480p/720p 两档**(1080P 降级 720p);**2.x 的 ratio/duration/resolution 走顶层 body 参数**(官方文档形态),1.x 沿用 prompt 内嵌 `--` 后缀 —— 实测 2.x 下 `--res 480p` 后缀被静默忽略(退化默认 720p),顶层参数才生效
2. **L2 原生音频模式** = 无 TTS 且片段 provider 支持原生音频:分镜 prompt 要求全部 `video_clip`(图片镜静默会破坏旁白连续性);素材提交时旁白确定性注入 prompt(追加 `画面配中文画外音旁白:「<narration>」`,不依赖 LLM 在分镜阶段遵守);`VOICE_SYNTHESIZING` 整步跳过,`ttsProvider='native'`(区分 TTS 缺失的 `'none'` 纯静默降级)
3. **合成层**:无独立配音的视频镜用 ffprobe 探测素材音轨,有则 `audioPath=assetPath` 复用原生音轨(同一文件两次作输入,ffmpeg 允许);镜长取素材真实探测时长(避免 tpad 冻帧截断原生音频)。字幕在原生音频模式无词级时间戳 → 每镜整句 cue(既有降级路径,时间轴用真实镜长)
4. **优先级**:TTS 配置在 → 独立 TTS 旁白仍是权威配音(视频镜不再请求原生音频,避免双配音);TTS 缺席 + 原生音频可用 → native;两者皆无 → none(纯字幕)
5. **模型激活是硬前提(实测)**:Ark `/models` 列出 ≠ 已开通。该账号 2.x 全系(2.5/2.0/2.0-fast/2.0-mini)提交任务返回 404 `ModelNotOpen`(需在 Ark 控制台"模型开通"页激活,按量付费);1.5-pro 返回 `InvalidEndpointOrModel`(未开通);仅 1.0-pro/1.0-pro-fast 已激活(无音频能力)。未激活时 L2 视频镜 404 → 逐镜降级图片 → 成片静默(降级链工作正常,但失去配音)
6. **降级链实测(2026-08-07)**:2.0-mini 未激活时真实任务 SUCCEEDED —— 分镜 LLM 遵守全 video_clip 规则,3 镜提交全部 404 → 逐镜 fallback 图片 → 18s 静默成片(字幕正常)。待 2.x 激活后重跑带原生配音的 e2e
7. L1 文生片段行为不变(不请求原生音频);`.env.example` 默认模型改 `doubao-seedance-2-0-mini-260615`
8. **真实 e2e 验证通过(2026-08-08,模型开通后)**:L1 新增 `resolution` 480P 档 + `generateAudio` 任务级开关(DTO 校验 → `VideoGenerationJob.generateAudio` 列持久化 → submitStage 透传)。两发真实任务(果茶第一视角广告 prompt,8s/9:16/`generateAudio:true`):
   - 第一发暴露并修复 2.x 参数形态问题(见 §16.1):请求确发 `--res 480p` 但产出 720×1280 —— 改顶层参数后重发
   - 第二发全程 ~20s SUCCEEDED:**496×864**(2.0-mini 480p 档 9:16)H.264+AAC 32kHz、8.1s、volumedetect mean **-16.5 dB**(原生音频清晰可闻,首发达 -15.4 dB)、MediaAsset 登记 ✓、抽帧核对符合 brief(摘苹果/倒茶分层/举杯标签)。已知限制:杯身中文标签字渲染轻微乱码(视频模型通病);`视频1/音频1/图片1/图片2` 多模态参考物(content 数组 `reference_video`/`reference_audio`/`last_frame` 角色)**当前 seam 不支持**(仅 firstFrameUrl),prompt 中此类引用被当文本意图处理
   - 计费 dev 余额 ¥0 → warn-only 不阻塞(`costActual=null`,与既有设计一致)
9. **对抗式评审修复(2026-08-07,6 项确认发现全修)**:
   - [major] MiniMax 时长归一收入 provider 内部(仅接受 6|10 档,≤8→6 / >8→10)——素材 step 的全局钳制放宽到 [2,15] 是为 Seedance 2.x,不能直接透传给 Hailuo(顺带修复既存 4/5/7/8/9 原样透传)
   - [minor] 合成层原生音轨复用/实测时长分支按 nativeAudio 模式门控 —— 无 TTS 的 MiniMax/1.0 任务与 media_asset 有声素材恢复既有"静音轨+时长 hint"行为,不意外混入原声
   - [minor] 原生音频模式"全 video_clip"从 prompt 软约束升级为契约归一(`parseStoryboard` `nativeAudio:true` 时 image/未知类型 → video_clip,step 记 warn 镜数);prompt 同步收紧:narration 20~50 字、durationHintSec 5~12(须容纳旁白朗读时长)
   - [minor] **1.5-pro + 无 TTS 存量部署行为变化(发布注记)**:升级后自动进入原生音频模式 —— 配音从"无"变"有"(体验提升),但单镜成本画像变化(有声生成单价高于静默,且长旁白可能被压入 ≤10s 片段);想保持旧行为需配置 TTS 或切回 1.0 系模型
   - [major×2/测试] 补两条钉住测试:原生音频模式视频镜全失败 → 降级图片镜静音(任务仍 SUCCEEDED、ttsProvider=native)的已知行为;新建 `compose.step.spec.ts` 直测 prepareScene 四分支(原生复用/无声素材/非原生门控/voice 优先)

## 17. 需求修正:原生音频为唯一配音通道,TTS 链路整体移除(2026-08-08)

用户决策修正:视频模型(Seedance 1.5+/2.x)生成时直接产出音频,**不再需要独立 TTS**。TTS 相关需求与实现整体删除,原生音频从"TTS 缺席时的备选"升格为**唯一配音通道**。

### 17.1 移除清单(代码)

- **删除**:`pipeline/voice.step.ts`(配音步)、`providers/tts/` 整个目录(volcengine-doubao + minimax-t2a 两个 TtsProvider 及 factory)、module 中 `TTS_PROVIDER` 注入
- **状态机**:`ASSETS_GENERATING → COMPOSING` 直达,`VOICE_SYNTHESIZING` 从新任务链中移除;该枚举值保留(shared `VideoJobStatus` + 数据库历史行),存量行由兼容分支直转 COMPOSING,`failedStep='voice'` 的存量失败行重试亦回 COMPOSING
- **配音通道判定**:`nativeAudio = videoGen.supportsNativeAudio === true`(不再与 TTS 可用性取反);`ttsProvider` 字段保留作通道标记,仅写 `'native'`(原生音频)/ `'none'`(provider 无原生音频能力,成片纯字幕降级)——历史值 `volcengine`/`minimax` 为已移除的 TTS 遗留
- **分镜/合成**:原生音频模式契约归一(image→video_clip)、旁白注入 prompt、原生音轨复用、探测时长取镜长等行为**不变**(§16.2/16.3);`scene.voice` checkpoint 字段与 `StoryboardSceneVoice` 类型删除
- **字幕**:词级时间戳链(`wordTimestamps` → 逐词 cue)删除,整句 cue 成为唯一方案(§8)
- **前端**:capability 去掉 `tts` 字段;任务卡片"已配音"chip 移除;L2 提示语改为"原生音频配音(Seedance 1.5+/2.x)/ 不支持时无配音(仅字幕)"
- **配置**:`.env.example` 删除 `VOLC_TTS_API_KEY/APP_ID/ACCESS_TOKEN/RESOURCE_ID/VOICE`、`MINIMAX_TTS_MODEL/VOICE` 全部条目

### 17.2 影响与行为变化

- **MiniMax(Hailuo)L2 任务**:此前可用 MiniMax TTS 配音,现 provider 无原生音频能力 → 成片固定无配音(仅字幕)。若 MiniMax 后续上线原生音频模型,在 `supportsNativeAudio` 判定中扩展即可
- **存量部署**:升级后不再读取任何 `VOLC_TTS_*`/`MINIMAX_TTS_*` 环境变量(留存在 .env 中无害,建议清理)
- **计费**:不再有 TTS 按字符计费项;原生音频成本含在视频生成单价内
- **测试**:后端 video 域 80/80 绿(compose/storyboard/provider/service specs 同步改写,TTS 用例全删)

### 17.3 未实现需求清单(修正后)

1. ~~多模态参考物 seam(`reference_video`/`reference_audio`/`first_frame`/`last_frame` 角色,§16.8 已知限制)~~ **已实现(§18,L1)**
2. MiniMax 图片/视频 provider 真实联调(代码就绪,无凭证未实测)
3. ~~L1 时长自由档前端暴露(后端已支持 2.x 4~15s)~~ **已实现**:provider `durationCapabilities` 能力位(free/fixed),capability 透出,前端按 mode 渲染自由数字输入(2.x 4~15s)或档位下拉(1.x [5,10]、MiniMax [6,10]);顺带修正 1.x 档位前端原本错显 6/10(应为 5/10)
4. Playwright 视频域回归覆盖
5. 生产部署:`migrate deploy` + 宿主机 ffmpeg + `VIDEO_RENDER_ENABLED=true`
6. L2 分镜级参考物(每镜挂 mediaAssetId/参考图)—— L1 seam 已就绪,L2 契约扩展另行设计

## 18. L1 多模态参考物 + 可选参数(2026-08-08,Seedance 2.x content 角色)

用户决策(经参数清单确认):接入**全部 5 个参考角色** + `seed`/`draft`/`return_last_frame` 三个顶层参数;范围**仅 L1**(L2 分镜级参考物另行设计)。

### 18.1 参数事实源(三重核实)

- **官方文档**(docs.volcengine.com 82379/1520757,2026-08-07 更新)经镜像站交叉确认:content 数组项 `type: text|image_url|video_url|audio_url` + `role: first_frame|last_frame|reference_image|reference_video|reference_audio`
- **ark-cli 官方参考**(volcengine/ark-cli):role 前缀 → wire `content[].role`;顶层 flag 全表(seed/watermark/generate-audio/camera-fixed/return-last-frame/draft/priority/service-tier/callback-url/frames/tools=web_search)
- **本账号 `/models` 实测元数据**(ground truth):`doubao-seedance-2-0-mini-260615` `input_modalities=[text,image,video,audio]` —— 2.0-mini **全角色支持**,无需另开 r2v 变体(2.0 全系统一多模态;1.5-pro 仅 [text,image])

### 18.2 约束(官方限额,service 层提交前校验,400 拒)

| 角色 | 上限 | 素材要求 |
|---|---|---|
| first_frame / last_frame | 各 ≤1 | jpeg/png/webp,300~6000px,≤30MB |
| reference_image | 图片合计 ≤9(含首/尾帧) | 同上 |
| reference_video | ≤3 | 2~15s/个,≤50MB |
| reference_audio | ≤3 | mp3/wav,2~15s(合计 ≤15s),≤15MB;**不能单独存在,须至少 1 图或 1 视频** |

### 18.3 实现要点

1. **seam**:`VideoGenSubmitRequest.references[{role,url}]` + `seed`/`draft`/`returnLastFrame`;provider 能力位 `paramCapabilities: { referenceRoles, seed, draft, returnLastFrame, frameReferenceExclusive }` —— Seedance 2.x 全角色 + 帧/参考互斥(**mini 例外:draft 全模式禁用,实测**),1.x 仅 first_frame(裸 image_url 无 role),MiniMax 仅 first_frame(→ `first_frame_image`,其余角色兜底抛错)
2. **持久化**:`VideoGenerationJob.submitOptions`(TEXT,JSON 字符串:`{references,seed,draft,returnLastFrame}`),submitStage 解析透传;损坏 JSON fail-open 按空 options 提交。迁移 `20260808_video_job_submit_options`(同时加 `lastFrameAssetId`)
3. **校验时序**:DTO 层(@ValidateNested+@Type 嵌套、https:// URL 形态、15 条总数上限 = 图 9+视频 3+音频 3)→ service 层(L2 拒、角色 ⊆ 能力位、数量上限、音频不单独、帧/参考互斥、seed/draft/尾帧能力位)→ provider 兜底
4. **尾帧续拍链**:`return_last_frame=true` → poll 取 `content.last_frame_url` → 下载转存 COS 入媒体库(`sourceRef=videoJob:<id>:last-frame`,不打标)→ 回写 `lastFrameAssetId`;VO 增 `lastFrameUrl`,任务卡片展示尾帧缩略图。尾帧失败仅告警不置任务失败(主片已成功)
5. **前端**:L1 表单参考物编辑器(角色下拉按 capability gating + **帧/参考互斥时按已选行动态过滤可选项** + URL 输入 + 媒体库选择器);`MediaPicker` 扩展 `mimePrefix`(媒体列表新增 `mimePrefix` 查询参数,ES/LIKE 双路径同源过滤;仅图片大类保留内嵌上传);seed 输入 + 打样/尾帧复选按能力位显隐
6. **MiniMax 行为**:仅首帧;传其它角色 400(provider 能力位先行拦截)。Hailuo 无 seed/draft/尾帧参数,前端表单自动隐藏

### 18.4 e2e 实测结论(2026-08-08,本账号 2.0-mini,真实 Ark 任务)

真机跑通两条模式链路(创建 → submitOptions 落库 → Ark 提交 → 轮询 → 转存 COS → 媒体库登记):

| 实测项 | 结果 | 证据 |
|---|---|---|
| **flf2v**(首+尾帧)+ seed + return_last_frame | ✅ SUCCEEDED | job `93939d6d`;Ark 回显 `seed:42`(**seed 生效**);`content.last_frame_url` 产出 → 尾帧入库(`sourceRef=videoJob:<id>:last-frame`,tagStatus=NONE);成片 496×864 5s h264 + **AAC 有声**(mean -21.2dB) |
| **r2v**(参考图+参考视频+参考音频)+ seed + return_last_frame | ✅ SUCCEEDED | job `f61db539`;Ark 回显 `seed:42`;尾帧同链路入库;成片 496×864 5s + AAC 有声(-22.3dB) |
| **帧角色 × 参考角色混合** | ❌ 平台级互斥 | Ark 400:"first/last frame content cannot be mixed with reference media content"(first_frame 混参考图同样拒)→ 能力位 `frameReferenceExclusive`,service 提前 400 + 前端选项过滤 |
| **draft 打样 @ 2.0-mini** | ❌ **全模式禁用** | t2v/i2v/flf2v/r2v 四种模式全部 400("draft is not supported for model doubao-seedance-2-0-mini in &lt;mode&gt;")→ mini 能力位 `draft:false`(前端打样复选直接隐藏);非 mini 2.x 按文档置 true(本账号无 pro,未实测) |
| **Ark 错误透出** | ✅ 已修 | axios 400 原本只剩 "status code 400";现 provider 提取 `response.data.error.message`,任务 error 字段直接可见 Ark 原始原因(e2e 第一轮失败即靠此定位) |

**经验**:① Seedance 2.x 的 content 角色实际是**两种互斥生成模式**——帧补间(t2v/i2v/flf2v)与多模态参考(r2v),不是自由组合;② 模型能力以**实测为准**,文档/marketing 参数表不代表单模型可用性(mini 禁 draft 任何文档均未写明);③ `ValidationPipe whitelist:true` 会静默丢弃未声明 DTO 字段,联调时先确认 submitOptions 落库再怀疑对端。

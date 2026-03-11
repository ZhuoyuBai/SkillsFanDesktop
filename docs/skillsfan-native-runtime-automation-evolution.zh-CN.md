# SkillsFan NativeRuntime 与自动化能力演变方案

## 1. 这份文档解决什么问题

这份文档要回答的是：

- 如果 SkillsFan 继续保留现在的 Claude Code / Claude SDK 路线，怎么用最小改动补上浏览器自动化、桌面自动化、截图回传这些能力
- 如果未来主流用户更多使用 Kimi、MiniMax、GLM、DeepSeek、Qwen 等自定义模型，怎么把这些模型逐步迁到 `NativeRuntime`
- 如果长期要往 OpenClaw 那种平台方向演变，现在应该怎样设计，后面才不会推翻重来
- OpenClaw 在这些能力上已经做到什么程度，哪些地方可以直接借鉴，哪些地方不能误以为“它已经全部做完了”

这份文档不是“全面重写方案”，而是“在现有产品基础上的渐进演变方案”。

---

## 2. 先讲结论

最合理的路线不是马上把 SkillsFan 变成 OpenClaw，而是先做三件事：

1. 保留现在的 `ClaudeRuntime`
2. 新增一个 `HostRuntime`，专门负责浏览器、桌面 App、截图、元素读取、步骤回传
3. 再新增一个 `NativeRuntime`，把主流自定义模型逐步迁进去

一句话理解：

**短期先补“手和眼”，长期再补“新的大脑”。**

这里的角色可以理解成：

- `ClaudeRuntime`：你现在已有的 agent 执行内核
- `NativeRuntime`：未来给 Kimi / MiniMax / GLM / Qwen 等模型使用的统一执行内核
- `HostRuntime`：负责“会操作浏览器、会操作电脑、会截图、会把步骤图发回来”

以后结构应该变成：

- 前台 `SkillsFan App`：聊天 UI、任务列表、步骤回放、远程控制
- 后台 `Automation Service`：真正常驻执行任务
- `ClaudeRuntime`：服务 Claude 用户和 Claude 风格 coding agent
- `NativeRuntime`：服务主流自定义模型
- `HostRuntime`：给两种 runtime 都提供浏览器和桌面宿主能力

---

## 3. 现在的 SkillsFan 和目标结构有什么区别

### 3.1 现在的结构

你现在更像：

- 一个很强的桌面 AI App
- 核心 agent 执行主要依赖 Claude Code / Claude SDK
- 远程网页、飞书、Loop Task、Artifact 这些能力已经有了
- 但真正的浏览器和桌面自动化能力还没有做成一套统一宿主能力层

现在的优点：

- 现成、成熟、迭代快
- Claude 风格体验稳定
- 前台产品完成度已经不错

现在的限制：

- 浏览器和桌面操作还没有统一宿主抽象
- 主流自定义模型长期还是绕在 ClaudeRuntime 周围，会越来越别扭
- 如果未来任务要脱离前台 App 长期运行，现有架构会越来越吃力

### 3.2 目标结构

目标不是“推翻当前产品”，而是：

- 保留现有 App
- 把宿主能力从 App 聊天流程中抽出来
- 再把主流模型迁到 NativeRuntime

也就是说，最终不是：

- 一个 App 包着一切

而是：

- App 作为控制台
- 后台服务作为执行器
- Runtime 作为大脑
- HostRuntime 作为手和眼

---

## 4. 什么是 Runtime，什么是 HostRuntime

### 4.1 Runtime 是什么

`Runtime` 可以理解为 agent 真正运行的执行内核。它负责：

- 创建会话
- 发送消息给模型
- 接收流式返回
- 处理工具调用
- 维护上下文和会话状态
- 中断、恢复、重试

它不是模型本身，也不是 UI。

### 4.2 你现在已经有一种 Runtime

你现在实际上已经有一套运行内核：

- `ClaudeRuntime`

只是它现在并没有被你显式地当成一个 runtime 模块命名出来，而是散落在当前 Claude SDK 相关实现中。

### 4.3 HostRuntime 是什么

`HostRuntime` 不是“大脑”，而是“手和眼”。

它负责：

- 控制浏览器
- 控制桌面 App
- 截图
- 读取可操作元素
- OCR / vision 兜底
- 生成步骤截图和回放材料

所以以后 SkillsFan 不应该是“每个 runtime 自己想办法控制电脑”，而应该是：

- `ClaudeRuntime` 调用 `HostRuntime`
- `NativeRuntime` 也调用 `HostRuntime`

这样以后换模型，不用重做自动化能力。

---

## 5. OpenClaw 在这些能力上做到什么程度了

这一部分非常重要，因为你要借鉴它，但不能误解它。

### 5.1 OpenClaw 已经明显做好的部分

#### A. 后台服务化

OpenClaw 明确有独立的 gateway / service 体系，可以作为系统服务常驻，不依赖前台窗口。

这部分已经很成熟，可以理解为平台底座。

#### B. 浏览器自动化

OpenClaw 的浏览器自动化已经是标准工具链，而不是“截图 + vision 乱点”。

它的核心逻辑是：

- 先 `snapshot`
- 给元素分 `ref`
- 再用 `click / type / wait / navigate / screenshot` 这些动作操作

这部分是 SkillsFan 最值得直接借鉴的能力模型。

#### C. macOS 宿主能力

OpenClaw 在 macOS 上明确有：

- `Accessibility`
- `AppleScript`
- `Screen Recording`
- `UIAutomationService`
- `ApplicationService`
- `WindowManagementService`
- `MenuService`
- `DockService`
- `DialogService`
- `ScreenCaptureService`

所以它在 macOS 上不是“不会操作电脑”，而是已经有专门的宿主自动化桥接层。

#### D. 多入口统一会话

OpenClaw 通过 route + session key + gateway，把不同入口汇到统一会话和统一执行体系中。

这也是它比单纯 App 架构更平台化的原因。

### 5.2 OpenClaw 不能简单理解成“什么都已经做完了”

需要注意，OpenClaw 虽然底座很强，但不能简单理解成：

- 它已经把任意桌面 App 的通用自动化都完全产品化了
- 它已经把“每一步都截图、标注、再漂亮地发回给用户”的完整产品流全部做成你想象中的成品

更准确地说：

- 它已经有很强的浏览器自动化体系
- 已经有很强的 macOS 宿主能力基础
- 已经有平台化后台结构
- 但你想要的“桌面操作 + 图片回传 + 用户可视化步骤流”的产品形态，仍然需要你自己在 SkillsFan 里结合现有 UI 能力去做

### 5.3 所以你该借鉴什么

最该借鉴的是：

- 浏览器自动化模型
- 宿主能力分层方式
- 后台服务化思路
- route / session key / gateway 平台思路

不应该照抄的是：

- 直接重做整个产品成 OpenClaw
- 先做大一统平台，再想着用户体验

---

## 6. 目标产品能力定义

你真正想要的效果，可以拆成下面 5 条：

1. AI 能操作浏览器
2. AI 能打开和操作其他桌面 App
3. AI 能截当前屏，理解当前界面状态
4. AI 能把每一步操作以截图和说明的形式回传
5. 任务不依赖前台 App 活着，可以长期自动化执行

为了达到这个效果，系统应该有如下能力：

- `Browser Control`
- `Desktop Control`
- `Perception`
- `Step Reporting`
- `Task Orchestration`
- `Background Service`

---

## 7. 总体演变路径

建议分 6 个阶段来做。

---

## 8. 第一阶段：抽出 Runtime 和 HostRuntime 边界

### 8.1 这一阶段做什么

先不重写 Claude SDK，不先碰大规模业务逻辑。  
这一阶段只做一件事：

**把“谁负责思考，谁负责动手”分清楚。**

需要新增的抽象：

- `AgentRuntime`
- `HostRuntime`
- `AutomationTask`
- `StepReport`

### 8.2 为什么先做这个

如果不先抽边界，后面会出现两个问题：

- 浏览器自动化、桌面自动化到处散落在业务代码里
- 以后新增 NativeRuntime 时，又会把这些能力复制一遍

这一步的目的不是给用户新功能，而是给后面搭地基。

### 8.3 这一阶段具体怎么做

建议按下面思路拆：

- 把当前 Claude SDK 执行流程包成 `ClaudeRuntime`
- 把将来要操作浏览器和桌面的能力定义成 `HostRuntime`
- 让聊天流程不直接操作具体宿主细节，而是通过接口调用

例如从职责上理解：

- `ClaudeRuntime.send(...)`
- `HostRuntime.browser.snapshot(...)`
- `HostRuntime.desktop.captureScreen(...)`
- `HostRuntime.desktop.click(...)`

### 8.4 做完有什么效果

- 现有功能不需要推翻
- 后面宿主能力有地方挂
- 未来新增 NativeRuntime 时不需要重做自动化层

### 8.5 OpenClaw 对应借鉴点

借鉴的不是它某一个文件，而是它“runtime 和宿主桥分层”的思路。

---

## 9. 第二阶段：先做浏览器自动化 MVP

### 9.1 为什么先做浏览器

浏览器是最适合先做的自动化场景，因为：

- 页面结构天然可读取
- 成功率远高于桌面 UI 自动化
- 更容易回放
- 更容易做出“AI 会自己操作网页”的强感知效果

### 9.2 这一阶段做什么

先做一套浏览器宿主能力：

- 打开浏览器或新标签
- 导航到目标网址
- 获取结构化页面快照
- 点击元素
- 输入文本
- 等待页面状态变化
- 截图

建议提供的动作：

- `browser.open`
- `browser.navigate`
- `browser.snapshot`
- `browser.click`
- `browser.type`
- `browser.wait`
- `browser.screenshot`

### 9.3 关键设计原则

**不要把浏览器自动化设计成“截图 + vision 看图点点点”。**

正确做法是：

- 先读取页面结构化树
- 给元素分 `ref`
- 模型决定“点击 ref=12”
- 宿主执行器去点这个元素

截图只做：

- 用户可视化回放
- 调试
- vision 兜底

### 9.4 为什么这样设计

这样做的好处：

- token 低
- 控制稳定
- 操作可解释
- 回放天然清晰

### 9.5 OpenClaw 对应借鉴点

这一阶段最直接借鉴 OpenClaw 的浏览器模型：

- `snapshot`
- `ref`
- `act`
- `screenshot`

这是 OpenClaw 目前最成熟、最值得抄的部分。

### 9.6 做完后的用户效果

用户会明显看到：

- AI 自己打开网页
- 自己点按钮、填表单
- 每一步都能看到截图和说明

---

## 10. 第三阶段：做 macOS 桌面宿主 MVP

### 10.1 这一阶段为什么重要

这一步决定 SkillsFan 能不能从“网页操作”变成“电脑操作”。

### 10.2 这一阶段先别追求什么

先不要追求：

- 任意软件都能自动化
- 像人一样什么界面都能识别
- 纯 vision 的万能桌面代理

这些目标太重，第一版不适合。

### 10.3 第一版建议支持哪些 App

只做高频、可控的少数 App：

- `Finder`
- `Terminal`
- `iTerm`
- `Chrome`
- `SkillsFan`

### 10.4 第一版建议支持哪些动作

- 打开应用
- 激活应用
- 切窗口
- 截图
- 点击
- 输入
- 快捷键
- 滚动

### 10.5 执行动作的优先级怎么设计

正确优先级应该是：

1. 应用专用动作
2. Accessibility 元素读取和元素点击
3. AppleScript / 系统事件
4. vision + 坐标点击兜底

### 10.6 为什么不能一开始全靠截图点击

因为全靠截图点击会带来：

- token 高
- 成功率低
- 难以调试
- 不同分辨率容易出问题

而 Accessibility / 应用动作是结构化的，更稳定。

### 10.7 这一阶段具体怎么做

建议拆成几个子模块：

- `DesktopCaptureService`
  负责全屏截图、窗口截图、局部截图

- `DesktopElementService`
  负责读取 macOS 可访问性元素树

- `DesktopActionService`
  负责点击、输入、快捷键、滚动

- `AppAdapters`
  给 `Finder / Terminal / iTerm / Chrome` 做专用动作

### 10.8 OpenClaw 对应借鉴点

OpenClaw 在 macOS 上已经有：

- 权限管理
- 宿主桥
- UIAutomationService
- 应用/窗口/菜单/对话框服务

这一阶段应该借鉴它“宿主桥”思路，而不是去照抄它全部产品形态。

### 10.9 做完后的用户效果

用户会看到：

- AI 不只是会点网页
- 还能打开 Terminal / Finder / Chrome 等真实软件
- 并且每一步都能看到截图和说明

---

## 11. 第四阶段：做 Perception 和 Step Reporter

### 11.1 这一阶段做什么

这是把“能操作”升级成“可理解、可汇报、可回放”。

需要新增两类能力：

- `Perception`
- `StepReporter`

### 11.2 Perception 负责什么

它负责“看见当前状态”。

输入来源包括：

- 浏览器结构化树
- 桌面元素树
- 本地 OCR
- 当前截图
- 必要时 vision 模型

关键原则：

**优先结构化输入，vision 作为补充。**

### 11.3 StepReporter 负责什么

它负责把每一步变成可回放材料。

每一步建议保存：

- 原始截图
- 标注图
- 动作说明
- 动作参数
- 执行前状态
- 执行后状态
- 成功 / 失败原因
- 时间戳

### 11.4 为什么这一步很重要

因为你想要的不只是“AI 能做”，还要：

- 用户看得懂
- 能远程查看
- 能排查失败
- 能把过程作为产品亮点展示

### 11.5 这一阶段怎么做

建议复用你现有的 Artifact / Canvas 能力：

- 每一步输出成 artifact
- 聊天流里显示缩略图和说明
- Canvas 中展示完整步骤流

### 11.6 OpenClaw 对应借鉴点

OpenClaw 有很强的浏览器截图、快照、宿主截图和快照能力，但“面向你这种产品展示风格的步骤流回传”仍然需要 SkillsFan 自己结合现有 UI 能力来做。

所以这里是：

- 底层机制借鉴 OpenClaw
- 产品呈现走 SkillsFan 自己优势

---

## 12. 第五阶段：做 NativeRuntime v1

### 12.1 这一阶段为什么现在不先做

因为你当前最缺的是宿主自动化能力，不是新的模型内核。

如果先做 NativeRuntime，却没有浏览器 / 桌面宿主能力，用户不会强感知。

### 12.2 这一阶段要达到什么目标

让主流自定义模型逐步脱离 ClaudeRuntime。

### 12.3 哪些模型应该进 NativeRuntime

建议第一批承接：

- Kimi
- MiniMax
- GLM
- DeepSeek
- Qwen
- OpenRouter 上主流 OpenAI-compatible 模型

### 12.4 怎么理解 NativeRuntime

不是“每个模型一个 runtime”，而是：

- 一个统一的 `NativeRuntime`
- 下面再接不同 provider adapter

### 12.5 NativeRuntime 第一版做什么

第一版只需要：

- 创建会话
- 流式输出
- 基础工具调用
- 工具结果回填
- 中断
- 基础上下文维护

不要第一版就做太重的：

- 复杂 failover
- 多 provider 高级路由
- 很复杂的多模型推理策略

### 12.6 为什么这样做

因为你的目标不是先成为“平台架构最纯正”，而是：

- 先把主流用户使用的自定义模型承接住
- 并且这些模型能调用同一套 HostRuntime 做自动化

### 12.7 做完后的结构变化

这时系统会变成：

- Claude 用户走 `ClaudeRuntime`
- 主流自定义模型走 `NativeRuntime`
- 自动化能力统一走 `HostRuntime`

---

## 13. 第六阶段：把执行层服务化

### 13.1 这一阶段为什么必须做

如果你真的要支持：

- 长时间自动化
- App 卡住任务还能继续
- 定时任务长期执行
- 多入口控制同一任务
- 自动重启和恢复

那最终必须把执行层独立成后台服务。

### 13.2 这一阶段做什么

要拆出去的包括：

- 自动化执行循环
- 浏览器运行实例
- 桌面宿主调用
- 任务状态
- 恢复逻辑
- 定时任务调度
- 步骤回传

### 13.3 App 还负责什么

前台 App 继续负责：

- 聊天 UI
- 任务控制
- 步骤查看
- 人工接管
- 配置和权限引导

### 13.4 做完后的效果

这一步做完，你的产品就从：

- “桌面 App 里有 AI 功能”

真正变成：

- “本地 AI 自动化平台，桌面 App 只是前台”

### 13.5 OpenClaw 对应借鉴点

这是 OpenClaw 最强的地方之一，它已经有明确的 gateway / daemon / service 结构。  
这也是你后期最值得靠近的方向。

---

## 14. 各阶段优先级和排期建议

如果按投入产出比来排，我建议顺序是：

1. Runtime / HostRuntime 边界
2. 浏览器自动化 MVP
3. 桌面宿主 MVP
4. StepReporter
5. NativeRuntime v1
6. 后台服务化

原因很简单：

- 前 4 项最容易形成用户感知
- 第 5 项开始承接主流自定义模型
- 第 6 项才真正解决长期自动化和稳定性

---

## 15. 哪些能力是 OpenClaw 已有，哪些不是“现成就能抄”

### 15.1 基本可以明确认为 OpenClaw 已有的

- 独立后台服务化思路
- 多入口统一路由与 session
- 浏览器结构化自动化
- macOS 宿主权限与桥接层
- 多 provider 的 runtime / adapter 体系

### 15.2 有基础，但不能简单理解为“已经替你做完产品”的

- 通用桌面 App 自动化的完整产品体验
- 你想要的“每一步漂亮截图回传给用户”的产品层呈现
- SkillsFan 这种前台 UI、Artifact、Canvas 深度融合的展示方式

### 15.3 所以你的正确借鉴方式

应该借鉴：

- 底层机制
- 服务边界
- 自动化思路
- 运行方式

不应该照搬：

- 整个产品结构
- 所有交互形式
- 所有上层表现

---

## 16. 最终建议

如果用一句话概括，这条路应该这样走：

**先保留 ClaudeRuntime，把浏览器和桌面自动化做成共享 HostRuntime，再补 NativeRuntime 承接主流自定义模型，最后把执行层服务化。**

这个顺序的好处是：

- 短期改动最小
- 用户最早感知到价值
- 不会推翻现有 Claude 路线
- 将来可以自然演变成更像 OpenClaw 的平台结构

对 SkillsFan 来说，这条路既务实，也留住了长期平台化空间。

# Codex Sidecar

给官方 Codex 桌面客户端加上整窗主题与自己的组件：任务条目、背景、字体、对话框、顶部额度、右下角悬停工具栏、便签、收藏。

**当前为 Windows 优先的早期 Alpha。** 聊天和上下文继续留在官方客户端；组件通过运行时挂载呈现，不改安装包和更新器。官方界面发生变化时，适配层仍可能需要更新。

Alpha.10 使用「皇家紫金 · 明亮版」整窗主题：浅色玻璃光影背景、深紫选中项与少量香槟金细节，优先使用本机 HarmonyOS Sans SC 字体。左侧可按原生分区切换工作空间。右下角工具条可同时打开便签、收藏和翻译，各自拖动、调整宽高并按对话记住布局。打开后无需 pin 即可保留；切换对话自动收起，回来恢复开关状态与位置尺寸。重复标签栏已隐藏；双击标题栏恢复默认位置。原生表格保持在回复卡片内，宽表格横向滚动。输入框、你的消息和助手回复统一使用 16px 字号与 1.8 倍行距。渐变可以保持静态。额度只显示通用 Codex 池，优先显示 7 天窗口，隐藏 Spark 专属池。设计与功能说明见 [皇家紫金](docs/royal-pearl.md)。

## 开始体验

开发建议使用 Node.js 24 LTS，运行成品需要 Node.js 22.13 或以上。

```powershell
npm ci --ignore-scripts
npm run check
npm run demo
```

打开输出中的 `DEMO_URL` 即可体验。演示额度有明确标记，演示便签单独保存，不会改动当前 Codex。

连接真实客户端：

```powershell
npm run doctor
node dist/cli.js start
```

首次连接需要 Codex 带着本地调试参数启动。如果它已经在运行，程序会说明情况并退出；请先结束手上的工作、正常退出 Codex，再打开 Sidecar。程序不会擅自强关或重启你的窗口。

```powershell
node dist/cli.js stop
```

停止后移除组件，官方客户端继续运行。若要关闭本地调试端口，需完全退出该 Codex 进程，再从原来的 Codex 入口打开。

## 开发和安装位置

源码可以放在 `D:\Projects\Codex-Sidecar`。运行 `scripts\install.ps1` 后，成品默认放到 `D:\Apps\Codex-Sidecar`，并创建桌面入口；安装目录不包含源码或 node_modules。Node 需要预先安装。

桌面入口为无控制台的 Windows 程序，支持开始菜单搜索和 Ctrl+Alt+X。脚本执行策略仅作用于本次子进程。需要登录 Windows 后启动时，运行 `scripts\install.ps1 -EnableStartup`；普通安装不会擅自开启自启动。

个人便签与设置默认保存在 `%USERPROFILE%\.codex-sidecar`，可以用环境变量 `CODEX_SIDECAR_DATA` 改位置。这个目录避免 Windows 把 AppData 写入隔离成不同副本。它们不会跟随项目代码发布到 GitHub。便签与收藏共享到已连接的多个窗口；旧版本保存会提示冲突，避免覆盖刚更新的内容。

Alpha.2 修复重复启动与后台残留：再次打开会等待或沿用现有实例，原来的 Codex 进程退出后，Sidecar 自动收尾。旧版 Alpha.1 的数据目录仍保留；升级前停止旧版，只在新目录尚无状态文件时复制原来的 `state.json`，不要复制锁和停止请求。若隔离目录里也有便签，先分别备份。

翻译只使用当前 Codex 账户的 Sol、medium 推理，会消耗 Codex 额度，但不新建聊天。最近 50 条译文保存在本机，可回看和清空；切换工具不会丢失正在输入的原文。没有本机翻译或第三方翻译入口。

详细运行边界、贡献方式和兼容记录见 [English README](README.md)、[兼容性](docs/compatibility.md) 和 [上游参考](THIRD_PARTY_NOTICES.md)。

MIT 开源。独立社区项目，与 OpenAI 无隶属或背书关系。

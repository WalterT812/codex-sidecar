# Codex Sidecar

给官方 Codex 桌面客户端加上整窗主题与自己的组件：任务条目、背景、字体、对话框、顶部额度、右侧悬停工具栏、便签、收藏。

**当前为 Windows 优先的早期 Alpha。** 聊天和上下文继续留在官方客户端；组件通过运行时挂载呈现，不改安装包和更新器。官方界面发生变化时，适配层仍可能需要更新。

Alpha.3 新增「珠光工坊」整窗主题：浅色界面搭配原创二次元背景，原生任务条目、按钮、菜单、输入框和账户区统一配色。设置中关闭整窗主题即可恢复原样；抽屉封面仍可单独关闭。额度只显示通用 Codex 池，优先显示 7 天窗口，隐藏 Spark 专属池。设计研究见 [珠光工坊](docs/pearl-atelier.md)，实测范围见兼容记录。

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

桌面入口只为本次启动进程允许本地脚本运行，不更改系统或用户级执行策略。启动器会等待组件真正挂载；失败时显示提示和本次日志位置。

个人便签与设置默认保存在 `%USERPROFILE%\.codex-sidecar`，可以用环境变量 `CODEX_SIDECAR_DATA` 改位置。这个目录避免 Windows 把 AppData 写入隔离成不同副本。它们不会跟随项目代码发布到 GitHub。便签与收藏共享到已连接的多个窗口；旧版本保存会提示冲突，避免覆盖刚更新的内容。

Alpha.2 修复重复启动与后台残留：再次打开会等待或沿用现有实例，原来的 Codex 进程退出后，Sidecar 自动收尾。旧版 Alpha.1 的数据目录仍保留；升级前停止旧版，只在新目录尚无状态文件时复制原来的 `state.json`，不要复制锁和停止请求。若隔离目录里也有便签，先分别备份。

翻译组件将在确定服务来源后加入；此版本没有把文字发送给任何翻译服务。

详细运行边界、贡献方式和兼容记录见 [English README](README.md)、[兼容性](docs/compatibility.md) 和 [上游参考](THIRD_PARTY_NOTICES.md)。

MIT 开源。独立社区项目，与 OpenAI 无隶属或背书关系。

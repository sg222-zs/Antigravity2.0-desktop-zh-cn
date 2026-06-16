# Antigravity 2.0 中文补丁

这是一个 Windows 上的 Antigravity 2.0 客户端中文显示补丁。它会在 Electron 外壳的 `app.asar` 中注入显示层翻译脚本。

## 使用方法

以管理员身份运行新的批处理入口：

```text
install-zh-cn.bat
```

安装脚本会在结束或失败时等待按回车，并把完整输出写入 `logs\install-zh-cn-*.log`，方便排查窗口闪退问题。

脚本会自动：

- 定位默认安装目录：`%LOCALAPPDATA%\Programs\antigravity`
- 关闭正在运行的 Antigravity
- 备份 `resources\app.asar`
- 写入中文显示补丁
- 验证 ASAR 和 JS 语法
- 重新启动 Antigravity

如果 Antigravity 安装在其他目录，可以在 PowerShell 中指定路径：

```powershell
.\install-zh-cn.ps1 -AppRoot "D:\Path\To\antigravity"
```

## 恢复原版

以管理员身份运行：

```text
restore-original.bat
```

恢复脚本同样会在 `logs\restore-original-*.log` 写入日志。

它会恢复最近一次安装补丁前自动备份的 `app.asar`。

备份目录位于：

```text
%LOCALAPPDATA%\Programs\antigravity\resources\.zh-cn-backups
```

## 依赖

需要系统 PATH 中可用的 Node.js：

```powershell
node --version
```
没有Node.js的话需要另外自行安装

安装教程https://nodejs.org/zh-cn/download

## 说明

- Antigravity 2.0 的主界面资源由内置服务动态提供，因此本项目采用 DOM 显示层翻译。
- 客户端更新后可能会覆盖 `app.asar`，届时重新运行 `install-zh-cn.bat` 即可。
- 如果出现启动异常，运行 `restore-original.bat` 恢复最近备份。
- 本补丁只做界面显示汉化，不处理登录、账号、网络或 API 功能。

## 安全性

脚本不联网，不收集数据，不写入安装目录之外的业务文件。主要文件操作是：

- 读取和备份 `resources\app.asar`
- 修改 `resources\app.asar`
- 写入备份目录 `.zh-cn-backups`

## 扫描面板说明

扫描面板用于排查和补充补丁词库里还没有覆盖的英文 UI 文案。它不会主动联网，也不会把候选文本上传到任何服务。

启动方式：

在Antigravity客户端界面使用快捷键

```text
Ctrl + Shift + Alt + Z
```

使用方法：

- 先在 Antigravity 里手动打开有英文残留的页面、菜单、下拉框、hover 提示或弹窗。
- 补丁会在点击、hover、聚焦、键盘等真实交互后做深度扫描，把疑似未翻译的英文收集到面板里。
- 按住面板标题栏可以拖动位置，避免遮挡当前界面。
- 面板左侧是原文，右侧可以填写中文译文；点击“保存翻译”后会写入本机 `localStorage`，并立即重新扫描当前界面。
- 留空的项目不会被保存，适合保留品牌名、产品名、插件名、快捷键和不需要翻译的专有名词。

这个面板的作用是让客户端更新后新增的英文 UI 可以先在本机快速补齐；确认翻译没问题后，再把这些映射加入项目内置词库并重新安装补丁。


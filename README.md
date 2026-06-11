# Antigravity 2.0 中文补丁

这是一个 Windows 上的 Antigravity 2.0 客户端中文显示补丁。它会在 Electron 外壳的 `app.asar` 中注入显示层翻译脚本。

## 使用方法

双击运行：

```text
install-zh-cn.cmd
```

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

双击运行：

```text
restore-original.cmd
```

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

## 说明

- Antigravity 2.0 的主界面资源由内置服务动态提供，因此本项目采用 DOM 显示层翻译。
- 客户端更新后可能会覆盖 `app.asar`，届时重新运行 `install-zh-cn.cmd` 即可。
- 如果出现启动异常，运行 `restore-original.cmd` 恢复最近备份。
- 本补丁只做界面显示汉化，不处理登录、账号、网络或 API 功能。

## 安全边界

脚本不联网，不收集数据，不写入安装目录之外的业务文件。主要文件操作是：

- 读取和备份 `resources\app.asar`
- 修改 `resources\app.asar`
- 写入备份目录 `.zh-cn-backups`


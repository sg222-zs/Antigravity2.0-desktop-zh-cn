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

## 残留英文排查

补丁会在界面运行时持续扫描新增的 DOM、弹窗、下拉菜单、Shadow DOM 和同源 iframe。它也会监听点击、hover、聚焦、键盘等真实用户交互，并在交互后做多轮延迟扫描，用来覆盖 hover tooltip、下拉菜单、弹出面板和递归打开的新层级。

补丁不会自动递归点击所有按钮。自动点击会误触删除项目、修改权限、安装组件、登录跳转或联网请求，因此这里采用“用户触发后自动翻译新内容”的方式。

未命中的英文候选可以通过内置面板查看。先打开有英文残留的菜单、下拉框或弹窗，然后按：

```text
Ctrl + Shift + Alt + Z
```

面板可以拖动，按住标题栏移动即可。面板会显示“原文 / 译文”表格。你可以直接在右侧填写中文，点击“保存翻译”，补丁会把这些映射写入本机 `localStorage`，并立即重新扫描当前界面应用翻译。品牌名、项目名、插件说明等不想翻译的内容可以留空。

如果能打开 DevTools，也可以直接读取变量：

```javascript
window.__antigravityZhCnUntranslated
```

候选收集只在点击、hover、聚焦等真实用户交互后的深度扫描中触发；普通后台扫描只负责翻译，不记录候选。候选收集会过滤邮箱、URL、本地路径、代码片段、快捷键、品牌名、单词碎片和已含中文的文本等明显不适合翻译的内容。它只保存在本机页面内存中，不会上传。

也可以在不重新打包 `app.asar` 的情况下临时补充本地词库：

```javascript
window.__antigravityZhCnAddTranslations({
  "Always Proceed": "始终继续",
  "Full Machine": "整机访问"
})
```

这些自定义翻译会保存在当前客户端的 `localStorage`，之后打开同类界面会自动应用。清空自定义词库：

```javascript
window.__antigravityZhCnClearCustomTranslations()
```

不建议默认接入在线翻译 API。界面文本里可能混有项目名、对话标题、路径或账号信息；如果需要接入翻译服务，应只使用本机离线翻译或手动筛选后的短 UI 文案。

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


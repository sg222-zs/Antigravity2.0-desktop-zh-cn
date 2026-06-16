const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const appRoot =
  process.argv[2] ||
  path.join(process.env.LOCALAPPDATA || "", "Programs", "antigravity");
const resourcesDir = path.join(appRoot, "resources");
const asarPath = path.join(resourcesDir, "app.asar");
const backupRoot = path.join(resourcesDir, ".zh-cn-backups");
const blockSize = 4 * 1024 * 1024;

function align4(value) {
  return value + ((4 - (value % 4)) % 4);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function integrity(buffer) {
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += blockSize) {
    blocks.push(sha256(buffer.subarray(offset, offset + blockSize)));
  }
  if (blocks.length === 0) blocks.push(sha256(buffer));
  return {
    algorithm: "SHA256",
    hash: sha256(buffer),
    blockSize,
    blocks,
  };
}

function decodeAsar(data) {
  if (data.length < 16) throw new Error("Invalid ASAR file.");
  const headerSize = data.readUInt32LE(4);
  const headerPickle = data.subarray(8, 8 + headerSize);
  const headerStringSize = headerPickle.readInt32LE(4);
  const headerString = headerPickle
    .subarray(8, 8 + headerStringSize)
    .toString("utf8");
  return { headerSize, header: JSON.parse(headerString) };
}

function encodeHeader(header) {
  const headerString = JSON.stringify(header);
  const headerBytes = Buffer.from(headerString, "utf8");
  const payloadSize = align4(4 + headerBytes.length);
  const pickle = Buffer.alloc(4 + payloadSize);
  pickle.writeUInt32LE(payloadSize, 0);
  pickle.writeInt32LE(headerBytes.length, 4);
  headerBytes.copy(pickle, 8);
  const out = Buffer.alloc(8 + pickle.length);
  out.writeUInt32LE(4, 0);
  out.writeUInt32LE(pickle.length, 4);
  pickle.copy(out, 8);
  return out;
}

function getEntry(header, filePath) {
  let node = header;
  for (const part of filePath.split("/")) {
    if (!node.files || !node.files[part]) {
      throw new Error(`ASAR entry not found: ${filePath}`);
    }
    node = node.files[part];
  }
  if (node.unpacked) throw new Error(`Cannot patch unpacked entry: ${filePath}`);
  return node;
}

function allEntries(node, out = []) {
  for (const child of Object.values(node.files || {})) {
    if (child.files) allEntries(child, out);
    else if (!child.unpacked && child.offset !== undefined) out.push(child);
  }
  return out;
}

function readEntry(data, headerSize, entry) {
  const start = 8 + headerSize + Number(entry.offset);
  return data.subarray(start, start + Number(entry.size));
}

function replaceEntry(asar, filePath, updater) {
  const entry = getEntry(asar.header, filePath);
  const oldOffset = Number(entry.offset);
  const oldSize = Number(entry.size);
  const oldContent = asar.body.subarray(oldOffset, oldOffset + oldSize);
  const oldText = oldContent.toString("utf8");
  const newText = updater(oldText);
  if (newText === oldText) return false;

  const newContent = Buffer.from(newText, "utf8");
  const delta = newContent.length - oldSize;
  entry.size = newContent.length;
  entry.integrity = integrity(newContent);

  if (delta !== 0) {
    for (const other of allEntries(asar.header)) {
      if (other !== entry && Number(other.offset) > oldOffset) {
        other.offset = String(Number(other.offset) + delta);
      }
    }
  }

  asar.body = Buffer.concat([
    asar.body.subarray(0, oldOffset),
    newContent,
    asar.body.subarray(oldOffset + oldSize),
  ]);
  return true;
}

function replaceAll(text, pairs) {
  let out = text;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
}

function regexReplaceAll(text, pairs) {
  let out = text;
  for (const [from, to] of pairs) out = out.replace(from, to);
  return out;
}

function preloadPatch() {
  return `

// zh-CN display patch injected by local Antigravity patcher.
(() => {
  if (globalThis.__antigravityZhCnPatch) return;
  globalThis.__antigravityZhCnPatch = true;

  const exact = new Map(Object.entries({
    "New Window": "新建窗口",
    "No agents running": "没有正在运行的智能体",
    "No agent running": "没有正在运行的智能体",
    "Open Antigravity": "打开 Antigravity",
    "Quit": "退出",
    "Cancel": "取消",
    "Confirm Quit": "确认退出",
    "Are you sure you want to quit?": "确定要退出吗？",
    "There may be agents or background tasks running.": "可能仍有智能体或后台任务正在运行。",
    "Check for Updates": "检查更新",
    "Checking for Updates...": "正在检查更新...",
    "Downloading Update...": "正在下载更新...",
    "Restart to Update": "重启以更新",
    "No updates available": "没有可用更新",
    "Open workspace": "打开工作区",
    "Loading Antigravity": "正在加载 Antigravity",
    "Welcome to Antigravity": "欢迎使用 Antigravity",
    "Welcome to the new Antigravity!": "欢迎使用新版 Antigravity！",
    "Setting up…": "正在设置...",
    "Setting up...": "正在设置...",
    "Download the Antigravity IDE": "下载 Antigravity IDE",
    "Explore the new Antigravity": "探索新版 Antigravity",
    "Docs": "文档",
    "Help": "帮助",
    "File": "文件",
    "Settings": "设置",
    "Projects": "项目",
    "Agents": "智能体",
    "Agent": "智能体",
    "New project": "新建项目",
    "New Project": "新建项目",
    "Search": "搜索",
    "Send": "发送",
    "Retry": "重试",
    "Continue": "继续",
    "Back": "返回",
    "Done": "完成",
    "Save": "保存",
    "Delete": "删除",
    "Edit": "编辑",
    "Close": "关闭",
    "Connect": "连接",
    "Disconnect": "断开连接",
    "Sign in": "登录",
    "Sign In": "登录",
    "Sign out": "退出登录",
    "Sign Out": "退出登录"
  }));

  const phrases = [
    ["Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named ", "Antigravity 已重新设计为以智能体为中心，并加入了新能力。如果你仍然需要代码编辑器，可以下载独立应用 "],
    [" agent running", " 个智能体正在运行"],
    [" agents running", " 个智能体正在运行"]
  ];

  const blocked = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE"]);
  function translateText(value) {
    if (!value || !value.trim()) return value;
    const trimmed = value.trim();
    let replacement = exact.get(trimmed);
    if (replacement) return value.replace(trimmed, replacement);
    let out = value;
    for (const [from, to] of phrases) out = out.split(from).join(to);
    return out;
  }
  function translateAttrs(el) {
    for (const attr of ["title", "aria-label", "placeholder", "alt"]) {
      const value = el.getAttribute && el.getAttribute(attr);
      const translated = translateText(value);
      if (translated && translated !== value) el.setAttribute(attr, translated);
    }
  }
  function walk(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (blocked.has(node.tagName) || node.isContentEditable) {
          node = walker.nextSibling();
          continue;
        }
        translateAttrs(node);
      } else if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && !blocked.has(parent.tagName) && !parent.isContentEditable) {
          const translated = translateText(node.nodeValue);
          if (translated !== node.nodeValue) node.nodeValue = translated;
        }
      }
      node = walker.nextNode();
    }
  }
  function run() { try { walk(document.body || document.documentElement); } catch {} }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
  new MutationObserver(() => {
    clearTimeout(globalThis.__antigravityZhCnPatchTimer);
    globalThis.__antigravityZhCnPatchTimer = setTimeout(run, 50);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
})();
`;
}

function mainWorldPatchScript() {
  return `
(() => {
  const patchVersion = "2026-06-16-marketplace-final-tails-v27";
  if (
    globalThis.__antigravityZhCnMainWorldPatchVersion === patchVersion &&
    globalThis.__antigravityZhCnTranslateNow
  ) {
    globalThis.__antigravityZhCnTranslateNow();
    return;
  }
  clearInterval(globalThis.__antigravityZhCnMainWorldPatchInterval);
  clearTimeout(globalThis.__antigravityZhCnMainWorldPatchTimer);
  for (const observer of globalThis.__antigravityZhCnMainWorldPatchObservers || []) {
    try { observer.disconnect(); } catch {}
  }
  globalThis.__antigravityZhCnMainWorldPatchObservers = [];
  globalThis.__antigravityZhCnMainWorldPatchVersion = patchVersion;
  globalThis.__antigravityZhCnMainWorldPatch = true;

  const exact = new Map(Object.entries({
    "File": "文件",
    "View": "视图",
    "Window": "窗口",
    "New Conversation": "新建对话",
    "New Conversation in Project": "在项目中新建对话",
    "Pin Conversation": "置顶对话",
    "Unpin Conversation": "取消置顶对话",
    "Archive Conversation": "归档对话",
    "Unarchive Conversation": "取消归档对话",
    "Mark As Unread": "标为未读",
    "Mark as Unread": "标为未读",
    "Mark As Read": "标为已读",
    "Mark as Read": "标为已读",
    "Rename": "重命名",
    "Delete Conversation": "删除对话",
    "Toggle Auxiliary Pane": "切换辅助面板",
    "Copy": "复制",
    "Good response": "好的回复",
    "Bad response": "不好的回复",
    "User message": "用户消息",
    "Agent response": "智能体回复",
    "Create New Project": "创建新项目",
    "Create Project": "创建项目",
    "New Project": "新建项目",
    "Quick Start": "快速开始",
    "Select folder(s)": "选择文件夹",
    "Create a new project. You can add folders to it now or later.": "创建新项目。你可以现在或稍后添加文件夹。",
    "Group By": "分组方式",
    "Project": "项目",
    "Status": "状态",
    "None": "无",
    "Sort Conversations": "对话排序",
    "Last Updated": "最近更新",
    "Alphabetical (A-Z)": "按字母顺序 (A-Z)",
    "Date Added": "添加时间",
    "Subtitles": "副标题",
    "Worktree": "工作树",
    "No Subtitle": "无副标题",
    "No conversations yet": "暂无对话",
    "Command Palette": "命令面板",
    "Zoom In": "放大",
    "Zoom Out": "缩小",
    "Reset Zoom": "重置缩放",
    "Toggle Developer Tools": "切换开发者工具",
    "Minimize": "最小化",
    "Maximize": "最大化",
    "Close": "关闭",
    "Conversation History": "对话历史",
    "Scheduled Tasks": "定时任务",
    "Projects": "项目",
    "Conversations": "对话",
    "Settings": "设置",
    "Install IDE": "安装 IDE",
    "Ask anything, @ to mention, / for actions": "输入问题，@ 提及，/ 执行动作",
    "Local": "本地",
    "General": "常规",
    "Account": "账户",
    "Permissions": "权限",
    "Appearance": "外观",
    "Models": "模型",
    "Customizations": "自定义",
    "Browser": "浏览器",
    "App": "应用",
    "Not in Project": "不在项目中",
    "Shortcuts": "快捷键",
    "Provide Feedback": "提供反馈",
    "Agent Settings": "智能体设置",
    "Security Preset": "安全预设",
    "Custom": "自定义",
    "Outside of folders file access policy": "文件夹外文件访问策略",
    "Terminal Command Auto Execution": "终端命令自动执行",
    "Require Review": "需要确认",
    "Always Ask": "始终询问",
    "Agent Behavior": "智能体行为",
    "Artifact Review Policy": "Artifact 审查策略",
    "Local Permissions": "本地权限",
    "File Access Rules": "文件访问规则",
    "Network Access Rules": "网络访问规则",
    "Terminal Commands": "终端命令",
    "Open": "打开",
    "Add": "添加",
    "Remove": "移除",
    "Allow": "允许",
    "Deny": "拒绝",
    "Allowed": "允许",
    "Denied": "拒绝",
    "Allowed Paths": "允许的路径",
    "Denied Paths": "拒绝的路径",
    "Allowed URLs": "允许的 URL",
    "Denied URLs": "拒绝的 URL",
    "Allowed Commands": "允许的命令",
    "Denied Commands": "拒绝的命令",
    "Add Rule": "添加规则",
    "Add rule": "添加规则",
    "Remove Rule": "移除规则",
    "Save Changes": "保存更改",
    "Save changes": "保存更改",
    "Create": "创建",
    "Name": "名称",
    "Description": "描述",
    "Path": "路径",
    "Command": "命令",
    "Arguments": "参数",
    "Environment Variables": "环境变量",
    "Server Name": "服务器名称",
    "Install": "安装",
    "Installed": "已安装",
    "Installing": "正在安装",
    "Enabled": "已启用",
    "Disabled": "已禁用",
    "Enable": "启用",
    "Disable": "禁用",
    "Request Review": "请求确认",
    "Always Allow": "始终允许",
    "Always Deny": "始终拒绝",
    "Ask Every Time": "每次询问",
    "Ask every time": "每次询问",
    "Learn more.": "了解更多。",
    "global settings": "全局设置",
    "Toggle Sidebar": "切换侧边栏",
    "Go Back": "后退",
    "Go Forward": "前进",
    "Display Options": "显示选项",
    "Add context": "添加上下文",
    "Record voice memo": "录制语音备忘",
    "Select Environment": "选择环境",
    "Message input": "消息输入",
    "Typeahead menu": "自动补全菜单",
    "New Window": "新建窗口",
    "Docs": "文档",
    "Quit": "退出",
    "Cancel": "取消",
    "Confirm Quit": "确认退出",
    "Are you sure you want to quit?": "确定要退出吗？",
    "There may be agents or background tasks running.": "可能仍有智能体或后台任务正在运行。",
    "Check for Updates": "检查更新",
    "Checking for Updates...": "正在检查更新...",
    "Downloading Update...": "正在下载更新...",
    "Restart to Update": "重启以更新",
    "No updates available": "没有可用更新",
    "Manage project folders, agent settings, and permissions.": "管理项目文件夹、智能体设置和权限。",
    "Folders": "文件夹",
    "Add Folder": "添加文件夹",
    "Skip": "跳过",
    "Default": "默认",
    "Learn more about Default": "了解默认设置",
    "Commands Outside Sandbox": "沙盒外命令",
    "MCP Tools": "MCP 工具",
    "Danger Zone": "危险区域",
    "Delete Project": "删除项目",
    "Manage your plan, credentials, and general preferences.": "管理你的套餐、凭据和常规偏好设置。",
    "Enable Telemetry": "启用遥测",
    "Marketing Emails": "营销邮件",
    "Your Plan: Google AI Pro": "当前套餐：Google AI Pro",
    "Upgrade": "升级",
    "Email": "邮箱",
    "Sign Out": "退出登录",
    "Sign In": "登录",
    "Authentication Required": "需要登录",
    "Open Settings": "打开设置",
    "Not Signed In": "未登录",
    "Sign in to use Antigravity!": "登录后使用 Antigravity！",
    "No models available": "暂无可用模型",
    "Learn more": "了解更多",
    "Learn more about": "了解",
    "By using this app, you agree to its": "使用此应用即表示你同意其",
    "Terms of Service": "服务条款",
    "Configure global allowed and denied resource permissions. Learn more.": "配置全局允许和拒绝的资源权限。了解更多。",
    "Project-Specific Settings": "项目专属设置",
    "Project Settings": "项目设置",
    "Go To Projects": "前往项目",
    "Go to Projects": "前往项目",
    "File Permissions": "文件权限",
    "Network Permissions": "网络权限",
    "Terminal & Tooling Permissions": "终端和工具权限",
    "Configure the agent's visual theme and display preferences.": "配置智能体的视觉主题和显示偏好。",
    "Chat Settings": "聊天设置",
    "Verbose agent chat": "显示详细智能体聊天",
    "Display and preserve intermediate thinking steps": "显示并保留中间思考步骤",
    "Select light, dark, or inherit system settings.": "选择浅色、深色或跟随系统设置。",
    "Dark": "深色",
    "Light Theme": "浅色主题",
    "Dark Theme": "深色主题",
    "Preset": "预设",
    "Default Light": "默认浅色",
    "Default Dark": "默认深色",
    "Background": "背景",
    "Foreground": "前景",
    "Accent": "强调色",
    "Configure AI models and view your quota.": "配置 AI 模型并查看你的配额。",
    "Refresh": "刷新",
    "Model Credits": "模型点数",
    "Enable AI Credit Overages": "启用 AI 点数超额使用",
    "Model Quota": "模型配额",
    "Configure default behaviors, skills, and MCP servers. Learn more.": "配置默认行为、技能和 MCP 服务器。了解更多。",
    "Token Usage": "Token 使用量",
    "Installed MCP Servers": "已安装的 MCP 服务器",
    "Add MCP": "添加 MCP",
    "No MCP Servers": "没有 MCP 服务器",
    "Build With Google Plugins": "使用 Google 插件构建",
    "Customize": "自定义",
    "Browser Settings": "浏览器设置",
    "Browser Javascript Execution Policy": "浏览器 JavaScript 执行策略",
    "Request Review": "请求确认",
    "Actuation Permissions": "浏览器操作权限",
    "Browser Actuation Rules": "浏览器操作规则",
    "App Settings": "应用设置",
    "Manage application settings.": "管理应用设置。",
    "Prevent Sleep": "防止休眠",
    "Keep In Menu Bar": "保留在菜单栏",
    "Notifications": "通知",
    "Notification Settings": "通知设置",
    "Open System Preferences": "打开系统偏好设置",
    "Edit": "编辑",
    "Edit project name": "编辑项目名称",
    "Sidebar": "侧边栏",
    "Describe the bug you encountered...": "描述你遇到的问题...",
    "Please list the steps to reproduce the issue": "请列出复现该问题的步骤",
    "Refresh quota and credits data": "刷新配额和点数数据",
    "Plan": "套餐",
    "Current Plan:": "当前套餐：",
    "Current plan:": "当前套餐：",
    "Gemini Models": "Gemini 模型",
    "Weekly Limit": "每周限额",
    "Five Hour Limit": "五小时限额",
    "Five-Hour Limit": "五小时限额",
    "5-hour limit": "五小时限额",
    "Model Limits": "模型限额",
    "Rate Limits": "速率限制",
    "Always Proceed": "始终继续",
    "Always proceed": "始终继续",
    "Proceed": "继续",
    "Block all browser JavaScript execution.": "阻止所有浏览器 JavaScript 执行。",
    "Prompt for approval before running browser scripts.": "运行浏览器脚本前请求批准。",
    "Allow full browser script execution without prompting.": "无需提示即可允许完整的浏览器脚本执行。",
    "Full Machine": "整机访问",
    "Full machine": "整机访问",
    "Turbo Mode": "极速模式",
    "Turbo mode": "极速模式",
    "Requires manual review for all terminal commands and file accesses outside of the working folders.": "所有终端命令以及工作文件夹外的文件访问都需要手动确认。",
    "All terminal commands require review. The agent can read or write to any file in the machine.": "所有终端命令都需要确认。智能体可以读取或写入此电脑上的任何文件。",
    "Disables all safety barriers for maximal iteration velocity.": "禁用所有安全屏障，以获得最快迭代速度。",
    "There are no customizations enabled.": "当前未启用任何自定义内容。",
    "No customizations enabled.": "当前未启用任何自定义内容。",
    "Add MCP +": "添加 MCP +",
    "Add MCP Server": "添加 MCP 服务器",
    "Add MCP server": "添加 MCP 服务器",
    "MCP Servers": "MCP 服务器",
    "Use Google Plugins to Build": "使用 Google 插件构建",
    "Build with Google Plugins": "使用 Google 插件构建",
    "Google Plugins": "Google 插件",
    "No MCP servers": "没有 MCP 服务器",
    "No MCP Servers": "没有 MCP 服务器",
    "No MCP servers installed": "未安装 MCP 服务器",
    "No MCP Servers Installed": "未安装 MCP 服务器",
    "Browser Operations": "浏览器操作",
    "Browser Operation Rules": "浏览器操作规则",
    "Browser operation rules": "浏览器操作规则",
    "JavaScript Execution Policy": "JavaScript 执行策略",
    "Browser JavaScript Execution Policy": "浏览器 JavaScript 执行策略",
    "Browser Javascript Execution Policy": "浏览器 JavaScript 执行策略",
    "Actuation Rules": "操作规则",
    "File Access Rule": "文件访问规则",
    "Network Access Rule": "网络访问规则",
    "Terminal Command": "终端命令",
    "Sandbox Command": "沙盒外命令",
    "Outside Sandbox Commands": "沙盒外命令",
    "Open Rule Editor": "打开规则编辑器",
    "Edit Rule": "编辑规则",
    "Delete Rule": "删除规则",
    "Save Rule": "保存规则",
    "Customizations Budget": "自定义预算",
    "Customization Budget": "自定义预算",
    "Token Budget": "Token 预算",
    "Quota": "配额",
    "Limit": "限额",
    "Limits": "限额",
    "Used": "已使用",
    "Refreshes": "刷新",
    "Refreshes in": "刷新倒计时",
    "Fully refreshes in": "完全刷新倒计时",
    "Show all": "显示全部",
    "Show All": "显示全部",
    "Not in project": "不在项目中",
    "Not In Project": "不在项目中",
    "Dialog": "对话框",
    "Conversation": "对话",
    "Workspace": "工作区",
    "Workspaces": "工作区",
    "Folder": "文件夹",
    "Folders": "文件夹",
    "URL": "URL",
    "URLs": "URL",
    "Review": "确认",
    "Reviews": "确认",
    "Prompt": "提示",
    "Prompts": "提示",
    "Approval": "批准",
    "Approvals": "批准",
    "Rejected": "已拒绝",
    "Approved": "已批准",
    "Blocked": "已阻止",
    "Proceeding": "正在继续",
    "Model Context Protocol": "Model Context Protocol",
    "MCP": "MCP",
    "Google AI Pro": "Google AI Pro",
    "Google AI Ultra": "Google AI Ultra",
    "Add MCP Servers": "添加 MCP 服务器",
    "Browser Actuation Permissions": "浏览器操作权限",
    "Allow/deny agent browser actuation access to specific URLs.": "允许或拒绝智能体对特定 URL 的浏览器操作访问。",
    "Allow/deny agent command execution outside the sandbox.": "允许或拒绝智能体在沙盒外执行命令。",
    "Allow/deny agent read access to specific URLs or domains.": "允许或拒绝智能体读取特定 URL 或域名。",
    "Allow/deny agent read access to specific files or directories.": "允许或拒绝智能体读取特定文件或目录。",
    "Allow/deny agent write access to specific files or directories.": "允许或拒绝智能体写入特定文件或目录。",
    "Allow/deny specific terminal commands.": "允许或拒绝特定终端命令。",
    "File Reads": "文件读取",
    "File Writes": "文件写入",
    "Read URLs": "读取 URL",
    "Execute URLs": "执行 URL",
    "Delete server": "删除服务器",
    "Dismiss error": "关闭错误",
    "Loading MCP servers...": "正在加载 MCP 服务器...",
    "Loading plugins...": "正在加载插件...",
    "Loading token usage...": "正在加载 Token 使用量...",
    "Loading workspace customizations...": "正在加载工作区自定义内容...",
    "No token data available.": "暂无 Token 数据。",
    "Editor": "编辑器",
    "Editor Settings": "编辑器设置",
    "Open Editor Settings": "打开编辑器设置",
    "To modify editor settings, open Settings within the editor window.": "如需修改编辑器设置，请在编辑器窗口中打开设置。",
    "Configure editor-specific behaviors and shortcuts.": "配置编辑器专属行为和快捷键。",
    "Configure tab completion, suggestions, and navigation behavior.": "配置 Tab 补全、建议和导航行为。",
    "Keyboard shortcuts for quick navigation and control.": "用于快速导航和控制的键盘快捷键。",
    "Navigation": "导航",
    "Layout Controls": "布局控制",
    "Selection Actions": "选区操作",
    "Show Selection Actions": "显示选区操作",
    "Show \\"Edit\\" and \\"Chat\\" buttons when selecting text in the editor.": "在编辑器中选择文本时显示“编辑”和“聊天”按钮。",
    "Find in Pane": "在面板中查找",
    "Focus Input": "聚焦输入框",
    "Open Conversation Picker": "打开对话选择器",
    "Open File Search": "打开文件搜索",
    "Select Next Conversation": "选择下一个对话",
    "Select Previous Conversation": "选择上一个对话",
    "Select Project": "选择项目",
    "Toggle Model Selector": "切换模型选择器",
    "Toggle Voice Recording": "切换语音录制",
    "Bug Report": "错误报告",
    "Feature Request": "功能请求",
    "General Feedback": "一般反馈",
    "Feedback Type": "反馈类型",
    "Auth and Billing": "认证和账单",
    "Actual behavior": "实际行为",
    "Expected behavior": "预期行为",
    "Steps to Reproduce": "复现步骤",
    "Steps to reproduce the issue": "复现问题的步骤",
    "Any error messages": "错误信息",
    "Any error messages seen when trying to log in": "尝试登录时看到的错误信息",
    "Any relevant information": "其他相关信息",
    "Attach a screenshot (optional)": "附加截图（可选）",
    "Attach Antigravity server logs": "附加 Antigravity 服务器日志",
    "Attaching logs requires an email address": "附加日志需要邮箱地址",
    "We recommend attaching logs. Attaching logs will help the Antigravity team act on and prioritize your feedback.": "建议附加日志。日志可以帮助 Antigravity 团队处理并优先安排你的反馈。",
    "Please describe the issue in detail. The more actionable your feedback, the quicker our team can address your request. Some helpful information includes:": "请详细描述问题。反馈越可操作，团队就能越快处理你的请求。可包含以下信息：",
    "Please describe the feature you'd like to see. The more detailed the requirements, the easier it will be for our team to incorporate your ideas. Some helpful information includes:": "请描述你希望看到的功能。需求越详细，团队越容易采纳你的想法。可包含以下信息：",
    "Please describe your auth or billing issue. More details will help our support team resolve your issue quicker. Some helpful information includes:": "请描述你的认证或账单问题。更多细节可帮助支持团队更快解决。可包含以下信息：",
    "For any feedback that does not fit into the above categories.": "用于不属于以上类别的其他反馈。",
    "How this feature would help you and other users": "这个功能如何帮助你和其他用户",
    "What is missing in your workflow": "你的工作流缺少什么",
    "What you would like to see to address this gap in your workflow": "你希望通过什么方式补齐这个工作流缺口",
    "What functionality you expect your account tier to have available that is missing": "你期望当前账号等级应具备但缺失的功能",
    "What quota or feature is being incorrectly limited": "哪个配额或功能被错误限制",
    "Submit": "提交",
    "Download": "下载",
    "Setup": "设置",
    "Recommended": "推荐",
    "Marketplace": "市场",
    "Marketplace Gallery URL": "市场图库 URL",
    "Marketplace Item URL": "市场条目 URL",
    "Changes the base URL for marketplace search results. You must restart Antigravity to use the new marketplace after changing this value.": "更改市场搜索结果的基础 URL。修改后必须重启 Antigravity 才能使用新的市场。",
    "Changes the base URL on each extension page. You must restart Antigravity to use the new marketplace after changing this value.": "更改每个扩展页面的基础 URL。修改后必须重启 Antigravity 才能使用新的市场。",
    "Build with Antigravity Plugins": "使用 Antigravity 插件构建",
    "Plugins are packaged collections of skills and MCPs to help the Agent in": "插件是技能和 MCP 的打包集合，用于帮助智能体",
    "work with Google developer products. You can always change your choices in Settings.": "使用 Google 开发者产品。你随时可以在设置中更改选择。",
    "External tools the agent can call via Model Context Protocol.": "智能体可通过 Model Context Protocol 调用的外部工具。",
    "Search MCP servers by name": "按名称搜索 MCP 服务器",
    "Enter tool name or server...": "输入工具名称或服务器...",
    "MCP Configuration Error:": "MCP 配置错误：",
    "Google Drive integration not available": "Google Drive 集成不可用",
    "For help, visit": "如需帮助，请访问",
    "and": "和",
    "including": "包括",
    ". Local permissions have higher priority.": "。本地权限优先级更高。",
    "Inherits from": "继承自",
    "Add scheduled task": "添加定时任务",
    "No scheduled tasks configured.": "尚未配置定时任务。",
    "Search conversations...": "搜索对话...",
    "Search tasks...": "搜索任务...",
    "Outside of Project": "项目外",
    "Permanently delete": "永久删除",
    "File Picker": "文件选择器",
    "Avatar URL": "头像 URL",
    "Bot Name": "机器人名称",
    "Enter avatar URL (optional)": "输入头像 URL（可选）",
    "Enter bot name (optional)": "输入机器人名称（可选）",
    "Setup Jetski Chat": "设置 Jetski Chat",
    "Configure a chat bot so you can use Jetski directly from Google Chat.": "配置聊天机器人，以便直接在 Google Chat 中使用 Jetski。",
    "Manage your notification preferences.": "管理你的通知偏好。",
    "Using the Antigravity Python SDK to build AI agents": "使用 Antigravity Python SDK 构建 AI 智能体",
    "Add MCP Servers": "添加 MCP 服务器",
    "A Model Context Protocol server for interacting with MongoDB Atlas.": "用于与 MongoDB Atlas 交互的 Model Context Protocol 服务器。",
    "A Model Context Protocol server that provides structured thinking and reasoning capabilities for LLM conversations.": "为 LLM 对话提供结构化思考和推理能力的 Model Context Protocol 服务器。",
    "An MCP server implementation that integrates the Perplexity Sonar API to provide real-time, web-wide research capabilities.": "集成 Perplexity Sonar API 的 MCP 服务器实现，可提供实时的全网研究能力。",
    "Atlassian MCP Server for interacting with Atlassian products.": "用于与 Atlassian 产品交互的 Atlassian MCP 服务器。",
    "Airweave lets agents search any app.": "Airweave 可让智能体搜索任何应用。",
    "Chrome DevTools for agents": "面向智能体的 Chrome DevTools",
    "Enable Antigravity to control and inspect a live Chrome browser, with access to the full power of Chrome DevTools for reliable automation, in-depth debugging, and performance analysis.": "允许 Antigravity 控制和检查实时 Chrome 浏览器，并使用 Chrome DevTools 的完整能力进行可靠自动化、深入调试和性能分析。",
    "Reliable automation, in-depth debugging, and performance analysis in Chrome using Chrome DevTools and Puppeteer": "使用 Chrome DevTools 和 Puppeteer 在 Chrome 中进行可靠自动化、深入调试和性能分析",
    "Enable Antigravity to deploy apps to Google Cloud Run.": "允许 Antigravity 将应用部署到 Google Cloud Run。",
    "Enable Antigravity to interact with Google Kubernetes Engine (GKE).": "允许 Antigravity 与 Google Kubernetes Engine (GKE) 交互。",
    "Access resources in the Cloud Logging platform using natural language.": "使用自然语言访问 Cloud Logging 平台中的资源。",
    "Access resources in the Cloud Monitoring platform using natural language.": "使用自然语言访问 Cloud Monitoring 平台中的资源。",
    "Access enterprise mobility data using natural language queries about device fleets, automated auditing of policy compliance, and the integration of device management data into broader automated workflows.": "通过自然语言查询设备群、自动审计策略合规性，并将设备管理数据集成到更广泛的自动化工作流中，从而访问企业移动管理数据。",
    "Connect your Supabase projects to AI assistants. This MCP server allows managing tables, fetching config, executing SQL queries, managing edge functions, and working with database schema in your Supabase projects.": "将你的 Supabase 项目连接到 AI 助手。此 MCP 服务器可管理表、获取配置、执行 SQL 查询、管理边缘函数，并处理 Supabase 项目中的数据库架构。",
    "Core tools and knowledge required to develop for Android": "Android 开发所需的核心工具和知识",
    "Curated collection of agent skills for science.": "面向科学场景精选的智能体技能集合。",
    "Figma Dev Mode MCP": "Figma 开发模式 MCP",
    "The Dev Mode MCP Server brings Figma directly into your workflow by providing important design information and context to AI agents generating code from Figma design files.": "开发模式 MCP 服务器会向根据 Figma 设计文件生成代码的 AI 智能体提供重要设计信息和上下文，从而将 Figma 直接带入你的工作流。",
    "The Dart and Flutter MCP server exposes Dart (and Flutter) development tool actions to compatible AI-assistant clients.": "Dart 和 Flutter MCP 服务器会向兼容的 AI 助手客户端暴露 Dart（和 Flutter）开发工具操作。",
    "The Firebase Model Context Protocol (MCP) Server gives AI-powered development tools the ability to work with your Firebase projects and your app's codebase.": "Firebase Model Context Protocol (MCP) 服务器让 AI 开发工具能够处理你的 Firebase 项目和应用代码库。",
    "The Genkit Model Context Protocol (MCP) Server gives AI-powered development tools the ability to build, debug and inspect your Genkit app.": "Genkit Model Context Protocol (MCP) 服务器让 AI 开发工具能够构建、调试和检查你的 Genkit 应用。",
    "The GitHub MCP Server is a Model Context Protocol (MCP) server that provides seamless integration with GitHub APIs, enabling advanced automation and interaction capabilities for developers and tools.": "GitHub MCP 服务器是一个 Model Context Protocol (MCP) 服务器，可与 GitHub API 无缝集成，为开发者和工具提供高级自动化与交互能力。",
    "The Heroku Platform MCP Server enables seamless interaction with Heroku Platform resources, allowing LLMs to read, manage, and operate applications, add-ons, databases, and more.": "Heroku Platform MCP 服务器支持与 Heroku Platform 资源无缝交互，让 LLM 能够读取、管理和操作应用、附加组件、数据库等。",
    "The Locofy MCP Server enables Locofy.ai code to be integrated and extended with your IDE.": "Locofy MCP 服务器可让 Locofy.ai 代码与你的 IDE 集成并扩展。",
    "The MCP Toolbox for Databases is an open-source MCP server designed to simplify and secure the development of tools for interacting with databases.": "MCP Toolbox for Databases 是一个开源 MCP 服务器，旨在简化并保护数据库交互工具的开发。",
    "The Pinecone MCP Server enables AI tools to search Pinecone documentation, configure indexes, generate code informed by your index configuration, and upsert/search data in your Pinecone indexes.": "Pinecone MCP 服务器让 AI 工具能够搜索 Pinecone 文档、配置索引、基于索引配置生成代码，并在 Pinecone 索引中写入或搜索数据。",
    "The Postman MCP Server connects Postman to AI tools, giving AI agents and assistants the ability to access workspaces, manage collections and environments, evaluate APIs, and automate workflows through natural language interactions.": "Postman MCP 服务器将 Postman 连接到 AI 工具，让 AI 智能体和助手能够访问工作区、管理集合和环境、评估 API，并通过自然语言交互自动化工作流。",
    "The Prisma MCP Server enables AI tools to interact with Prisma for creating and managing Postgres databases easily.": "Prisma MCP 服务器让 AI 工具能够与 Prisma 交互，轻松创建和管理 Postgres 数据库。",
    "The Spanner remote MCP server lets you access and run Spanner tools to create, manage, and query Spanner resources from your AI-enabled development environments and AI agent platforms.": "Spanner 远程 MCP 服务器可让你在支持 AI 的开发环境和智能体平台中访问并运行 Spanner 工具，以创建、管理和查询 Spanner 资源。",
    "The Stripe Model Context Protocol server allows you to integrate with Stripe APIs through function calling. This protocol supports various tools to interact with different Stripe services.": "Stripe Model Context Protocol 服务器可让你通过函数调用集成 Stripe API。该协议支持多种工具与不同的 Stripe 服务交互。",
    "The gopls Model Context Protocol (MCP) server provides tools for semantic code analysis, live diagnostics, and transformation of your non-google3 Go codebase.": "gopls Model Context Protocol (MCP) 服务器为非 google3 Go 代码库提供语义代码分析、实时诊断和代码转换工具。",
    "This MCP server provides your LLM with docs and examples to instrument your AI apps with Arize AX. It also provides access to Arize support. Connect it to your IDE or LLM and get curated tracing examples, best practices and Arize support!": "此 MCP 服务器为你的 LLM 提供文档和示例，用于通过 Arize AX 为 AI 应用接入观测能力。它还提供 Arize 支持入口。连接到 IDE 或 LLM 后，可获得精选追踪示例、最佳实践和 Arize 支持。",
    "Harness MCP Server allows AI assistants to interact with the Harness platform APIs, enabling intelligent automation and assistance for software delivery and cloud operations.": "Harness MCP 服务器允许 AI 助手与 Harness 平台 API 交互，为软件交付和云运维提供智能自动化与辅助能力。",
    "Interact directly with the PostHog product analytics platform using natural language. Run queries, manage feature flags, track errors, and manage projects.": "使用自然语言直接与 PostHog 产品分析平台交互。可运行查询、管理功能开关、跟踪错误并管理项目。",
    "Interact with Redis key-value stores": "与 Redis 键值存储交互",
    "Interact with documents stored in a Firestore database using natural language.": "使用自然语言与 Firestore 数据库中存储的文档交互。",
    "Keep your coding agent up to date with the latest web best practices.": "让你的编码智能体保持最新的 Web 最佳实践。",
    "MCP Toolbox for Databases": "数据库 MCP 工具箱",
    "Manage Pub/Sub resources and publish messages. Create, list, get, update, and delete Pub/Sub topics, subscriptions, and snapshots, as well as publish messages to topics.": "管理 Pub/Sub 资源并发布消息。可创建、列出、获取、更新和删除 Pub/Sub 主题、订阅和快照，也可向主题发布消息。",
    "Manage clusters for Managed Service for Apache Kafka and Kafka Connect using natural language.": "使用自然语言管理 Managed Service for Apache Kafka 和 Kafka Connect 的集群。",
    "Neon MCP Server is an open-source tool that lets you interact with your Neon Postgres databases in natural language.": "Neon MCP 服务器是一个开源工具，可让你使用自然语言与 Neon Postgres 数据库交互。",
    "Netlify MCP Server enables AI assistants to interact with Netlify's platform for managing sites, deployments, domains, and other web development workflows.": "Netlify MCP 服务器让 AI 助手能够与 Netlify 平台交互，用于管理站点、部署、域名和其他 Web 开发工作流。",
    "Official Linear.app MCP Server for interacting with Linear projects, issues, and workflows.": "用于与 Linear 项目、议题和工作流交互的官方 Linear.app MCP 服务器。",
    "Official Notion MCP Server that allows interaction with Notion workspaces, pages, databases, and comments via the Notion API.": "官方 Notion MCP 服务器，可通过 Notion API 与 Notion 工作区、页面、数据库和评论交互。",
    "Official PayPal MCP Server that allows integration with PayPal APIs for payment processing, transaction management, and account operations.": "官方 PayPal MCP 服务器，可集成 PayPal API，用于支付处理、交易管理和账户操作。",
    "Perform searches on ingested data in Google-owned data stores.": "在 Google 拥有的数据存储中对已摄取的数据执行搜索。",
    "Prototype, build & run modern apps users love with Firebase's backend, AI, and operational infrastructure.": "借助 Firebase 的后端、AI 和运维基础设施，原型设计、构建并运行用户喜爱的现代应用。",
    "Search your Google Cloud projects using natural language.": "使用自然语言搜索你的 Google Cloud 项目。",
    "SonarQube MCP Server enables AI assistants to interact with SonarQube instances for code quality analysis, project management, and quality gate operations.": "SonarQube MCP 服务器让 AI 助手能够与 SonarQube 实例交互，用于代码质量分析、项目管理和质量门禁操作。",
    "Sonatype MCP server for interacting with our dependency management and security intelligence platform.": "用于与依赖管理和安全情报平台交互的 Sonatype MCP 服务器。",
    "The Bigtable Admin remote MCP server lets you manage Bigtable resources.": "Bigtable Admin 远程 MCP 服务器可让你管理 Bigtable 资源。",
    "Vertex AI Search": "Vertex AI Search"
  }));

  const phrases = [
    ["并访问项目和屏幕 details. See https://stitch.withgoogle.com/docs for mor", "并访问项目和屏幕详情。更多信息请查看 https://stitch.withgoogle.com/docs"],
    ["details. See https://stitch.withgoogle.com/docs for mor", "详情。更多信息请查看 https://stitch.withgoogle.com/docs"],
    ["information for Google's products such as Firebase, Google Cloud,", "Google 产品的信息，例如 Firebase、Google Cloud、"],
    ["查看备份和账单详情，让智能体工具能够利用 ClickHous", "查看备份和账单详情，让智能体工具能够利用 ClickHouse"],
    ["and instance 模板、管理磁盘和快照，并检索预留和承诺使用相关", "和实例模板、管理磁盘和快照，并检索预留和承诺使用相关"],
    ["管理实例组管理器 and instance 模板", "管理实例组管理器和实例模板"],
    ["The Stitch MCP server enables AI assistants to interact with Stitch for vibe design: generating UI designs from text and images, and accessing project and screen details. See https://stitch.withgoogle.com/docs for mor", "Stitch MCP 服务器让 AI 助手能够与 Stitch 交互，用于 vibe design：根据文本和图片生成 UI 设计，并访问项目和屏幕详情。更多信息请查看 https://stitch.withgoogle.com/docs"],
    ["The Google Developer Knowledge MCP server gives AI-powered development tools the ability to search Google's official developer documentation and retrieve information for Google's products such as Firebase, Google Cloud,", "Google Developer Knowledge MCP 服务器让 AI 开发工具能够搜索 Google 官方开发者文档，并检索 Firebase、Google Cloud 等 Google 产品的信息。"],
    ["The ClickHouse MCP server enables agents to securely interact with ClickHouse databases. It provides a universal interface to execute SQL, explore data, and view backup & billing details, allowing agentic tooling to leverage ClickHous", "ClickHouse MCP 服务器让智能体能够安全地与 ClickHouse 数据库交互。它提供通用接口，用于执行 SQL、探索数据、查看备份和账单详情，让智能体工具能够利用 ClickHouse。"],
    ["Perform a range of infrastructure management tasks, including: manage virtual machine (VM) instances, manage instance group managers and instance templates, manage disks and snapshots, retrieve information about reservations and commitments", "执行一系列基础设施管理任务，包括：管理虚拟机 (VM) 实例、管理实例组管理器和实例模板、管理磁盘和快照，并检索预留和承诺使用相关信息"],
    ["AlloyDB for PostgreSQL 远程 MCP 服务器可让你访问并运行 AlloyDB 工具，用于管理 AlloyDB 集群和实例、管理用户、创建和恢复 备份、管理用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。", "AlloyDB for PostgreSQL 远程 MCP 服务器可让你访问并运行 AlloyDB 工具，用于管理 AlloyDB 集群和实例、管理用户、创建和恢复备份、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。"],
    ["The Cloud SQL remote MCP server lets you access and run Cloud SQL tools to manage Cloud SQL instances, manage users, create and restore 备份、管理用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。", "Cloud SQL 远程 MCP 服务器可让你访问并运行 Cloud SQL 工具，用于管理 Cloud SQL 实例、管理用户、创建和恢复备份、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。"],
    ["Cloud SQL 远程 MCP 服务器可让你访问并运行 Cloud SQL 工具，用于管理 Cloud SQL 实例、管理用户、创建和恢复备份、执行管理操作 用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。", "Cloud SQL 远程 MCP 服务器可让你访问并运行 Cloud SQL 工具，用于管理 Cloud SQL 实例、管理用户、创建和恢复备份、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。"],
    ["ClickHouse MCP 服务器让智能体能够安全地与 ClickHouse 数据库交互。它提供通用接口，用于执行 SQL、探索数据并查看 备份和账单详情，让智能体工具能够利用 ClickHouse 的高性能分析能力。", "ClickHouse MCP 服务器让智能体能够安全地与 ClickHouse 数据库交互。它提供通用接口，用于执行 SQL、探索数据、查看备份和账单详情，让智能体工具能够利用 ClickHouse 的高性能分析能力。"],
    ["使用自然语言与你的 BigQuery 数据交互。此 MCP 服务器可安全连接到你的数据集，用于搜索数据集、检查表 元数据、执行 SQL 查询、生成时间序列预测、 并直接从你的 AI 工具执行贡献分析。", "使用自然语言与你的 BigQuery 数据交互。此 MCP 服务器可安全连接到你的数据集，用于搜索数据集、检查表元数据、执行 SQL 查询、生成时间序列预测，并直接从你的 AI 工具执行贡献分析。"],
    ["将你的 GitLab SDLC 作为知识图谱查询。Orbit 会索引群组、项目、源代码、合并请求、流水线、工作项和安全发现，并整理为 单一图谱，使智能体能够回答影响范围、 入门引导和依赖映射问题，而不是在分散系统中逐个检索。", "将你的 GitLab SDLC 作为知识图谱查询。Orbit 会索引群组、项目、源代码、合并请求、流水线、工作项和安全发现，并整理为单一图谱，使智能体能够回答影响范围、入门引导和依赖映射问题，而不是在分散系统中逐个检索。"],
    ["执行一系列基础设施管理任务，包括：管理虚拟机 (VM) 实例, 管理实例组管理器 and instance 模板、管理磁盘和快照，并检索预留和承诺使用相关信息。", "执行一系列基础设施管理任务，包括：管理虚拟机 (VM) 实例、管理实例组管理器和实例模板、管理磁盘和快照，并检索预留和承诺使用相关信息。"],
    ["使用自然语言与你的 Oracle Database 数据交互。此 MCP 服务器可安全连接到你的数据库，用于执行 SQL 查询、 inspecting table schemas, and troubleshooting database performance issues directly from your AI tools.", "使用自然语言与你的 Oracle Database 数据交互。此 MCP 服务器可安全连接到你的数据库，用于执行 SQL 查询、检查表架构，并直接从你的 AI 工具排查数据库性能问题。"],
    ["将你的 AI 助手连接到 Knowledge Catalog（原 Dataplex）。此 MCP 服务器允许你搜索内容，从而实现数据发现和治理 for data assets, retrieve detailed metadata such as schemas and ownership, and explore aspect types across your distributed data.", "将你的 AI 助手连接到 Knowledge Catalog（原 Dataplex）。此 MCP 服务器允许你搜索数据资产、检索架构和所有权等详细元数据，并探索分布式数据中的方面类型，从而实现数据发现和治理。"],
    ["将你的 AI 助手连接到 Looker 商业智能。此 MCP 服务器允许你执行自然语言操作，从而进行数据探索和内容管理 language queries, run saved Looks, create and manage dashboards, and perform instance health checks within your Looker environment.", "将你的 AI 助手连接到 Looker 商业智能。此 MCP 服务器允许你执行自然语言查询、运行已保存的 Looks、创建和管理仪表板，并在 Looker 环境中执行实例健康检查，从而进行数据探索和内容管理。"],
    ["Google Maps Platform Code Assist MCP 服务器会为你常用的 AI 编码助手提供最新的官方 Google Maps Platform 文档和代码 samples, and best practices. By grounding your AI assistant in our official resources, it can generate more accurate, reliable, and useful code.", "Google Maps Platform Code Assist MCP 服务器会为你常用的 AI 编码助手提供最新的官方 Google Maps Platform 文档、代码示例和最佳实践。通过让 AI 助手基于我们的官方资源，它可以生成更准确、可靠且实用的代码。"],
    ["samples, and best practices. By grounding your AI assistant in our official resources, it can generate more accurate, reliable, and useful code.", "示例和最佳实践。通过让 AI 助手基于我们的官方资源，它可以生成更准确、可靠且实用的代码。"],
    ["inspecting table schemas, and troubleshooting database performance issues directly from your AI tools.", "检查表架构，并直接从你的 AI 工具排查数据库性能问题。"],
    ["for data assets, retrieve detailed metadata such as schemas and ownership, and explore aspect types across your distributed data.", "数据资产、检索架构和所有权等详细元数据，并探索分布式数据中的方面类型。"],
    ["language queries, run saved Looks, create and manage dashboards, and perform instance health checks within your Looker environment.", "查询、运行已保存的 Looks、创建和管理仪表板，并在 Looker 环境中执行实例健康检查。"],
    ["Initiating Coding Assistance", "正在启动编码辅助"],
    ["Initiating Programming Assistance", "正在启动编程辅助"],
    ["Initiating Technical Assistance", "正在启动技术辅助"],
    ["Starting Assistant Collaboration", "正在启动助手协作"],
    ["Starting Development Session", "正在启动开发会话"],
    ["backups, administer users, import and export data, and run SQL queries from your AI-enabled development environments and AI agent platforms.", "备份、管理用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。"],
    ["backups, administer users, import and export data, and run SQL queries from your AI-enabled development environments and AI agent platforms", "备份、管理用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询"],
    ["users, import and export data, and run SQL queries from your AI-enabled development environments and AI agent platforms.", "用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询。"],
    ["users, import and export data, and run SQL queries from your AI-enabled development environments and AI agent platforms", "用户、导入和导出数据，并在支持 AI 的开发环境和 AI 智能体平台中运行 SQL 查询"],
    ["backup & billing details, allowing agentic tooling to leverage ClickHouse's high-performance analytical capabilities.", "备份和账单详情，让智能体工具能够利用 ClickHouse 的高性能分析能力。"],
    ["backup & billing details, allowing agentic tooling to leverage ClickHouse's high-performance analytical capabilities", "备份和账单详情，让智能体工具能够利用 ClickHouse 的高性能分析能力"],
    ["and perform contribution analysis directly from your AI tools.", "并直接从你的 AI 工具执行贡献分析。"],
    ["and perform contribution analysis directly from your AI tools", "并直接从你的 AI 工具执行贡献分析"],
    ["onboarding, and dependency mapping questions by traversing real relationships instead of grepping across separate systems.", "入门引导和依赖映射问题，而不是在分散系统中逐个检索。"],
    ["onboarding, and dependency mapping questions by traversing real relationships instead of grepping across separate systems", "入门引导和依赖映射问题，而不是在分散系统中逐个检索"],
    ["templates, manage disks and snapshots, retrieve information about reservations and commitments.", "模板、管理磁盘和快照，并检索预留和承诺使用相关信息。"],
    ["templates, manage disks and snapshots, retrieve information about reservations and commitments", "模板、管理磁盘和快照，并检索预留和承诺使用相关信息"],
    ["s, manage disks and snapshots, retrieve information about reservations and commitments.", "、管理磁盘和快照，并检索预留和承诺使用相关信息。"],
    ["s, manage disks and snapshots, retrieve information about reservations and commitments", "、管理磁盘和快照，并检索预留和承诺使用相关信息"],
    ["The Google Maps Platform Code Assist MCP server provides your favorite AI coding assistant with up-to-date, official Google Maps Platform documentation, code", "Google Maps Platform Code Assist MCP 服务器会为你常用的 AI 编码助手提供最新的官方 Google Maps Platform 文档和代码"],
    ["Connect your AI assistants to Looker business intelligence. This MCP server enables data exploration and content management by allowing you to execute natural", "将你的 AI 助手连接到 Looker 商业智能。此 MCP 服务器允许你执行自然语言操作，从而进行数据探索和内容管理"],
    ["Connect your AI assistants to the Knowledge Catalog (formerly known as Dataplex). This MCP server enables data discovery and governance by allowing you to search", "将你的 AI 助手连接到 Knowledge Catalog（原 Dataplex）。此 MCP 服务器允许你搜索内容，从而实现数据发现和治理"],
    ["Interact with your Oracle Database data using natural language. This MCP server allows you to securely connect to your databases for executing SQL queries,", "使用自然语言与你的 Oracle Database 数据交互。此 MCP 服务器可安全连接到你的数据库，用于执行 SQL 查询、"],
    ["single graph so agents can answer blast radius,", "单一图谱，使智能体能够回答影响范围、"],
    ["single graph so agents can answer blast radius", "单一图谱，使智能体能够回答影响范围"],
    ["metadata, execute SQL queries, generate time-series forecasts,", "元数据、执行 SQL 查询、生成时间序列预测、"],
    ["metadata, execute SQL queries, generate time-series forecasts", "元数据、执行 SQL 查询、生成时间序列预测"],
    ["inspect table metadata", "检查表元数据"],
    ["execute SQL queries", "执行 SQL 查询"],
    ["generate time-series forecasts", "生成时间序列预测"],
    ["The Stitch MCP server enables AI assistants to interact with Stitch for vibe design: generating UI designs from text and images, and accessing project and screen", "Stitch MCP 服务器让 AI 助手能够与 Stitch 交互，用于 vibe design：根据文本和图片生成 UI 设计，并访问项目和屏幕"],
    ["The Google Developer Knowledge MCP server gives AI-powered development tools the ability to search Google's official developer documentation and retrieve", "Google Developer Knowledge MCP 服务器让 AI 开发工具能够搜索 Google 官方开发者文档并检索"],
    ["The ClickHouse MCP server enables agents to securely interact with ClickHouse databases. It provides a universal interface to execute SQL, explore data, and view", "ClickHouse MCP 服务器让智能体能够安全地与 ClickHouse 数据库交互。它提供通用接口，用于执行 SQL、探索数据并查看"],
    ["Perform a range of infrastructure management tasks, including: manage virtual machine (VM) instances, manage instance group managers and instance template", "执行一系列基础设施管理任务，包括：管理虚拟机 (VM) 实例、管理实例组管理器和实例模板"],
    ["manage virtual machine (VM) instances", "管理虚拟机 (VM) 实例"],
    ["manage instance group managers", "管理实例组管理器"],
    ["instance template", "实例模板"],
    ["and accessing project and screen", "并访问项目和屏幕"],
    ["and retrieve", "并检索"],
    ["and view", "并查看"],
    ["Query your GitLab SDLC as a knowledge graph. Orbit indexes groups, projects, source code, merge requests, pipelines, work items, and security findings into a", "将你的 GitLab SDLC 作为知识图谱查询。Orbit 会索引群组、项目、源代码、合并请求、流水线、工作项和安全发现，并整理为"],
    ["Interact with your BigQuery data using natural language. This MCP server allows you to securely connect to your datasets to search the datasets, inspect table", "使用自然语言与你的 BigQuery 数据交互。此 MCP 服务器可安全连接到你的数据集，用于搜索数据集、检查表"],
    ["The AlloyDB for PostgreSQL remote MCP server lets you access and run AlloyDB tools to manage AlloyDB clusters and instances, manage users, create and restore", "AlloyDB for PostgreSQL 远程 MCP 服务器可让你访问并运行 AlloyDB 工具，用于管理 AlloyDB 集群和实例、管理用户、创建和恢复"],
    ["The Cloud SQL remote MCP server lets you access and run Cloud SQL tools to manage Cloud SQL instances, manage users, create and restore backups, administer", "Cloud SQL 远程 MCP 服务器可让你访问并运行 Cloud SQL 工具，用于管理 Cloud SQL 实例、管理用户、创建和恢复备份、执行管理操作"],
    ["The Cloud SQL remote MCP server lets you access and run Cloud SQL tools to manage Cloud SQL instances, manage users, create and restore backups", "Cloud SQL 远程 MCP 服务器可让你访问并运行 Cloud SQL 工具，用于管理 Cloud SQL 实例、管理用户、创建和恢复备份"],
    ["Interact with your BigQuery data using natural language.", "使用自然语言与你的 BigQuery 数据交互。"],
    ["This MCP server allows you to securely connect to your datasets to search the datasets", "此 MCP 服务器可安全连接到你的数据集，用于搜索数据集"],
    ["Within each group, models share a weekly limit and a 5-hour limit. Quota is consumed proportionally to the cost of the tokens. Thus, limits will last longer with shorter tasks or using more cost-effective models. The 5-hour limit smooths out aggregate demand to fairly distribute global capacity across all users, while your weekly limit is tied directly to your individual tier.", "每个模型组共享每周限额和五小时限额。配额会按 Token 成本等比例消耗。因此，任务越短或使用成本更低的模型，限额可持续越久。五小时限额用于平滑总体需求，让全球容量能在所有用户之间公平分配；每周限额则与你的个人套餐等级直接相关。"],
    ["You have used some of your weekly limit, it will fully refresh in ", "你已使用部分每周限额，将在 "],
    ["You have used some of your 5-hour limit, it will fully refresh in ", "你已使用部分五小时限额，将在 "],
    ["You can upgrade to Google AI Ultra to receive higher rate limits.", "你可以升级到 Google AI Ultra 以获得更高的速率限制。"],
    ["You can upgrade to a Google AI Ultra plan to receive higher rate limits.", "你可以升级到 Google AI Ultra 套餐以获得更高的速率限制。"],
    ["Current Plan:", "当前套餐："],
    ["Current plan:", "当前套餐："],
    ["Quota is consumed proportionally to the cost of the tokens.", "配额会按 Token 成本等比例消耗。"],
    ["The 5-hour limit smooths out aggregate demand to fairly distribute global capacity across all users, while your weekly limit is tied directly to your individual tier.", "五小时限额用于平滑总体需求，让全球容量能在所有用户之间公平分配；每周限额则与你的个人套餐等级直接相关。"],
    ["Thus, limits will last longer with shorter tasks or using more cost-effective models.", "因此，任务越短或使用成本更低的模型，限额可持续越久。"],
    ["Within each group, models share a weekly limit and a 5-hour limit.", "每个模型组共享每周限额和五小时限额。"],
    ["Configure allowed and denied browser actuation URLs.", "配置允许和拒绝浏览器操作的 URL。"],
    ["Configure allowed and denied URLs for browser actuation.", "配置允许和拒绝浏览器操作的 URL。"],
    ["Configure allowed and denied browser operation URLs.", "配置允许和拒绝浏览器操作的 URL。"],
    ["Configure allowed and denied URLs for reading.", "配置允许和拒绝读取的 URL。"],
    ["Configure allowed and denied paths for file reads and writes.", "配置文件读写允许和拒绝的路径。"],
    ["Configure allowed terminal commands.", "配置允许的终端命令。"],
    ["Configure commands that are allowed to run outside the sandbox.", "配置允许在沙盒外执行的命令。"],
    ["Configure allowed commands outside the sandbox.", "配置允许在沙盒外执行的命令。"],
    ["Configure external tools via Model Context Protocol.", "通过 Model Context Protocol 配置外部工具。"],
    ["The breakdown below shows token usage from customizations like skills, rules, and MCP. If the budget is exceeded, large customizations will be truncated automatically.", "下方明细显示技能、规则和 MCP 等自定义内容的 Token 使用量。如果超出预算，较大的自定义内容会被自动截断。"],
    ["There are no customizations enabled.", "当前未启用任何自定义内容。"],
    ["Permanently delete ", "永久删除 "],
    [" including ", "，包括 "],
    [" active conversations", " 个活跃对话"],
    [" active conversation", " 个活跃对话"],
    [" archived conversations", " 个已归档对话"],
    [" archived conversation", " 个已归档对话"],
    ["Requires manual review for all terminal commands and file accesses outside of the working folders.", "所有终端命令以及工作文件夹外的文件访问都需要手动确认。"],
    ["All terminal commands require review. The agent can read or write to any file in the machine.", "所有终端命令都需要确认。智能体可以读取或写入此电脑上的任何文件。"],
    ["Disables all safety barriers for maximal iteration velocity.", "禁用所有安全屏障，以获得最快迭代速度。"],
    ["Block all browser JavaScript execution.", "阻止所有浏览器 JavaScript 执行。"],
    ["Prompt for approval before running browser scripts.", "运行浏览器脚本前请求批准。"],
    ["Allow full browser script execution without prompting.", "无需提示即可允许完整的浏览器脚本执行。"],
    ["Google Chrome to be installed", "安装 Google Chrome"],
    ["Google Chrome", "Google Chrome"],
    ["Always Proceed", "始终继续"],
    ["Full Machine", "整机访问"],
    ["Full machine", "整机访问"],
    ["Turbo mode", "极速模式"],
    ["Turbo Mode", "极速模式"],
    ["Gemini Models", "Gemini 模型"],
    ["Weekly Limit", "每周限额"],
    ["Five Hour Limit", "五小时限额"],
    ["Five-Hour Limit", "五小时限额"],
    ["Model Context Protocol", "Model Context Protocol"],
    ["Add MCP +", "添加 MCP +"],
    ["Show all", "显示全部"],
    [" days", " 天"],
    [" day", " 天"],
    [" hrs", " 小时"],
    [" hr", " 小时"],
    [" seconds", " 秒"],
    [" second", " 秒"],
    ["它需要安装 Google Chrome to be installed.", "它需要安装 Google Chrome。"],
    ["它需要安装 Google Chrome to be installed", "它需要安装 Google Chrome"],
    ["to be installed. ", "。"],
    ["to be installed.", "。"],
    ["了解更多.", "了解更多。"],
    ["Inherits from 全局设置. Local permissions have higher priority. 了解更多.", "继承自全局设置。本地权限优先级更高。了解更多。"],
    ["Inherits from 全局设置. Local permissions have higher priority.", "继承自全局设置。本地权限优先级更高。"],
    ["Agent settings and permissions for conversations outside of projects.", "项目外对话的智能体设置和权限。"],
    ["Choose a predefined security preset for the agent. This controls terminal auto-execution policy, and file access policy.", "为智能体选择预设安全策略。它会控制终端自动执行策略和文件访问策略。"],
    ["Configures how the agent tries to access files outside of its working folders.", "配置智能体如何访问工作文件夹之外的文件。"],
    ["Controls whether terminal commands require your approval before running.", "控制终端命令运行前是否需要你的批准。"],
    ["Specifies Agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.", "指定智能体在请求审查 Artifact 时的行为。Artifact 是它创建的文档，用于提供更丰富的对话体验。"],
    ["Inherits from global settings. Local permissions have higher priority.", "继承自全局设置。本地权限优先级更高。"],
    ["Configure allowed and denied paths for file reads and writes.", "配置文件读写允许和拒绝的路径。"],
    ["Configure allowed and denied URLs for reading.", "配置允许和拒绝读取的 URL。"],
    ["Configure allowed terminal commands.", "配置允许的终端命令。"],
    ["Configure allowed commands outside the sandbox.", "配置允许在沙盒外执行的命令。"],
    ["Configure external tools via Model Context Protocol.", "通过 Model Context Protocol 配置外部工具。"],
    ["Permanently delete this project and all of its conversations.", "永久删除此项目及其所有对话。"],
    ["When toggled on, Antigravity collects usage data to help Google enhance performance and features.", "开启后，Antigravity 会收集使用数据，帮助 Google 改进性能和功能。"],
    ["Receive product updates, tips, and promotions from Google Antigravity via email.", "通过邮件接收 Google Antigravity 的产品更新、技巧和推广信息。"],
    ["You can upgrade to a Google AI Ultra plan to receive higher rate limits.", "你可以升级到 Google AI Ultra 套餐以获得更高的速率限制。"],
    ["By using this app, you agree to its Terms of Service", "使用此应用即表示你同意其服务条款"],
    ["To start using the agent, please sign in with your Google account.", "要开始使用智能体，请使用你的 Google 账号登录。"],
    ["failed to get profile picture:", "获取头像失败："],
    ["Modify scoped permissions, folders, and agent settings like Sandbox and Terminal Command Execution.", "修改限定范围的权限、文件夹，以及沙盒和终端命令执行等智能体设置。"],
    ["When toggled on, Antigravity will use your AI credits to fulfill model requests once you're out of model quota. Antigravity will always use your model quota first before using AI credits.", "开启后，当模型配额用尽时，Antigravity 会使用你的 AI 点数完成模型请求。Antigravity 始终会优先使用模型配额，然后才使用 AI 点数。"],
    ["View your available model quota and AI credits. Model quota refreshes periodically based on your plan. Enable AI Credit Overages to continue using models when your quota is exhausted.", "查看可用模型配额和 AI 点数。模型配额会根据你的套餐定期刷新。启用 AI 点数超额使用后，配额耗尽时仍可继续使用模型。"],
    ["The breakdown below shows token usage from customizations like skills, rules, and MCP. If the budget is exceeded, large customizations will be truncated automatically.", "下方明细显示技能、规则和 MCP 等自定义内容的 Token 使用量。如果超出预算，较大的自定义内容会被自动截断。"],
    ["100.0% of the customization budget is available.", "当前 100.0% 的自定义预算可用。"],
    ["No customizations found for this workspace.", "此工作区未找到自定义内容。"],
    ["You currently don't have any MCP Servers installed. Add an MCP server above", "当前没有安装任何 MCP 服务器。可在上方添加 MCP 服务器。"],
    ["Configure the browser subagent. It requires Google Chrome to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.", "配置浏览器子智能体。它需要安装 Google Chrome。可在对话输入框中输入 /browser 调用浏览器子智能体。"],
    ["Controls whether the agent can run custom JavaScript to automate complex browser actions.", "控制智能体是否可以运行自定义 JavaScript 来自动执行复杂的浏览器操作。"],
    ["Configure allowed and denied URLs for browser actuation.", "配置允许和拒绝浏览器操作的 URL。"],
    ["Prevent the computer from sleeping while the app is running.", "应用运行时阻止电脑进入休眠。"],
    ["The app will be accessible from the menu bar and will keep running in the background when all windows are closed.", "应用会显示在菜单栏中，并在所有窗口关闭后继续在后台运行。"],
    ["To modify notification settings, open your operating system's system preferences.", "如需修改通知设置，请打开操作系统的系统偏好设置。"],
    ["Inherits from 全局设置. Local permissions have higher priority.", "继承自全局设置。本地权限优先级更高。"],
    ["Inherits from ", "继承自"],
    [". Local permissions have higher priority. Learn more.", "。本地权限优先级更高。了解更多。"],
    ["Learn more about ", "了解"],
    ["Configure global allowed and denied resource permissions.", "配置全局允许和拒绝的资源权限。"],
    ["Configure default behaviors, skills, and MCP servers.", "配置默认行为、技能和 MCP 服务器。"],
    ["Your Plan:", "当前套餐："],
    ["By using this app, you agree to its ", "使用此应用即表示你同意其"],
    ["By using this app, you agree to its 服务条款", "使用此应用即表示你同意其服务条款"],
    [" Learn more.", "了解更多。"],
    ["Learn more.", "了解更多。"],
    ["Go To Projects", "前往项目"],
    ["View your available model quota. Quota refreshes periodically based on your plan.", "查看可用模型配额。配额会根据你的套餐定期刷新。"],
    ["You currently don't have any MCP Servers installed.", "当前没有安装任何 MCP 服务器。"],
    ["Add an MCP server above", "可在上方添加 MCP 服务器"],
    ["Configure the browser subagent.", "配置浏览器子智能体。"],
    ["It requires Google Chrome to be installed.", "它需要安装 Google Chrome。"],
    ["It requires ", "它需要安装 "],
    ["It requires", "它需要安装"],
    [" to be installed.", "。"],
    ["Google Chrome to be installed", "安装 Google Chrome"],
    ["The browser subagent can be invoked by typing /browser in the conversation input box.", "可在对话输入框中输入 /browser 调用浏览器子智能体。"],
    [" of the customization budget is available.", " 的自定义预算可用。"],
    ["Typeahead menu", "自动补全菜单"],
    ["Instantly create a new project and folder to start building.", "立即创建新项目和文件夹，开始构建。"],
    ["Refreshes in ", "刷新倒计时："],
    [" hours", " 小时"],
    [" hour", " 小时"],
    [" minutes", " 分钟"],
    [" minute", " 分钟"],
    ["Select model, current:", "选择模型，当前："],
    [" agent running", " 个智能体正在运行"],
    [" agents running", " 个智能体正在运行"]
  ];

  const dynamicRules = [
    [/^Permanently delete (.+?) including (\\d+) active conversation(?:s)? and (\\d+) archived conversation(?:s)?\\.$/i, (_m, name, active, archived) => "永久删除 " + name + "，包括 " + active + " 个活跃对话和 " + archived + " 个已归档对话。"],
    [/^You have used some of your weekly limit, it will fully refresh in (.+)\\.$/i, (_m, time) => "你已使用部分每周限额，将在 " + time + " 后完全刷新。"],
    [/^You have used some of your 5-hour limit, it will fully refresh in (.+)\\.$/i, (_m, time) => "你已使用部分五小时限额，将在 " + time + " 后完全刷新。"],
    [/^Refreshes in (.+)$/i, (_m, time) => "刷新倒计时：" + time],
    [/^(\\d+(?:\\.\\d+)?)% of the customization budget is available\\.$/i, (_m, percent) => "当前 " + percent + "% 的自定义预算可用。"],
    [/^Select model, current:\\s*(.+)$/i, (_m, model) => "选择模型，当前：" + model],
    [/^(\\d+) agent(?:s)? running$/i, (_m, count) => count + " 个智能体正在运行"],
    [/^No agent(?:s)? running$/i, () => "没有正在运行的智能体"]
  ];

  const customDictStorageKey = "__antigravityZhCnCustomDict";
  const blocked = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
  const observedRoots = new WeakSet();
  const observedFrames = new WeakSet();
  const untranslated = new Set();
  const interactiveEvents = [
    "pointerover",
    "mouseover",
    "mouseenter",
    "pointerenter",
    "pointerdown",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "contextmenu",
    "focusin",
    "keydown",
    "keyup",
    "input"
  ];

  function normalizeKey(value) {
    return String(value)
      .replace(/\\u00a0/g, " ")
      .replace(/[\\r\\n\\t]+/g, " ")
      .replace(/\\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
  }

  const ignoredCandidateKeys = new Set([
    "alt",
    "ctrl",
    "shift",
    "tab",
    "antigravity",
    "google chrome",
    "gemini 3.1 pro (high)",
    "mcp",
    "model context protocol",
    "and",
    "or",
    "ask",
    "including",
    "or join the",
    "chat space",
    "e.g., curl",
    "e.g., npm test",
    "$bytes",
    "$content",
    "alloydb for postgresql",
    "android management api",
    "chrome devtools",
    "claude and gpt models",
    "cloud run",
    "cloud sql",
    "creating a login page",
    "fixing latex syntax errors",
    "gitlab orbit",
    "google antigravity sdk",
    "google cloud bigtable admin",
    "google cloud firestore",
    "google cloud logging",
    "google cloud monitoring",
    "google cloud pub/sub",
    "google cloud resource manager",
    "google compute engine",
    "google developer knowledge",
    "google kubernetes engine (oss)",
    "google managed service for apache kafka",
    "google maps platform code assist",
    "jetski chat",
    "knowledge catalog",
    "modern web guidance",
    "one dark pro",
    "one light",
    "oracle database",
    "perplexity ask",
    "sequential thinking",
    "solarized light",
    "sonatype guide",
    "tokyo night",
    "go/jetski-chat"
  ].map(normalizeKey));

  const protectedEnglishTerms = [
    "AI",
    "API",
    "LLM",
    "MCP",
    "SDK",
    "SQL",
    "URL",
    "VM",
    "Antigravity",
    "Antigravity zh-CN",
    "Arize AX",
    "Airweave",
    "Android",
    "Artifact",
    "Atlassian",
    "BigQuery",
    "Bigtable",
    "ClickHouse",
    "Cloud SQL",
    "Dart",
    "Firebase",
    "Flutter",
    "GKE",
    "Genkit",
    "GitHub",
    "GitLab SDLC",
    "Google AI Ultra",
    "Google",
    "Google Chat",
    "Google Cloud",
    "Google Cloud Run",
    "Google Drive",
    "Google Developer Knowledge",
    "Google Kubernetes Engine",
    "Harness",
    "Heroku",
    "IDE",
    "Linear.app",
    "Locofy.ai",
    "MCP Toolbox for Databases",
    "Model Context Protocol",
    "MongoDB Atlas",
    "Neon",
    "Netlify",
    "Notion",
    "PayPal",
    "Pinecone",
    "PostHog",
    "Postman",
    "Prisma",
    "Python",
    "Redis",
    "SonarQube",
    "Spanner",
    "Stitch",
    "Stripe",
    "Supabase",
    "Token",
    "gopls",
    "google3",
    "localStorage"
  ];

  const normalizedExact = new Map();
  for (const [key, translated] of exact.entries()) {
    normalizedExact.set(normalizeKey(key), translated);
  }

  function loadCustomDict() {
    try {
      const raw = localStorage.getItem(customDictStorageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function rebuildCustomDict() {
    const custom = loadCustomDict();
    globalThis.__antigravityZhCnCustomDict = custom;
    globalThis.__antigravityZhCnCustomExact = new Map(Object.entries(custom));
    globalThis.__antigravityZhCnCustomNormalized = new Map(
      Object.entries(custom).map(([key, translated]) => [normalizeKey(key), translated])
    );
  }

  rebuildCustomDict();

  globalThis.__antigravityZhCnAddTranslations = (dict) => {
    if (!dict || typeof dict !== "object") return false;
    const current = loadCustomDict();
    for (const [key, value] of Object.entries(dict)) {
      if (typeof key === "string" && typeof value === "string" && key.trim() && value.trim()) {
        current[key] = value;
      }
    }
    localStorage.setItem(customDictStorageKey, JSON.stringify(current));
    rebuildCustomDict();
    scheduleDeepScan();
    return true;
  };

  globalThis.__antigravityZhCnClearCustomTranslations = () => {
    localStorage.removeItem(customDictStorageKey);
    rebuildCustomDict();
    scheduleDeepScan();
    return true;
  };

  function lookupExact(value) {
    const customExact = globalThis.__antigravityZhCnCustomExact;
    const customNormalized = globalThis.__antigravityZhCnCustomNormalized;
    return (customExact && customExact.get(value)) ||
      (customNormalized && customNormalized.get(normalizeKey(value))) ||
      exact.get(value) ||
      normalizedExact.get(normalizeKey(value));
  }

  function translateDynamic(trimmed) {
    for (const [pattern, replacer] of dynamicRules) {
      const match = trimmed.match(pattern);
      if (match) return replacer(...match);
    }
    return undefined;
  }

  function escapeRegExp(value) {
    return String(value).replace(new RegExp("[.*+?^" + "$" + "{}()|[\\\\]\\\\\\\\]", "g"), "\\\\$&");
  }

  function residualEnglishText(value) {
    let text = String(value || "")
      .replace(/[\\u3400-\\u9fff]+/g, " ")
      .replace(/\\s+/g, " ");
    for (const term of protectedEnglishTerms) {
      text = text.replace(new RegExp("\\\\b" + escapeRegExp(term) + "\\\\b", "gi"), " ");
    }
    text = text
      .replace(/https?:\\/\\/\\S+/gi, " ")
      .replace(/[A-Za-z]:\\\\\\S+/g, " ")
      .replace(/[0-9]+(?:\\.[0-9]+)?/g, " ")
      .replace(/[^A-Za-z\\s]+/g, " ")
      .replace(/\\s+/g, " ")
      .trim();
    return text;
  }

  function looksLikeUntranslatedEnglish(value) {
    const text = String(value || "").replace(/\\s+/g, " ").trim();
    const key = normalizeKey(text);
    if (text.length < 3 || text.length > 240) return false;
    if (ignoredCandidateKeys.has(key)) return false;
    if (/[\\u3400-\\u9fff]/.test(text)) {
      const residual = residualEnglishText(text);
      if (!residual || residual.length < 4) return false;
      if (ignoredCandidateKeys.has(normalizeKey(residual))) return false;
      if (!/[A-Za-z]{2,}/.test(residual)) return false;
      const residualWords = residual.split(/\\s+/).filter(Boolean);
      if (residualWords.length > 0 && residualWords.every((word) => /^[A-Z0-9][A-Za-z0-9.+-]*$/.test(word))) return false;
      if (/^[a-z]+(?:\\s+[a-z]+){0,3}$/.test(residual) && !/(agent|agents|answer|datasets|metadata|execute|generate|screen|retrieve|view|template|radius|forecast|forecasts|restore|backup|backups|administer)/i.test(residual)) return false;
      return true;
    }
    if (!/[A-Za-z]{2,}/.test(text)) return false;
    if (/^[A-Z0-9_./:\\\\-]+$/.test(text)) return false;
    if (/^(https?:|file:|[A-Za-z]:\\\\)/.test(text)) return false;
    if (/^[A-Za-z]+(?:\\+[A-Za-z0-9,]+)+$/.test(text)) return false;
    if (/^[A-Z][A-Za-z0-9.+-]*$/.test(text) && !lookupExact(text)) return false;
    if (/^[a-z]+(?:\\s+[a-z]+){0,7}$/.test(text) && !/[.!?:)]$/.test(text)) return false;
    if (/^(or|and|to|for|with|from|in|on)\\s+/i.test(text) && !/[.!?]$/.test(text)) return false;
    return true;
  }

  function isLikelyPrivateText(value) {
    const text = String(value || "").trim();
    if (!text) return true;
    if (/@/.test(text)) return true;
    if (/https?:\\/\\//i.test(text)) return true;
    if (/[A-Za-z]:\\\\|\\\\\\\\|\\/[\\w.-]+\\//.test(text)) return true;
    if (/\\.(ts|tsx|js|jsx|json|md|py|java|cpp|c|h|go|rs|cs|html|css|scss|yml|yaml|toml|tex)\\b/i.test(text)) return true;
    if (/[{};=<>]|=>/.test(text) || text.includes(String.fromCharCode(96, 96, 96))) return true;
    if (/^\\d+[\\w.-]*$/.test(text)) return true;
    return false;
  }

  function rememberUntranslated(value) {
    const text = String(value || "").replace(/\\s+/g, " ").trim();
    if (isLikelyPrivateText(text)) return;
    if (!looksLikeUntranslatedEnglish(text) || untranslated.has(text)) return;
    if (untranslated.size >= 500) return;
    untranslated.add(text);
    globalThis.__antigravityZhCnUntranslated = Array.from(untranslated).sort();
    clearTimeout(globalThis.__antigravityZhCnReportTimer);
    globalThis.__antigravityZhCnReportTimer = setTimeout(() => {
      try {
        console.info("[Antigravity zh-CN] untranslated English candidates:", globalThis.__antigravityZhCnUntranslated);
      } catch {}
    }, 1000);
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        void navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function showUntranslatedPanel() {
    try {
      const existing = document.getElementById("__antigravityZhCnUntranslatedPanel");
      if (existing) {
        existing.remove();
        return;
      }
      const customDict = loadCustomDict();
      const items = Array.from(untranslated)
        .filter((item) => !isLikelyPrivateText(item) && looksLikeUntranslatedEnglish(item))
        .sort();
      const text = JSON.stringify(items, null, 2);
      const panel = document.createElement("div");
      panel.id = "__antigravityZhCnUntranslatedPanel";
      panel.style.cssText = [
        "position:fixed",
        "right:18px",
        "bottom:18px",
        "z-index:2147483647",
        "width:min(980px,calc(100vw - 36px))",
        "max-height:min(720px,calc(100vh - 36px))",
        "background:#111",
        "color:#eee",
        "border:1px solid #444",
        "border-radius:8px",
        "box-shadow:0 18px 60px rgba(0,0,0,.55)",
        "font:13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif",
        "display:flex",
        "flex-direction:column",
        "overflow:hidden"
      ].join(";");

      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #333;background:#181818;color:#fff;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;cursor:move;user-select:none;";
      const title = document.createElement("div");
      title.textContent = "Antigravity zh-CN 未命中英文 (" + items.length + ")";
      title.style.cssText = "font-weight:600;flex:1;";

      let dragState = null;
      header.addEventListener("pointerdown", (event) => {
        try {
          if (event.target && event.target.closest && event.target.closest("button,textarea,input,select")) return;
          const rect = panel.getBoundingClientRect();
          dragState = {
            dx: event.clientX - rect.left,
            dy: event.clientY - rect.top
          };
          panel.style.left = rect.left + "px";
          panel.style.top = rect.top + "px";
          panel.style.right = "auto";
          panel.style.bottom = "auto";
          if (header.setPointerCapture) header.setPointerCapture(event.pointerId);
          event.preventDefault();
        } catch {}
      });
      header.addEventListener("pointermove", (event) => {
        try {
          if (!dragState) return;
          const rect = panel.getBoundingClientRect();
          const maxLeft = Math.max(0, window.innerWidth - rect.width);
          const maxTop = Math.max(0, window.innerHeight - Math.min(rect.height, window.innerHeight));
          const left = Math.min(Math.max(0, event.clientX - dragState.dx), maxLeft);
          const top = Math.min(Math.max(0, event.clientY - dragState.dy), maxTop);
          panel.style.left = left + "px";
          panel.style.top = top + "px";
        } catch {}
      });
      const stopDrag = (event) => {
        try {
          if (header.releasePointerCapture && event && dragState) header.releasePointerCapture(event.pointerId);
        } catch {}
        dragState = null;
      };
      header.addEventListener("pointerup", stopDrag);
      header.addEventListener("pointercancel", stopDrag);

      const status = document.createElement("span");
      status.style.cssText = "color:#aaa;font-size:12px;";

      const saveButton = document.createElement("button");
      saveButton.textContent = "保存翻译";
      saveButton.style.cssText = "background:#2f6feb;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;";

      const copyButton = document.createElement("button");
      copyButton.textContent = "复制原文";
      copyButton.style.cssText = "background:#2f6feb;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;";
      copyButton.onclick = () => {
        const ok = copyText(text);
        copyButton.textContent = ok ? "已复制" : "复制失败";
        setTimeout(() => { copyButton.textContent = "复制原文"; }, 1200);
      };

      const clearButton = document.createElement("button");
      clearButton.textContent = "清空";
      clearButton.style.cssText = "background:#333;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;";
      clearButton.onclick = () => {
        untranslated.clear();
        globalThis.__antigravityZhCnUntranslated = [];
        panel.remove();
      };

      const closeButton = document.createElement("button");
      closeButton.textContent = "关闭";
      closeButton.style.cssText = "background:#333;color:#fff;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;";
      closeButton.onclick = () => panel.remove();

      const body = document.createElement("div");
      body.style.cssText = "overflow:auto;max-height:calc(100vh - 150px);background:#0b0b0b;";
      const rows = [];

      if (!items.length) {
        const empty = document.createElement("div");
        empty.textContent = "当前还没有收集到未命中的英文。先打开有英文残留的菜单、下拉框或弹窗，再按 Ctrl+Shift+Alt+Z。";
        empty.style.cssText = "padding:16px;color:#bbb;";
        body.appendChild(empty);
      } else {
        const table = document.createElement("div");
        table.style.cssText = "display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1fr);gap:0;border-top:1px solid #242424;";
        const leftHead = document.createElement("div");
        leftHead.textContent = "原文";
        leftHead.style.cssText = "position:sticky;top:0;background:#181818;color:#aaa;padding:8px 10px;border-bottom:1px solid #333;font-weight:600;";
        const rightHead = document.createElement("div");
        rightHead.textContent = "译文（填写后点保存）";
        rightHead.style.cssText = "position:sticky;top:0;background:#181818;color:#aaa;padding:8px 10px;border-bottom:1px solid #333;font-weight:600;";
        table.append(leftHead, rightHead);

        for (const original of items) {
          const sourceCell = document.createElement("div");
          sourceCell.textContent = original;
          sourceCell.style.cssText = "white-space:pre-wrap;word-break:break-word;padding:9px 10px;border-bottom:1px solid #242424;border-right:1px solid #242424;color:#ddd;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;";

          const targetCell = document.createElement("div");
          targetCell.style.cssText = "padding:6px 8px;border-bottom:1px solid #242424;";
          const input = document.createElement("textarea");
          input.value = customDict[original] || "";
          input.placeholder = "输入中文翻译";
          input.spellcheck = false;
          input.style.cssText = "box-sizing:border-box;width:100%;min-height:42px;resize:vertical;background:#161616;color:#fff;border:1px solid #333;border-radius:6px;padding:7px 8px;outline:none;font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;";
          targetCell.appendChild(input);
          rows.push({ original, input });
          table.append(sourceCell, targetCell);
        }
        body.appendChild(table);
      }

      saveButton.onclick = () => {
        const additions = {};
        for (const row of rows) {
          const translated = row.input.value.trim();
          if (!translated || translated === row.original) continue;
          additions[row.original] = translated;
        }
        const count = Object.keys(additions).length;
        if (!count) {
          status.textContent = "没有可保存的译文";
          return;
        }
        globalThis.__antigravityZhCnAddTranslations(additions);
        for (const original of Object.keys(additions)) untranslated.delete(original);
        globalThis.__antigravityZhCnUntranslated = Array.from(untranslated).sort();
        status.textContent = "已保存 " + count + " 条，正在重新扫描";
        scheduleDeepScan();
        setTimeout(() => {
          try {
            panel.remove();
            showUntranslatedPanel();
          } catch {}
        }, 250);
      };

      const hint = document.createElement("div");
      hint.textContent = "快捷键：Ctrl+Shift+Alt+Z。保存后写入本机 localStorage，不会上传。品牌名、项目名和插件说明可以留空不翻译。";
      hint.style.cssText = "padding:8px 12px;border-top:1px solid #333;color:#aaa;font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;";

      header.append(title, status, saveButton, copyButton, clearButton, closeButton);
      panel.append(header, body, hint);
      document.body.appendChild(panel);
    } catch {}
  }

  globalThis.__antigravityZhCnShowUntranslated = showUntranslatedPanel;

  function translateValue(value, options = {}) {
    if (!value || !value.trim) return value;
    const trimmed = value.trim();
    const hit = lookupExact(trimmed);
    if (hit) return value.replace(trimmed, hit);
    const dynamic = translateDynamic(trimmed);
    if (dynamic) return value.replace(trimmed, dynamic);
    let out = value;
    for (const [from, to] of phrases) out = out.split(from).join(to);
    const outTrimmed = out.trim();
    const secondHit = outTrimmed === trimmed ? undefined : lookupExact(outTrimmed);
    if (secondHit) out = out.replace(outTrimmed, secondHit);
    if (options.collectUntranslated && looksLikeUntranslatedEnglish(out)) {
      rememberUntranslated(out.trim());
    }
    return out;
  }
  function translateAttrs(el, options = {}) {
    if (!el.getAttribute) return;
    for (const attr of ["aria-label", "aria-description", "aria-placeholder", "aria-valuetext", "title", "placeholder", "alt", "data-tooltip", "data-title"]) {
      const value = el.getAttribute(attr);
      const translated = translateValue(value, options);
      if (translated && translated !== value) el.setAttribute(attr, translated);
    }
    try {
      if (el instanceof HTMLInputElement && /^(button|submit|reset)$/i.test(el.type || "")) {
        const translated = translateValue(el.value, options);
        if (translated && translated !== el.value) el.value = translated;
      }
    } catch {}
  }
  function translateTextNodes(root, options = {}) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      try {
        const parent = node.parentElement;
        if (!parent || blocked.has(parent.tagName) || parent.isContentEditable) continue;
        if (parent.closest && parent.closest("#__antigravityZhCnUntranslatedPanel")) continue;
        const translated = translateValue(node.nodeValue, options);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      } catch {}
    }
  }
  function translateAllAttrs(root, options = {}) {
    if (!root || !root.querySelectorAll) return;
    try {
      if (!(root.closest && root.closest("#__antigravityZhCnUntranslatedPanel"))) {
        translateAttrs(root, options);
      }
      for (const el of root.querySelectorAll("*")) {
        if (el.closest && el.closest("#__antigravityZhCnUntranslatedPanel")) continue;
        if (!blocked.has(el.tagName)) translateAttrs(el, options);
        if (el.shadowRoot) {
          translateTextNodes(el.shadowRoot, options);
          translateAllAttrs(el.shadowRoot, options);
        }
      }
    } catch {}
  }
  function hideSidebarRelativeTimes(root) {
    if (!root || !root.querySelectorAll) return;
    try {
      for (const el of root.querySelectorAll("span")) {
        const text = (el.textContent || "").trim();
        if (!/^\\d+\\s*[smhdw]$/i.test(text)) continue;
        const className = typeof el.className === "string" ? el.className : "";
        if (!className.includes("text-muted-foreground") || !className.includes("min-w-4")) continue;
        const parentClass = el.parentElement && typeof el.parentElement.className === "string"
          ? el.parentElement.className
          : "";
        const rect = el.getBoundingClientRect();
        if (rect.x > 320 && !parentClass.includes("group-hover:invisible")) continue;
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
      }
    } catch {}
  }
  function scheduleRun() {
    clearTimeout(globalThis.__antigravityZhCnMainWorldPatchTimer);
    globalThis.__antigravityZhCnMainWorldPatchTimer = setTimeout(run, 20);
  }

  function scheduleDeepScan() {
    if (globalThis.__antigravityZhCnDeepScanQueued) return;
    globalThis.__antigravityZhCnDeepScanQueued = true;
    scheduleRun();
    for (const delay of [60, 150, 350, 800, 1500]) {
      setTimeout(() => run({ collectUntranslated: true }), delay);
    }
    setTimeout(() => {
      globalThis.__antigravityZhCnDeepScanQueued = false;
    }, 1600);
  }

  function patchAttachShadow() {
    try {
      const proto = Element.prototype;
      if (!proto.attachShadow || proto.__antigravityZhCnAttachShadowPatched) return;
      const original = proto.attachShadow;
      Object.defineProperty(proto, "__antigravityZhCnAttachShadowPatched", { value: true });
      proto.attachShadow = function(init) {
        const shadow = original.call(this, init);
        setTimeout(() => {
          try {
            walk(shadow);
            observeRoot(shadow);
          } catch {}
        }, 0);
        return shadow;
      };
    } catch {}
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    try {
      const observer = new MutationObserver(scheduleRun);
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
      globalThis.__antigravityZhCnMainWorldPatchObservers.push(observer);
    } catch {}
  }

  function observeInteractiveEvents(doc) {
    if (!doc || observedFrames.has(doc)) return;
    observedFrames.add(doc);
    try {
      for (const eventName of interactiveEvents) {
        doc.addEventListener(eventName, scheduleDeepScan, true);
      }
      doc.addEventListener("keydown", (event) => {
        try {
          if (event.ctrlKey && event.shiftKey && event.altKey && event.code === "KeyZ") {
            event.preventDefault();
            showUntranslatedPanel();
          }
        } catch {}
      }, true);
      doc.addEventListener("visibilitychange", scheduleDeepScan, true);
    } catch {}
  }

  function visitFrames(root, options = {}) {
    if (!root || !root.querySelectorAll) return;
    try {
      for (const frame of root.querySelectorAll("iframe, webview")) {
        try {
          const doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
          if (!doc) continue;
          observeInteractiveEvents(doc);
          observeRoot(doc.documentElement);
          walk(doc.documentElement, new WeakSet(), options);
        } catch {}
      }
    } catch {}
  }

  function walk(root, seen = new WeakSet(), options = {}) {
    if (!root || seen.has(root)) return;
    seen.add(root);
    observeRoot(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      try {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id === "__antigravityZhCnUntranslatedPanel" || (node.closest && node.closest("#__antigravityZhCnUntranslatedPanel"))) {
            node = walker.nextSibling();
            continue;
          }
          if (blocked.has(node.tagName)) {
            node = walker.nextSibling();
            continue;
          }
          translateAttrs(node, options);
          if (node.shadowRoot) walk(node.shadowRoot, seen, options);
          if (node.tagName === "IFRAME" || node.tagName === "WEBVIEW") visitFrames(root, options);
        } else if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (parent && !blocked.has(parent.tagName) && !parent.isContentEditable) {
            if (parent.closest && parent.closest("#__antigravityZhCnUntranslatedPanel")) {
              node = walker.nextNode();
              continue;
            }
            const translated = translateValue(node.nodeValue, options);
            if (translated !== node.nodeValue) node.nodeValue = translated;
          }
        }
      } catch {}
      node = walker.nextNode();
    }
  }
  function run(options = {}) {
    try {
      patchAttachShadow();
      observeInteractiveEvents(document);
      observeRoot(document.documentElement);
      const root = document.body || document.documentElement;
      translateTextNodes(root, options);
      translateAllAttrs(root, options);
      hideSidebarRelativeTimes(root);
      walk(root, new WeakSet(), options);
      visitFrames(root, options);
    } catch {}
  }
  globalThis.__antigravityZhCnTranslateNow = run;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
  globalThis.__antigravityZhCnMainWorldPatchInterval = setInterval(run, 250);
})();
`;
}

function patchPreload(text) {
  if (text.includes("__antigravityZhCnPatch")) return text;
  return text + preloadPatch();
}

function patchUtils(text) {
  const sourceLine = `const __antigravityZhCnMainWorldPatchSource = ${JSON.stringify(mainWorldPatchScript())};`;
  if (text.includes("__antigravityZhCnMainWorldPatchSource")) {
    const start = text.indexOf("const __antigravityZhCnMainWorldPatchSource = ");
    const nextLine = text.indexOf("\n", start);
    if (start < 0 || nextLine < 0) {
      throw new Error("Could not replace existing zh-CN main world patch source in dist/utils.js");
    }
    return text.slice(0, start) + sourceLine + text.slice(nextLine);
  }
  const marker = "(0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);";
  const injection = `
    ${sourceLine}
    const __runAntigravityZhCnMainWorldPatch = () => {
        void win.webContents.executeJavaScript(__antigravityZhCnMainWorldPatchSource).catch(() => {});
    };
    win.webContents.on('dom-ready', __runAntigravityZhCnMainWorldPatch);
    win.webContents.on('did-finish-load', __runAntigravityZhCnMainWorldPatch);
    win.webContents.on('did-navigate-in-page', __runAntigravityZhCnMainWorldPatch);
`;
  if (!text.includes(marker)) {
    throw new Error("Could not find createWindow injection point in dist/utils.js");
  }
  return text.replace(marker, marker + injection);
}

function patchMenu(text) {
  const marker = "    electron_1.Menu.setApplicationMenu(menu);";
  const injection = `    // zh-CN display patch: translate Electron default menu labels.
    const __antigravityZhCnMenuLabels = {
        'File': '文件',
        'View': '视图',
        'Window': '窗口',
        'New Conversation': '新建对话',
        'Create Project': '创建项目',
        'Command Palette': '命令面板',
        'Zoom In': '放大',
        'Zoom Out': '缩小',
        'Reset Zoom': '重置缩放',
        'Toggle Developer Tools': '切换开发者工具',
        'Minimize': '最小化',
        'Maximize': '最大化',
        'Close': '关闭',
    };
    const __antigravityZhCnTranslateMenu = (menuToTranslate) => {
        for (const item of menuToTranslate.items || []) {
            if (__antigravityZhCnMenuLabels[item.label]) {
                item.label = __antigravityZhCnMenuLabels[item.label];
            }
            if (item.submenu) {
                __antigravityZhCnTranslateMenu(item.submenu);
            }
        }
    };
    __antigravityZhCnTranslateMenu(menu);
`;
  if (text.includes("__antigravityZhCnTranslateMenu")) {
    const start = text.indexOf("    // zh-CN display patch: translate Electron default menu labels.");
    const call = "    __antigravityZhCnTranslateMenu(menu);";
    const callStart = text.indexOf(call, start);
    const end = callStart < 0 ? -1 : text.indexOf("\n", callStart);
    if (start < 0 || callStart < 0 || end < 0) {
      throw new Error("Could not replace existing zh-CN menu translation block in dist/menu.js");
    }
    return text.slice(0, start) + injection + text.slice(end + 1);
  }
  if (!text.includes(marker)) {
    throw new Error("Could not find Menu.setApplicationMenu injection point in dist/menu.js");
  }
  return text.replace(marker, injection + marker);
}

function main() {
  if (!fs.existsSync(asarPath)) {
    throw new Error(`app.asar not found: ${asarPath}`);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const backupDir = path.join(backupRoot, stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, "app.asar");
  fs.copyFileSync(asarPath, backupPath);

  const data = fs.readFileSync(asarPath);
  const { headerSize, header } = decodeAsar(data);
  const asar = {
    data,
    headerSize,
    header,
    body: data.subarray(8 + headerSize),
  };

  const changes = [];
  const patch = (file, updater) => {
    if (replaceEntry(asar, file, updater)) changes.push(file);
  };

  patch("dist/preload.js", patchPreload);
  patch("dist/utils.js", patchUtils);
  patch("dist/loadingOverlay.js", (text) =>
    replaceAll(text, [
      ["Loading Antigravity", "正在加载 Antigravity"],
      ["正在加载 Antigravity", "正在加载 Antigravity"],
    ])
  );
  patch("dist/ipcHandlers.js", (text) =>
    replaceAll(text, [
      ["title: 'Open workspace'", "title: '打开工作区'"],
      ["title: '打开工作区'", "title: '打开工作区'"],
    ])
  );
  patch("dist/main.js", (text) =>
    replaceAll(text, [
      ["label: 'New Window'", "label: '新建窗口'"],
      ["label: 'No agents running'", "label: '没有正在运行的智能体'"],
      ["label: `Open ${electron_1.app.getName()}`", "label: `打开 ${electron_1.app.getName()}`"],
      ["label: 'Quit'", "label: '退出'"],
      ["buttons: ['Cancel', 'Quit']", "buttons: ['取消', '退出']"],
      ["title: 'Confirm Quit'", "title: '确认退出'"],
      ["message: 'Are you sure you want to quit?'", "message: '确定要退出吗？'"],
      ["detail: 'There may be agents or background tasks running.'", "detail: '可能仍有智能体或后台任务正在运行。'"],
    ])
  );
  patch("dist/menu.js", (text) =>
    patchMenu(replaceAll(text, [
      ["label: 'New Window'", "label: '新建窗口'"],
      ["label: 'New Conversation'", "label: '新建对话'"],
      ["label: 'Create Project'", "label: '创建项目'"],
      ["label: 'Command Palette'", "label: '命令面板'"],
      ["label: 'Zoom In'", "label: '放大'"],
      ["label: 'Zoom Out'", "label: '缩小'"],
      ["label: 'Reset Zoom'", "label: '重置缩放'"],
      ["label: 'Toggle Developer Tools'", "label: '切换开发者工具'"],
      ["label: 'Minimize'", "label: '最小化'"],
      ["label: 'Maximize'", "label: '最大化'"],
      ["label: 'Close'", "label: '关闭'"],
      ["addItemToSubmenu(menu, 'File'", "addItemToSubmenu(menu, 'File'"],
      ["label: 'Docs'", "label: '文档'"],
    ]))
  );
  patch("dist/tray.js", (text) =>
    regexReplaceAll(text, [
      [
        /countItem\.label\s*=\s*\n\s*\(count > 0 \? `\$\{count\}` : 'No'\) \+\s*\n\s*' agent' \+\s*\n\s*\(count === 1 \? '' : 's'\) \+\s*\n\s*' running';/,
        "countItem.label = count > 0 ? `${count} 个智能体正在运行` : '没有正在运行的智能体';",
      ],
    ])
  );
  patch("dist/updater.js", (text) =>
    replaceAll(text, [
      ['MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', 'MenuUpdateStep["CheckForUpdates"] = "检查更新";'],
      ['MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', 'MenuUpdateStep["CheckingForUpdates"] = "正在检查更新...";'],
      ['MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', 'MenuUpdateStep["DownloadingUpdate"] = "正在下载更新...";'],
      ['MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', 'MenuUpdateStep["RestartToUpdate"] = "重启以更新";'],
      ["title: 'Check for Updates'", "title: '检查更新'"],
      ["message: 'No updates available'", "message: '没有可用更新'"],
      ["buttons: ['OK']", "buttons: ['确定']"],
    ])
  );
  patch("dist/ideInstall/wizardHtml.js", (text) =>
    replaceAll(text, [
      ['<html lang="en">', '<html lang="zh-CN">'],
      ["<title>Welcome to Antigravity</title>", "<title>欢迎使用 Antigravity</title>"],
      [">Setting up…<", ">正在设置...<"],
      [">Welcome to the new Antigravity!<", ">欢迎使用新版 Antigravity！<"],
      ["Antigravity has been redesigned to put agents first with new capabilities. If you'd still like a code editor, you can download it as a separate app named <b>Antigravity IDE</b>.",
       "Antigravity 已重新设计为以智能体为中心，并加入了新能力。如果你仍然需要代码编辑器，可以下载独立应用 <b>Antigravity IDE</b>。"],
      [">Download the Antigravity IDE<", ">下载 Antigravity IDE<"],
      [">Explore the new Antigravity<", ">探索新版 Antigravity<"],
      ['alt="Antigravity Icon"', 'alt="Antigravity 图标"'],
    ])
  );

  if (changes.length === 0) {
    console.log(`No changes needed. Backup kept at: ${backupPath}`);
    return;
  }

  const newHeader = encodeHeader(asar.header);
  const output = Buffer.concat([newHeader, asar.body]);
  fs.writeFileSync(asarPath, output);
  console.log(`Patched ${changes.length} files in app.asar:`);
  for (const file of changes) console.log(`- ${file}`);
  console.log(`Backup: ${backupPath}`);
}

main();

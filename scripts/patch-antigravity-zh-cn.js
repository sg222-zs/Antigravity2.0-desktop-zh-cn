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
  const patchVersion = "2026-06-11-project-dialog-v6";
  if (globalThis.__antigravityZhCnMainWorldPatchVersion === patchVersion) return;
  globalThis.__antigravityZhCnMainWorldPatchVersion = patchVersion;
  globalThis.__antigravityZhCnMainWorldPatch = true;

  const exact = new Map(Object.entries({
    "File": "文件",
    "View": "视图",
    "Window": "窗口",
    "New Conversation": "新建对话",
    "Create New Project": "创建新项目",
    "Create Project": "创建项目",
    "New Project": "新建项目",
    "Quick Start": "快速开始",
    "Select folder(s)": "选择文件夹",
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
    "Go To Projects": "前往项目",
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
    "Refresh quota and credits data": "刷新配额和点数数据"
  }));

  const phrases = [
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
    ["Refreshes in ", "刷新倒计时："],
    [" hours", " 小时"],
    [" hour", " 小时"],
    [" minutes", " 分钟"],
    [" minute", " 分钟"],
    ["Select model, current:", "选择模型，当前："],
    [" agent running", " 个智能体正在运行"],
    [" agents running", " 个智能体正在运行"]
  ];

  const blocked = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);
  function translateValue(value) {
    if (!value || !value.trim) return value;
    const trimmed = value.trim();
    const hit = exact.get(trimmed);
    if (hit) return value.replace(trimmed, hit);
    let out = value;
    for (const [from, to] of phrases) out = out.split(from).join(to);
    return out;
  }
  function translateAttrs(el) {
    if (!el.getAttribute) return;
    for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
      const value = el.getAttribute(attr);
      const translated = translateValue(value);
      if (translated && translated !== value) el.setAttribute(attr, translated);
    }
  }
  function walk(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (blocked.has(node.tagName)) {
          node = walker.nextSibling();
          continue;
        }
        translateAttrs(node);
      } else if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && !blocked.has(parent.tagName) && !parent.isContentEditable) {
          const translated = translateValue(node.nodeValue);
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
    clearTimeout(globalThis.__antigravityZhCnMainWorldPatchTimer);
    globalThis.__antigravityZhCnMainWorldPatchTimer = setTimeout(run, 30);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
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
    const updated = text.replace(
      /const __antigravityZhCnMainWorldPatchSource = "(?:\\.|[^"\\])*";/,
      sourceLine
    );
    if (updated === text) {
      throw new Error("Could not replace existing zh-CN main world patch source in dist/utils.js");
    }
    return updated;
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
    replaceAll(text, [
      ["label: 'New Window'", "label: '新建窗口'"],
      ["addItemToSubmenu(menu, 'File'", "addItemToSubmenu(menu, 'File'"],
      ["label: 'Docs'", "label: '文档'"],
    ])
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

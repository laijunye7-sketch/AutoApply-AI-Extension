# 🚀 AutoApply AI Pro: 智能网申填表助手

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/Chrome-Extension-orange.svg)

在春招/秋招的高强度投递中，机械地在各大 ATS（求职者追踪系统，如 Workday, Moka, 北森）中重复填写简历是一项极耗精力的工作。

**AutoApply AI** 是一款基于大语言模型（LLMs）的 Chrome 浏览器扩展。它能够智能解析复杂的现代前端网页表单，结合用户的中英文简历与自定义题库，实现精准的自动化填表。

## ✨ 核心特性 (Features)

- **🧠 多模型智能解析**：原生支持接入 Kimi (Moonshot), DeepSeek, OpenAI 等主流 LLM API，利用大模型强大的阅读理解能力，精准匹配表单 Label 与简历内容。
- **🌐 中英双语与上下文感知**：自动识别目标企业网站的语言环境，并在提取输入框时进行“向上溯源（Context-Aware）”，完美解决多段经历（如教育经历1、教育经历2）中同名输入框的覆盖冲突。
- **🛡️ 突破现代前端框架拦截**：针对 React/Vue 等框架构建的现代招聘网站（如模拟的 `<div class="select">`），内置原生 DOM 事件模拟（Input/Change/Blur 派发）与聚焦劫持，确保数据成功写入不丢失。
- **📦 专属网申题库引擎**：
  - **自动学习**：监听用户的每一次手动填表，静默学习并存入本地 LevelDB 沙盒。
  - **强制抓取**：按住 `Alt + 左键点击` 即可强行抓取难以解析的“假下拉框”数据。
  - **表格管理**：支持将网申经验一键导出为 `.csv` 文件，在 Excel 中批量维护“标准答案”后再无缝导入更新。

## 🛠️ 安装说明 (Installation)

由于本项目目前为开发者版本，请通过开发者模式加载：

1. Clone 本仓库或下载 ZIP 压缩包并解压。
2. 打开 Chrome / Edge 浏览器，进入扩展程序管理页面（地址栏输入 `chrome://extensions/`）。
3. 开启右上角的 **“开发者模式”**。
4. 点击左上角的 **“加载已解压的扩展程序”**，选择本项目的文件夹即可。

## 💡 使用指南 (Usage)

1. 点击浏览器右上角的插件图标，打开配置面板。
2. 选择你偏好的 AI 模型平台，并填入对应的 `API Key`。
3. 粘贴你的中文简历（可选填英文简历，投递外企必备）。
4. 点击“保存配置”（所有数据均加密保存在本地 `chrome.storage.local`，绝不上传第三方服务器，保障隐私安全）。
5. 进入目标招聘网站的填表页面，点击 **“✨ 智能填充当前页面”**，静候 AI 自动完成表单填写。

## 👨‍💻 技术栈 (Tech Stack)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Browser API**: Chrome Extensions API V3 (Content Scripts, Popup, Storage, Messaging)
- **AI Integration**: Fetch API for LLM RESTful endpoints

---
*If you find this tool helpful in your job hunt, please give it a ⭐️! Good luck with your offers!*

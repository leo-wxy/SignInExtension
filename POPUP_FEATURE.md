# 全局浮窗功能说明

## 功能概述

点击扩展图标后，会在当前页面右下角显示一个**全局浮窗**，用户可以直接在页面上操作签到任务。

---

## 实现方式

### 1. 浮窗位置
- **固定在右下角** (`right: 24px; bottom: 24px`)
- **z-index: 2147483647** 确保在所有页面元素之上
- **宽度: 360px** (响应式: `max-width: calc(100vw - 48px)`)

### 2. 浮窗内容

#### 头部区域
- **标题**: "签到助手"
- **关闭按钮**: 点击 ✕ 关闭浮窗

#### 内容区域
- **任务名称**: 显示当前任务名
- **状态**: 显示最后执行状态（已签到/未签到/错误等）
- **地址**: 显示任务目标 URL

#### 操作区域
- **立即签到按钮**: 直接执行签到，显示 toast 反馈
- **打开页面按钮**: 打开任务目标页面

---

## 工作流程

```
用户点击扩展图标
  ↓
Background: 获取当前任务和状态
  ↓
Background: 发送 SHOW_POPUP 消息到 Content Script
  ↓
Content: 在页面右下角显示浮窗
  ↓
用户操作:
  - 点击"立即签到" → 执行签到
  - 点击"打开页面" → 跳转到目标页
  - 点击关闭按钮 → 隐藏浮窗
```

---

## 消息类型

### SHOW_POPUP
**方向**: Background → Content  
**数据**:
```javascript
{
  type: 'SHOW_POPUP',
  data: {
    taskName: '牧原签到',
    status: 'ready',
    url: 'https://example.com',
    task: { /* 完整任务对象 */ }
  }
}
```

### HIDE_POPUP
**方向**: Background → Content  
**功能**: 隐藏浮窗

---

## 样式设计

### 配色方案
- **背景**: `#ffffff` (白色)
- **头部/底部**: `#f9f9fb` (浅灰)
- **标题**: `#201936` (深灰)
- **主按钮**: `#2563eb` (蓝色)
- **次按钮**: `#ffffff` + 边框
- **边框**: `#e5e5ea`

### 阴影效果
```css
box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28)
border-radius: 12px
```

---

## 与确认面板的区别

| 特性 | 确认面板 | 全局浮窗 |
|------|---------|---------|
| **触发方式** | 右键菜单 / 拾取器 | 点击扩展图标 |
| **用途** | 选择和确认元素 | 查看状态和执行操作 |
| **内容** | 元素信息、选择器列表 | 任务状态、操作按钮 |
| **宽度** | 520px | 360px |
| **按钮** | 取消/重选/确认 | 立即签到/打开页面 |
| **位置** | 固定右下角 | 固定右下角 |

---

## 用户体验优化

### 1. 即时反馈
- 点击"立即签到"后显示 toast 提示
- 执行成功: 绿色 toast "签到完成"
- 执行失败: 红色 toast "签到失败"

### 2. 自动关闭
- 点击"打开页面"后自动关闭浮窗
- 点击关闭按钮立即关闭

### 3. 响应式设计
- 小屏幕自动调整宽度
- 内容区域最大高度 400px，超出可滚动

---

## 后续扩展建议

### 1. 多任务支持
在浮窗中显示任务列表，用户可以切换选择

### 2. 快捷操作
添加"编辑任务"、"删除任务"按钮

### 3. 历史记录
显示最近签到记录和时间

### 4. 状态图标
根据任务状态显示不同颜色的状态指示器

### 5. 键盘快捷键
- `Esc` 关闭浮窗
- `Enter` 执行签到
- `Space` 打开页面

---

## 技术实现细节

### Content Script 注入
浮窗通过 Content Script 直接注入到页面 DOM 中，使用：
- `document.createElement()` 动态创建
- `Object.assign(element.style, {...})` 设置样式
- 避免与页面样式冲突

### 消息通信
```javascript
// Background → Content
chrome.tabs.sendMessage(tabId, {
  type: 'SHOW_POPUP',
  data: { ... }
});

// Content 内部操作
popup.addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({
    type: 'RUN_TASK',
    task: data.task
  });
});
```

### 清理机制
```javascript
function removePopup() {
  document.getElementById(POPUP_ID)?.remove();
}
```

---

## 测试要点

### 功能测试
- ✅ 点击扩展图标显示浮窗
- ✅ 浮窗显示正确的任务信息
- ✅ "立即签到"按钮执行签到
- ✅ "打开页面"按钮跳转正确
- ✅ 关闭按钮隐藏浮窗

### 兼容性测试
- ✅ 不同屏幕尺寸下的显示
- ✅ 页面滚动时浮窗位置固定
- ✅ 多标签页独立显示
- ✅ 与页面元素不冲突

### 边界情况
- ✅ 无任务时的显示
- ✅ Content Script 未加载时的处理
- ✅ 任务执行失败时的提示

---

## 代码位置

### Content Script
- **文件**: `src/content.js`
- **函数**: 
  - `showPopup(data)` - 显示浮窗
  - `removePopup()` - 移除浮窗
  - `MESSAGE_TYPES.SHOW_POPUP` - 消息处理
  - `MESSAGE_TYPES.HIDE_POPUP` - 消息处理

### Background
- **文件**: `src/background.js`
- **事件**: `chrome.action.onClicked` - 点击图标处理

---

## 总结

全局浮窗提供了一个**轻量级、非侵入式**的用户界面，让用户无需离开当前页面就能快速查看签到状态和执行操作。相比传统的 popup 页面，这种方式更符合用户的使用习惯。

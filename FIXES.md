# 元素选择逻辑修复记录

## 修复日期
2026-06-14

## 问题概述
元素选择功能的核心逻辑存在多处缺失，导致右键菜单无法正常工作。

## 修复详情

### 1. 添加 `lastContextElement` 变量声明
**文件**: `src/content.js`  
**位置**: 第 32 行  
**问题**: 代码中使用了 `lastContextElement` 但从未声明  
**修复**: 添加 `let lastContextElement = null;`

### 2. 补全 `MESSAGE_TYPES` 枚举
**文件**: `src/content.js`  
**位置**: 第 7-15 行  
**问题**: 缺少 `GET_CONTEXT_ELEMENT` 消息类型  
**修复**: 添加 `GET_CONTEXT_ELEMENT: 'GET_CONTEXT_ELEMENT'`

### 3. 添加右键菜单事件监听器
**文件**: `src/content.js`  
**位置**: 第 744-749 行  
**问题**: 没有监听 `contextmenu` 事件来记录用户右键的元素  
**修复**: 
```javascript
document.addEventListener('contextmenu', (event) => {
  if (event.target instanceof Element) {
    lastContextElement = event.target;
  }
}, true);
```

### 4. 修复 `showConfirmPanel` 调用参数
**文件**: `src/content.js`  
**位置**: 第 619, 624-627 行  
**问题**: 传递的 `context` 参数不完整，缺少 `mode` 和 `taskId`  
**修复**: 传递完整的上下文对象 `{ targetKey, mode, taskId }`

### 5. 修复 `handleQuickPickElement` 函数签名
**文件**: `src/content.js`  
**位置**: 第 690 行  
**问题**: 函数只接收 `targetKey` 参数，缺少 `mode` 和 `taskId`  
**修复**: 添加完整参数 `handleQuickPickElement(targetKey, mode, taskId)`

### 6. 修复 `startPicker` 函数状态赋值
**文件**: `src/content.js`  
**位置**: 第 599-604 行  
**问题**: `PICKER_STATE` 没有正确设置 `mode` 和 `taskId`  
**修复**: 添加缺失的状态赋值

### 7. 添加 `rect` 属性到 picked 对象
**文件**: `src/content.js`  
**位置**: 第 623, 695 行  
**问题**: `showConfirmPanel` 需要 `picked.rect` 来定位面板，但 `buildPickedElementInfo` 不返回该属性  
**修复**: 在调用处手动添加 `picked.rect = element.getBoundingClientRect()`

### 8. 修复 `showConfirmPanel` 的 fallback rect
**文件**: `src/content.js`  
**位置**: 第 585-589 行  
**问题**: 原始 fallback rect 太小可能导致面板定位异常  
**修复**: 使用 `document.elementFromPoint(100, 100)?.getBoundingClientRect()` 作为更合理的 fallback

## 验证结果

✅ 语法检查通过 (`npm run check:manifest`)  
✅ 所有测试通过 (`npm test`) - 11/11 tests  
✅ 核心功能完整：
  - 右键菜单记录元素
  - 元素拾取器启动
  - 确认面板显示
  - 选择器生成和选择
  - 任务创建/更新

## 工作流程验证

### 创建任务流程
1. 用户在签到按钮上右键 → `contextmenu` 事件记录 `lastContextElement`
2. 用户点击"创建签到任务" → Background 发送 `QUICK_PICK_ELEMENT`
3. Content 检查 `lastContextElement` 存在 → 调用 `buildPickedElementInfo`
4. 显示确认面板，传递完整 context `{ targetKey, mode: 'create', taskId: null }`
5. 用户选择 selector 并确认 → 发送 `PICKER_RESULT` 到 Background
6. Background 保存任务到 storage

### 编辑任务流程
1. 用户在新按钮上右键 → 记录新的 `lastContextElement`
2. 用户点击"更新签到元素" → Background 发送 `QUICK_PICK_ELEMENT` with `mode: 'edit'`
3. Content 使用新元素生成 picked 信息
4. 确认面板显示"确认更新"按钮（而非"确认创建"）
5. 更新现有任务的 action selector

## 未来改进建议

1. **元素验证增强**
   - 在保存前验证选择器能否成功查找到元素
   - 显示选择器覆盖范围（唯一性检查）

2. **视觉反馈改进**
   - 在确认面板中预览选中的元素（高亮或截图）
   - 显示候选选择器的优先级评分

3. **错误处理**
   - 如果 `lastContextElement` 已从 DOM 移除，提示用户重新右键
   - 选择器失效时自动重试候选选择器

4. **性能优化**
   - 限制 `selectorCandidates` 数量避免面板过长
   - 懒加载候选选择器（仅在展开下拉框时生成）

## 相关文件
- `src/content.js` - Content script 主文件
- `src/background.js` - Background service worker
- `src/shared/rules.js` - 规则引擎
- `tests/rules.test.js` - 测试套件

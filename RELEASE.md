# 发布流程

## 日常校验

本地提交前先执行：

```bash
npm test
npm run check:manifest
```

## 本地打包

执行：

```bash
bash scripts/package.sh
```

产物会输出到：

```text
dist/signin-extension-v<version>.zip
```

## GitHub CI

仓库包含两个 GitHub Actions 工作流：

- `CI`
  - 触发：`push main`、`pull_request`
  - 内容：`npm test`、`npm run check:manifest`

- `Release`
  - 触发：推送符合 `v*` 规则的 tag
  - 内容：
    - 安装依赖
    - 跑测试
    - 跑脚本校验
    - 执行 `scripts/package.sh`
    - 创建 GitHub Release 并上传 zip

## Tag 发布

### 1. 更新版本号

至少更新以下文件中的版本：

- `manifest.json`
- `package.json`

### 2. 提交版本改动

```bash
git add manifest.json package.json
git commit -m "chore: 发布 v0.1.0"
git push origin main
```

### 3. 创建并推送 tag

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

### 4. 等待 GitHub Actions 完成

`Release` 工作流完成后，会在 GitHub Releases 页面生成对应版本，并自动附带 zip 安装包。

## 手动分发

如果不走 GitHub Release，也可以把 `dist/` 里的 zip 直接发给使用者。使用者解压后，在 Chrome / Arc 中通过“加载已解压的扩展程序”安装。

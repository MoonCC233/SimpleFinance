# 膏方提成计算

> 膏方销售提成计算 Android 应用

## 简介

基于 Capacitor 7 构建的 Android 应用，用于按月记录膏方品种出库数据并自动计算提成，支持数据导入导出备份。

**提成公式**：提成 = (总售价 − 成本 − 运费 − 额外支出) × 提成比例%

## 功能

- **品种管理**：新增/删除膏方品种，设置成本、多档售价、库存

- **月度独立**：每月数据单独保存，新建月份可复制上月品种结构（出库数清零）

- **数据备份**：导出为 xlsx 备份（单元格样式/公式/合并单元格与模板一致），支持从备份表格导入恢复

- **月度备注**：每月可写备注，导出换行保留、导入可识别

- **本地存储**：数据保存在设备本地，无需联网

## 下载安装

前往 [Releases](https://github.com/MoonCC233/SimpleFinance/releases) 页面下载最新 APK，传到手机安装即可。

## 自动构建

项目配置了 GitHub Actions（[build-apk.yml](.github/workflows/build-apk.yml)）：

- 推送 `v*` 标签时自动构建并发布到 Release

- 也可在 Actions 页面手动触发（仅构建，不发布 Release）

发布新版本：

```bash
git tag v1.19
git push origin v1.19
```

## 本地构建

前置：Node.js 20+、Android SDK（build-tools 34+）、JDK 17

```bash
npm ci
npx cap sync android
cd android
./gradlew assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release-unsigned.apk`，用 `apksigner` 签名后可安装。

## 签名配置（可选）

CI 默认用临时 debug keystore 签名（可安装，但每次签名不同，无法覆盖升级）。如需固定签名，在仓库 **Settings → Secrets and variables → Actions** 配置以下 Secrets：

| Secret                    | 说明                                                   |
| ------------------------- | ---------------------------------------------------- |
| `SIGNING_KEYSTORE_BASE64` | keystore 文件的 base64（生成：`base64 -i release.keystore`） |
| `SIGNING_STORE_PASSWORD`  | keystore 密码                                          |
| `SIGNING_KEY_ALIAS`       | key 别名                                               |
| `SIGNING_KEY_PASSWORD`    | key 密码                                               |

配置后，CI 会自动用该 keystore 签名，保证版本签名一致、可覆盖升级。

## 技术栈

- **Capacitor 7**：Web → Android 原生封装

- **SheetJS / xlsx-js-style**：Excel 读写与单元格样式

- **Android Gradle Plugin 8.7.2 + Gradle 8.13**

- **GitHub Actions**：CI/CD 自动构建发布

## 项目结构

```
SimpleFinance/
├── www/                      # Web 前端源码
│   ├── app.js                # 业务逻辑（提成计算、导入/导出、月份管理）
│   ├── index.html
│   └── styles.css
├── android/                  # Capacitor Android 原生工程
├── .github/workflows/        # CI 工作流
├── capacitor.config.json     # Capacitor 配置
├── 食用膏方.xlsx             # 原始模板（样式/公式参考）
└── package.json
```


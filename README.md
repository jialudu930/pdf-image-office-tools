# 文档工坊

公开使用地址：https://jialudu930.github.io/pdf-image-office-tools/

这是一个在浏览器本地处理文件的办公工具，支持：

- PDF 合并、预览、删页、拖拽排序、旋转、页面提取和逐页拆分
- PDF 水印、文字与图片编辑、普通签章、骑缝章、黑白打码和 OCR
- PDF 与图片压缩
- 图片拼接、拖拽裁剪、图片转 PDF
- Word、Excel 批量转 PDF

仓库根目录是 GitHub Pages 的静态成品；`source/` 是可维护的前端源码。

## 本地运行

使用 Node.js 22 和 pnpm 10，在 `source` 目录执行：

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 4174
pnpm test --run
pnpm build
```

将 `source/build/` 内的文件同步到仓库根目录即可更新 GitHub Pages。`index.html` 和它引用的 `assets` 必须来自同一次构建。

## 能力说明

Word、Excel 转换采用浏览器渲染，复杂页眉页脚、浮动图片、图表和打印设置可能与 Office 不同。需要严格保留原版式时，请在 Office 中另存为 PDF。

PDF 编辑保存会把页面合成为图片。OCR 首次使用需要联网下载中英文模型，目前仅为英文识别结果加入搜索层。扫描件压缩也会把页面转为图片；图片压缩输出 JPG，透明区域转为白色。印章功能是图片叠加，不是证书数字签名。

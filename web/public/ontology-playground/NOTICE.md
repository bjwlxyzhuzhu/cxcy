# Ontology Playground（第三方，MIT 协议）

- 来源：https://github.com/microsoft/ontology-playground
- 版本：提交 7bf7acb427424ce68f917fa26f484fb06ca42051（2026-10-22）
- 许可：MIT，版权归 Microsoft Corporation，原文见同目录 LICENSE.txt
- 本站的改动：去掉 index.html 中的 Google 字体链接（不引入外网字体）；构建时 base 设为 /ontology-playground/，关闭 AI 生成功能；删除 Azure 部署配置 staticwebapp.config.json。其余未改动。
- 重新构建：node scripts/vendor-ontology-playground.mjs <源码目录>（见脚本说明）

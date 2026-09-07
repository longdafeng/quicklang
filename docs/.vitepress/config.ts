import { defineConfig } from "vitepress";
export default defineConfig({
  title: "QuickLang",
  description: "个人背单词应用 · 工程文档",
  lang: "zh-CN",
  base: process.env.DOCS_BASE || "/",
  themeConfig: {
    nav: [{ text: "快速开始", link: "/development/getting-started" }, { text: "设计", link: "/quicklang-product-technical-design-v1" }],
    sidebar: [
      { text: "工程框架", items: [
        { text: "概览", link: "/" }, { text: "开发指南", link: "/development/getting-started" },
        { text: "实现与验证", link: "/development/implementation" }, { text: "架构", link: "/architecture/overview" },
        { text: "许可与来源", link: "/reference/licenses" },
      ] },
      { text: "详细设计", link: "/quicklang-product-technical-design-v1" },
    ],
  },
});

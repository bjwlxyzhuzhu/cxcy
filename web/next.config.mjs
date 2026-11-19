/** @type {import('next').NextConfig} */
const nextConfig = {
  // 首页为命令式 Canvas 动效移植，关闭严格模式避免开发期重复初始化造成的动画叠加
  reactStrictMode: false,
  // Docker（Linux）部署：产出最小化 standalone server（.next/standalone/server.js）。
  // Windows 本机默认不产出：standalone 里的 pnpm 符号链接在 Windows 上删不掉，会导致下次 dev/build 报 EPERM。
  // 需要在 Windows 上产出时设 BUILD_STANDALONE=1；BUILD_LOCAL=1 则在任何平台都不产出。
  output:
    process.env.BUILD_LOCAL === "1" || (process.platform === "win32" && process.env.BUILD_STANDALONE !== "1")
      ? undefined
      : "standalone",
  // 启用 instrumentation.ts（本地开发为服务端 fetch 注入代理）
  experimental: { instrumentationHook: true },
  // 数据库用 Node 内置 node:sqlite：webpack 不认识这个内置模块，需声明为外部依赖，运行时由 Node 直接加载
  webpack: (config, { isServer, nextRuntime }) => {
    if (isServer && nextRuntime !== "edge") {
      config.externals = [...(config.externals || []), { "node:sqlite": "commonjs node:sqlite" }];
    }
    return config;
  },
};

export default nextConfig;

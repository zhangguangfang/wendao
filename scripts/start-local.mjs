#!/usr/bin/env node

import { createServer, get } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = 4173;
const address = `http://${host}:${port}/`;
const healthPath = "/__huanhuan_health";
const identity = {
  app: "huanhuan",
  version: "0.1.0",
  launcher: "huanhuan-local-v1",
};
const shouldOpen = !process.argv.includes("--no-open");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function isInside(root, target) {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function openBrowser() {
  if (!shouldOpen) return;
  const [command, args] = process.platform === "win32"
    ? ["cmd.exe", ["/d", "/c", "start", "", address]]
    : process.platform === "darwin"
      ? ["open", [address]]
      : ["xdg-open", [address]];
  console.log("正在请求默认浏览器打开缓缓……");
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => {
      console.log(`无法自动打开浏览器，请手动输入：${address}`);
    });
    child.once("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.log(`浏览器没有成功打开，请手动输入：${address}`);
      }
    });
    child.unref();
  } catch {
    console.log(`无法自动打开浏览器，请手动输入：${address}`);
  }
}

function isOurRunningApp() {
  return new Promise((done) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      done(value);
    };
    const request = get(`${address.slice(0, -1)}${healthPath}`, {
      timeout: 1500,
      headers: { Accept: "application/json" },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finish(false);
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) {
          response.destroy();
          finish(false);
        }
      });
      response.on("error", () => finish(false));
      response.on("end", () => {
        try {
          const data = JSON.parse(body);
          finish(data.app === identity.app && data.version === identity.version && data.launcher === identity.launcher);
        } catch {
          finish(false);
        }
      });
    });
    request.on("timeout", () => { request.destroy(); finish(false); });
    request.on("error", () => finish(false));
  });
}

let root;
try {
  root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist"));
  const entry = await realpath(resolve(root, "index.html"));
  if (!isInside(root, entry) || !(await stat(entry)).isFile()) throw new Error("Missing entry");
} catch {
  console.error("没有找到可运行的应用文件。请在“缓缓”文件夹中执行 npm ci 和 npm run build，然后重新启动。");
  process.exitCode = 1;
}

if (root && !process.exitCode) {
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    const head = request.method === "HEAD";
    const reply = (status, text) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(head ? undefined : text);
    };
    if (request.method !== "GET" && !head) {
      response.setHeader("Allow", "GET, HEAD");
      reply(405, "只支持 GET 和 HEAD 请求。");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    } catch {
      reply(400, "无效的文件地址。");
      return;
    }
    if (!pathname.startsWith("/") || pathname.startsWith("//") || /[\\\0]/.test(pathname) || pathname.split("/").some((part) => part === "." || part === "..")) {
      reply(403, "无法访问此地址。");
      return;
    }
    if (pathname === healthPath) {
      const body = JSON.stringify(identity);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
      response.end(head ? undefined : body);
      return;
    }

    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const candidate = resolve(root, requested);
    if (!isInside(root, candidate)) {
      reply(403, "无法访问此文件。");
      return;
    }
    try {
      const actual = await realpath(candidate);
      if (!isInside(root, actual)) { reply(403, "无法访问此文件。"); return; }
      const info = await stat(actual);
      if (!info.isFile()) { reply(404, "没有找到此文件。"); return; }
      const extension = extname(actual).toLowerCase();
      const immutable = /^assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css|png|jpe?g|webp|avif|svg|woff2?)$/.test(requested);
      response.writeHead(200, {
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-store",
      });
      if (head) { response.end(); return; }
      const file = createReadStream(actual);
      file.on("error", () => response.destroy());
      file.pipe(response);
    } catch (error) {
      if (!response.headersSent) reply(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500, "暂时无法读取此文件。");
      else response.destroy();
    }
  });

  server.on("error", async (error) => {
    if (error.code === "EADDRINUSE" && await isOurRunningApp()) {
      console.log(`缓缓已经在运行：${address}`);
      openBrowser();
      return;
    }
    if (error.code === "EADDRINUSE") {
      console.error("4173 端口已被其他应用占用。请先关闭占用该端口的应用，再重新启动缓缓；本程序不会打开或停止其他应用。");
    } else {
      console.error(`无法启动缓缓（${error.code ?? "未知错误"}）。请确认当前用户可以在本机启动服务。`);
    }
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`缓缓已在本机启动：${address}`);
    console.log("请保留此窗口。按 Ctrl+C 可停止应用；关闭浏览器不会删除已保存的记录。");
    openBrowser();
  });
  const shutdown = () => {
    console.log("\n正在停止缓缓……");
    server.close(() => { process.exitCode = 0; });
    server.closeIdleConnections?.();
    const timeout = setTimeout(() => process.exit(0), 3000);
    timeout.unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

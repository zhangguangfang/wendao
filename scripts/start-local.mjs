#!/usr/bin/env node

import { createServer, get } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const host = "127.0.0.1";
const healthPath = "/__huanhuan_health";
const defaultProject = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

function openBrowser(address, logger) {
  const [command, args] = process.platform === "win32"
    ? ["cmd.exe", ["/d", "/c", "start", "", address]]
    : process.platform === "darwin"
      ? ["open", [address]]
      : ["xdg-open", [address]];
  logger.log("正在请求默认浏览器打开缓缓……");
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => {
      logger.log(`无法自动打开浏览器，请手动输入：${address}`);
    });
    child.once("exit", (code) => {
      if (code !== 0 && code !== null) {
        logger.log(`浏览器没有成功打开，请手动输入：${address}`);
      }
    });
    child.unref();
  } catch {
    logger.log(`无法自动打开浏览器，请手动输入：${address}`);
  }
}

function inspectRunningApp(address) {
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
        finish(null);
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4096) {
          response.destroy();
          finish(null);
        }
      });
      response.on("error", () => finish(null));
      response.on("end", () => {
        try {
          const data = JSON.parse(body);
          finish(data && data.app === "huanhuan" && /^huanhuan-local-v[12]$/.test(data.launcher) ? data : null);
        } catch {
          finish(null);
        }
      });
    });
    request.on("timeout", () => { request.destroy(); finish(null); });
    request.on("error", () => finish(null));
  });
}

async function buildIdentity(projectDirectory, root) {
  const packageJson = JSON.parse(await readFile(join(projectDirectory, "package.json"), "utf8"));
  if (typeof packageJson.version !== "string" || !/^[0-9A-Za-z.+-]{1,64}$/.test(packageJson.version)) {
    throw new Error("Invalid package version");
  }
  const hash = createHash("sha256");
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      // A package must be self-contained. Do not fingerprint data reached by links.
      if (entry.isSymbolicLink()) throw new Error("Linked build asset");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const name = relative(root, path).split(sep).join("/");
        const contents = await readFile(path);
        hash.update(`${Buffer.byteLength(name)}:${name}:${contents.byteLength}:`);
        hash.update(contents);
      } else throw new Error("Unsupported build asset");
    }
  }
  await visit(root);
  return {
    app: "huanhuan",
    version: packageJson.version,
    launcher: "huanhuan-local-v2",
    build: hash.digest("hex"),
  };
}

// Tests pass an isolated directory and an OS-assigned port. The shipped CLI
// always uses 4173 so upgrades retain the same browser storage origin.
export async function startLocal({ projectDirectory = defaultProject, port = 4173, open = true, logger = console } = {}) {
  let root;
  let identity;
  try {
    root = await realpath(resolve(projectDirectory, "dist"));
    const entry = await realpath(resolve(root, "index.html"));
    if (!isInside(root, entry) || !(await stat(entry)).isFile()) throw new Error("Missing entry");
    identity = await buildIdentity(projectDirectory, root);
  } catch {
    throw new Error("没有找到完整的应用文件。请重新解压完整的“缓缓”运行包；使用源码时，请执行 npm ci 和 npm run build 后再启动。");
  }
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

  const error = await new Promise((done) => {
    const onError = (cause) => done(cause);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      done(null);
    });
  });
  const actualPort = error ? port : server.address().port;
  const address = `http://${host}:${actualPort}/`;
  if (error) {
    if (error.code === "EADDRINUSE") {
      const existing = await inspectRunningApp(address);
      if (existing?.version === identity.version && existing?.build === identity.build && existing?.launcher === identity.launcher) {
        logger.log(`缓缓 ${identity.version} 已经在运行：${address}`);
        if (open) openBrowser(address, logger);
        return { status: "reused", address, identity };
      }
      if (existing) {
        throw new Error(`已有另一个版本或构建的缓缓在运行。请先回到旧的启动窗口，按 Ctrl+C 停止它，再从这个“缓缓”文件夹重新启动 ${identity.version}。固定本机地址可继续使用原有记录。`);
      }
      throw new Error(`${port} 端口已被其他应用占用。请先关闭占用该端口的应用，再重新启动缓缓；本程序不会打开或停止其他应用。`);
    }
    throw new Error(`无法启动缓缓（${error.code ?? "未知错误"}）。请确认当前用户可以在本机启动服务。`);
  }
  logger.log(`缓缓 ${identity.version} 已在本机启动：${address}`);
  logger.log("请保留此窗口。按 Ctrl+C 可停止应用；关闭浏览器不会删除已保存的记录。");
  if (open) openBrowser(address, logger);
  return { status: "started", server, address, identity };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await startLocal({ open: !process.argv.includes("--no-open") });
    if (result.server) {
      const shutdown = () => {
        console.log("\n正在停止缓缓……");
        result.server.close(() => { process.exitCode = 0; });
        result.server.closeIdleConnections?.();
        const timeout = setTimeout(() => process.exit(0), 3000);
        timeout.unref();
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

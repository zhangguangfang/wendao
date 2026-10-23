import { expect, test } from "@playwright/test";
import { createServer, request, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The launcher is plain Node ESM so the downloaded app needs no runtime packages.
// @ts-expect-error JavaScript launcher intentionally ships without a TS build step.
import { startLocal } from "../scripts/start-local.mjs";

type Started = { status: "started"; server: Server; address: string; identity: { version: string; build: string } };
const quiet = { log: () => undefined };

async function fixture(version = "0.2.0", body = "<h1>缓缓测试</h1>") {
  const directory = await mkdtemp(join(tmpdir(), "huanhuan-launcher-"));
  await mkdir(join(directory, "dist", "assets"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "huanhuan", version }));
  await writeFile(join(directory, "dist", "index.html"), body);
  await writeFile(join(directory, "dist", "assets", "main-abcdef12.js"), "window.huanhuan = true;");
  return directory;
}

async function close(server: Server) {
  server.closeAllConnections?.();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function launch(directory: string, port = 0): Promise<Started> {
  return startLocal({ projectDirectory: directory, port, open: false, logger: quiet });
}

function rawRequest(address: string, path: string, method = "GET") {
  return new Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    // Passing path directly preserves traversal probes that a URL would normalize.
    const url = new URL(address);
    const pending = request({ host: url.hostname, port: url.port, path, method, agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => body += chunk);
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body, headers: response.headers }));
      response.on("error", reject);
    });
    pending.on("error", reject);
    pending.end();
  });
}

test("local launcher serves the package with bounded paths, correct MIME and HEAD behavior", async () => {
  const directory = await fixture();
  let running: Started | undefined;
  try {
    running = await launch(directory);
    const home = await rawRequest(running.address, "/");
    expect(home.status).toBe(200);
    expect(home.body).toContain("缓缓测试");
    expect(home.headers["content-type"]).toContain("text/html");
    expect(home.headers["cache-control"]).toBe("no-store");
    expect(home.headers["x-content-type-options"]).toBe("nosniff");
    const head = await rawRequest(running.address, "/", "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(Number(head.headers["content-length"])).toBe(Buffer.byteLength(home.body));
    const asset = await rawRequest(running.address, "/assets/main-abcdef12.js");
    expect(asset.headers["content-type"]).toContain("text/javascript");
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await rawRequest(running.address, "/assets/")).status).toBe(404);
    expect((await rawRequest(running.address, "/package.json")).status).toBe(404);
    expect((await rawRequest(running.address, "/", "POST")).status).toBe(405);
    expect((await rawRequest(running.address, "/%E0%A4%A")).status).toBe(400);
    for (const path of ["/../package.json", "/%2e%2e/package.json", "/assets/./main-abcdef12.js", "/%5cpackage.json", "/%00"]) {
      expect((await rawRequest(running.address, path)).status).toBe(403);
    }
    const health = JSON.parse((await rawRequest(running.address, "/__huanhuan_health")).body);
    expect(health).toMatchObject({ app: "huanhuan", version: "0.2.0", launcher: "huanhuan-local-v2" });
    expect(health.build).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(health)).not.toContain(directory);
  } finally {
    if (running) await close(running.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("reopening the same build reuses it but a changed version or changed bundle requires stopping the old app", async () => {
  const first = await fixture();
  const nextVersion = await fixture("0.3.0");
  const nextBuild = await fixture("0.2.0", "<h1>新的缓缓功能</h1>");
  let running: Started | undefined;
  try {
    running = await launch(first);
    const port = Number(new URL(running.address).port);
    const duplicate = await startLocal({ projectDirectory: first, port, open: false, logger: quiet });
    expect(duplicate.status).toBe("reused");
    expect(duplicate.server).toBeUndefined();
    for (const directory of [nextVersion, nextBuild]) {
      await expect(launch(directory, port)).rejects.toThrow("已有另一个版本或构建的缓缓在运行");
      expect((await rawRequest(running.address, "/")).body).toContain("缓缓测试");
    }
  } finally {
    if (running) await close(running.server);
    await Promise.all([first, nextVersion, nextBuild].map((directory) => rm(directory, { recursive: true, force: true })));
  }
});

test("an old launcher is recognized and an unrelated service is never reused", async () => {
  const directory = await fixture();
  let responseBody = JSON.stringify({ app: "huanhuan", version: "0.1.0", launcher: "huanhuan-local-v1" });
  const other = createServer((_, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(responseBody);
  });
  await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
  const port = (other.address() as { port: number }).port;
  try {
    await expect(launch(directory, port)).rejects.toThrow("按 Ctrl+C 停止它");
    responseBody = JSON.stringify({ app: "other-app", version: "0.2.0" });
    await expect(launch(directory, port)).rejects.toThrow("端口已被其他应用占用");
    responseBody = "not JSON";
    await expect(launch(directory, port)).rejects.toThrow("端口已被其他应用占用");
    expect(other.listening).toBe(true);
  } finally {
    await close(other);
    await rm(directory, { recursive: true, force: true });
  }
});

test("a missing build is rejected without starting a service or changing package files", async () => {
  const directory = await fixture();
  try {
    const manifest = await readFile(join(directory, "package.json"), "utf8");
    await rm(join(directory, "dist", "index.html"));
    await expect(launch(directory)).rejects.toThrow("重新解压完整");
    expect(await readFile(join(directory, "package.json"), "utf8")).toBe(manifest);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a link created after launch cannot expose a file outside dist", async () => {
  const directory = await fixture();
  let running: Started | undefined;
  try {
    running = await launch(directory);
    try {
      await symlink(join(directory, "package.json"), join(directory, "dist", "outside.json"));
    } catch (error) {
      // Creating symlinks can require Developer Mode on Windows; production
      // behavior remains protected by realpath containment on every request.
      if ((error as NodeJS.ErrnoException).code === "EPERM") test.skip(true, "This OS does not allow test symlinks.");
      throw error;
    }
    expect((await rawRequest(running.address, "/outside.json")).status).toBe(403);
  } finally {
    if (running) await close(running.server);
    await rm(directory, { recursive: true, force: true });
  }
});

test("an active or interrupted update cannot launch a partially installed program", async () => {
  const directory = await fixture();
  try {
    for (const marker of [".huanhuan-update.json", ".huanhuan-update-active.json"]) {
      await writeFile(join(directory, marker), "{}");
      await expect(launch(directory)).rejects.toThrow("上次更新尚未完成");
      await rm(join(directory, marker));
    }
    const running = await launch(directory);
    await close(running.server);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

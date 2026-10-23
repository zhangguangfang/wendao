import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const executable = process.env.POWERSHELL_EXECUTABLE_PATH || (process.platform === "win32" ? "powershell.exe" : "pwsh");
const script = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "update-core.tests.ps1");
const child = spawn(executable, ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: "inherit" });
child.on("error", (error) => {
  console.error(`无法运行 PowerShell 检查（${error.code ?? "未知错误"}）。Windows 可使用内置 PowerShell；其他系统安装 pwsh，或设置 POWERSHELL_EXECUTABLE_PATH。`);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });

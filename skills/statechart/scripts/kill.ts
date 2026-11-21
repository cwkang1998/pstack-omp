import { spawn } from "node:child_process";
import { once } from "node:events";

export async function killGroup(pid: number) {
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    await once(killer, "exit").catch(() => {});
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {}
}

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.info.projectDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(projectDir, "build", "icon.ico");
  const electronWinstallerPath = require.resolve("electron-winstaller/package.json");
  const rceditPath = path.join(path.dirname(electronWinstallerPath), "vendor", "rcedit.exe");

  if (!existsSync(exePath)) {
    throw new Error(`Packed executable not found: ${exePath}`);
  }

  if (!existsSync(iconPath)) {
    throw new Error(`Icon file not found: ${iconPath}`);
  }

  if (!existsSync(rceditPath)) {
    throw new Error(`rcedit executable not found: ${rceditPath}`);
  }

  execFileSync(rceditPath, [exePath, "--set-icon", iconPath], {
    stdio: "inherit",
  });

  console.log(`Patched executable icon: ${exePath}`);
}

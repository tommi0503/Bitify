import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourceIcon = path.join(rootDir, "src", "icon.png");
const buildDir = path.join(rootDir, "build");
const targetPng = path.join(buildDir, "icon.png");
const targetIco = path.join(buildDir, "icon.ico");

if (!existsSync(sourceIcon)) {
  throw new Error(`Source icon not found: ${sourceIcon}`);
}

mkdirSync(buildDir, { recursive: true });
copyFileSync(sourceIcon, targetPng);
const icoBuffer = await pngToIco(sourceIcon);
writeFileSync(targetIco, icoBuffer);
console.log(`Synced ${sourceIcon} -> ${targetPng}`);
console.log(`Generated ${targetIco}`);
const fs = require("node:fs");
const path = require("node:path");

module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const productFilename = context.packager?.appInfo?.productFilename;
  if (!productFilename || !context.appOutDir) {
    console.log(
      "[after-pack] Skipping Windows icon setup because required context values are missing:",
      { missingProductFilename: !productFilename, missingAppOutDir: !context.appOutDir }
    );
    return;
  }

  const executablePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, "build-resources", "icon.ico");

  if (!fs.existsSync(executablePath) || !fs.existsSync(iconPath)) {
    console.log(
      "[after-pack] Skipping Windows icon setup because required files are missing:",
      { missingExecutable: !fs.existsSync(executablePath), missingIcon: !fs.existsSync(iconPath) }
    );
    return;
  }

  try {
    const { rcedit } = await import("rcedit");
    await rcedit(executablePath, { icon: iconPath });
    console.log(`[after-pack] Icon applied to ${executablePath}`);
  } catch (error) {
    console.error(`[after-pack] Failed to apply icon: ${error.message}`);
    throw error;
  }
};

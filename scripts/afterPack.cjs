// afterPack hook - Execute professional ad-hoc signing after packaging, before DMG creation
// Prevents users from seeing "damaged app" prompts
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function fixNodePtySpawnHelpers(appPath) {
  const candidates = [
    path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper'),
    path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'node-pty', 'prebuilds', 'darwin-x64', 'spawn-helper'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    try {
      fs.chmodSync(candidate, 0o755);
      console.log(`[afterPack] Ensured executable permission: ${candidate}`);
    } catch (error) {
      console.warn(`[afterPack] Failed to chmod ${candidate}: ${error.message}`);
    }
  }
}

module.exports = async function(context) {
  // Only process macOS
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlementsPath = path.join(__dirname, '..', 'resources', 'entitlements.mac.plist');

  console.log(`[afterPack] Professional ad-hoc signing: ${appPath}`);

  try {
    fixNodePtySpawnHelpers(appPath);

    // 1. Remove quarantine attribute (if exists)
    try {
      execSync(`xattr -dr com.apple.quarantine "${appPath}"`, { stdio: 'pipe' });
    } catch { }

    // 2. Ad-hoc sign with entitlements
    const codesignCmd = `codesign --force --deep -s - --entitlements "${entitlementsPath}" --timestamp=none "${appPath}"`;
    console.log(`[afterPack] Executing: ${codesignCmd}`);
    execSync(codesignCmd, { stdio: 'inherit' });

    // 3. Verify signature
    console.log('[afterPack] Verifying signature...');
    const verifyOutput = execSync(`codesign -dv "${appPath}" 2>&1`, { encoding: 'utf8' });
    console.log(verifyOutput);

    console.log('[afterPack] ✅ Professional ad-hoc signing complete');
  } catch (error) {
    console.error('[afterPack] Signing failed:', error.message);
    // Don't throw error, let build continue
  }
};

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  project: path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'),
  scheme: path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/Clip.xcscheme'),
  plist: path.join(root, 'ios/App/Clip/Info.plist'),
  entitlements: path.join(root, 'ios/App/Clip/Clip.entitlements'),
  aasa: path.join(root, 'public/.well-known/apple-app-site-association'),
  index: path.join(root, 'index.html'),
  ghThumbnail: path.join(root, 'public/media/gh-akwaaba-fifa-ghana-thumbnail.png'),
  clipPatchVerifier: path.join(root, 'ios/App/Clip/ClipPatchVerifier.swift'),
};

const read = (label, file) => {
  if (!fs.existsSync(file)) throw new Error(`${label} missing: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
};

const project = read('Xcode project', files.project);
const scheme = read('Clip shared scheme', files.scheme);
const plist = read('Clip Info.plist', files.plist);
const entitlements = read('Clip entitlements', files.entitlements);
const aasa = read('AASA', files.aasa);
const index = read('index.html', files.index);
const clipPatchVerifier = read('ClipPatchVerifier.swift', files.clipPatchVerifier);
const plistBool = (key, value) => new RegExp(`<key>${key}</key>\\s*<${value ? 'true' : 'false'}/>`, 'm').test(plist);

const checks = [
  ['Clip native target', project.includes('/* Clip */ = {') && project.includes('isa = PBXNativeTarget;')],
  ['Clip App Store product type', project.includes('com.apple.product-type.application.on-demand-install-capable')],
  ['Clip bundle identifier', project.includes('PRODUCT_BUNDLE_IDENTIFIER = com.bytspot.app.Clip;')],
  ['Clip Info.plist build setting', project.includes('INFOPLIST_FILE = Clip/Info.plist;')],
  ['Clip entitlements build setting', project.includes('CODE_SIGN_ENTITLEMENTS = Clip/Clip.entitlements;')],
  ['Clip Swift sources', ['ClipApp.swift in Sources', 'ClipContentView.swift in Sources', 'ClipPatchVerifier.swift in Sources'].every((value) => project.includes(value))],
  ['Host embeds App Clips', project.includes('/* Embed App Clips */') && project.includes('dstSubfolderSpec = 16;')],
  ['Host depends on Clip target', project.includes('PBXTargetDependency') && project.includes('target = A13F010E2C0FF0010000001E /* Clip */;')],
  ['Clip shared scheme', scheme.includes('BlueprintName = "Clip"') && scheme.includes('BuildableName = "Clip.app"')],
  ['Clip Info.plist declares NSAppClip', plist.includes('<key>NSAppClip</key>')],
  ['Clip requests ephemeral notification capability', plistBool('NSAppClipRequestEphemeralUserNotification', true)],
  ['Clip requests location confirmation capability', plistBool('NSAppClipRequestLocationConfirmation', true)],
  ['Clip associated domain entitlement for bytspot.app', entitlements.includes('appclips:bytspot.app')],
  ['Clip associated domain entitlement for bytspot.com', entitlements.includes('appclips:bytspot.com')],
  ['Clip Apple Pay merchant entitlement', entitlements.includes('merchant.com.bytspot.app')],
  ['Clip does not request Core NFC entitlement', !entitlements.includes('com.apple.developer.nfc.readersession.formats')],
  ['Clip Info.plist does not request Core NFC usage', !plist.includes('NFCReaderUsageDescription')],
  ['AASA supports exact /patch compatibility path', aasa.includes('"/": "/patch"')],
  ['AASA supports /access full-app handoff path', aasa.includes('"/": "/access/*"')],
  ['Smart App Banner default app-argument is AASA-matched', index.includes('app-argument=https://bytspot.app/p/app-clip?tier=platinum')],
  ['GH Akwaaba FIFA thumbnail PNG exists', fs.existsSync(files.ghThumbnail)],
  ['GH Akwaaba is not a standalone service tile', !clipPatchVerifier.includes('platinum-fifa-matchday') && !clipPatchVerifier.includes('ghAkwaabaFifaService')],
  ['GH Akwaaba short-link targets Event Access vendor', clipPatchVerifier.includes('return platinumEventAccessService()') && clipPatchVerifier.includes('static func explicitVendor')],
  ['GH Akwaaba vendor carries FIFA product hero', clipPatchVerifier.includes('productHeroURL = isGhAkwaabaProduct ? ClipLocalService.ghAkwaabaFifaThumbnailURL')],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('[ios-app-clip-packaging] FAIL');
  for (const name of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`[ios-app-clip-packaging] PASS (${checks.length} checks)`);
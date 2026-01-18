#!/usr/bin/env node
/**
 * 앱 아이콘 생성 스크립트
 * SVG를 PNG로 변환하여 iOS/Android 앱 아이콘 생성
 * 사전 요구사항: yarn add -D sharp
 * 사용법: node scripts/generate-app-icons.js
 */

const fs = require('fs');
const path = require('path');

// iOS 앱 아이콘 사이즈 (1x 기준, 필요시 2x, 3x 생성)
const IOS_ICON_SIZES = [
  { size: 20, scales: [1, 2, 3] },
  { size: 29, scales: [1, 2, 3] },
  { size: 40, scales: [1, 2, 3] },
  { size: 60, scales: [2, 3] },
  { size: 76, scales: [1, 2] },
  { size: 83.5, scales: [2] },
  { size: 1024, scales: [1] },
];

// Android 앱 아이콘 사이즈
const ANDROID_ICON_SIZES = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

// 색상 상수
const BRAND_COLORS = {
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  accent: '#A5B4FC',
  deepPurple: '#3730A3',
};

/**
 * SVG 아이콘 템플릿 생성 - 심플한 고양이 얼굴
 */
function generateIconSVG(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_COLORS.accent}"/>
      <stop offset="40%" stop-color="${BRAND_COLORS.primary}"/>
      <stop offset="100%" stop-color="${BRAND_COLORS.primaryDark}"/>
    </linearGradient>
    <linearGradient id="shineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="white" stop-opacity="0.25"/>
      <stop offset="50%" stop-color="white" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- 배경 - 둥근 사각형 (iOS 스타일) -->
  <rect x="0" y="0" width="100" height="100" rx="22" ry="22" fill="url(#iconGradient)"/>

  <!-- 상단 광택 효과 -->
  <path d="M22 0 L78 0 Q100 0 100 22 L100 45 Q50 55 0 45 L0 22 Q0 0 22 0 Z" fill="url(#shineGradient)"/>

  <!-- 심플한 고양이 얼굴 -->
  <g transform="translate(15, 18)">
    <!-- 왼쪽 귀 -->
    <path d="M12 28 L5 5 L25 20 Z" fill="white"/>
    <!-- 오른쪽 귀 -->
    <path d="M58 28 L65 5 L45 20 Z" fill="white"/>
    <!-- 귀 안쪽 (왼쪽) -->
    <path d="M13 24 L9 10 L22 19 Z" fill="#C7D2FE"/>
    <!-- 귀 안쪽 (오른쪽) -->
    <path d="M57 24 L61 10 L48 19 Z" fill="#C7D2FE"/>
    <!-- 얼굴 -->
    <ellipse cx="35" cy="42" rx="30" ry="26" fill="white"/>
    <!-- 왼쪽 눈 -->
    <ellipse cx="22" cy="38" rx="5" ry="6" fill="${BRAND_COLORS.deepPurple}"/>
    <circle cx="23" cy="36" r="2" fill="white"/>
    <!-- 오른쪽 눈 -->
    <ellipse cx="48" cy="38" rx="5" ry="6" fill="${BRAND_COLORS.deepPurple}"/>
    <circle cx="49" cy="36" r="2" fill="white"/>
    <!-- 코 -->
    <ellipse cx="35" cy="50" rx="3.5" ry="2.5" fill="#C7D2FE"/>
    <!-- 입 -->
    <path d="M35 52.5 Q30 58 26 55" stroke="#C7D2FE" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M35 52.5 Q40 58 44 55" stroke="#C7D2FE" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <!-- 수염 (왼쪽) -->
    <line x1="2" y1="42" x2="14" y2="44" stroke="#E0E7FF" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="2" y1="48" x2="14" y2="48" stroke="#E0E7FF" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="4" y1="54" x2="14" y2="52" stroke="#E0E7FF" stroke-width="1.2" stroke-linecap="round"/>
    <!-- 수염 (오른쪽) -->
    <line x1="68" y1="42" x2="56" y2="44" stroke="#E0E7FF" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="68" y1="48" x2="56" y2="48" stroke="#E0E7FF" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="66" y1="54" x2="56" y2="52" stroke="#E0E7FF" stroke-width="1.2" stroke-linecap="round"/>
  </g>
</svg>`;
}

/**
 * iOS용 Contents.json 생성
 */
function generateContentsJSON() {
  const images = [];

  IOS_ICON_SIZES.forEach(({ size, scales }) => {
    scales.forEach(scale => {
      const idiom =
        size === 76 || size === 83.5
          ? 'ipad'
          : size === 1024
          ? 'ios-marketing'
          : 'iphone';
      const actualSize = size * scale;
      images.push({
        filename: `icon-${size}@${scale}x.png`,
        idiom: idiom === 'ios-marketing' ? 'ios-marketing' : idiom,
        scale: `${scale}x`,
        size: `${size}x${size}`,
      });
    });
  });

  return {
    images,
    info: {
      author: 'generate-app-icons.js',
      version: 1,
    },
  };
}

/**
 * 메인 함수
 */
async function main() {
  const projectRoot = path.join(__dirname, '..');
  const assetsDir = path.join(projectRoot, 'assets');
  const iconsDir = path.join(assetsDir, 'icons');

  // 디렉토리 생성
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  // 마스터 SVG 생성
  const masterSVG = generateIconSVG(1024);
  const svgPath = path.join(iconsDir, 'tori-icon.svg');
  fs.writeFileSync(svgPath, masterSVG);
  console.log(`✅ SVG 아이콘 생성: ${svgPath}`);

  // Sharp 확인
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('\n⚠️  sharp 패키지가 설치되지 않았습니다.');
    console.log('   PNG 아이콘을 생성하려면 다음 명령어를 실행하세요:');
    console.log('   yarn add -D sharp');
    console.log('\n   SVG 파일은 생성되었습니다. 다음 도구로 PNG 변환 가능:');
    console.log('   - https://cloudconvert.com/svg-to-png');
    console.log('   - https://www.appicon.co/');
    return;
  }

  // iOS 아이콘 생성
  const iosIconsDir = path.join(
    projectRoot,
    'ios/ToriWallet/Images.xcassets/AppIcon.appiconset',
  );

  if (!fs.existsSync(iosIconsDir)) {
    fs.mkdirSync(iosIconsDir, { recursive: true });
  }

  console.log('\n📱 iOS 아이콘 생성 중...');
  for (const { size, scales } of IOS_ICON_SIZES) {
    for (const scale of scales) {
      const actualSize = Math.round(size * scale);
      const filename = `icon-${size}@${scale}x.png`;
      const outputPath = path.join(iosIconsDir, filename);

      await sharp(Buffer.from(generateIconSVG(actualSize)))
        .resize(actualSize, actualSize)
        .png()
        .toFile(outputPath);

      console.log(`   ✅ ${filename} (${actualSize}x${actualSize})`);
    }
  }

  // Contents.json 생성
  const contentsJSON = generateContentsJSON();
  fs.writeFileSync(
    path.join(iosIconsDir, 'Contents.json'),
    JSON.stringify(contentsJSON, null, 2),
  );
  console.log('   ✅ Contents.json');

  // Android 아이콘 생성
  console.log('\n🤖 Android 아이콘 생성 중...');
  const androidResDir = path.join(projectRoot, 'android/app/src/main/res');

  for (const { folder, size } of ANDROID_ICON_SIZES) {
    const folderPath = path.join(androidResDir, folder);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Regular icon
    const iconPath = path.join(folderPath, 'ic_launcher.png');
    await sharp(Buffer.from(generateIconSVG(size)))
      .resize(size, size)
      .png()
      .toFile(iconPath);

    // Round icon (same for now)
    const roundIconPath = path.join(folderPath, 'ic_launcher_round.png');
    await sharp(Buffer.from(generateIconSVG(size)))
      .resize(size, size)
      .png()
      .toFile(roundIconPath);

    console.log(`   ✅ ${folder}/ic_launcher.png (${size}x${size})`);
  }

  // 공통 에셋 아이콘
  console.log('\n📦 공통 에셋 생성 중...');
  const sizes = [64, 128, 256, 512, 1024];
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `tori-icon-${size}.png`);
    await sharp(Buffer.from(generateIconSVG(size)))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`   ✅ tori-icon-${size}.png`);
  }

  console.log('\n🎉 앱 아이콘 생성 완료!');
  console.log('\n다음 단계:');
  console.log('1. iOS: Xcode에서 Images.xcassets 확인');
  console.log('2. Android: android/app/src/main/res 폴더 확인');
  console.log('3. 앱 재빌드');
}

main().catch(console.error);

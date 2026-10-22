const iosE2EApp = {
  type: 'ios.app',
  binaryPath:
    'ios/build/e2e/Build/Products/Release-iphonesimulator/ToriWallet.app',
  build:
    'xcodebuild -workspace ios/ToriWallet.xcworkspace -scheme ToriWallet -configuration Release -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath ios/build/e2e -jobs 2 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- PRODUCT_BUNDLE_IDENTIFIER=com.toriwallet.e2e',
};

/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.e2e': iosE2EApp,
    'ios.ci': {
      ...iosE2EApp,
      // The hosted macos-26 runner and its simulator both use Apple Silicon.
      build: `${iosE2EApp.build} ARCHS=arm64 ONLY_ACTIVE_ARCH=YES`,
    },
    'android.e2e': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/e2e/app-e2e.apk',
      testBinaryPath:
        'android/app/build/outputs/apk/androidTest/e2e/app-e2e-androidTest.apk',
      build:
        'cd android && ./gradlew :app:assembleE2e :app:assembleAndroidTest -DtestBuildType=e2e',
    },
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Debug-iphonesimulator/ToriWallet.app',
      build:
        'xcodebuild -workspace ios/ToriWallet.xcworkspace -scheme ToriWallet -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Release-iphonesimulator/ToriWallet.app',
      build:
        'xcodebuild -workspace ios/ToriWallet.xcworkspace -scheme ToriWallet -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build:
        'cd android && ./gradlew :app:assembleRelease :app:assembleAndroidTest -DtestBuildType=release',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: process.env.DETOX_IOS_UDID
        ? { id: process.env.DETOX_IOS_UDID }
        : { type: process.env.DETOX_IOS_DEVICE || 'iPhone 15 Pro' },
    },
    attached: {
      type: 'android.attached',
      device: {
        adbName: '.*',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: process.env.DETOX_ANDROID_AVD || 'Pixel_4_API_34',
      },
    },
  },
  configurations: {
    'ios.sim.ci': {
      device: 'simulator',
      app: 'ios.ci',
    },
    'ios.sim.e2e': {
      device: 'simulator',
      app: 'ios.e2e',
    },
    'android.att.e2e': {
      device: 'attached',
      app: 'android.e2e',
    },
    'android.emu.e2e': {
      device: 'emulator',
      app: 'android.e2e',
    },
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.att.debug': {
      device: 'attached',
      app: 'android.debug',
    },
    'android.att.release': {
      device: 'attached',
      app: 'android.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
  },
};

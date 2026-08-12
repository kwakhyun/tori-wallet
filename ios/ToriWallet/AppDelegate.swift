import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import RNBootSplash

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  private let privacyViewTag = 9_204_817

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "ToriWallet",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func applicationWillResignActive(_ application: UIApplication) {
    guard let window, window.viewWithTag(privacyViewTag) == nil else { return }

    let privacyView = UIView(frame: window.bounds)
    privacyView.tag = privacyViewTag
    privacyView.backgroundColor = .systemBackground

    let title = UILabel()
    title.text = "Tori Wallet"
    title.font = .boldSystemFont(ofSize: 22)
    title.textColor = .label
    title.translatesAutoresizingMaskIntoConstraints = false
    privacyView.addSubview(title)

    NSLayoutConstraint.activate([
      title.centerXAnchor.constraint(equalTo: privacyView.centerXAnchor),
      title.centerYAnchor.constraint(equalTo: privacyView.centerYAnchor),
    ])
    window.addSubview(privacyView)
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    window?.viewWithTag(privacyViewTag)?.removeFromSuperview()
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

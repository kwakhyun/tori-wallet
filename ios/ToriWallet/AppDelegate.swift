import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import RNBootSplash

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    self.launchOptions = launchOptions
    return true
  }
}

// UIKit requires a scene-based window when linking against the iOS 27 SDK.
// Keep UI lifecycle and the privacy overlay on the scene that owns the window.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private let privacyViewTag = 9_204_817

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    factory.startReactNative(
      withModuleName: "ToriWallet",
      in: window,
      launchOptions: (UIApplication.shared.delegate as? AppDelegate)?.launchOptions
    )
  }

  func sceneWillResignActive(_ scene: UIScene) {
    guard let window, window.viewWithTag(privacyViewTag) == nil else { return }

    let privacyView = UIView(frame: window.bounds)
    privacyView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
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

  func sceneDidBecomeActive(_ scene: UIScene) {
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

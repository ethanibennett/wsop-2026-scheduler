import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// The console lives behind HTTP Basic Auth, which a plain Capacitor WebView
// rejects (blank screen). This registers a plugin that feeds the WebView the
// login. Credentials are held in memory for the session only — never stored.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BasicAuthPlugin())
    }
}

@objc(BasicAuthPlugin)
public class BasicAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    // CAPBridgedPlugin conformance (required so registerPluginInstance accepts it).
    public let identifier = "BasicAuthPlugin"
    public let jsName = "BasicAuth"
    public let pluginMethods: [CAPPluginMethod] = []

    // Session-only cached credential (gone when the app is killed).
    static var cached: URLCredential?

    @objc override public func handleWKWebViewURLAuthenticationChallenge(
        _ challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) -> Bool {
        let method = challenge.protectionSpace.authenticationMethod
        guard method == NSURLAuthenticationMethodHTTPBasic ||
              method == NSURLAuthenticationMethodHTTPDigest else {
            return false // let Capacitor handle server-trust etc.
        }
        // Reuse this session's credential unless the server just rejected it.
        if challenge.previousFailureCount == 0, let cred = BasicAuthPlugin.cached {
            completionHandler(.useCredential, cred)
            return true
        }
        DispatchQueue.main.async {
            self.promptLogin(realm: challenge.protectionSpace.realm ?? "futurega.me") { cred in
                if let cred = cred {
                    BasicAuthPlugin.cached = cred
                    completionHandler(.useCredential, cred)
                } else {
                    completionHandler(.cancelAuthenticationChallenge, nil)
                }
            }
        }
        return true
    }

    private func promptLogin(realm: String, done: @escaping (URLCredential?) -> Void) {
        let alert = UIAlertController(title: "Sign in to WSOP Console",
                                      message: realm, preferredStyle: .alert)
        alert.addTextField {
            $0.placeholder = "Username"; $0.text = "ham"
            $0.autocapitalizationType = .none; $0.autocorrectionType = .no
        }
        alert.addTextField { $0.placeholder = "Password"; $0.isSecureTextEntry = true }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done(nil) })
        alert.addAction(UIAlertAction(title: "Sign in", style: .default) { _ in
            let u = alert.textFields?.first?.text ?? ""
            let p = alert.textFields?.last?.text ?? ""
            done(URLCredential(user: u, password: p, persistence: .forSession))
        })
        topViewController()?.present(alert, animated: true)
    }

    private func topViewController() -> UIViewController? {
        var top = UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }
            .first?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

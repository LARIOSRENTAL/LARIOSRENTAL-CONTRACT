import UIKit
import Capacitor
import ProximityReader

class LariosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(LariosTapEducation())
    }
}

@objc(LariosTapEducation)
public class LariosTapEducation: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LariosTapEducation"
    public let jsName = "LariosTapEducation"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)]

    @objc func present(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard UIDevice.current.userInterfaceIdiom == .phone else {
                call.reject("Tap to Pay on iPhone necesita un iPhone compatible; el iPad puede gestionar el contrato y usar otro medio de cobro.")
                return
            }
            let key = "lr.tap.education.v1"
            if !call.getBool("force", false) && UserDefaults.standard.bool(forKey: key) {
                call.resolve()
                return
            }
            guard #available(iOS 18.0, *) else {
                call.reject("Actualiza iOS para usar Tap to Pay on iPhone en Larios Rental.")
                return
            }
            guard var presenter = self.bridge?.viewController else {
                call.reject("No se puede abrir la ayuda de Tap to Pay.")
                return
            }
            while let presented = presenter.presentedViewController { presenter = presented }
            do {
                let discovery = ProximityReaderDiscovery()
                let content = try await discovery.content(for: .payment(.howToTap))
                try await discovery.presentContent(content, from: presenter)
                UserDefaults.standard.set(true, forKey: key)
                call.resolve()
            } catch {
                call.reject("No se pudo mostrar la guía de Tap to Pay: " + error.localizedDescription)
            }
        }
    }
}

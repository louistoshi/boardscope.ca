import Capacitor
import StoreKit

@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "StoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkEntitlements", returnType: CAPPluginReturnPromise),
    ]

    private let productIds = [
        "com.louistoshi.boardscope.pro.yearly",
        "com.louistoshi.boardscope.pro.lifetime"
    ]

    private var products: [Product] = []

    override public func load() {
        Task {
            await listenForTransactions()
        }
    }

    private func listenForTransactions() async {
        for await result in Transaction.updates {
            if case .verified(let transaction) = result {
                await transaction.finish()
                let isPro = await checkIfPro()
                notifyListeners("entitlementChanged", data: ["isPro": isPro])
            }
        }
    }

    private func checkIfPro() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                if productIds.contains(transaction.productID) {
                    if let expirationDate = transaction.expirationDate {
                        if expirationDate > Date() { return true }
                    } else {
                        return true
                    }
                }
            }
        }
        return false
    }

    @objc func loadProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let storeProducts = try await Product.products(for: Set(productIds))
                self.products = storeProducts

                let productsData = storeProducts.map { product -> [String: Any] in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue,
                        "type": product.type == .autoRenewable ? "subscription" : "nonConsumable"
                    ]
                }

                call.resolve(["products": productsData])
            } catch {
                call.reject("Failed to load products", nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Product ID is required")
            return
        }

        guard let product = products.first(where: { $0.id == productId }) else {
            call.reject("Product not found. Load products first.")
            return
        }

        Task {
            do {
                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve([
                            "success": true,
                            "productId": transaction.productID,
                            "plan": product.type == .autoRenewable ? "yearly" : "lifetime"
                        ])
                    case .unverified(_, let error):
                        call.reject("Transaction unverified", nil, error)
                    }
                case .userCancelled:
                    call.resolve(["success": false, "cancelled": true])
                case .pending:
                    call.resolve(["success": false, "pending": true])
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed", nil, error)
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let isPro = await checkIfPro()
                call.resolve(["isPro": isPro])
            } catch {
                call.reject("Failed to restore purchases", nil, error)
            }
        }
    }

    @objc func checkEntitlements(_ call: CAPPluginCall) {
        Task {
            let isPro = await checkIfPro()
            call.resolve(["isPro": isPro])
        }
    }
}

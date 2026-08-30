# Privacy Policy

**Effective Date: August 30, 2026**

Tori Wallet ("App") respects your privacy and is committed to protecting your personal data in compliance with applicable laws and regulations.

## 1. Information We Collect

### Information the App Does Not Automatically Collect

- No advertising, user analytics, remote crash-reporting, or performance-monitoring SDK is currently integrated.
- The App does not automatically transmit device models, crash logs, or performance metrics to the operator. Development and production logs remain on the device or in the developer console.

### Information Sent Externally When You Use a Feature

- **Support Email**: When you choose Contact Us, the App adds the app version and operating-system type to an email draft. This information is sent only if you send the email.
- **Blockchain Features**: Wallet addresses and request data may be sent to RPC providers, blockchain explorer APIs, or public blockchains for balance queries, transaction queries, and transfers.
- **WalletConnect**: When connecting to a dApp, your wallet address, approved chains and methods, and session metadata are sent to the Reown network and that dApp.
- **Swap and Market Data**: Requests may send token details, amounts, and the taker address to 0x or the production proxy. Market prices are retrieved from CoinGecko with CoinCap as a fallback.

### Information Stored on Your Device

- The mnemonic is encrypted with the PIN and stored in EncryptedStorage. A device-only Keychain/Keystore copy is added only if you enable biometric authentication.
- Private keys are not stored separately. They are derived from the mnemonic during an unlocked signing session and removed from the session when the wallet locks or the App enters the background.
- Public wallet addresses, settings, address-book entries, transaction caches, and WalletConnect records may be stored locally in AsyncStorage and Realm.

## 2. How We Use Your Information

- To provide app features
- To analyze local errors and improve stability
- To respond to user inquiries

## 3. Data Retention and Deletion

- **In-App Reset**: Reset Wallet attempts to disconnect WalletConnect sessions and delete the encrypted wallet storage, Realm records, and persisted state. The App reports an error if cleanup is incomplete.
- **App Uninstallation**: Regular app data is removed according to operating-system policy, but iOS Keychain data may remain after uninstallation. If complete deletion is required, use Reset Wallet before uninstalling the App.
- Requests sent to third-party services and on-chain transactions cannot be deleted by the App and remain subject to each service's policy and blockchain properties.

## 4. Third-Party Sharing

The operator does not sell user data or store it on a separate account server. When you use a feature, information required to provide it may be sent to:

- Public blockchains, RPC providers, and blockchain explorer APIs
- The Reown WalletConnect relay and dApps you connect
- The 0x Swap API or the production swap proxy
- CoinGecko and CoinCap
- The email service you select

## 5. Third-Party Services

External services may process network metadata such as your IP address, and their own privacy policies apply. Transactions recorded on public blockchains such as Ethereum, Polygon, Arbitrum, Optimism, and Base are public and cannot be reversed or deleted.

## 6. Your Rights

You have the following rights:

- **Local Data Deletion**: Use Reset Wallet in the App
- **Data Access**: View wallet addresses, address-book entries, transactions, connected sessions, and primary settings in the App
- **Questions**: Contact us at the email address below

## 7. Security

- The mnemonic is stored in a PIN-encrypted vault. A biometric copy uses a device-only Keychain/Keystore policy only when enabled by the user.
- Private keys are not stored separately and are derived only during an unlocked session.
- App access is protected by PIN and biometric authentication
- External-service communications use HTTPS or WSS encrypted channels

## 8. Children's Privacy

This app is not intended for children under 14 years of age, and we do not knowingly collect personal information from children.

## 9. Changes to This Policy

If this policy is updated, we will notify you through in-app announcements or update notes.

## 10. Contact Us

For privacy-related inquiries, please contact us at:

- Email: khyun9685@gmail.com
- In-app: Settings > Contact Us

---

**Tori Wallet**  
Last Updated: August 30, 2026

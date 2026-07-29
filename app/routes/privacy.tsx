export default function PrivacyPolicy() {
    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: "1.6", color: "#333" }}>
            <h1 style={{ fontSize: "28px", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>Privacy Policy</h1>

            <p style={{ marginBottom: "20px", color: "#666" }}>
                Last updated: July 28, 2026
            </p>

            <div style={{ marginBottom: "30px" }}>
                <p>
                    This Privacy Policy describes how <strong>Geo: Redirect & Country Block</strong> (the "App") collects, uses, and discloses your Personal Information when you install or use the App in connection with your Shopify-supported store.
                </p>
            </div>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>1. Information We Collect</h2>
                <p>When you install the App, we are automatically able to access certain types of information from your Shopify account:</p>
                <ul style={{ paddingLeft: "20px", marginTop: "10px", marginBottom: "15px" }}>
                    <li>Shop domain and configuration settings.</li>
                    <li>Customer IP addresses (strictly for geolocation purposes).</li>
                    <li>Browsing behavior on your storefront (to trigger redirects or blocks).</li>
                    <li>When Order Risk is enabled, limited order metadata such as order ID, order number, timestamps, amount, currency, fulfillment status, financial status, checkout IP address, and Shopify risk assessment.</li>
                </ul>
                <p><strong>We do not request or store customer names, email addresses, phone numbers, street addresses, postal codes, or payment credentials for Order Risk.</strong></p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>2. How We Use Your Information</h2>
                <p>We use the collected information for the following purposes:</p>
                <ul style={{ paddingLeft: "20px", marginTop: "10px", marginBottom: "15px" }}>
                    <li>To provide the geolocation redirection and blocking services.</li>
                    <li>To provide analytics on redirection and blocking events.</li>
                    <li>To improve and optimize our App's performance.</li>
                    <li>When anti-fraud protection is enabled by the merchant, to check whether a visitor appears to be using a VPN, proxy, hosting provider, or similar anonymizing service.</li>
                    <li>When Order Risk is enabled, to associate checkout IP activity with an order, identify repeated or previously blocked IP activity, and provide an advisory risk assessment for merchant review.</li>
                </ul>
                <p>The App does not automatically cancel, refund, hold, or reject orders. Final order decisions remain with the merchant.</p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>3. Data Retention</h2>
                <p>
                    Storefront visitor logs, including raw IP addresses, are retained for up to 7 days. Order Risk records are retained for up to 60 days. Operational billing-event records may be retained for up to 35 days. Data is automatically deleted after the applicable retention period unless a shorter period is required by a verified deletion request.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>4. Security</h2>
                <p>
                    The App uses HTTPS to protect data in transit. Checkout IP addresses, IP-derived location data, order display metadata, and risk-signal details retained in Order Risk are encrypted before database storage. Deterministic keyed hashes are used for order linkage, deletion requests, and repeated-IP comparisons without querying the encrypted values.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>5. Third-Party Processors</h2>
                <p>
                    Geolocation lookups are primarily performed using local IP geolocation data. When region-level data is unavailable, visitor IP addresses may be processed by a third-party IP geolocation provider to improve location accuracy. If the merchant enables anti-fraud protection and configures a VPN/proxy checking provider, visitor IP addresses may also be sent to that configured provider for fraud and security checks.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>6. Merchant Instructions and Privacy Requests</h2>
                <p>
                    We process data only to provide the functions described above and on the merchant's instructions. We do not sell protected customer data or use it for advertising. We process Shopify's mandatory customer data request, customer redaction, and shop redaction webhooks and delete linked Order Risk records when requested.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>7. Changes</h2>
                <p>
                    We may update this Privacy Policy from time to time in order to reflect, for example, changes to our practices or for other operational, legal, or regulatory reasons.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>8. Contact Us</h2>
                <p>
                    For more information about our privacy practices, if you have questions, or if you would like to make a complaint, please contact us by e-mail at <a href="mailto:support@bluepeaks.top" style={{ color: "#008060", textDecoration: "none" }}>support@bluepeaks.top</a>.
                </p>
            </section>
        </div>
    );
}

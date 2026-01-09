export default function PrivacyPolicy() {
    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: "1.6", color: "#333" }}>
            <h1 style={{ fontSize: "28px", marginBottom: "20px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>Privacy Policy</h1>

            <p style={{ marginBottom: "20px", color: "#666" }}>
                Last updated: {new Date().toLocaleDateString()}
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
                </ul>
                <p><strong>We do NOT collect or store sensitive personal data such as customer names, emails, or payment details.</strong></p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>2. How We Use Your Information</h2>
                <p>We use the collected information for the following purposes:</p>
                <ul style={{ paddingLeft: "20px", marginTop: "10px", marginBottom: "15px" }}>
                    <li>To provide the geolocation redirection and blocking services.</li>
                    <li>To provide analytics on redirection and blocking events.</li>
                    <li>To improve and optimize our App's performance.</li>
                </ul>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>3. Data Retention</h2>
                <p>
                    We retain IP address logs for a limited period (typically 30 days) solely for the purpose of providing analytics and troubleshooting. After this period, data is automatically anonymized or deleted.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>4. Changes</h2>
                <p>
                    We may update this Privacy Policy from time to time in order to reflect, for example, changes to our practices or for other operational, legal, or regulatory reasons.
                </p>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600" }}>5. Contact Us</h2>
                <p>
                    For more information about our privacy practices, if you have questions, or if you would like to make a complaint, please contact us by e-mail at <a href="mailto:support@bluepeaks.top" style={{ color: "#008060", textDecoration: "none" }}>support@bluepeaks.top</a>.
                </p>
            </section>
        </div>
    );
}

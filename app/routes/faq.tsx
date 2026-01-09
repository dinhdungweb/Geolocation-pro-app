export default function FAQ() {
    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px", fontFamily: "system-ui, -apple-system, sans-serif", lineHeight: "1.6", color: "#333" }}>
            <h1 style={{ fontSize: "28px", marginBottom: "30px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>Frequently Asked Questions</h1>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600", color: "#000" }}>General</h2>

                <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>Is coding knowledge required?</h3>
                    <p style={{ color: "#444" }}>No! Geo: Redirect & Country Block is designed to be "No Code." You can set up redirection and blocking rules directly from the simple dashboard.</p>
                </div>

                <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>Does it slow down my store?</h3>
                    <p style={{ color: "#444" }}>Our app is optimized for speed. Geolocation checks happen asynchronously and are cached to ensure your store's loading speed remains unaffected.</p>
                </div>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600", color: "#000" }}>Billing & Plans</h2>

                <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>Is there a free trial?</h3>
                    <p style={{ color: "#444" }}>Yes, all paid plans come with a 7-day free trial so you can test all features risk-free.</p>
                </div>

                <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>What happens if I exceed my visitor limit?</h3>
                    <p style={{ color: "#444" }}>If you are on a paid plan, overage charges may apply. For the Free plan, geolocation features will pause until the next billing cycle.</p>
                </div>
            </section>

            <section style={{ marginBottom: "30px" }}>
                <h2 style={{ fontSize: "20px", marginBottom: "15px", fontWeight: "600", color: "#000" }}>Troubleshooting</h2>

                <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>Why is the redirect not working for me?</h3>
                    <p style={{ color: "#444" }}>Please ensure you are testing from an IP address that matches your rule. Also, clear your browser cookies or try Incognito mode, as the app remembers your choice to avoid redirect loops.</p>
                </div>

                <div style={{ marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>How do I contact support?</h3>
                    <p style={{ color: "#444" }}>You can reach our support team anytime at <a href="mailto:support@bluepeaks.top" style={{ color: "#008060", textDecoration: "none" }}>support@bluepeaks.top</a>. We typically respond within 24 hours.</p>
                </div>
            </section>
        </div>
    );
}

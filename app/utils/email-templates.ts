export const getWelcomeEmailHtml = (shop: string) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #6366f1; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Welcome to Geo: Redirect & Country Block!</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Thank you for installing <strong>Geo: Redirect & Country Block</strong>! We're excited to help you provide a localized experience for your international customers.</p>
        <p>With our app, you can:</p>
        <ul>
            <li>Automatically redirect visitors based on their location.</li>
            <li>Show localized welcome popups and banners.</li>
            <li>Block unwanted traffic from specific countries or IP addresses.</li>
        </ul>
        <p>To get started, simply head over to your dashboard and create your first redirect rule.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://${shop}/admin/apps/geo-redirect-country-block" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Go to Dashboard</a>
        </div>
        <p>If you have any questions or need assistance, feel free to reply to this email.</p>
        <p>Best regards,<br>The Geo Support Team</p>
    </div>
    <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #777;">
        &copy; ${new Date().getFullYear()} Geo: Redirect & Country Block. All rights reserved.
    </div>
</div>
`;

export const getLimit80EmailHtml = (shop: string, usage: number, limit: number) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ffcc00; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #fff4e5; padding: 20px; text-align: center; border-bottom: 2px solid #ffcc00;">
        <h1 style="color: #664d03; margin: 0;">Usage Warning (80%)</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Your shop <strong>${shop}</strong> has reached <strong>80%</strong> of its monthly visitor limit in <strong>Geo: Redirect & Country Block</strong>.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;">Current Usage: <strong>${usage.toLocaleString()}</strong> visitors</p>
            <p style="margin: 5px 0;">Plan Limit: <strong>${limit.toLocaleString()}</strong> visitors</p>
        </div>
        <p>To ensure uninterrupted service and avoid potential overage charges, we recommend upgrading your plan now.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://${shop}/admin/apps/geo-redirect-country-block/app/pricing" style="background-color: #ffc107; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Upgrade Plan</a>
        </div>
        <p>Best regards,<br>The Geo Support Team</p>
    </div>
    <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #777;">
        &copy; ${new Date().getFullYear()} Geo: Redirect & Country Block. All rights reserved.
    </div>
</div>
`;

export const getLimit100EmailHtml = (shop: string, usage: number, limit: number) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #dc3545; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #f8d7da; padding: 20px; text-align: center; border-bottom: 2px solid #dc3545;">
        <h1 style="color: #721c24; margin: 0;">Limit Reached (100%)</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Your shop <strong>${shop}</strong> has reached or exceeded <strong>100%</strong> of its monthly visitor limit in <strong>Geo: Redirect & Country Block</strong>.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;">Current Usage: <strong>${usage.toLocaleString()}</strong> visitors</p>
            <p style="margin: 5px 0;">Plan Limit: <strong>${limit.toLocaleString()}</strong> visitors</p>
        </div>
        <p><strong>Important:</strong> Your visitors may no longer see redirects or popups depending on your plan configuration. Please upgrade to a higher plan immediately to restore full service.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://${shop}/admin/apps/geo-redirect-country-block/app/pricing" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Upgrade Now</a>
        </div>
        <p>Best regards,<br>The Geo Support Team</p>
    </div>
    <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #777;">
        &copy; ${new Date().getFullYear()} Geo: Redirect & Country Block. All rights reserved.
    </div>
</div>
`;

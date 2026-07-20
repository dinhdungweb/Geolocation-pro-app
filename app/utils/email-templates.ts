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

type VisitorCountValue = number | string;

function formatVisitorCount(value: VisitorCountValue) {
    return typeof value === "number" ? value.toLocaleString() : value;
}

export const getLimit80EmailHtml = (shop: string, usage: VisitorCountValue, limit: VisitorCountValue) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ffcc00; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #fff4e5; padding: 20px; text-align: center; border-bottom: 2px solid #ffcc00;">
        <h1 style="color: #664d03; margin: 0;">Usage Warning (80%)</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Your shop <strong>${shop}</strong> has reached <strong>80%</strong> of its monthly visitor limit in <strong>Geo: Redirect & Country Block</strong>.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;">Current Usage: <strong>${formatVisitorCount(usage)}</strong> visitors</p>
            <p style="margin: 5px 0;">Plan Limit: <strong>${formatVisitorCount(limit)}</strong> visitors</p>
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

export const getLimit100EmailHtml = (shop: string, usage: VisitorCountValue, limit: VisitorCountValue) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #dc3545; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #f8d7da; padding: 20px; text-align: center; border-bottom: 2px solid #dc3545;">
        <h1 style="color: #721c24; margin: 0;">Limit Reached (100%)</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Your shop <strong>${shop}</strong> has reached or exceeded <strong>100%</strong> of its monthly visitor limit in <strong>Geo: Redirect & Country Block</strong>.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;">Current Usage: <strong>${formatVisitorCount(usage)}</strong> visitors</p>
            <p style="margin: 5px 0;">Plan Limit: <strong>${formatVisitorCount(limit)}</strong> visitors</p>
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

export const getLimitUnlimitedEmailHtml = (shop: string, usage: VisitorCountValue) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #28a745; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #d4edda; padding: 20px; text-align: center; border-bottom: 2px solid #28a745;">
        <h1 style="color: #155724; margin: 0;">Unlimited Usage Granted!</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Congratulations! Your shop <strong>${shop}</strong> has reached <strong>${formatVisitorCount(usage)}</strong> visitors this month.</p>
        <p>As a token of our appreciation for your high traffic, we have granted you <strong>Unlimited Usage</strong> for the remainder of this month. You will not be charged any further overage fees for additional visitors until the next billing cycle begins.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;">Current Usage: <strong>${formatVisitorCount(usage)}</strong> visitors</p>
            <p style="margin: 5px 0;">Status: <strong>Unlimited (Free for the rest of the month)</strong></p>
        </div>
        <p>Keep up the great work with your store!</p>
        <p>Best regards,<br>The Geo Support Team</p>
    </div>
    <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #777;">
        &copy; ${new Date().getFullYear()} Geo: Redirect & Country Block. All rights reserved.
    </div>
</div>
`;

export const getLimitFreeReminderEmailHtml = (shop: string, usage: VisitorCountValue, limit: VisitorCountValue) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ff9800; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #fff3e0; padding: 20px; text-align: center; border-bottom: 2px solid #ff9800;">
        <h1 style="color: #e65100; margin: 0;">Reminder: Free Plan Limit Reached</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>We noticed that yesterday your store <strong>${shop}</strong> reached its monthly Free plan limit of <strong>${formatVisitorCount(limit)}</strong> visitors.</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;">Current Usage: <strong>${formatVisitorCount(usage)}</strong> visitors</p>
            <p style="margin: 5px 0;">Free Plan Limit: <strong>${formatVisitorCount(limit)}</strong> visitors</p>
        </div>
        <p>To keep your location redirects, popups, and country blocking active without interruption, please upgrade to a higher plan so you can continue enjoying our full services as your store grows.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://${shop}/admin/apps/geo-redirect-country-block/app/pricing" style="background-color: #ff9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Explore Paid Plans</a>
        </div>
        <p>Best regards,<br>The Geo Support Team</p>
    </div>
    <div style="background-color: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #777;">
        &copy; ${new Date().getFullYear()} Geo: Redirect & Country Block. All rights reserved.
    </div>
</div>
`;

export const getReview3DaysEmailHtml = (shop: string) => `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 28px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">We Value Your Feedback!</h1>
    </div>
    <div style="padding: 32px 30px; line-height: 1.6; color: #334155; font-size: 15px;">
        <p style="margin-top: 0;">Hi there,</p>
        <p>You have been using <strong>Geo: Redirect & Country Block</strong> on <strong>${shop}</strong> for a few days now, and we hope the app is helping you deliver a seamless, localized experience to your shoppers around the globe!</p>
        <p>We are constantly striving to improve and provide the best possible support for merchants like you. We would love to hear your thoughts:</p>
        <div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 18px 20px; border-radius: 0 6px 6px 0; margin: 24px 0;">
            <p style="margin: 0; font-style: italic; color: #1e293b;">"How has your experience been with Geo: Redirect so far? Do you have any feature suggestions or need assistance with setting up rules?"</p>
        </div>
        <p>If you enjoy using our app, sharing a quick 2-minute review on the Shopify App Store would mean the world to our team and helps us continue supporting and enhancing the app.</p>
        <div style="text-align: center; margin: 32px 0;">
            <a href="https://apps.shopify.com/geo-redirect-country-block?#modal-show=WriteReviewModal" style="background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; display: inline-block; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">Write a Review</a>
        </div>
        <p style="margin-bottom: 0;">If you need any help or have suggestions, simply reply to this email or reach out via our in-app support chat anytime. We are always here to help!</p>
        <p style="margin-top: 24px;">Best regards,<br><strong>The Geo Support Team</strong></p>
    </div>
    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
        &copy; ${new Date().getFullYear()} Geo: Redirect & Country Block. All rights reserved.
    </div>
</div>
`;


import prisma from "../db.server";
import {
  getWelcomeEmailHtml,
  getLimit80EmailHtml,
  getLimit100EmailHtml,
  getLimitUnlimitedEmailHtml,
  getLimitFreeReminderEmailHtml,
  getReview3DaysEmailHtml,
} from "./email-templates";

export async function ensureDefaultEmailAssets() {
  const shopPlaceholder = "{shop}";
  const defaultItems = [
    {
      type: "welcome",
      name: "Welcome new subscribers",
      templateName: "Welcome Email Template",
      subject: "Welcome to Geo: Redirect & Country Block!",
      html: getWelcomeEmailHtml(shopPlaceholder),
      blocks: [
        {
          id: "w1",
          type: "header",
          content: { logoText: "Welcome to Geo: Redirect" },
          style: { themeColor: "#6366f1", padding: "20px" },
        },
        {
          id: "w2",
          type: "heading",
          content: { text: "Welcome to Geo: Redirect & Country Block!" },
          style: { color: "#1e293b", fontSize: "24px", textAlign: "center", padding: "30px" },
        },
        {
          id: "w3",
          type: "text",
          content: {
            text: `Hi there,\n\nThank you for installing Geo: Redirect & Country Block! We're excited to help you provide a localized experience for your international customers.\n\nWith our app, you can:\n• Automatically redirect visitors based on their location.\n• Show localized welcome popups and banners.\n• Block unwanted traffic from specific countries or IP addresses.\n\nTo get started, simply head over to your dashboard and create your first redirect rule.`,
          },
          style: { color: "#334155", fontSize: "16px", padding: "20px" },
        },
        {
          id: "w4",
          type: "button",
          content: {
            label: "Go to Dashboard",
            url: `https://${shopPlaceholder}/admin/apps/geo-redirect-country-block`,
          },
          style: { buttonColor: "#6366f1", textAlign: "center", padding: "30px" },
        },
        {
          id: "w5",
          type: "footer",
          content: { text: "© 2026 Geo: Redirect & Country Block. All rights reserved." },
          style: { padding: "30px" },
        },
      ],
    },
    {
      type: "limit_80",
      name: "80% usage limit notification",
      templateName: "80% Usage Warning Template",
      subject: "{shop}: Usage Warning (80%) - Geo: Redirect & Country Block",
      html: getLimit80EmailHtml(shopPlaceholder, 8000, 10000),
      blocks: [
        {
          id: "l81",
          type: "header",
          content: { logoText: "Usage Warning (80%)" },
          style: { themeColor: "#ffcc00", padding: "20px" },
        },
        {
          id: "l82",
          type: "heading",
          content: { text: "80% Monthly Visitor Limit Reached" },
          style: { color: "#854d0e", fontSize: "24px", textAlign: "center", padding: "30px" },
        },
        {
          id: "l83",
          type: "text",
          content: {
            text: `Hi there,\n\nYour shop ${shopPlaceholder} has reached 80% of its monthly visitor limit in Geo: Redirect & Country Block.\n\n• Current Usage: 8,000 visitors\n• Plan Limit: 10,000 visitors\n\nTo ensure uninterrupted service and avoid potential overage charges, we recommend upgrading your plan now.`,
          },
          style: { color: "#334155", fontSize: "16px", padding: "20px" },
        },
        {
          id: "l84",
          type: "button",
          content: {
            label: "Upgrade Plan",
            url: `https://${shopPlaceholder}/admin/apps/geo-redirect-country-block/app/pricing`,
          },
          style: { buttonColor: "#d97706", textAlign: "center", padding: "30px" },
        },
        {
          id: "l85",
          type: "footer",
          content: { text: "© 2026 Geo: Redirect & Country Block. All rights reserved." },
          style: { padding: "30px" },
        },
      ],
    },
    {
      type: "limit_100",
      name: "100% usage limit notification",
      templateName: "100% Usage Limit Alert Template",
      subject: "ACTION REQUIRED: {shop} reached 100% limit - Geo: Redirect & Country Block",
      html: getLimit100EmailHtml(shopPlaceholder, 10000, 10000),
      blocks: [
        {
          id: "l101",
          type: "header",
          content: { logoText: "Limit Reached (100%)" },
          style: { themeColor: "#dc3545", padding: "20px" },
        },
        {
          id: "l102",
          type: "heading",
          content: { text: "100% Monthly Visitor Limit Reached" },
          style: { color: "#991b1b", fontSize: "24px", textAlign: "center", padding: "30px" },
        },
        {
          id: "l103",
          type: "text",
          content: {
            text: `Hi there,\n\nYour shop ${shopPlaceholder} has reached or exceeded 100% of its monthly visitor limit in Geo: Redirect & Country Block.\n\n• Current Usage: 10,000 visitors\n• Plan Limit: 10,000 visitors\n\nImportant: Your visitors may no longer see redirects or popups depending on your plan configuration. Please upgrade to a higher plan immediately to restore full service.`,
          },
          style: { color: "#334155", fontSize: "16px", padding: "20px" },
        },
        {
          id: "l104",
          type: "button",
          content: {
            label: "Upgrade Now",
            url: `https://${shopPlaceholder}/admin/apps/geo-redirect-country-block/app/pricing`,
          },
          style: { buttonColor: "#dc3545", textAlign: "center", padding: "30px" },
        },
        {
          id: "l105",
          type: "footer",
          content: { text: "© 2026 Geo: Redirect & Country Block. All rights reserved." },
          style: { padding: "30px" },
        },
      ],
    },
    {
      type: "limit_unlimited",
      name: "Unlimited usage granted",
      templateName: "Unlimited Usage Reward Template",
      subject: "CONGRATULATIONS: {shop} granted UNLIMITED usage this month!",
      html: getLimitUnlimitedEmailHtml(shopPlaceholder, 25000),
      blocks: [
        {
          id: "u1",
          type: "header",
          content: { logoText: "Unlimited Usage Granted!" },
          style: { themeColor: "#28a745", padding: "20px" },
        },
        {
          id: "u2",
          type: "heading",
          content: { text: "Congratulations on Your High Traffic!" },
          style: { color: "#166534", fontSize: "24px", textAlign: "center", padding: "30px" },
        },
        {
          id: "u3",
          type: "text",
          content: {
            text: `Hi there,\n\nCongratulations! Your shop ${shopPlaceholder} has reached 25,000 visitors this month.\n\nAs a token of our appreciation for your high traffic, we have granted you Unlimited Usage for the remainder of this month. You will not be charged any further overage fees for additional visitors until the next billing cycle begins.\n\nKeep up the great work with your store!`,
          },
          style: { color: "#334155", fontSize: "16px", padding: "20px" },
        },
        {
          id: "u4",
          type: "footer",
          content: { text: "© 2026 Geo: Redirect & Country Block. All rights reserved." },
          style: { padding: "30px" },
        },
      ],
    },
    {
      type: "limit_free_reminder",
      name: "Free plan limit reminder (1 day after)",
      templateName: "Free Plan 1-Day Reminder Template",
      subject: "[Reminder] {shop}: Free plan limit reached - Upgrade to keep geo-redirects active",
      html: getLimitFreeReminderEmailHtml(shopPlaceholder, 1000, 1000),
      blocks: [
        {
          id: "f1",
          type: "header",
          content: { logoText: "Reminder: Free Plan Limit Reached" },
          style: { themeColor: "#ff9800", padding: "20px" },
        },
        {
          id: "f2",
          type: "heading",
          content: { text: "Upgrade to Keep Geo-Redirects Active" },
          style: { color: "#c2410c", fontSize: "24px", textAlign: "center", padding: "30px" },
        },
        {
          id: "f3",
          type: "text",
          content: {
            text: `Hi there,\n\nWe noticed that yesterday your store ${shopPlaceholder} reached its monthly Free plan limit of 1,000 visitors.\n\n• Current Usage: 1,000 visitors\n• Free Plan Limit: 1,000 visitors\n\nTo keep your location redirects, popups, and country blocking active without interruption, please upgrade to a higher plan so you can continue enjoying our full services as your store grows.`,
          },
          style: { color: "#334155", fontSize: "16px", padding: "20px" },
        },
        {
          id: "f4",
          type: "button",
          content: {
            label: "Explore Paid Plans",
            url: `https://${shopPlaceholder}/admin/apps/geo-redirect-country-block/app/pricing`,
          },
          style: { buttonColor: "#ff9800", textAlign: "center", padding: "30px" },
        },
        {
          id: "f5",
          type: "footer",
          content: { text: "© 2026 Geo: Redirect & Country Block. All rights reserved." },
          style: { padding: "30px" },
        },
      ],
    },
    {
      type: "review_3_days",
      name: "Request app review (3 days after install)",
      templateName: "App Review Request Template",
      subject: "How is your experience with Geo: Redirect & Country Block?",
      html: getReview3DaysEmailHtml(shopPlaceholder),
      blocks: [
        {
          id: "r1",
          type: "header",
          content: { logoText: "We Value Your Feedback" },
          style: { themeColor: "#4f46e5", padding: "20px" },
        },
        {
          id: "r2",
          type: "heading",
          content: { text: "How is your experience so far?" },
          style: { color: "#1e293b", fontSize: "24px", textAlign: "center", padding: "30px" },
        },
        {
          id: "r3",
          type: "text",
          content: {
            text: `Hi there,\n\nYou have been using Geo: Redirect & Country Block on ${shopPlaceholder} for a few days now, and we hope the app is helping you deliver a seamless, localized experience to your shoppers!\n\nWe are constantly striving to improve and provide the best possible support for merchants like you. If you enjoy using our app, sharing a quick review on the Shopify App Store would mean the world to our team and helps us continue enhancing the app.\n\nIf you have any feedback, feature suggestions, or need assistance, we are always here to help!`,
          },
          style: { color: "#334155", fontSize: "16px", padding: "20px" },
        },
        {
          id: "r4",
          type: "button",
          content: {
            label: "Write a Review",
            url: "https://apps.shopify.com/geo-redirect-country-block?#modal-show=WriteReviewModal",
          },
          style: { buttonColor: "#4f46e5", textAlign: "center", padding: "30px" },
        },
        {
          id: "r5",
          type: "footer",
          content: { text: "© 2026 Geo: Redirect & Country Block. All rights reserved." },
          style: { padding: "30px" },
        },
      ],
    },
  ];

  for (const item of defaultItems) {
    try {
      const configJson = JSON.stringify(item.blocks);

      // 1. Ensure global EmailTemplate exists and has config populated
      let template = await prisma.emailTemplate.findFirst({
        where: { shop: "GLOBAL", name: item.templateName },
      });

      if (!template) {
        template = await prisma.emailTemplate.create({
          data: {
            shop: "GLOBAL",
            name: item.templateName,
            subject: item.subject,
            html: item.html,
            config: configJson,
          },
        });
      } else if (!template.config || template.config === "[]" || !template.html || template.html === "") {
        template = await prisma.emailTemplate.update({
          where: { id: template.id },
          data: { html: item.html, subject: item.subject, config: configJson },
        });
      }

      // 2. Ensure global Automation exists and points to template
      let automation = await prisma.automation.findUnique({
        where: { shop_type: { shop: "GLOBAL", type: item.type } },
      });

      const configWithTemplate = JSON.stringify([
        {
          id: "1",
          type: "action",
          parentId: "trigger",
          data: {
            label: "Send Email",
            templateId: template.id,
            isCustom: false,
          },
        },
      ]);

      if (!automation) {
        await prisma.automation.create({
          data: {
            shop: "GLOBAL",
            type: item.type,
            name: item.name,
            subject: item.subject,
            isActive: true,
            config: configWithTemplate,
            html: item.html,
          },
        });
      } else {
        let needsUpdate = false;
        let updateData: any = {};

        if (!automation.html || automation.html === "") {
          updateData.html = item.html;
          needsUpdate = true;
        }

        try {
          const parsedConfig = JSON.parse(automation.config || "[]");
          if (
            !Array.isArray(parsedConfig) ||
            parsedConfig.length === 0 ||
            !parsedConfig[0]?.data?.templateId ||
            parsedConfig[0]?.data?.templateId === ""
          ) {
            updateData.config = configWithTemplate;
            needsUpdate = true;
          }
        } catch (e) {
          updateData.config = configWithTemplate;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await prisma.automation.update({
            where: { id: automation.id },
            data: updateData,
          });
        }
      }
    } catch (err) {
      console.error(`[Email Seeder] Failed to seed default assets for ${item.type}:`, err);
    }
  }
}

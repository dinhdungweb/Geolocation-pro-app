import prisma from "../db.server";
import {
  getWelcomeEmailHtml,
  getLimit80EmailHtml,
  getLimit100EmailHtml,
  getLimitUnlimitedEmailHtml,
  getLimitFreeReminderEmailHtml,
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
    },
    {
      type: "limit_80",
      name: "80% usage limit notification",
      templateName: "80% Usage Warning Template",
      subject: "{shop}: Usage Warning (80%) - Geo: Redirect & Country Block",
      html: getLimit80EmailHtml(shopPlaceholder, 8000, 10000),
    },
    {
      type: "limit_100",
      name: "100% usage limit notification",
      templateName: "100% Usage Limit Alert Template",
      subject: "ACTION REQUIRED: {shop} reached 100% limit - Geo: Redirect & Country Block",
      html: getLimit100EmailHtml(shopPlaceholder, 10000, 10000),
    },
    {
      type: "limit_unlimited",
      name: "Unlimited usage granted",
      templateName: "Unlimited Usage Reward Template",
      subject: "CONGRATULATIONS: {shop} granted UNLIMITED usage this month!",
      html: getLimitUnlimitedEmailHtml(shopPlaceholder, 25000),
    },
    {
      type: "limit_free_reminder",
      name: "Free plan limit reminder (1 day after)",
      templateName: "Free Plan 1-Day Reminder Template",
      subject: "[Reminder] {shop}: Free plan limit reached - Upgrade to keep geo-redirects active",
      html: getLimitFreeReminderEmailHtml(shopPlaceholder, 1000, 1000),
    },
  ];

  for (const item of defaultItems) {
    try {
      // 1. Ensure global EmailTemplate exists
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
            config: "[]",
          },
        });
      } else if (!template.html || template.html === "") {
        template = await prisma.emailTemplate.update({
          where: { id: template.id },
          data: { html: item.html, subject: item.subject },
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
        // If the automation exists but html/config is empty or missing templateId, populate it
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

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { sendAdminEmail, hasSentEmail } from "../utils/email.server";
import { getWelcomeEmailHtml } from "../utils/email-templates";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic !== "APP_INSTALLED") {
      return new Response("Invalid topic", { status: 400 });
  }

  // Check if we've already sent a welcome email to avoid duplicates
  // (Shopify might send the webhook multiple times)
  const welcomed = await hasSentEmail(shop, 'welcome');
  
  if (!welcomed) {
    console.log(`[Webhook] Sending welcome email to ${shop}`);
    await sendAdminEmail({
      shop,
      type: 'welcome',
      subject: 'Welcome to Geo: Redirect & Country Block!',
      html: getWelcomeEmailHtml(shop)
    });
  } else {
    console.log(`[Webhook] Welcome email already sent for ${shop}, skipping.`);
  }

  return new Response();
};

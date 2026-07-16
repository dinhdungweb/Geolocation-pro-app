import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import prisma from '../db.server';
import { replaceEmailVariables } from './email-parser';
import { decryptSecret } from './secret-crypto.server';

const resend = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_your_api_key_here' 
    ? new Resend(process.env.RESEND_API_KEY) 
    : null;

const DEFAULT_SENDER = process.env.SENDER_EMAIL || 'send@geopro.bluepeaks.top';
const SHOPIFY_API_VERSION = "2026-04";

export type EmailType = 'welcome' | 'limit_80' | 'limit_100' | 'limit_unlimited' | 'limit_free_reminder' | 'review_3_days' | 'manual';

function getEmailLogType(type: EmailType, dedupeKey?: string) {
    return dedupeKey ? `${type}:${dedupeKey}` : type;
}

async function fetchAndStoreShopEmail(shop: string, accessToken: string) {
    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
            query: `query { shop { email } }`,
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Shopify email query failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    const email = data?.data?.shop?.email;
    if (!email) return null;

    await prisma.session.updateMany({
        where: { shop },
        data: { email },
    });

    return email as string;
}

async function resolveShopRecipientEmail(shop: string) {
    const sessionWithEmail = await prisma.session.findFirst({
        where: {
            shop,
            email: { not: null },
        },
        orderBy: { expires: 'desc' },
        select: { email: true },
    });

    if (sessionWithEmail?.email) return sessionWithEmail.email;

    const sessionWithToken = await prisma.session.findFirst({
        where: { shop },
        orderBy: { expires: 'desc' },
        select: {
            accessToken: true,
        },
    });

    if (!sessionWithToken?.accessToken) return null;

    try {
        const email = await fetchAndStoreShopEmail(shop, sessionWithToken.accessToken);
        if (email) {
            console.log(`[Email Service] Recovered recipient email for ${shop}`);
        }
        return email;
    } catch (error: any) {
        const errorStr = String(error?.message || error).toLowerCase();
        const isUnauthorized = errorStr.includes("401") || errorStr.includes("unauthorized") || errorStr.includes("session");
        if (isUnauthorized) {
            console.warn(`[Email Service] Skipping email recovery for ${shop}: Access token is unauthorized/expired (potentially uninstalled).`);
        } else {
            console.error(`[Email Service] Failed to recover email for shop ${shop}:`, error);
        }
        return null;
    }
}

export async function sendAdminEmail({ 
    shop, 
    type, 
    subject, 
    html,
    dedupeKey,
}: { 
    shop: string, 
    type: EmailType, 
    subject: string, 
    html: string,
    dedupeKey?: string,
}) {
    console.log(`[Email Service] Preparing to send ${type} email to ${shop}`);
    const logType = getEmailLogType(type, dedupeKey);
    
    // Check if the shop is in the Blacklist
    const isBlacklisted = await prisma.emailBlacklist.findUnique({
        where: { shop }
    });

    if (isBlacklisted) {
        console.log(`[Email Service] Shop ${shop} is BLACKLISTED. Skipping email delivery.`);
        return { success: true, skipped: true, reason: 'blacklisted' };
    }

    // Fetch settings for SMTP and sender info
    const settings = await prisma.settings.findUnique({
        where: { shop: 'GLOBAL' }
    });

    // Check for custom automation template (Specific Shop then GLOBAL)
    let customAuto = await prisma.automation.findUnique({
        where: { shop_type: { shop, type } }
    });

    if (!customAuto) {
        customAuto = await prisma.automation.findUnique({
            where: { shop_type: { shop: 'GLOBAL', type } }
        });
    }

    // If disabled, skip sending
    if (customAuto && !customAuto.isActive) {
        console.log(`[Email Service] Automation ${type} is disabled for ${shop}`);
        return { success: true, disabled: true };
    }

    // Use custom content if available, else use default provided
    let finalSubject = subject;
    let finalHtml = html;

    if (customAuto) {
        console.log(`[Email Service] Using CUSTOM template for ${type} email to ${shop}`);
        finalSubject = replaceEmailVariables(customAuto.subject || subject, { shop });
        finalHtml = replaceEmailVariables(customAuto.html || html, { shop });
    } else {
        finalSubject = replaceEmailVariables(subject, { shop });
        finalHtml = replaceEmailVariables(html, { shop });
    }

    const recipient = await resolveShopRecipientEmail(shop);
    if (!recipient) {
        console.warn(`[Email Service] No email found for shop ${shop} (potentially uninstalled or unauthorized)`);
        return { success: false, error: 'No recipient email' };
    }

    const senderName = settings?.emailSenderName || "Geo Admin";
    const senderEmail = settings?.emailSenderEmail || DEFAULT_SENDER;

    try {
        // Option 1: SMTP Transporter
        if (settings?.smtpHost && settings?.smtpUser) {
            console.log(`[Email Service] Attempting SMTP delivery via ${settings.smtpHost}`);
            const transporter = nodemailer.createTransport({
                host: settings.smtpHost,
                port: settings.smtpPort || 587,
                secure: settings.smtpSecure,
                auth: {
                    user: settings.smtpUser,
                    pass: decryptSecret(settings.smtpPass),
                },
            } as nodemailer.TransportOptions);

            await transporter.sendMail({
                from: `"${senderName}" <${senderEmail}>`,
                to: recipient,
                subject: finalSubject,
                html: finalHtml,
            });

            await prisma.adminEmailLog.create({
                data: { shop, type: logType, subject: finalSubject, html: finalHtml, status: 'sent' }
            });
            return { success: true };
        }

        // Option 2: Resend API
        if (resend) {
            const { data, error } = await resend.emails.send({
                from: `${senderName} <${senderEmail}>`,
                to: [recipient],
                subject: finalSubject,
                html: finalHtml,
            });

            if (error) {
                await prisma.adminEmailLog.create({
                    data: { shop, type: logType, subject: finalSubject, html: finalHtml, status: 'failed', error: JSON.stringify(error) }
                });
                return { success: false, error };
            }

            await prisma.adminEmailLog.create({
                data: { shop, type: logType, subject: finalSubject, html: finalHtml, status: 'sent' }
            });
            return { success: true, data };
        }

        // Fallback: Simulation
        console.log(`[Email Simulation] TO: ${recipient} | SUBJECT: ${finalSubject}`);
        await prisma.adminEmailLog.create({
            data: { shop, type: logType, subject: finalSubject, html: finalHtml, status: 'simulated' }
        });
        
        return { success: true, simulated: true };
    } catch (err: any) {
        console.error(`[Email Service] Error:`, err);
        await prisma.adminEmailLog.create({
            data: { shop, type: logType, subject: finalSubject, html: finalHtml, status: 'failed', error: err.message }
        });
        return { success: false, error: err.message };
    }
}

/**
 * Checks if an automated email of a certain type has already been sent to a shop.
 */
export async function hasSentEmail(shop: string, type: EmailType, dedupeKey?: string) {
    if (type === 'manual') return false;
    const logType = getEmailLogType(type, dedupeKey);
    
    const log = await prisma.adminEmailLog.findFirst({
        where: { 
            shop, 
            type: logType,
            status: { in: ['sent', 'simulated'] }
        }
    });
    
    return !!log;
}

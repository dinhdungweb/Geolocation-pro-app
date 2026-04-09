import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import prisma from '../db.server';
import { replaceEmailVariables } from './email-parser';

const resend = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_your_api_key_here' 
    ? new Resend(process.env.RESEND_API_KEY) 
    : null;

const DEFAULT_SENDER = process.env.SENDER_EMAIL || 'send@geopro.bluepeaks.top';

export type EmailType = 'welcome' | 'limit_80' | 'limit_100' | 'manual';

export async function sendAdminEmail({ 
    shop, 
    type, 
    subject, 
    html 
}: { 
    shop: string, 
    type: EmailType, 
    subject: string, 
    html: string 
}) {
    console.log(`[Email Service] Preparing to send ${type} email to ${shop}`);
    
    // Check if the shop is in the Blacklist
    const isBlacklisted = await (prisma as any).emailBlacklist.findUnique({
        where: { shop }
    });

    if (isBlacklisted) {
        console.log(`[Email Service] Shop ${shop} is BLACKLISTED. Skipping email delivery.`);
        return { success: true, skipped: true, reason: 'blacklisted' };
    }

    // Fetch settings for SMTP and sender info
    const settings = await (prisma as any).settings.findUnique({
        where: { shop: 'GLOBAL' }
    });

    // Check for custom automation template (Specific Shop then GLOBAL)
    let customAuto = await (prisma as any).automation.findUnique({
        where: { shop_type: { shop, type } }
    });

    if (!customAuto) {
        customAuto = await (prisma as any).automation.findUnique({
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
        finalSubject = replaceEmailVariables(customAuto.subject, { shop });
        finalHtml = replaceEmailVariables(customAuto.html, { shop });
    } else {
        finalSubject = replaceEmailVariables(subject, { shop });
        finalHtml = replaceEmailVariables(html, { shop });
    }

    // Find shop email from Session
    const session = await prisma.session.findFirst({
        where: { shop },
        orderBy: { expires: 'desc' }
    });

    const recipient = session?.email;
    if (!recipient) {
        console.error(`[Email Service] No email found for shop ${shop}`);
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
                    pass: settings.smtpPass,
                },
            });

            await transporter.sendMail({
                from: `"${senderName}" <${senderEmail}>`,
                to: recipient,
                subject: finalSubject,
                html: finalHtml,
            });

            await (prisma as any).adminEmailLog.create({
                data: { shop, type, subject: finalSubject, html: finalHtml, status: 'sent' }
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
                await (prisma as any).adminEmailLog.create({
                    data: { shop, type, subject: finalSubject, html: finalHtml, status: 'failed', error: JSON.stringify(error) }
                });
                return { success: false, error };
            }

            await (prisma as any).adminEmailLog.create({
                data: { shop, type, subject: finalSubject, html: finalHtml, status: 'sent' }
            });
            return { success: true, data };
        }

        // Fallback: Simulation
        console.log(`[Email Simulation] TO: ${recipient} | SUBJECT: ${finalSubject}`);
        await (prisma as any).adminEmailLog.create({
            data: { shop, type, subject: finalSubject, html: finalHtml, status: 'simulated' }
        });
        
        return { success: true, simulated: true };
    } catch (err: any) {
        console.error(`[Email Service] Error:`, err);
        await (prisma as any).adminEmailLog.create({
            data: { shop, type, subject: finalSubject, html: finalHtml, status: 'failed', error: err.message }
        });
        return { success: false, error: err.message };
    }
}

/**
 * Checks if an automated email of a certain type has already been sent to a shop.
 */
export async function hasSentEmail(shop: string, type: EmailType) {
    if (type === 'manual') return false;
    
    const log = await (prisma as any).adminEmailLog.findFirst({
        where: { 
            shop, 
            type,
            status: { in: ['sent', 'simulated'] }
        }
    });
    
    return !!log;
}

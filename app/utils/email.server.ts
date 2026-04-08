import { Resend } from 'resend';
import prisma from '../db.server';
import { replaceEmailVariables } from './email-parser';

const resend = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 're_your_api_key_here' 
    ? new Resend(process.env.RESEND_API_KEY) 
    : null;

const SENDER = process.env.SENDER_EMAIL || 'send@geopro.bluepeaks.top';

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

    // Check for custom automation template
    const customAuto = await (prisma as any).automation.findUnique({
        where: { shop_type: { shop, type } }
    });

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
        // Still replace variables in default if they exist (standardizing)
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

    try {
        if (!resend) {
            console.log(`[Email Simulation]
                TO: ${recipient}
                SUBJECT: ${subject}
                TYPE: ${type}
                BODY: (HTML content hidden)
            `);
            
            // Still log to DB so we don't repeat automated emails
            await (prisma as any).adminEmailLog.create({
                data: { shop, type, subject, status: 'simulated' }
            });
            
            return { success: true, simulated: true };
        }

        const { data, error } = await resend.emails.send({
            from: `Geo: Redirect & Country Block <${SENDER}>`,
            to: [recipient],
            subject: finalSubject,
            html: finalHtml,
        });

        if (error) {
            await (prisma as any).adminEmailLog.create({
                data: { shop, type, subject: subject || type, status: 'failed', error: JSON.stringify(error) }
            });
            return { success: false, error };
        }

        await (prisma as any).adminEmailLog.create({
            data: { shop, type, subject: subject || type, status: 'sent' }
        });

        return { success: true, data };
    } catch (err: any) {
        console.error(`[Email Service] Error:`, err);
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

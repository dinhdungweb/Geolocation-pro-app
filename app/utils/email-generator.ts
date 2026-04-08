export type EmailBlockType = 
    | 'header' 
    | 'hero' 
    | 'text' 
    | 'button' 
    | 'image_text' 
    | 'coupon' 
    | 'product' 
    | 'social' 
    | 'footer' 
    | 'spacer' 
    | 'divider'
    | 'heading';

export interface EmailBlock {
    id: string;
    type: EmailBlockType;
    content: any;
    style?: any;
}

/**
 * Generates an email-safe table-based HTML string from a list of blocks.
 */
export function generateEmailHtml(blocks: EmailBlock[], shopName: string): string {
    const content = blocks.map(block => renderBlock(block)).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Email</title>
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        table { border-collapse: collapse !important; }
        body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f8fafc; }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
        
        @media screen and (max-width: 600px) {
            .main-container { width: 100% !important; padding: 10px !important; }
            .stack-column { display: block !important; width: 100% !important; }
        }
    </style>
</head>
<body style="background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="600" class="main-container" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    ${content}
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `.trim();
}

function renderBlock(block: EmailBlock): string {
    const { type, content, style = {} } = block;
    const padding = style.padding || '30px';
    const bgColor = style.backgroundColor || 'transparent';

    switch (type) {
        case 'header':
            return `
                <tr>
                    <td align="center" style="padding: 20px; background-color: ${style.themeColor || '#6366f1'};">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">${content.logoText || 'Geo: Redirect'}</h1>
                    </td>
                </tr>
            `;

        case 'heading':
            return `
                <tr>
                    <td style="padding: ${padding} ${padding} 10px; background-color: ${bgColor};">
                        <h2 style="margin: 0; color: ${style.color || '#1e293b'}; font-size: ${style.fontSize || '24px'}; font-weight: 800; text-align: ${style.textAlign || 'left'}; line-height: 1.2;">
                            ${content.text}
                        </h2>
                    </td>
                </tr>
            `;

        case 'text':
            return `
                <tr>
                    <td style="padding: 10px ${padding} ${padding}; background-color: ${bgColor};">
                        <p style="margin: 0; color: ${style.color || '#475569'}; font-size: ${style.fontSize || '16px'}; line-height: 1.6; text-align: ${style.textAlign || 'left'};">
                            ${content.text.replace(/\n/g, '<br>')}
                        </p>
                    </td>
                </tr>
            `;

        case 'button':
            return `
                <tr>
                    <td align="${style.textAlign || 'center'}" style="padding: 20px ${padding}; background-color: ${bgColor};">
                        <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td align="center" style="border-radius: 8px; background-color: ${style.buttonColor || '#6366f1'};">
                                    <a href="${content.url || '#'}" target="_blank" style="padding: 12px 24px; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none;">
                                        ${content.label || 'Click Here'}
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            `;

        case 'divider':
            return `
                <tr>
                    <td style="padding: 10px ${padding};">
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0;">
                    </td>
                </tr>
            `;

        case 'spacer':
            return `<tr><td height="${content.height || '20'}" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>`;

        case 'hero':
            return `
                <tr>
                    <td style="background-color: #f1f5f9; padding: 40px ${padding}; text-align: center;">
                        ${content.imageUrl ? `<img src="${content.imageUrl}" width="540" style="width: 100%; max-width: 540px; border-radius: 8px; margin-bottom: 20px;">` : ''}
                        <h2 style="margin: 0; color: #0f172a; font-size: 28px; font-weight: 900;">${content.title || ''}</h2>
                    </td>
                </tr>
            `;

        case 'coupon':
            return `
                <tr>
                    <td style="padding: 20px ${padding};">
                        <div style="background-color: #fefce8; border: 2px dashed #facc15; border-radius: 12px; padding: 24px; text-align: center;">
                            <div style="font-size: 14px; font-weight: 700; color: #854d0e; text-transform: uppercase; margin-bottom: 8px;">Use Code At Checkout</div>
                            <div style="font-size: 32px; font-weight: 900; color: #1e293b; letter-spacing: 0.1em;">${content.code || 'WELCOME20'}</div>
                        </div>
                    </td>
                </tr>
            `;

        case 'footer':
            return `
                <tr>
                    <td align="center" style="padding: 30px ${padding}; background-color: #f8fafc; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                            ${content.text || '&copy; 2024 Geo: Redirect & Country Block. All rights reserved.'}<br>
                            You received this because you are an admin of this Shopify store.
                        </p>
                    </td>
                </tr>
            `;

        default:
            return '';
    }
}

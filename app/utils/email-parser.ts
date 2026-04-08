/**
 * Replaces placeholders in the format {variable_name} with actual data.
 */
export function replaceEmailVariables(
    content: string, 
    data: { 
        shop: string; 
        shopName?: string;
        usage?: number; 
        limit?: number;
    }
): string {
    const now = new Date();
    const replacements: Record<string, string> = {
        '{shop}': data.shop,
        '{shop_name}': data.shopName || data.shop,
        '{usage}': (data.usage || 0).toLocaleString(),
        '{limit}': (data.limit || 0).toLocaleString(),
        '{year}': now.getFullYear().toString()
    };

    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
        // Use a global regex to replace all occurrences
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        result = result.replace(regex, value);
    }

    return result;
}

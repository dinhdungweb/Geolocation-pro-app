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
        '[Shop Name]': data.shopName || data.shop,
        '[shop_name]': data.shopName || data.shop,
        '{year}': now.getFullYear().toString()
    };

    if (typeof data.usage === "number") {
        replacements['{usage}'] = data.usage.toLocaleString("en-US");
        replacements['{current_usage}'] = data.usage.toLocaleString("en-US");
    }

    if (typeof data.limit === "number") {
        replacements['{limit}'] = data.limit.toLocaleString("en-US");
        replacements['{plan_limit}'] = data.limit.toLocaleString("en-US");
    }

    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
        // Use a global regex to replace all occurrences
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        result = result.replace(regex, value);
    }

    return result;
}

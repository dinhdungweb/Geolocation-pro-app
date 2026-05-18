const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'app', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.startsWith('admin.') && f.endsWith('.tsx'));

const mappings = {
  // Fonts
  'var(--ed-font-family)': 'var(--ed-font-primary)',
  'var(--ed-font-xs)': 'var(--ed-font-size-xs)',
  'var(--ed-font-sm)': 'var(--ed-font-size-sm)',
  'var(--ed-font-md)': 'var(--ed-font-size-md)',
  'var(--ed-line-base)': 'var(--ed-line-height-base)',
  'var(--ed-weight-base)': 'var(--ed-font-weight-base)',
  'var(--ed-weight-medium)': '500', // Hardcode if no token
  'var(--ed-weight-strong)': '700', // Hardcode if no token

  // Colors
  'var(--ed-text)': 'var(--ed-color-text-tertiary)',
  'var(--ed-text-strong)': 'var(--ed-color-text-primary)',
  'var(--ed-surface-page)': 'var(--ed-color-surface-muted)',
  'var(--ed-surface-base)': 'var(--ed-color-surface-strong)',
  'var(--ed-surface-elevated)': 'var(--ed-color-surface-strong)',
  'var(--ed-surface-soft)': 'var(--ed-color-surface-muted)',
  'var(--ed-surface-muted)': 'var(--ed-color-border-muted)',
  'var(--ed-border)': 'var(--ed-color-surface-muted)',
  'var(--ed-border-strong)': 'var(--ed-color-border-muted)',
  'var(--ed-danger)': '#ef4444', // Fallback if no token
  'var(--ed-warning)': '#f59e0b',
  'var(--ed-success)': '#10b981',
  'var(--ed-focus)': 'var(--ed-color-border-muted)',

  // Radius & Shadow
  'var(--ed-radius)': 'var(--ed-radius-xl)', // 10px
  'var(--ed-shadow-1)': 'var(--ed-shadow-2)', // Softer shadow

  // Hex Replacements (common ones to map to tokens)
  '#ffffff': 'var(--ed-color-surface-strong)',
  '#000000': 'var(--ed-color-surface-base)',
  '#f4f5f8': 'var(--ed-color-surface-muted)',
  '#f5f6f8': 'var(--ed-color-surface-muted)',
  '#f7f8fb': 'var(--ed-color-surface-muted)',
  '#f9fbfc': 'var(--ed-color-surface-muted)',
  '#f4f8fb': 'var(--ed-color-surface-muted)',
  '#fbfcfd': 'var(--ed-color-surface-strong)',
  '#fbfdff': 'var(--ed-color-surface-strong)',
  '#fbfcfa': 'var(--ed-color-surface-strong)',
  '#3d3d47': 'var(--ed-color-text-primary)',
  '#767676': 'var(--ed-color-text-tertiary)',
  '#43b9b2': 'var(--ed-color-border-muted)',
};

const hexRegex = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})\b/g;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace old variables
  for (const [oldVar, newVar] of Object.entries(mappings)) {
    content = content.split(oldVar).join(newVar);
  }

  // Find style blocks and replace hex colors if possible
  const styleRegex = /<style>\{`([\s\S]*?)`\}<\/style>/g;
  content = content.replace(styleRegex, (match, css) => {
    let newCss = css;
    
    // Convert px values to token spaces if applicable? No, that's too dangerous.
    
    // We replace hex with tokens if it exists in mappings, or just lowercase it
    newCss = newCss.replace(hexRegex, (hexMatch) => {
      const lowerHex = hexMatch.toLowerCase();
      if (mappings[lowerHex]) {
        return mappings[lowerHex];
      }
      return lowerHex;
    });

    return `<style>{\`${newCss}\`}</style>`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${path.basename(filePath)}`);
  }
}

for (const file of files) {
  processFile(path.join(routesDir, file));
}

// Now handle admin.tsx root tokens
let adminTsxPath = path.join(routesDir, 'admin.tsx');
let adminContent = fs.readFileSync(adminTsxPath, 'utf8');

// Replace google font
adminContent = adminContent.replace(
  /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Nunito[^']*'\);/g,
  `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');`
);

// Replace :root block completely
const newRoot = `:root {
          --ed-font-primary: "Outfit", sans-serif;
          --ed-font-size-base: 14px;
          --ed-font-weight-base: 400;
          --ed-line-height-base: 21px;

          --ed-font-size-xs: 12px;
          --ed-font-size-sm: 13px;
          --ed-font-size-md: 14px;
          --ed-font-size-lg: 15px;
          --ed-font-size-xl: 16px;
          --ed-font-size-2xl: 20px;
          --ed-font-size-3xl: 22px;
          --ed-font-size-4xl: 26px;

          --ed-color-text-primary: #3d3d47;
          --ed-color-border-muted: #43b9b2;
          --ed-color-accent-soft: #e8fbfa;
          --ed-color-accent-active: #0a9f98;
          --ed-color-text-tertiary: #767676;
          --ed-color-surface-base: #000000;
          --ed-color-surface-muted: #f4f5f8;
          --ed-color-surface-strong: #ffffff;
          --ed-content-padding-mobile: 15px;
          --ed-card-padding-mobile: 15px;

          --ed-space-1: 5px;
          --ed-space-2: 20px;
          --ed-space-3: 24px;
          --ed-space-4: 28px;
          --ed-space-5: 32px;
          --ed-space-6: 40px;
          --ed-space-7: 48px;
          --ed-space-8: 64px;

          --ed-radius-xs: 3.5px;
          --ed-radius-sm: 3.75px;
          --ed-radius-md: 5px;
          --ed-radius-lg: 6px;
          --ed-radius-xl: 10px;
          --ed-radius-2xl: 50px;
          --ed-radius-step7: 60px;
          --ed-radius-step8: 100px;

          --ed-shadow-1: rgba(0, 0, 0, 0.1) 0px 36px 35px 0px;
          --ed-shadow-2: rgba(10, 75, 85, 0.05) 0px 4px 34px 0px;

          --ed-motion-instant: 300ms;
          --ed-motion-fast: 500ms;
          --ed-motion-normal: 1000ms;

          --ed-sidebar-width: 252px;
        }`;

adminContent = adminContent.replace(/:root\s*\{[\s\S]*?--sidebar-width:\s*var\(--ed-sidebar-width\);\s*\}/, newRoot);

// Ensure body uses new tokens
adminContent = adminContent.replace(/font-family:\s*var\(--ed-font-family\);/g, 'font-family: var(--ed-font-primary);');

fs.writeFileSync(adminTsxPath, adminContent);
console.log('Updated admin.tsx :root block');

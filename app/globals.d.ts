declare module "*.css";

interface Window {
  shopify?: {
    idToken?: () => Promise<string>;
  };
}

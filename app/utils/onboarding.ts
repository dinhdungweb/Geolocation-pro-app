export function getOnboardingStorageKeys(
  shop: string,
  onboardingInstallId: string,
) {
  const installationKey = `${shop}:${onboardingInstallId}`;

  return {
    confirmed: `geo_dashboard_setup_confirmed:${installationKey}`,
    dismissed: `geo_dashboard_setup_dismissed:${installationKey}`,
  };
}

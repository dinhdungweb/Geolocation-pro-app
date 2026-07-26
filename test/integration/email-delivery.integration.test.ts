import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";

const { createTransportMock, sendMailMock } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    createTransportMock: vi.fn(() => ({ sendMail })),
    sendMailMock: sendMail,
  };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

const { sendAdminEmail } = await import("../../app/utils/email.server");

const SHOP = "email-delivery.integration.test";
const GLOBAL_SETTINGS_SHOP = "GLOBAL";

async function clearEmailData() {
  await prisma.adminEmailLog.deleteMany({ where: { shop: SHOP } });
  await prisma.automation.deleteMany({
    where: { shop: { in: [SHOP, GLOBAL_SETTINGS_SHOP] } },
  });
  await prisma.emailBlacklist.deleteMany({ where: { shop: SHOP } });
  await prisma.session.deleteMany({ where: { shop: SHOP } });
  await prisma.settings.deleteMany({
    where: { shop: { in: [SHOP, GLOBAL_SETTINGS_SHOP] } },
  });
}

beforeEach(async () => {
  await clearEmailData();
  createTransportMock.mockClear();
  sendMailMock.mockReset();

  await prisma.settings.create({
    data: {
      emailSenderEmail: "noreply@example.com",
      emailSenderName: "Geo Test",
      shop: GLOBAL_SETTINGS_SHOP,
      smtpHost: "smtp.example.com",
      smtpPass: "integration-password",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "integration-user",
    },
  });
  await prisma.session.create({
    data: {
      accessToken: "integration-access-token",
      email: "owner@example.com",
      id: `offline_${SHOP}`,
      isOnline: false,
      shop: SHOP,
      state: "integration-state",
    },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await clearEmailData();
});

describe("automated email delivery integration", () => {
  it("sends through SMTP and reserves a delivery key to prevent duplicates", async () => {
    sendMailMock.mockResolvedValue({ messageId: "integration-message" });

    const first = await sendAdminEmail({
      dedupeKey: "welcome-period",
      html: "<p>Welcome</p>",
      shop: SHOP,
      subject: "Welcome",
      type: "welcome",
    });
    const duplicate = await sendAdminEmail({
      dedupeKey: "welcome-period",
      html: "<p>Welcome</p>",
      shop: SHOP,
      subject: "Welcome",
      type: "welcome",
    });

    expect(first).toMatchObject({ success: true });
    expect(duplicate).toMatchObject({
      reason: "duplicate",
      skipped: true,
      success: true,
    });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false,
      }),
    );
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Geo Test" <noreply@example.com>',
        html: "<p>Welcome</p>",
        subject: "Welcome",
        to: "owner@example.com",
      }),
    );

    const log = await prisma.adminEmailLog.findFirstOrThrow({
      where: { shop: SHOP },
    });
    expect(log).toMatchObject({
      deliveryKey: `${SHOP}:welcome:welcome-period`,
      status: "sent",
    });
  });

  it("records a transport timeout and permits a later retry of the same delivery", async () => {
    sendMailMock
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({ messageId: "retry-message" });

    const failed = await sendAdminEmail({
      dedupeKey: "limit-period",
      html: "<p>Limit reached</p>",
      shop: SHOP,
      subject: "Limit reached",
      type: "limit_100",
    });

    expect(failed).toMatchObject({
      error: "ETIMEDOUT",
      success: false,
    });
    expect(
      await prisma.adminEmailLog.findFirstOrThrow({ where: { shop: SHOP } }),
    ).toMatchObject({
      error: "ETIMEDOUT",
      status: "failed",
    });

    const retried = await sendAdminEmail({
      dedupeKey: "limit-period",
      html: "<p>Limit reached</p>",
      shop: SHOP,
      subject: "Limit reached",
      type: "limit_100",
    });

    expect(retried).toMatchObject({ success: true });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(
      await prisma.adminEmailLog.findFirstOrThrow({ where: { shop: SHOP } }),
    ).toMatchObject({
      error: null,
      status: "sent",
    });
  });
});

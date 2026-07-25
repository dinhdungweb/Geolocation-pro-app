import { afterAll, beforeAll } from "vitest";
import prisma from "../../app/db.server";

beforeAll(() => {
  const databaseUrl = process.env.DATABASE_URL || "";
  const schema = new URL(databaseUrl).searchParams.get("schema") || "";

  if (!schema || schema === "public" || !/(test|integration)/i.test(schema)) {
    throw new Error("Integration tests require a dedicated non-public test schema");
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

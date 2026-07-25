import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok" }, { headers });
  } catch (error) {
    console.error("[Health] Database check failed:", error);
    return json({ status: "unavailable" }, { status: 503, headers });
  }
}

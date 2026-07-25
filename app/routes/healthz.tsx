import prisma from "../db.server";

function responseData<T>(payload: T, init?: ResponseInit) {
  return Response.json(payload, init);
}

export async function loader() {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    return responseData({ status: "ok" }, { headers });
  } catch (error) {
    console.error("[Health] Database check failed:", error);
    return responseData({ status: "unavailable" }, { status: 503, headers });
  }
}

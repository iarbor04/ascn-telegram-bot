import { NextResponse, type NextRequest } from "next/server";
import { verifyAdmin } from "@/lib/admin";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) return NextResponse.next();
  if (request.method === "GET" && request.nextUrl.pathname.startsWith("/api/uploads/")) return NextResponse.next();
  if (!process.env.ADMIN_PASSWORD || verifyAdmin(request.headers)) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "www-authenticate": 'Basic realm="ASCN Broadcast"' } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };

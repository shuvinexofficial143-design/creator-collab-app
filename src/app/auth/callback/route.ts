import { configured } from "@/lib/config";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { safeNext } from "@/lib/validation";
export async function GET(request: NextRequest) {
  if (!configured())
    return NextResponse.redirect(new URL("/setup", request.url));
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await db();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          safeNext(request.nextUrl.searchParams.get("next")),
          request.url,
        ),
      );
  }
  return NextResponse.redirect(
    new URL("/auth/login?error=Confirmation%20link%20expired", request.url),
  );
}

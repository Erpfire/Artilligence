import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");
  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");
  // XSS protection (legacy browsers)
  response.headers.set("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS (1 year, include subdomains)
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  // Permissions policy — disable unused browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  // Content Security Policy
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return response;
}

function checkCors(request: NextRequest, response: NextResponse): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // API routes: enforce same-origin in production
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (origin && host) {
      const allowedOrigins = [
        `http://${host}`,
        `https://${host}`,
      ];
      if (!allowedOrigins.includes(origin)) {
        return new NextResponse(JSON.stringify({ error: "CORS: Origin not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // Set CORS headers for same-origin requests
    if (origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle CORS preflight
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      const allowedOrigins = [`http://${host}`, `https://${host}`];
      if (!allowedOrigins.includes(origin)) {
        return new NextResponse(null, { status: 403 });
      }
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const token = await getToken({ req: request });

  // If token indicates blocked user, redirect to login
  if (token?.blocked || (token && !token.id)) {
    if (pathname !== "/login" && !pathname.startsWith("/join") && !pathname.startsWith("/api/auth")) {
      return NextResponse.redirect(new URL("/login?error=blocked", request.url));
    }
  }

  // Redirect logged-in users away from login page
  if (pathname === "/login") {
    if (token && !token.blocked && token.id) {
      const dest = token.role === "ADMIN" ? "/admin" : "/dashboard";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Allow /join routes for everyone (referral links should always work)
  if (pathname.startsWith("/join")) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Protected admin routes
  if (pathname.startsWith("/admin")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Protected dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (token.role !== "MEMBER") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // API routes: CORS check + security headers
  if (pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    const corsBlock = checkCors(request, response);
    if (corsBlock) return addSecurityHeaders(corsBlock);
    return response;
  }

  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/login",
    "/join/:path*",
    "/api/:path*",
    "/",
  ],
};

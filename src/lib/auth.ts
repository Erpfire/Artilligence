import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { checkRateLimit } from "./rate-limit";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Rate limit by IP
        const ip =
          req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
          "unknown";
        const rateCheck = checkRateLimit(`login:${ip}`);
        if (!rateCheck.allowed) {
          throw new Error("Too many login attempts. Try again later.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("Invalid email or password");
        }

        if (user.status === "BLOCKED" || user.status === "DEACTIVATED") {
          throw new Error(
            "Your account has been deactivated. Contact admin."
          );
        }

        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!valid) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      // Check if user is still active on every token refresh
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { status: true },
          });
          if (!dbUser || dbUser.status === "BLOCKED" || dbUser.status === "DEACTIVATED") {
            // Invalidate the token by clearing the id
            return { ...token, id: null, blocked: true };
          }
        } catch {
          // DB errors should not break auth flow
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.blocked || !token.id) {
        // Return a session that signals the client to log out
        return { ...session, user: { ...session.user, id: null, blocked: true } } as any;
      }
      if (session.user) {
        (session.user as any).id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

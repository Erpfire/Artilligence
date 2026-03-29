import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import RegistrationForm from "./RegistrationForm";

interface Props {
  params: Promise<{ referralCode: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { referralCode } = await params;

  const sponsor = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true, name: true, status: true, referralCode: true },
  });

  if (!sponsor) {
    notFound();
  }

  if (sponsor.status === "BLOCKED" || sponsor.status === "DEACTIVATED") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Referral Link Inactive
          </h1>
          <p className="mt-2 text-gray-600">
            This referral link is no longer active. Please contact the person
            who shared it with you.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary">Artilligence</h1>
          <p className="mt-2 text-sm text-gray-600">Create your account</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-6 rounded-md bg-blue-50 p-3 text-center text-sm text-blue-800">
            You&apos;ve been referred by{" "}
            <span className="font-semibold">{sponsor.name}</span>
          </div>

          <RegistrationForm referralCode={sponsor.referralCode} />

          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

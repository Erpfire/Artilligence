export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          Invalid Referral Code
        </h1>
        <p className="mt-2 text-gray-600">
          This referral link is invalid. Please check the link and try again,
          or contact the person who referred you.
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

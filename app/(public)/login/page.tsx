import { Suspense } from "react";
import Link from "next/link";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <Suspense fallback={<div className="text-sm text-neutral-500">Loading…</div>}>
        <LoginForm />
      </Suspense>

      <div className="mt-6 border-t border-neutral-200 pt-4 text-center text-sm text-neutral-600">
        <span>Don&apos;t have an account?</span>{" "}
        <Link href="/signup" className="font-medium underline underline-offset-4 hover:text-neutral-900">
          Sign up
        </Link>
      </div>
    </div>
  );
}

// Super-admin sign-in: centered glass card over violet NFC ripples (the film's look).
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import { FadeUp } from "@/components/admin/motion";
import { getSession } from "@/lib/auth";
import { str, type SearchParams } from "../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

function safeNext(v: string) {
  return /^\/admin(?:[/?#]|$)/.test(v) && !v.startsWith("//") && !v.includes("\\") && !v.startsWith("/admin/login") ? v : "/admin";
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNext(str(sp.next));
  if (await getSession()) redirect(next);
  const error = str(sp.error) || undefined;

  return (
    <main className="login">
      <div className="waves" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="grain" aria-hidden />
      <FadeUp className="login-card">
        <Image className="logo" src="/brand/mark_white.png" alt="onde" width={132} height={50} priority />
        <div className="tag">
          <span className="pill vio">
            <i />
            Super Admin
          </span>
        </div>
        <h1>Welcome back</h1>
        <p className="lead">Every chip, every link, one place.</p>
        <LoginForm next={next} initialError={error} />
        <p className="login-foot">Private area · ONDE · onde.tn</p>
      </FadeUp>
    </main>
  );
}

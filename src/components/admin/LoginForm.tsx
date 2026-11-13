"use client";
// Super-admin sign-in. Works as a plain HTML form post (no JS) and, hydrated, as a fetch to /api/admin/login.
import { motion, useAnimationControls } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

const MESSAGES: Record<string, string> = {
  "1": "Wrong email or password.",
  invalid_credentials: "Wrong email or password.",
  rate_limited: "Too many attempts. Wait a minute, then try again.",
  network: "No connection to the server. Check your internet and try again.",
  server: "The server couldn’t sign you in. Check ADMIN_EMAIL, ADMIN_PASSWORD_HASH and SESSION_SECRET in the server environment.",
};

export default function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const uid = useId();
  const shake = useAnimationControls();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? (MESSAGES[initialError] ?? MESSAGES["1"]) : null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      void shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      const key = res.status === 429 ? "rate_limited" : res.status === 401 ? "invalid_credentials" : "server";
      setError(MESSAGES[key]);
      if (res.status === 401) setPassword("");
    } catch {
      setError(MESSAGES.network);
    }
    setPending(false);
    void shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } });
  }

  return (
    <motion.div animate={shake}>
      <form method="post" action="/api/admin/login" onSubmit={onSubmit} noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input
            id={`${uid}-email`}
            name="email"
            type="email"
            className={`input${error ? " bad" : ""}`}
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-pw`}>Password</label>
          <div className="pw">
            <input
              id={`${uid}-pw`}
              name="password"
              type={show ? "text" : "password"}
              className={`input${error ? " bad" : ""}`}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? "Hide password" : "Show password"}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {error ? (
          <motion.div className="login-err" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
            <span aria-hidden>!</span>
            <span>{error}</span>
          </motion.div>
        ) : null}
        <button type="submit" className={`save${pending ? " busy" : ""}`} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </motion.div>
  );
}

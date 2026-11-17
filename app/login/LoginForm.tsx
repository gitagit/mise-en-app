"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/** Where to go after sign-in: a same-origin path only, so the query string cannot redirect off-site. */
function safeReturnPath(raw: string | null): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export default function LoginForm({ hasGoogle, hasGithub }: { hasGoogle: boolean; hasGithub: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const from = safeReturnPath(searchParams.get("callbackUrl") ?? searchParams.get("from"));
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Incorrect email or password");
    } else {
      // Full navigation, not router.push: the nav links were prefetched while signed out,
      // so the client router cache holds "redirect to /login" for them and would bounce
      // a freshly signed-in user straight back here.
      window.location.assign(from);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
          style={{ fontSize: 16 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ fontSize: 16 }}
        />
        {error && (
          <p style={{ color: "var(--danger)", margin: 0 }}>
            <small>{error}</small>
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: "rgba(74,144,217,0.15)",
            border: "1px solid rgba(74,144,217,0.4)",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {(hasGoogle || hasGithub) && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(127,127,127,0.2)" }} />
            <small className="muted">or</small>
            <div style={{ flex: 1, height: 1, background: "rgba(127,127,127,0.2)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hasGoogle && (
              <button
                onClick={() => signIn("google", { callbackUrl: "/" })}
                style={{ background: "none", border: "1px solid rgba(127,127,127,0.3)" }}
              >
                Continue with Google
              </button>
            )}
            {hasGithub && (
              <button
                onClick={() => signIn("github", { callbackUrl: "/" })}
                style={{ background: "none", border: "1px solid rgba(127,127,127,0.3)" }}
              >
                Continue with GitHub
              </button>
            )}
          </div>
        </>
      )}

      <p style={{ textAlign: "center", margin: "4px 0 0" }}>
        <small className="muted">
          No account?{" "}
          <Link href="/register" style={{ color: "var(--accent)" }}>
            Register
          </Link>
        </small>
      </p>
    </div>
  );
}

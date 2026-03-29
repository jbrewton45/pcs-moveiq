import { useState } from "react";
import { api, setToken } from "../api";
import type { UserPublic } from "../types";

interface Props {
  onAuth: (user: UserPublic) => void;
}

export function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (mode === "signup") {
        const result = await api.signup(email, password, displayName);
        setToken(result.token);
        onAuth(result.user);
      } else {
        const result = await api.login(email, password);
        setToken(result.token);
        onAuth(result.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-card__title">PCS MoveIQ</h1>
        <p className="auth-card__subtitle">Downsizing assistant for military households</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "login" ? "auth-tab--active" : ""}`}
            onClick={() => { setMode("login"); setError(""); }}
            type="button"
          >
            Log In
          </button>
          <button
            className={`auth-tab ${mode === "signup" ? "auth-tab--active" : ""}`}
            onClick={() => { setMode("signup"); setError(""); }}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}

          {mode === "signup" && (
            <label>
              Display Name
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. SSG Smith"
                required
                autoComplete="name"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              required
              minLength={mode === "signup" ? 6 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? "..." : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

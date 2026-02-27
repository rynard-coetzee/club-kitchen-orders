// src/pages/LoginPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function goByRole() {
    setErr("");

    const { data, error } = await supabase.rpc("get_my_role");
    if (error) {
      setErr(error.message);
      return;
    }

    const role = String(data || "").trim().toLowerCase();

    if (role === "admin") {
      nav("/admin", { replace: true });
      return;
    }

    if (role === "kitchen") {
      nav("/kitchen", { replace: true });
      return;
    }

    if (role === "waiter") {
      nav("/waiter", { replace: true });
      return;
    }

    setErr(`This account has no valid role. Role returned: "${data}"`);
  }

  // If already logged in, redirect immediately
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setMsg("Already signed in. Redirecting…");
        await goByRole();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!email.trim() || !password) {
      setErr("Enter email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setMsg("Logged in. Redirecting…");
    await goByRole();
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Staff Login</h1>

      {err && (
        <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 12, border: "1px solid #fecaca" }}>
          <b>Error:</b> {err}
        </div>
      )}

      {msg && (
        <div style={{ background: "#e7f6e7", padding: 12, borderRadius: 12, border: "1px solid #bbf7d0", marginTop: 10 }}>
          {msg}
        </div>
      )}

      <form onSubmit={login} style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          autoComplete="email"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd" }}
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "none",
            background: loading ? "#cbd5e1" : "#111827",
            color: "white",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
        You will be redirected automatically based on your role (admin / kitchen / waiter).
      </div>
    </div>
  );
}
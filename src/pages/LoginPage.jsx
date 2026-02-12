import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function login(e) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setErr(error.message);
    nav("/kitchen");
  }

  return (
    <div style={{ fontFamily: "Arial", padding: 16, maxWidth: 420, margin: "0 auto" }}>
      <h1>Kitchen Login</h1>
      {err && <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 10 }}><b>Error:</b> {err}</div>}
      <form onSubmit={login} style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }} />
        <button style={{ padding: 12, borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 800 }}>
          Login
        </button>
      </form>
    </div>
  );
}

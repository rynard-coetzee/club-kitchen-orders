import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function RequireRole({ allow = [], children }) {
  const [state, setState] = useState({ loading: true, ok: false, redirectTo: "/login" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setState({ loading: true, ok: false, redirectTo: "/login" });

      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session?.user) {
        if (!cancelled) setState({ loading: false, ok: false, redirectTo: "/login" });
        return;
      }

      const { data: role, error } = await supabase.rpc("get_my_role");
      if (cancelled) return;

      if (error) {
        setState({ loading: false, ok: false, redirectTo: "/login" });
        return;
      }

      const r = String(role || "").trim().toLowerCase();

      if (allow.includes(r)) {
        setState({ loading: false, ok: true, redirectTo: "/login" });
        return;
      }

      // ✅ If logged in but wrong page, send them where they belong
      if (r === "admin") setState({ loading: false, ok: false, redirectTo: "/admin" });
      else if (r === "kitchen") setState({ loading: false, ok: false, redirectTo: "/kitchen" });
      else if (r === "waiter") setState({ loading: false, ok: false, redirectTo: "/waiter" });
      else setState({ loading: false, ok: false, redirectTo: "/login" });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allow]);

  if (state.loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!state.ok) return <Navigate to={state.redirectTo} replace />;

  return children;
}
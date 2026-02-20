import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function RequireRole({ allow = [], children }) {
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session?.user) {
        if (!cancelled) {
          setOk(false);
          setLoading(false);
        }
        return;
      }

      const { data: role, error } = await supabase.rpc("get_my_role");
      if (cancelled) return;

      if (error) {
        setOk(false);
        setLoading(false);
        return;
      }

      const r = String(role || "").trim().toLowerCase();
      setOk(allow.includes(r));
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [allow]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!ok) return <Navigate to="/login" replace />;

  return children;
}
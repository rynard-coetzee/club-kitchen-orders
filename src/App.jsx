import { Routes, Route, Navigate } from "react-router-dom";
import OrderPage from "./pages/OrderPage";
import KitchenPage from "./pages/KitchenPage";
import WaiterPage from "./pages/WaiterPage";
import LoginPage from "./pages/LoginPage";
import ReportsPage from "./pages/ReportsPage";
import AdminPage from "./pages/AdminPage";
import RequireRole from "./components/RequireRole";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/order" replace />} />
      <Route path="/order" element={<OrderPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/kitchen"
        element={
          <RequireRole allow={["kitchen"]}>
            <KitchenPage />
          </RequireRole>
        }
      />

      <Route
        path="/waiter"
        element={
          <RequireRole allow={["waiter"]}>
            <WaiterPage />
          </RequireRole>
        }
      />

      <Route
        path="/reports"
        element={
          <RequireRole allow={["kitchen", "waiter", "admin"]}>
            <ReportsPage />
          </RequireRole>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireRole allow={["admin"]}>
            <AdminPage />
          </RequireRole>
        }
      />

      <Route path="*" element={<div style={{ padding: 16 }}>Not found</div>} />
    </Routes>
  );
}
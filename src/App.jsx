import { Routes, Route, Navigate } from "react-router-dom";
import OrderPage from "./pages/OrderPage";
import KitchenPage from "./pages/KitchenPage";
import WaiterPage from "./pages/WaiterPage";
import LoginPage from "./pages/LoginPage";
import ReportsPage from "./pages/ReportsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/order" replace />} />
      <Route path="/order" element={<OrderPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/kitchen" element={<KitchenPage />} />
      <Route path="/waiter" element={<WaiterPage />} />
      <Route path="*" element={<div style={{ padding: 16 }}>Not found</div>} />
      <Route path="/reports" element={<ReportsPage />} />
    </Routes>
  );
}

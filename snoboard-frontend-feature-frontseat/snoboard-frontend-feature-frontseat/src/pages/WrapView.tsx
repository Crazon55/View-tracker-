import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MonthlyWrapScreen } from "@/components/MonthlyWrapHost";
import { getDefaultWrapMonth, isWrapMonthSkipped } from "@/lib/monthlyWrap";

/** Full-screen wrap — open directly at `/wrap` or `/wrap?month=2026-05`. */
export default function WrapView() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("month");
  const reportMonth =
    raw && /^\d{4}-\d{2}$/.test(raw) ? raw : getDefaultWrapMonth();

  useEffect(() => {
    if (!reportMonth || isWrapMonthSkipped(reportMonth)) {
      navigate("/", { replace: true });
    }
  }, [reportMonth, navigate]);

  if (!reportMonth || isWrapMonthSkipped(reportMonth)) {
    return null;
  }

  return (
    <MonthlyWrapScreen
      reportMonth={reportMonth}
      onExit={() => navigate("/")}
    />
  );
}

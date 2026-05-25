import { useSearchParams, useNavigate } from "react-router-dom";
import { MonthlyWrapScreen } from "@/components/MonthlyWrapHost";
import { getDefaultWrapMonth } from "@/lib/monthlyWrap";

/** Full-screen wrap — open directly at `/wrap` or `/wrap?month=2026-05`. */
export default function WrapView() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("month");
  const reportMonth =
    raw && /^\d{4}-\d{2}$/.test(raw) ? raw : getDefaultWrapMonth();

  return (
    <MonthlyWrapScreen
      reportMonth={reportMonth}
      onExit={() => navigate("/")}
    />
  );
}

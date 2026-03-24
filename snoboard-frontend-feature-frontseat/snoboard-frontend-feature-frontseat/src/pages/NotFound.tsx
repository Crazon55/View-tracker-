import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-2 text-5xl font-bold font-mono text-foreground tracking-tighter">404</h1>
        <p className="mb-6 text-sm text-muted-foreground">This page doesn't exist</p>
        <a href="/" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
          Return to View Tracker
        </a>
      </div>
    </div>
  );
};

export default NotFound;

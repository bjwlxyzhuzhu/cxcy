"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export default function Presence() {
  const path = usePathname();
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible")
        void fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 45000);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
    };
  }, [path]);
  return null;
}

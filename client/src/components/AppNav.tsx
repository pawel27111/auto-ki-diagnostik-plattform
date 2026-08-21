import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { APP_LOGO } from "@/const";
import { LogOut, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

/**
 * Shared top bar. Previously each page duplicated this markup, which is how
 * the settings link ended up pointing at a route that did not exist.
 */
export default function AppNav({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { user, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-blue-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <img src={APP_LOGO} alt="" className="h-10 w-10 shrink-0" />
          <span className="text-xl font-bold text-white truncate">{title}</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          {actions}
          {user && (
            <div className="text-right hidden sm:block">
              <p className="text-sm text-blue-200">Willkommen</p>
              <p className="font-semibold text-white truncate max-w-[12rem]">
                {user.name || user.email}
              </p>
            </div>
          )}
          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon"
              className="text-blue-300 hover:text-blue-100"
              aria-label="Einstellungen"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-400 hover:text-red-300"
            onClick={() => void logout()}
            aria-label="Abmelden"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}

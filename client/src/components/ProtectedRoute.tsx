import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Gate for routes that require a signed-in user.
 *
 * Renders a loading state while `auth.me` is still in flight rather than
 * redirecting immediately: `isAuthenticated` is false during loading too, so
 * redirecting on it alone bounced every page reload back to the login screen
 * before the session had a chance to resolve.
 *
 * This is a UX guard only — the data itself is protected server-side by
 * protectedProcedure.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 to-blue-950">
        <div className="text-center">
          <Loader2
            className="h-10 w-10 text-blue-400 mx-auto animate-spin"
            aria-hidden="true"
          />
          <p className="text-white mt-4">Lädt…</p>
        </div>
      </div>
    );
  }

  // The redirect is already under way; render nothing rather than flashing the
  // protected page.
  if (!isAuthenticated) return null;

  return <>{children}</>;
}

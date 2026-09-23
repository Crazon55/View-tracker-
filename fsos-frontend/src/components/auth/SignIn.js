// The door. Google only, @owledmedia.com only — the backend enforces the domain, this
// just says so up front rather than letting someone sign in and then be refused.
import React, { useState } from "react";
import { signIn, authConfigured } from "@/lib/session";
import { Button } from "@/components/ui/button";
import * as Icons from "lucide-react";

export default function SignIn({ error }) {
  const [going, setGoing] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-4xl text-stone-900">FSOS</h1>
          <p className="mt-1 text-sm text-stone-500">Frontseat Operating System</p>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <Icons.AlertCircle className="h-4 w-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {!authConfigured ? (
            <div className="text-xs text-stone-600">
              <p className="font-medium text-stone-900">Sign-in isn't configured.</p>
              <p className="mt-1">
                Set <code className="rounded bg-stone-100 px-1">REACT_APP_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-stone-100 px-1">REACT_APP_SUPABASE_ANON_KEY</code> in{" "}
                <code className="rounded bg-stone-100 px-1">.env.local</code>, and turn on the Google
                provider in Supabase.
              </p>
            </div>
          ) : (
            <>
              <Button
                data-testid="sign-in"
                className="w-full bg-stone-900 hover:bg-stone-800"
                disabled={going}
                onClick={() => { setGoing(true); signIn(); }}
              >
                {going ? "Taking you to Google…" : "Continue with Google"}
              </Button>
              <p className="mt-3 text-center text-[11px] text-stone-500">
                Use your @owledmedia.com account.
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-stone-400">
          New here? Sign in and an admin will give you access.
        </p>
      </div>
    </div>
  );
}

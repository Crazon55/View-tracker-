// What you see before the app: signing in, waiting for a role, or something broken.
//
// The distinction that matters is between "we don't know who you are" and "we know
// exactly who you are and you haven't been given a role yet". The second isn't an
// error, and shouldn't read like one — it's the first thing a new joiner sees.
import React from "react";
import { signOut } from "@/lib/session";
import { Button } from "@/components/ui/button";
import * as Icons from "lucide-react";

export function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="flex flex-col items-center gap-3">
        <Icons.Loader2 className="h-5 w-5 animate-spin text-stone-400" />
        <span className="text-xs text-stone-500">Loading your workspace…</span>
      </div>
    </div>
  );
}

export function PendingAccess({ email }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
          <Icons.Clock className="h-5 w-5 text-amber-700" />
        </div>
        <h1 className="font-serif text-2xl text-stone-900">You're signed in — access is pending</h1>
        <p className="mt-2 text-sm text-stone-600">
          {email ? <>We know you as <b>{email}</b>. </> : null}
          An admin needs to give you a role before FSOS has anything to show you. Ask in the team
          channel and it takes a minute.
        </p>
        <Button variant="outline" className="mt-6" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}

export function LoadFailed({ error, onRetry }) {
  const offline = error?.status === 0;
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100">
          <Icons.AlertTriangle className="h-5 w-5 text-red-700" />
        </div>
        <h1 className="font-serif text-2xl text-stone-900">
          {offline ? "Can't reach the FSOS server" : "That didn't load"}
        </h1>
        <p className="mt-2 text-sm text-stone-600">{error?.message || "Something went wrong."}</p>
        {offline && (
          <p className="mt-2 text-xs text-stone-500">
            If you're running this locally, start the backend:{" "}
            <code className="rounded bg-stone-100 px-1">python -m uvicorn app.main:app --port 8000</code>
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

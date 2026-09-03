'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const next = searchParams.get('next') ?? '/overview';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSignupMessage(null);
    setResetMessage(null);
    const supabase = createSupabaseBrowserClient();

    if (mode === 'forgot') {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      // Deliberately the same message whether or not the email is registered - confirming which
      // emails have accounts here would let anyone enumerate real users of this dashboard.
      setResetMessage('If an account exists for that email, a password reset link has been sent.');
      setLoading(false);
      return;
    }

    if (mode === 'signin') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      router.replace(next);
      return;
    }

    // mode === 'signup'
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      // Email confirmation is disabled on this project - signUp already returned a live session.
      router.replace(next);
      return;
    }
    setSignupMessage('Check your inbox to confirm your email, then sign in.');
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground">P</div>
          <h1 className="text-lg font-semibold text-foreground">PrepQ Analytics</h1>
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'signin' && 'Sign in to view your marketing and sales dashboards.'}
            {mode === 'signup' && 'Create an account to get started.'}
            {mode === 'forgot' && "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'forgot' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                      setSignupMessage(null);
                      setResetMessage(null);
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-xs text-critical">{error}</p>}
          {signupMessage && <p className="text-xs text-good">{signupMessage}</p>}
          {resetMessage && <p className="text-xs text-good">{resetMessage}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </Button>
        </form>

        {mode === 'forgot' ? (
          <button
            type="button"
            className="text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode('signin');
              setError(null);
              setResetMessage(null);
            }}
          >
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            className="text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setSignupMessage(null);
            }}
          >
            {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

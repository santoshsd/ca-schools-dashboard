import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Database, ArrowLeft, CheckCircle2 } from "lucide-react";

type AuthView = "login" | "register" | "forgot";

export default function AuthPage() {
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loginFailed, setLoginFailed] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const authMutation = useMutation({
    mutationFn: async () => {
      const endpoint = view === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = view === "register"
        ? { email, password, firstName, lastName }
        : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? data.error ?? "Authentication failed");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      if (view === "login") setLoginFailed(true);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return res.json();
    },
    onSuccess: () => {
      setForgotSuccess(true);
    },
    onError: () => {
      setForgotSuccess(true);
    },
  });

  function switchView(next: AuthView) {
    setView(next);
    setLoginFailed(false);
    setForgotSuccess(false);
    setPassword("");
  }

  if (view === "forgot") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md" data-testid="forgot-password-card">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Database className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold">CA School Dashboard API</span>
            </div>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              Enter your email address. If an account exists, we'll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotSuccess ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center" data-testid="text-forgot-success">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="text-sm text-muted-foreground">
                  If an account with that email exists, you will receive a reset link shortly. Check your inbox (and spam folder).
                </p>
              </div>
            ) : (
              <form
                data-testid="form-forgot-password"
                onSubmit={(e) => {
                  e.preventDefault();
                  forgotMutation.mutate();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="forgot-email">
                    Email
                  </label>
                  <Input
                    id="forgot-email"
                    data-testid="input-forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="developer@example.com"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  data-testid="button-forgot-submit"
                  disabled={forgotMutation.isPending}
                >
                  {forgotMutation.isPending ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="ghost"
              className="w-full"
              data-testid="button-back-to-login"
              onClick={() => switchView("login")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="auth-card">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Database className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold">CA School Dashboard API</span>
          </div>
          <CardTitle data-testid="text-auth-title">
            {view === "login" ? "Sign In" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {view === "login"
              ? "Sign in to manage your API keys and access the developer portal."
              : "Create an account to get started with the CA School Dashboard API."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            data-testid="form-auth"
            onSubmit={(e) => {
              e.preventDefault();
              authMutation.mutate();
            }}
            className="space-y-4"
          >
            {view === "register" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="firstName">First Name</label>
                  <Input
                    id="firstName"
                    data-testid="input-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground" htmlFor="lastName">Last Name</label>
                  <Input
                    id="lastName"
                    data-testid="input-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="email">Email</label>
              <Input
                id="email"
                data-testid="input-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="password">Password</label>
              <Input
                id="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>
            <Button
              type="submit"
              data-testid="button-auth-submit"
              className="w-full"
              disabled={authMutation.isPending}
            >
              {authMutation.isPending
                ? "Please wait..."
                : view === "login"
                  ? "Sign In"
                  : "Create Account"}
            </Button>

            {view === "login" && loginFailed && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                data-testid="button-forgot-password"
                onClick={() => switchView("forgot")}
              >
                Forgot your password?
              </Button>
            )}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            variant="ghost"
            data-testid="button-toggle-auth-mode"
            onClick={() => switchView(view === "login" ? "register" : "login")}
            className="w-full"
          >
            {view === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </Button>
          <Button
            variant="outline"
            data-testid="link-back-home"
            onClick={() => setLocation("/")}
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

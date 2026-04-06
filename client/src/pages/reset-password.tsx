import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Database, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (password !== confirm) throw new Error("Passwords do not match.");
      if (password.length < 12) throw new Error("Password must be at least 12 characters.");
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Password reset failed.");
      return data;
    },
    onSuccess: () => {
      setDone(true);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Database className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold">CA School Dashboard API</span>
            </div>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>This password reset link is missing or malformed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setLocation("/auth")}>Back to Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
            <CardTitle>Password Updated</CardTitle>
            <CardDescription>Your password has been reset successfully. You can now sign in with your new password.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => setLocation("/auth")}
              data-testid="button-go-to-signin"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="reset-password-card">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Database className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold">CA School Dashboard API</span>
          </div>
          <CardTitle>Set New Password</CardTitle>
          <CardDescription>Choose a strong password for your account. It must be at least 12 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            data-testid="form-reset-password"
            onSubmit={(e) => {
              e.preventDefault();
              resetMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="new-password">
                New Password
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  data-testid="input-new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  required
                  minLength={12}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password-visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <Input
                id="confirm-password"
                data-testid="input-confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                required
                minLength={12}
              />
            </div>
            {password && confirm && password !== confirm && (
              <p className="text-sm text-destructive" data-testid="text-password-mismatch">Passwords do not match.</p>
            )}
            <Button
              type="submit"
              className="w-full"
              data-testid="button-reset-submit"
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Updating..." : "Set New Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

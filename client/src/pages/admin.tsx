import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, LogOut, RefreshCw, Play, ShieldAlert, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";

type IngestionLog = {
  id: number;
  source: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  details: string | null;
  startedAt: string;
  completedAt: string | null;
};

type StatusResponse = {
  data: {
    running: boolean;
    logs: IngestionLog[];
  };
};

export default function AdminPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [adminSecret, setAdminSecret] = useState("");
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate]);

  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["/api/admin/ingest/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ingest/status", {
        headers: { "X-Admin-Secret": adminSecret },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: !!adminSecret,
    refetchInterval: polling ? 5000 : false,
    retry: false,
  });

  const isRunning = statusQuery.data?.data?.running ?? false;

  useEffect(() => {
    setPolling(isRunning);
  }, [isRunning]);

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "X-Admin-Secret": adminSecret },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "already_running") {
        toast({ title: "Already running", description: "An ingestion is already in progress." });
      } else {
        toast({ title: "Ingestion started", description: "CDE data import is running in the background." });
        setPolling(true);
        queryClient.invalidateQueries({ queryKey: ["/api/admin/ingest/status"] });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  function handleCheckStatus() {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ingest/status"] });
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const logs = statusQuery.data?.data?.logs ?? [];

  function statusBadge(status: string) {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      completed: { variant: "secondary", icon: CheckCircle },
      error: { variant: "destructive", icon: XCircle },
      started: { variant: "outline", icon: Loader2 },
      checking: { variant: "outline", icon: Loader2 },
      warning: { variant: "outline", icon: ShieldAlert },
    };
    const config = variants[status] ?? { variant: "outline", icon: null };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 text-xs">
        {Icon && <Icon className="h-3 w-3" />}
        {status}
      </Badge>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="font-semibold tracking-tight">CA School Data</span>
            <Badge variant="secondary" className="text-xs">Admin</Badge>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link href="/admin" className="text-foreground font-medium">Admin</Link>
          </div>
          <div className="flex items-center gap-3">
            {user?.profileImageUrl && (
              <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm hidden sm:block">{user?.firstName || user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => logout()} data-testid="button-logout-admin">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" data-testid="text-admin-title">Data Administration</h1>
          <p className="text-muted-foreground">Trigger CDE data ingestion and monitor progress.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <Card className="p-6" data-testid="card-admin-secret">
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Admin Authentication</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Enter your admin secret to enable the controls below. This is the <code>ADMIN_SECRET</code> environment variable set on the server.
              </p>
              <Input
                type="password"
                placeholder="Admin secret"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                data-testid="input-admin-secret"
                className="font-mono"
              />
              {adminSecret && statusQuery.isError && (
                <p className="text-xs text-destructive mt-2">
                  {(statusQuery.error as Error)?.message ?? "Authentication failed"}
                </p>
              )}
              {adminSecret && statusQuery.isSuccess && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Authenticated
                </p>
              )}
            </Card>

            <Card className="p-6" data-testid="card-ingest-trigger">
              <div className="flex items-center gap-2 mb-4">
                <Play className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Run Ingestion</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Fetches the latest data from CDE public files and replaces all existing school, district, county, and performance records.
              </p>
              <p className="text-xs text-muted-foreground mb-4 p-3 bg-muted rounded-md">
                This process takes 5–15 minutes. The database will have reduced data while the import runs. Polling for progress every 5 seconds.
              </p>
              {isRunning ? (
                <Button disabled className="w-full" data-testid="button-ingest-running">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Ingestion Running...
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => triggerMutation.mutate()}
                  disabled={!adminSecret || !statusQuery.isSuccess || triggerMutation.isPending}
                  data-testid="button-run-ingest"
                >
                  {triggerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Start Full Ingestion
                </Button>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="p-6" data-testid="card-ingest-logs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : (
                    <RefreshCw className="h-5 w-5 text-primary" />
                  )}
                  <h2 className="font-semibold">Ingestion Log</h2>
                  {isRunning && <Badge variant="outline" className="text-xs animate-pulse">Live</Badge>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckStatus}
                  disabled={!adminSecret || statusQuery.isFetching}
                  data-testid="button-refresh-logs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${statusQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {!adminSecret ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Enter your admin secret to view logs.
                </div>
              ) : statusQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : statusQuery.isError ? (
                <div className="text-center py-12 text-destructive text-sm">
                  <XCircle className="h-8 w-8 mx-auto mb-2 opacity-60" />
                  {(statusQuery.error as Error)?.message ?? "Failed to fetch logs"}
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No ingestion logs found.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[600px]">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-md border text-sm"
                      data-testid={`log-row-${log.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium truncate">{log.source}</span>
                        {statusBadge(log.status)}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
                        <span>Processed: <strong>{log.recordsProcessed.toLocaleString()}</strong></span>
                        {log.recordsFailed > 0 && (
                          <span className="text-destructive">Failed: <strong>{log.recordsFailed}</strong></span>
                        )}
                        <span>{new Date(log.startedAt).toLocaleString()}</span>
                        {log.completedAt && (
                          <span>→ {new Date(log.completedAt).toLocaleString()}</span>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-xs text-muted-foreground truncate" title={log.details}>
                          {log.details}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

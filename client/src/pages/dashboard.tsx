import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Key, Plus, Trash2, Copy, Activity, BarChart3, Clock,
  GraduationCap, LogOut, BookOpen, Code2, Eye, EyeOff
} from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "wouter";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const { data: keysData, isLoading: keysLoading } = useQuery<{ data: any[] }>({
    queryKey: ["/api/keys"],
  });

  const { data: usageData, isLoading: usageLoading } = useQuery<{ data: { totalRequests: number; endpoints: Record<string, number>; daily: { date: string; count: number }[] } }>({
    queryKey: ["/api/usage"],
  });

  const { data: statsData } = useQuery<{ data: { counties: number; districts: number; schools: number; indicators: number; dataPoints: number } }>({
    queryKey: ["/api/platform/stats"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/keys", { name });
      return res.json();
    },
    onSuccess: (data) => {
      setRevealedKey(data.key);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({ title: "API Key Created", description: "Copy your key now. It won't be shown again." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create API key", variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({ title: "API Key Deactivated" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const topEndpoints = usageData?.data?.endpoints
    ? Object.entries(usageData.data.endpoints)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="font-semibold tracking-tight">CA School Data</span>
            <Badge variant="secondary" className="text-xs">API</Badge>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/dashboard" className="text-foreground font-medium">Dashboard</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/explorer">Explorer</Link>
          </div>
          <div className="flex items-center gap-3">
            {user?.profileImageUrl && (
              <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" data-testid="img-avatar" />
            )}
            <span className="text-sm hidden sm:block" data-testid="text-username">{user?.firstName || user?.email}</span>
            <Button variant="outline" size="sm" onClick={() => logout()} data-testid="button-logout">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" data-testid="text-page-title">Developer Dashboard</h1>
          <p className="text-muted-foreground">Manage your API keys and monitor usage.</p>
        </div>

        {statsData?.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Schools", value: statsData.data.schools, icon: GraduationCap },
              { label: "Districts", value: statsData.data.districts, icon: BarChart3 },
              { label: "Data Points", value: statsData.data.dataPoints.toLocaleString(), icon: Activity },
              { label: "API Requests", value: usageData?.data?.totalRequests ?? 0, icon: Code2 },
            ].map((stat) => (
              <Card key={stat.label} className="p-4" data-testid={`card-stat-${stat.label.toLowerCase()}`}>
                <div className="flex items-center gap-3">
                  <stat.icon className="h-4 w-4 text-primary" />
                  <div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                    <div className="text-xl font-bold">{stat.value}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <Card className="p-6" data-testid="card-api-keys">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-lg">API Keys</h2>
                </div>
              </div>

              {revealedKey && (
                <div className="mb-4 p-4 rounded-md bg-chart-3/10 border border-chart-3/30">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-chart-3">New API Key Created</span>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(revealedKey)} data-testid="button-copy-key">
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                    </Button>
                  </div>
                  <code className="text-xs break-all block bg-background p-2 rounded" data-testid="text-new-key">{revealedKey}</code>
                  <p className="text-xs text-muted-foreground mt-2">Save this key securely. It will not be shown again.</p>
                </div>
              )}

              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Key name (e.g., my-app)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1"
                  data-testid="input-key-name"
                />
                <Button
                  onClick={() => newKeyName && createKeyMutation.mutate(newKeyName)}
                  disabled={!newKeyName || createKeyMutation.isPending}
                  data-testid="button-create-key"
                >
                  <Plus className="h-4 w-4 mr-1" /> Create
                </Button>
              </div>

              {keysLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : keysData?.data?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No API keys yet. Create one to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {keysData?.data?.map((key: any) => (
                    <div key={key.id} className="flex items-center justify-between gap-4 p-3 rounded-md border" data-testid={`api-key-${key.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{key.name}</span>
                          <Badge variant={key.isActive ? "secondary" : "destructive"} className="text-xs">
                            {key.isActive ? "Active" : "Revoked"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <code>{key.keyPrefix}...</code>
                          {key.lastUsedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {key.isActive && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteKeyMutation.mutate(key.id)}
                          data-testid={`button-revoke-key-${key.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6" data-testid="card-quick-start">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">Quick Start</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">cURL</h3>
                  <Card className="p-3 bg-card/80 font-mono text-xs">
                    <pre className="whitespace-pre-wrap">{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  ${window.location.origin}/api/v1/schools?search=Berkeley`}</pre>
                  </Card>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">JavaScript</h3>
                  <Card className="p-3 bg-card/80 font-mono text-xs">
                    <pre className="whitespace-pre-wrap">{`const res = await fetch("/api/v1/schools?search=Berkeley", {
  headers: { "Authorization": "Bearer YOUR_API_KEY" }
});
const { data } = await res.json();`}</pre>
                  </Card>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">Python</h3>
                  <Card className="p-3 bg-card/80 font-mono text-xs">
                    <pre className="whitespace-pre-wrap">{`import requests
res = requests.get(
    "${window.location.origin}/api/v1/schools",
    params={"search": "Berkeley"},
    headers={"Authorization": "Bearer YOUR_API_KEY"}
)
data = res.json()["data"]`}</pre>
                  </Card>
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6" data-testid="card-usage">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">API Usage</h2>
              </div>
              {usageLoading ? (
                <Skeleton className="h-40" />
              ) : usageData?.data?.daily && usageData.data.daily.length > 0 ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageData.data.daily}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} width={30} />
                      <Tooltip labelFormatter={(v) => `Date: ${v}`} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No usage data yet. Make API requests to see metrics.
                </div>
              )}
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground mb-1">Total Requests (30 days)</div>
                <div className="text-2xl font-bold" data-testid="text-total-requests">{usageData?.data?.totalRequests ?? 0}</div>
              </div>
            </Card>

            {topEndpoints.length > 0 && (
              <Card className="p-6" data-testid="card-top-endpoints">
                <h3 className="font-semibold mb-3">Top Endpoints</h3>
                <div className="space-y-2">
                  {topEndpoints.map(([endpoint, count]) => (
                    <div key={endpoint} className="flex items-center justify-between text-sm">
                      <code className="text-xs truncate max-w-[200px]">{endpoint}</code>
                      <Badge variant="secondary" className="text-xs">{count}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-6" data-testid="card-rate-limits">
              <h3 className="font-semibold mb-3">Rate Limits</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily limit</span>
                  <span className="font-medium">1,000 requests</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max page size</span>
                  <span className="font-medium">500 records</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate limit</span>
                  <span className="font-medium">10 req/sec</span>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-2">
              <Link href="/docs">
                <Button variant="outline" className="w-full justify-start" data-testid="button-go-docs">
                  <BookOpen className="h-4 w-4 mr-2" /> API Documentation
                </Button>
              </Link>
              <Link href="/explorer">
                <Button variant="outline" className="w-full justify-start" data-testid="button-go-explorer">
                  <Code2 className="h-4 w-4 mr-2" /> API Explorer
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

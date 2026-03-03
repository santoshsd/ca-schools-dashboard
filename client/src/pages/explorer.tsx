import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap, Play, Copy, Loader2, ChevronDown
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const predefinedQueries = [
  { label: "List all counties", endpoint: "/api/v1/counties", params: "limit=10" },
  { label: "Search schools by name", endpoint: "/api/v1/schools", params: "search=Berkeley&limit=5" },
  { label: "Get Los Angeles districts", endpoint: "/api/v1/districts", params: "county_id=4&limit=10" },
  { label: "Performance indicators", endpoint: "/api/v1/indicators", params: "" },
  { label: "Student demographic groups", endpoint: "/api/v1/student-groups", params: "" },
  { label: "Performance data (sample)", endpoint: "/api/v1/performance", params: "school_id=1&academic_year=2023-24&limit=5" },
  { label: "Platform overview stats", endpoint: "/api/v1/overview", params: "" },
];

export default function ExplorerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [endpoint, setEndpoint] = useState("/api/v1/counties");
  const [params, setParams] = useState("limit=10");
  const [apiKey, setApiKey] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  const executeQuery = async () => {
    if (!apiKey) {
      toast({ title: "API key required", description: "Enter your API key to make requests.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResponse(null);
    setStatusCode(null);

    const url = params ? `${endpoint}?${params}` : endpoint;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const elapsed = Date.now() - start;
      setResponseTime(elapsed);
      setStatusCode(res.status);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (e) {
      const elapsed = Date.now() - start;
      setResponseTime(elapsed);
      setStatusCode(0);
      setResponse(JSON.stringify({ error: "Network error" }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const selectPredefined = (idx: string) => {
    const query = predefinedQueries[parseInt(idx)];
    if (query) {
      setEndpoint(query.endpoint);
      setParams(query.params);
    }
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response);
      toast({ title: "Response copied" });
    }
  };

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
            {user ? <Link href="/dashboard">Dashboard</Link> : null}
            <Link href="/docs">Docs</Link>
            <Link href="/explorer" className="text-foreground font-medium">Explorer</Link>
          </div>
          <div>
            {user ? (
              <Link href="/dashboard">
                <Button variant="outline" size="sm">Dashboard</Button>
              </Link>
            ) : (
              <a href="/api/login">
                <Button size="sm">Get API Key</Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-serif mb-2" data-testid="text-explorer-title">API Explorer</h1>
          <p className="text-muted-foreground">
            Test API endpoints interactively. Enter your API key and select an endpoint to try.
          </p>
        </div>

        <div className="space-y-4">
          <Card className="p-4" data-testid="card-api-key-input">
            <label className="text-sm font-medium mb-2 block">API Key</label>
            <Input
              type="password"
              placeholder="csd_your_api_key_here..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-api-key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {user ? (
                <>Generate keys from your <Link href="/dashboard" className="text-primary underline">dashboard</Link>.</>
              ) : (
                <>Need a key? <a href="/api/login" className="text-primary underline">Sign up</a> to get one.</>
              )}
            </p>
          </Card>

          <Card className="p-4" data-testid="card-query-builder">
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm font-medium">Quick Examples</label>
              <Select onValueChange={selectPredefined}>
                <SelectTrigger className="w-64" data-testid="select-predefined">
                  <SelectValue placeholder="Choose a preset..." />
                </SelectTrigger>
                <SelectContent>
                  {predefinedQueries.map((q, i) => (
                    <SelectItem key={i} value={i.toString()} data-testid={`option-preset-${i}`}>{q.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Endpoint</label>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="font-mono text-xs shrink-0 h-9 flex items-center">GET</Badge>
                  <Input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    className="font-mono text-sm flex-1"
                    placeholder="/api/v1/..."
                    data-testid="input-endpoint"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Query Parameters</label>
                <Input
                  value={params}
                  onChange={(e) => setParams(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="key=value&key2=value2"
                  data-testid="input-params"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={executeQuery} disabled={loading} data-testid="button-execute">
                  {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                  Execute
                </Button>
                <span className="text-xs text-muted-foreground font-mono">
                  {params ? `${endpoint}?${params}` : endpoint}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-4" data-testid="card-response">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium">Response</h3>
                {statusCode !== null && (
                  <Badge variant={statusCode >= 200 && statusCode < 300 ? "secondary" : "destructive"} className="font-mono text-xs" data-testid="badge-status">
                    {statusCode}
                  </Badge>
                )}
                {responseTime !== null && (
                  <span className="text-xs text-muted-foreground" data-testid="text-response-time">{responseTime}ms</span>
                )}
              </div>
              {response && (
                <Button size="sm" variant="outline" onClick={copyResponse} data-testid="button-copy-response">
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : response ? (
              <pre className="text-xs font-mono bg-card/80 p-4 rounded-md border overflow-x-auto max-h-[500px] overflow-y-auto" data-testid="text-response">
                {response}
              </pre>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Play className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Execute a query to see the response here.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

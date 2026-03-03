import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, Code2, BarChart3, Key, Activity, Shield,
  ArrowRight, BookOpen, Zap, Globe, ChevronRight,
  GraduationCap, School, Building2, Users
} from "lucide-react";

export default function LandingPage() {
  const { data: stats } = useQuery<{ data: { counties: number; districts: number; schools: number; indicators: number; dataPoints: number } }>({
    queryKey: ["/api/platform/stats"],
  });

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            <span className="font-semibold text-lg tracking-tight">CA School Data</span>
            <Badge variant="secondary" className="ml-1 text-xs">API</Badge>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="transition-colors" data-testid="link-features">Features</a>
            <a href="#endpoints" className="transition-colors" data-testid="link-endpoints">Endpoints</a>
            <a href="#getting-started" className="transition-colors" data-testid="link-getting-started">Getting Started</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/api/login" data-testid="button-login">
              <Button variant="outline" size="sm">Log In</Button>
            </a>
            <a href="/api/login" data-testid="button-get-started">
              <Button size="sm">Get API Key <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
            </a>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge variant="secondary" className="mb-6" data-testid="badge-version">v1.0 Public Beta</Badge>
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight mb-6">
                California School<br />
                <span className="text-primary">Dashboard API</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                Access comprehensive K-12 education data for every school, district, and county in California. Build applications powered by real performance metrics, graduation rates, and accountability indicators.
              </p>
              <div className="flex flex-wrap gap-3 mb-8">
                <a href="/api/login" data-testid="button-hero-start">
                  <Button size="lg">
                    Start Building <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
                <a href="/docs" data-testid="button-hero-docs">
                  <Button variant="outline" size="lg">
                    <BookOpen className="mr-2 h-4 w-4" /> API Docs
                  </Button>
                </a>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Free forever</span>
                <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> 1,000 req/day</span>
                <span className="flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> No credit card</span>
              </div>
            </div>
            <div className="hidden lg:block">
              <Card className="bg-card/80 p-6 font-mono text-sm border-card-border">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-chart-2/60" />
                  <div className="w-3 h-3 rounded-full bg-chart-3/60" />
                  <span className="ml-2 text-xs">API Request</span>
                </div>
                <pre className="text-xs leading-relaxed overflow-x-auto">
{`GET /api/v1/schools?county_id=19&search=Hollywood
Authorization: Bearer csd_a1b2c3d4...

{
  "data": [
    {
      "id": 7,
      "code": "19-64733-0101",
      "name": "Hollywood High School",
      "city": "Los Angeles",
      "gradeSpan": "9-12",
      "type": "high"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 100,
    "offset": 0,
    "hasMore": false
  }
}`}
                </pre>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {stats?.data && (
        <section className="py-12 px-6 border-y bg-card/40">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              {[
                { icon: Building2, label: "Counties", value: stats.data.counties },
                { icon: School, label: "Districts", value: stats.data.districts },
                { icon: GraduationCap, label: "Schools", value: stats.data.schools },
                { icon: BarChart3, label: "Indicators", value: stats.data.indicators },
                { icon: Database, label: "Data Points", value: stats.data.dataPoints.toLocaleString() },
              ].map((stat) => (
                <div key={stat.label} className="text-center" data-testid={`stat-${stat.label.toLowerCase()}`}>
                  <stat.icon className="h-5 w-5 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-serif text-3xl font-bold mb-3">Built for Developers</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Everything you need to build education data applications on top of California's school performance data.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Code2, title: "RESTful API", desc: "Clean, versioned JSON API with filtering, pagination, and comprehensive query parameters." },
              { icon: Database, title: "Rich Data Model", desc: "Normalized schema modeling counties, districts, schools, indicators, and student demographics." },
              { icon: Key, title: "API Key Management", desc: "Generate and manage API keys with secure hashing. Track usage per key." },
              { icon: Activity, title: "Usage Metering", desc: "Monitor your API consumption with daily breakdowns and endpoint analytics." },
              { icon: Globe, title: "Auto Data Sync", desc: "Automated agents check for new data releases from the CA School Dashboard weekly." },
              { icon: Shield, title: "Free Access", desc: "1,000 requests per day with no credit card required. Build freely." },
            ].map((feature) => (
              <Card key={feature.title} className="p-6 hover-elevate" data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s/g, '-')}`}>
                <feature.icon className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold mb-1.5">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="endpoints" className="py-20 px-6 bg-card/40 border-y">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-serif text-3xl font-bold mb-3">API Endpoints</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Comprehensive endpoints to access all California school accountability data.
            </p>
          </div>
          <div className="max-w-3xl mx-auto space-y-3">
            {[
              { method: "GET", path: "/api/v1/counties", desc: "List all California counties" },
              { method: "GET", path: "/api/v1/counties/:code", desc: "Get county by CDS code" },
              { method: "GET", path: "/api/v1/districts", desc: "List districts with filtering" },
              { method: "GET", path: "/api/v1/districts/:code", desc: "Get district by CDS code" },
              { method: "GET", path: "/api/v1/schools", desc: "Search and filter schools" },
              { method: "GET", path: "/api/v1/schools/:code", desc: "Get school details by CDS code" },
              { method: "GET", path: "/api/v1/indicators", desc: "List all performance indicators" },
              { method: "GET", path: "/api/v1/student-groups", desc: "List student demographic groups" },
              { method: "GET", path: "/api/v1/performance", desc: "Query performance metrics with filters" },
              { method: "GET", path: "/api/v1/overview", desc: "Platform-wide data statistics" },
            ].map((endpoint) => (
              <div key={endpoint.path} className="flex items-center gap-4 p-4 rounded-md bg-background border" data-testid={`endpoint-${endpoint.path.replace(/[/:]/g, '-')}`}>
                <Badge variant="secondary" className="font-mono text-xs shrink-0 w-12 justify-center">{endpoint.method}</Badge>
                <code className="text-sm font-mono text-primary shrink-0">{endpoint.path}</code>
                <span className="text-sm text-muted-foreground ml-auto hidden sm:block">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="getting-started" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-serif text-3xl font-bold mb-3">Get Started in Minutes</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Three simple steps to start building with California education data.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Create Account", desc: "Sign up with your existing account. No credit card required.", code: "Click 'Get API Key' above" },
              { step: "2", title: "Generate API Key", desc: "Create a personal API key from your developer dashboard.", code: 'POST /api/keys\n{ "name": "my-app" }' },
              { step: "3", title: "Make Requests", desc: "Start querying schools, districts, and performance data.", code: 'curl -H "Authorization: Bearer csd_..." \\\n  /api/v1/schools?search=Berkeley' },
            ].map((item) => (
              <div key={item.step} className="text-center" data-testid={`step-${item.step}`}>
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{item.desc}</p>
                <Card className="p-3 text-left font-mono text-xs bg-card/80">
                  <pre className="whitespace-pre-wrap">{item.code}</pre>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-3xl font-bold mb-4">Ready to Build?</h2>
          <p className="text-primary-foreground/80 mb-8 text-lg">
            Join developers building the next generation of education technology with California's school data.
          </p>
          <a href="/api/login" data-testid="button-cta-final">
            <Button variant="secondary" size="lg">
              Get Your Free API Key <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </a>
        </div>
      </section>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            <span>CA School Dashboard API</span>
          </div>
          <div>Data sourced from the California Department of Education</div>
        </div>
      </footer>
    </div>
  );
}

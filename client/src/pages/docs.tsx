import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GraduationCap, ArrowLeft, BookOpen, Code2, Database,
  Key, Activity, Globe, ChevronRight, Copy
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const endpoints = [
  {
    id: "auth",
    title: "Authentication",
    items: [
      {
        method: "GET",
        path: "/api/v1/*",
        desc: "All API endpoints require authentication via API key.",
        params: [],
        headers: [{ name: "Authorization", desc: "Bearer YOUR_API_KEY", required: true }],
        queryParams: [],
        response: null,
      },
    ],
  },
  {
    id: "counties",
    title: "Counties",
    items: [
      {
        method: "GET",
        path: "/api/v1/counties",
        desc: "List all California counties in the system.",
        queryParams: [
          { name: "limit", desc: "Max records to return (default: 100, max: 500)", required: false },
          { name: "offset", desc: "Number of records to skip (default: 0)", required: false },
        ],
        response: `{
  "data": [
    { "id": 1, "code": "01", "name": "Alameda", "type": "county" }
  ],
  "pagination": { "total": 58, "limit": 100, "offset": 0, "hasMore": false }
}`,
      },
      {
        method: "GET",
        path: "/api/v1/counties/:code",
        desc: "Get a specific county by its CDS code.",
        pathParams: [{ name: "code", desc: "County CDS code (e.g., '01' for Alameda)" }],
        response: `{
  "data": { "id": 1, "code": "01", "name": "Alameda", "type": "county" }
}`,
      },
    ],
  },
  {
    id: "districts",
    title: "Districts",
    items: [
      {
        method: "GET",
        path: "/api/v1/districts",
        desc: "List school districts with optional filtering.",
        queryParams: [
          { name: "county_id", desc: "Filter by county ID", required: false },
          { name: "search", desc: "Search by district name (case-insensitive)", required: false },
          { name: "limit", desc: "Max records (default: 100, max: 500)", required: false },
          { name: "offset", desc: "Records to skip (default: 0)", required: false },
        ],
        response: `{
  "data": [
    { "id": 1, "code": "01-61259", "name": "Oakland Unified", "countyId": 1, "type": "unified" }
  ],
  "pagination": { "total": 1, "limit": 100, "offset": 0, "hasMore": false }
}`,
      },
      {
        method: "GET",
        path: "/api/v1/districts/:code",
        desc: "Get a specific district by CDS code.",
        pathParams: [{ name: "code", desc: "District CDS code (e.g., '01-61259')" }],
        response: `{
  "data": { "id": 1, "code": "01-61259", "name": "Oakland Unified", "countyId": 1, "type": "unified" }
}`,
      },
    ],
  },
  {
    id: "schools",
    title: "Schools",
    items: [
      {
        method: "GET",
        path: "/api/v1/schools",
        desc: "Search and filter schools.",
        queryParams: [
          { name: "district_id", desc: "Filter by district ID", required: false },
          { name: "county_id", desc: "Filter by county ID", required: false },
          { name: "search", desc: "Search by school name (case-insensitive)", required: false },
          { name: "limit", desc: "Max records (default: 100, max: 500)", required: false },
          { name: "offset", desc: "Records to skip (default: 0)", required: false },
        ],
        response: `{
  "data": [
    {
      "id": 1, "code": "01-61259-0100", "name": "Oakland High School",
      "districtId": 1, "countyId": 1, "type": "high",
      "gradeSpan": "9-12", "city": "Oakland", "state": "CA", "zip": "94601"
    }
  ],
  "pagination": { "total": 1, "limit": 100, "offset": 0, "hasMore": false }
}`,
      },
    ],
  },
  {
    id: "indicators",
    title: "Indicators",
    items: [
      {
        method: "GET",
        path: "/api/v1/indicators",
        desc: "List all performance indicator types.",
        response: `{
  "data": [
    { "id": 1, "code": "ela", "name": "English Language Arts",
      "description": "Measures student performance on the Smarter Balanced ELA assessment",
      "category": "Academic" }
  ]
}`,
      },
    ],
  },
  {
    id: "student-groups",
    title: "Student Groups",
    items: [
      {
        method: "GET",
        path: "/api/v1/student-groups",
        desc: "List all student demographic groups.",
        response: `{
  "data": [
    { "id": 1, "code": "all", "name": "All Students", "category": "All" },
    { "id": 6, "code": "hi", "name": "Hispanic", "category": "Race/Ethnicity" }
  ]
}`,
      },
    ],
  },
  {
    id: "performance",
    title: "Performance Data",
    items: [
      {
        method: "GET",
        path: "/api/v1/performance",
        desc: "Query performance metrics with comprehensive filtering. This is the main data endpoint.",
        queryParams: [
          { name: "school_id", desc: "Filter by school ID", required: false },
          { name: "district_id", desc: "Filter by district ID", required: false },
          { name: "county_id", desc: "Filter by county ID", required: false },
          { name: "indicator_id", desc: "Filter by indicator ID", required: false },
          { name: "student_group_id", desc: "Filter by student group ID", required: false },
          { name: "academic_year", desc: "Filter by academic year (e.g., '2023-24')", required: false },
          { name: "limit", desc: "Max records (default: 100, max: 500)", required: false },
          { name: "offset", desc: "Records to skip (default: 0)", required: false },
        ],
        response: `{
  "data": [
    {
      "id": 1, "schoolId": 1, "districtId": 1, "countyId": 1,
      "indicatorId": 1, "studentGroupId": 1,
      "academicYear": "2023-24", "value": 12.5,
      "statusLevel": 4, "statusText": "High",
      "changeLevel": 5, "changeText": "Increased Significantly",
      "color": "green", "enrollmentCount": 1500,
      "denominatorCount": 1200, "numeratorCount": 900,
      "reportingLevel": "school"
    }
  ],
  "pagination": { "total": 1, "limit": 100, "offset": 0, "hasMore": false }
}`,
      },
    ],
  },
  {
    id: "overview",
    title: "Overview",
    items: [
      {
        method: "GET",
        path: "/api/v1/overview",
        desc: "Get platform-wide data statistics.",
        response: `{
  "data": {
    "counties": 58, "districts": 1042, "schools": 10393,
    "indicators": 7, "dataPoints": 2450000
  }
}`,
      },
    ],
  },
];

export default function DocsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("auth");

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
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
            <Link href="/docs" className="text-foreground font-medium">Docs</Link>
            <Link href="/explorer">Explorer</Link>
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

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-24">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">API Reference</h3>
              <nav className="space-y-1">
                {endpoints.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
                      activeSection === section.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                    }`}
                    data-testid={`nav-section-${section.id}`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="mb-8">
              <h1 className="text-3xl font-bold font-serif mb-2" data-testid="text-docs-title">API Documentation</h1>
              <p className="text-muted-foreground">
                Complete reference for the California School Dashboard API. All endpoints return JSON and require API key authentication.
              </p>
            </div>

            <Card className="p-6 mb-8 bg-primary/5 border-primary/20">
              <h2 className="font-semibold mb-2">Base URL</h2>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-background px-3 py-1.5 rounded border flex-1">{window.location.origin}</code>
                <Button size="icon" variant="outline" onClick={() => copyCode(window.location.origin)} data-testid="button-copy-base-url">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>

            <div className="space-y-12">
              {endpoints.map((section) => (
                <section key={section.id} id={section.id}>
                  <h2 className="text-xl font-bold mb-4 pb-2 border-b">{section.title}</h2>
                  <div className="space-y-6">
                    {section.items.map((endpoint, idx) => (
                      <Card key={idx} className="overflow-visible" data-testid={`doc-endpoint-${section.id}-${idx}`}>
                        <div className="p-4 border-b">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant="secondary" className="font-mono text-xs">{endpoint.method}</Badge>
                            <code className="text-sm font-mono text-primary">{endpoint.path}</code>
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">{endpoint.desc}</p>
                        </div>

                        <div className="p-4 space-y-4">
                          {"headers" in endpoint && endpoint.headers && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Headers</h4>
                              <div className="space-y-1">
                                {endpoint.headers.map((h: any) => (
                                  <div key={h.name} className="flex items-start gap-2 text-sm">
                                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{h.name}</code>
                                    <span className="text-muted-foreground">{h.desc}</span>
                                    {h.required && <Badge variant="destructive" className="text-[10px] shrink-0">Required</Badge>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {"pathParams" in endpoint && endpoint.pathParams && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Path Parameters</h4>
                              <div className="space-y-1">
                                {endpoint.pathParams.map((p: any) => (
                                  <div key={p.name} className="flex items-start gap-2 text-sm">
                                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                                    <span className="text-muted-foreground">{p.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {endpoint.queryParams && endpoint.queryParams.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Query Parameters</h4>
                              <div className="space-y-1">
                                {endpoint.queryParams.map((p: any) => (
                                  <div key={p.name} className="flex items-start gap-2 text-sm">
                                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                                    <span className="text-muted-foreground">{p.desc}</span>
                                    {p.required && <Badge variant="destructive" className="text-[10px] shrink-0">Required</Badge>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {endpoint.response && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Response</h4>
                              <Card className="p-3 bg-card/80">
                                <pre className="text-xs font-mono overflow-x-auto whitespace-pre">{endpoint.response}</pre>
                              </Card>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="mt-12" id="errors">
              <h2 className="text-xl font-bold mb-4 pb-2 border-b">Error Handling</h2>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground mb-4">All error responses follow a consistent format:</p>
                <Card className="p-3 bg-card/80 mb-4">
                  <pre className="text-xs font-mono">{`{
  "error": "Human-readable error message"
}`}</pre>
                </Card>
                <div className="space-y-2 text-sm">
                  {[
                    { code: "400", desc: "Bad Request - Invalid query parameters" },
                    { code: "401", desc: "Unauthorized - Missing or invalid API key" },
                    { code: "404", desc: "Not Found - Resource does not exist" },
                    { code: "429", desc: "Rate Limited - Too many requests" },
                    { code: "500", desc: "Internal Error - Server-side error" },
                  ].map((err) => (
                    <div key={err.code} className="flex items-center gap-3">
                      <Badge variant={err.code === "401" || err.code === "429" ? "destructive" : "secondary"} className="font-mono text-xs w-12 justify-center">{err.code}</Badge>
                      <span className="text-muted-foreground">{err.desc}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

// Skill dictionary for rule-based matching (no AI). Canonical name → aliases.
// Aliases are matched case-insensitively on word boundaries, except entries marked `cs` (case-sensitive),
// which exist for short/ambiguous words like "Go" or "REST".

type Skill = { name: string; aliases: string[]; cs?: string[] };

const SKILLS: Skill[] = [
  // Languages
  { name: "Python", aliases: ["python"] },
  { name: "Java", aliases: ["java"] },
  { name: "JavaScript", aliases: ["javascript", "ecmascript", "es6"] },
  { name: "TypeScript", aliases: ["typescript"] },
  { name: "Go", aliases: ["golang"], cs: ["Go"] },
  { name: "Rust", aliases: ["rust"] },
  { name: "C++", aliases: ["c++", "cpp"] },
  { name: "C#", aliases: ["c#", "csharp"] },
  { name: "Ruby", aliases: ["ruby"] },
  { name: "PHP", aliases: ["php"] },
  { name: "Kotlin", aliases: ["kotlin"] },
  { name: "Swift", aliases: ["swift"] },
  { name: "Scala", aliases: ["scala"] },
  { name: "Elixir", aliases: ["elixir"] },
  { name: "Dart", aliases: ["dart"] },
  { name: "SQL", aliases: ["sql"] },
  { name: "Bash", aliases: ["bash", "shell scripting"] },
  { name: "R", aliases: ["rstudio", "r programming"], cs: ["R/Python", "Python/R"] },
  { name: "MATLAB", aliases: ["matlab"] },
  { name: "Solidity", aliases: ["solidity"] },
  // Frontend
  { name: "React", aliases: ["react", "reactjs", "react.js"] },
  { name: "Next.js", aliases: ["next.js", "nextjs"] },
  { name: "Vue", aliases: ["vue", "vue.js", "vuejs"] },
  { name: "Angular", aliases: ["angular", "angularjs"] },
  { name: "Svelte", aliases: ["svelte", "sveltekit"] },
  { name: "Redux", aliases: ["redux"] },
  { name: "HTML", aliases: ["html", "html5"] },
  { name: "CSS", aliases: ["css", "css3"] },
  { name: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"] },
  { name: "Sass", aliases: ["sass", "scss"] },
  { name: "Webpack", aliases: ["webpack"] },
  { name: "Vite", aliases: ["vite"] },
  // Backend frameworks
  { name: "Node.js", aliases: ["node.js", "nodejs", "node js"] },
  { name: "Express", aliases: ["express.js", "expressjs"] },
  { name: "NestJS", aliases: ["nestjs", "nest.js"] },
  { name: "Django", aliases: ["django"] },
  { name: "Flask", aliases: ["flask"] },
  { name: "FastAPI", aliases: ["fastapi"] },
  { name: "Spring Boot", aliases: ["spring boot", "springboot", "spring framework", "spring mvc"] },
  { name: "Ruby on Rails", aliases: ["rails", "ruby on rails"] },
  { name: "Laravel", aliases: ["laravel"] },
  { name: ".NET", aliases: [".net", "asp.net", "dotnet", ".net core"] },
  { name: "GraphQL", aliases: ["graphql"] },
  { name: "gRPC", aliases: ["grpc"] },
  { name: "REST APIs", aliases: ["restful", "rest api", "rest apis"], cs: ["REST"] },
  { name: "Microservices", aliases: ["microservices", "microservice", "service-oriented architecture"] },
  { name: "WebSockets", aliases: ["websocket", "websockets"] },
  // Data stores & messaging
  { name: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { name: "MySQL", aliases: ["mysql"] },
  { name: "MongoDB", aliases: ["mongodb", "mongo"] },
  { name: "Redis", aliases: ["redis"] },
  { name: "Elasticsearch", aliases: ["elasticsearch", "opensearch", "elk"] },
  { name: "Cassandra", aliases: ["cassandra"] },
  { name: "DynamoDB", aliases: ["dynamodb"] },
  { name: "SQLite", aliases: ["sqlite"] },
  { name: "Kafka", aliases: ["kafka"] },
  { name: "RabbitMQ", aliases: ["rabbitmq"] },
  { name: "Snowflake", aliases: ["snowflake"] },
  { name: "BigQuery", aliases: ["bigquery"] },
  { name: "ClickHouse", aliases: ["clickhouse"] },
  // Cloud & DevOps
  { name: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"] },
  { name: "GCP", aliases: ["gcp", "google cloud"] },
  { name: "Azure", aliases: ["azure"] },
  { name: "Docker", aliases: ["docker", "containers", "containerization"] },
  { name: "Kubernetes", aliases: ["kubernetes", "k8s", "eks", "gke"] },
  { name: "Terraform", aliases: ["terraform"] },
  { name: "Ansible", aliases: ["ansible"] },
  { name: "Jenkins", aliases: ["jenkins"] },
  { name: "GitHub Actions", aliases: ["github actions"] },
  { name: "CI/CD", aliases: ["ci/cd", "continuous integration", "continuous delivery", "continuous deployment"] },
  { name: "Linux", aliases: ["linux", "unix"] },
  { name: "Git", aliases: ["git"] },
  { name: "Prometheus", aliases: ["prometheus"] },
  { name: "Grafana", aliases: ["grafana"] },
  { name: "Datadog", aliases: ["datadog"] },
  { name: "Observability", aliases: ["observability", "monitoring and alerting", "opentelemetry"] },
  { name: "Serverless", aliases: ["serverless"] },
  { name: "Nginx", aliases: ["nginx"] },
  // Mobile
  { name: "Android", aliases: ["android"] },
  { name: "iOS", aliases: ["ios"] },
  { name: "React Native", aliases: ["react native"] },
  { name: "Flutter", aliases: ["flutter"] },
  { name: "SwiftUI", aliases: ["swiftui"] },
  { name: "Firebase", aliases: ["firebase"] },
  // Data / ML
  { name: "Machine Learning", aliases: ["machine learning"], cs: ["ML"] },
  { name: "Deep Learning", aliases: ["deep learning", "neural networks"] },
  { name: "NLP", aliases: ["nlp", "natural language processing"] },
  { name: "Computer Vision", aliases: ["computer vision", "opencv"] },
  { name: "LLMs", aliases: ["llm", "llms", "large language models", "generative ai", "genai", "rag", "prompt engineering"] },
  { name: "PyTorch", aliases: ["pytorch"] },
  { name: "TensorFlow", aliases: ["tensorflow", "keras"] },
  { name: "scikit-learn", aliases: ["scikit-learn", "sklearn"] },
  { name: "Pandas", aliases: ["pandas"] },
  { name: "NumPy", aliases: ["numpy"] },
  { name: "Spark", aliases: ["spark", "pyspark", "apache spark"] },
  { name: "Hadoop", aliases: ["hadoop", "hive"] },
  { name: "Airflow", aliases: ["airflow"] },
  { name: "dbt", aliases: ["dbt"] },
  { name: "ETL", aliases: ["etl", "elt", "data pipelines", "data pipeline"] },
  { name: "Data Warehousing", aliases: ["data warehouse", "data warehousing", "data modeling", "data modelling"] },
  { name: "Statistics", aliases: ["statistics", "statistical analysis", "a/b testing", "hypothesis testing"] },
  { name: "Tableau", aliases: ["tableau"] },
  { name: "Power BI", aliases: ["power bi", "powerbi"] },
  { name: "Looker", aliases: ["looker"] },
  { name: "Excel", aliases: ["excel", "spreadsheets", "google sheets"] },
  // Engineering practice
  { name: "System Design", aliases: ["system design", "systems design", "software architecture", "scalable systems"] },
  { name: "Distributed Systems", aliases: ["distributed systems", "distributed computing"] },
  { name: "Data Structures & Algorithms", aliases: ["data structures", "algorithms", "dsa"] },
  { name: "Object-Oriented Design", aliases: ["object-oriented", "object oriented", "oop", "design patterns"] },
  { name: "Testing", aliases: ["unit testing", "integration testing", "test automation", "tdd", "jest", "pytest", "junit", "cypress", "selenium", "playwright"] },
  { name: "Security", aliases: ["application security", "appsec", "owasp", "penetration testing", "cybersecurity", "iam"] },
  { name: "OAuth", aliases: ["oauth", "oauth2", "openid connect", "sso", "saml"] },
  { name: "Performance Optimization", aliases: ["performance optimization", "performance tuning", "latency", "profiling"] },
  { name: "Agile", aliases: ["agile", "scrum", "kanban", "sprint"] },
  { name: "Jira", aliases: ["jira", "confluence"] },
  // Design / product / business
  { name: "Figma", aliases: ["figma"] },
  { name: "UX Design", aliases: ["ux", "user experience", "user research", "wireframing", "prototyping"] },
  { name: "Product Management", aliases: ["product management", "product roadmap", "roadmapping", "prds"] },
  { name: "Stakeholder Management", aliases: ["stakeholder management", "cross-functional"] },
  { name: "Salesforce", aliases: ["salesforce"] },
  { name: "HubSpot", aliases: ["hubspot"] },
  { name: "SEO", aliases: ["seo", "search engine optimization"] },
  { name: "Google Analytics", aliases: ["google analytics", "ga4"] },
  { name: "Financial Modeling", aliases: ["financial modeling", "financial modelling", "valuation"] },
  { name: "SAP", aliases: ["sap"] },
  { name: "Tally", aliases: ["tally"] },
];

const BOUNDARY_BEFORE = "(?<![a-z0-9+#])";
const BOUNDARY_AFTER = "(?![a-z0-9+#])";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

type Matcher = { name: string; ci?: RegExp; cs?: RegExp };

const MATCHERS: Matcher[] = SKILLS.map((s) => ({
  name: s.name,
  ci: s.aliases.length
    ? new RegExp(`${BOUNDARY_BEFORE}(?:${s.aliases.map(esc).join("|")})${BOUNDARY_AFTER}`, "i")
    : undefined,
  cs: s.cs?.length ? new RegExp(`(?<![A-Za-z0-9+#])(?:${s.cs.map(esc).join("|")})(?![A-Za-z0-9+#])`) : undefined,
}));

/** Returns canonical skill names mentioned in the text, in dictionary order. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const m of MATCHERS) {
    if (m.ci?.test(text) || m.cs?.test(text)) found.push(m.name);
  }
  return found;
}

export type MatchResult = { score: number; matched: string[]; missing: string[] } | null;

/** % of the job's skills that the candidate has. Null when the job lists too few recognisable skills. */
export function matchSkills(jobSkills: string[], candidate: Set<string>): MatchResult {
  if (jobSkills.length < 3) return null;
  const matched = jobSkills.filter((s) => candidate.has(s));
  const missing = jobSkills.filter((s) => !candidate.has(s));
  return { score: Math.round((matched.length / jobSkills.length) * 100), matched, missing };
}

/**
 * Ranking key for "best match" sorting. Shrinks scores of jobs that mention few skills toward 0,
 * so 3/4 (0.43) ranks below 6/10 (0.46) and 8/10 (0.62). Display still uses the plain percentage.
 */
export function matchRank(m: MatchResult): number {
  if (!m) return -1;
  const total = m.matched.length + m.missing.length;
  return m.matched.length / (total + 3);
}

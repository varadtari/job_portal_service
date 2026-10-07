// Rule-based "is this an IT / software role?" check on job titles.

const IT = new RegExp(
  [
    "software", "developer", "programmer", "\\bsde\\b", "\\bswe\\b", "\\bsdet\\b", "full[- ]?stack", "front[- ]?end", "back[- ]?end",
    "web", "mobile", "android", "ios\\b", "devops", "\\bsre\\b", "site reliability", "platform", "infrastructure", "cloud",
    "\\bdata\\b", "machine learning", "\\bml\\b", "\\bai\\b", "deep learning", "\\bnlp\\b", "computer vision", "\\bllm", "research (engineer|scientist)",
    "applied scientist", "analytics engineer", "\\bbi\\b", "business intelligence", "database", "\\bdba\\b", "\\bqa\\b", "quality assurance", "\\btest",
    "automation engineer", "security", "cyber", "\\bsoc\\b", "penetration", "network", "systems? (engineer|administrator|admin)", "sysadmin",
    "\\bit\\b", "information technology", "technical support", "support engineer", "help ?desk", "desktop support", "solutions? architect",
    "architect", "engineering manager", "tech(nical)? lead", "\\bcto\\b", "embedded", "firmware", "game (developer|engineer)", "blockchain", "smart contract",
    "salesforce (developer|admin)", "sap (consultant|developer|abap)", "\\berp\\b", "\\bcrm\\b developer", "ui ?/ ?ux", "\\bux\\b", "\\bui\\b", "product designer",
    "technical program manager", "\\btpm\\b", "product manager", "scrum master", "release engineer", "build engineer", "integration engineer", "api",
  ].join("|"),
  "i",
);

// Titles that contain IT words but aren't IT roles (or are sales/business roles)
const NOT_IT = new RegExp(
  [
    "\\bsales\\b", "account (executive|manager|director)", "business development", "\\bbdr\\b", "\\bsdr\\b", "marketing", "recruit", "talent",
    "\\bhr\\b", "people (partner|ops|operations)", "finance", "accountant", "accounting", "legal", "counsel", "paralegal", "payroll", "tax",
    "mechanical", "civil", "chemical", "electrical(?! and computer)", "manufacturing", "hardware design", "facilities", "warehouse", "driver",
    "customer success", "customer support (?!engineer)", "partner manager", "communications", "public relations", "content writer", "copywriter",
    "executive assistant", "office manager", "procurement", "supply chain", "logistics", "medical", "nurse", "clinical", "physician",
  ].join("|"),
  "i",
);

export function isITRole(title: string): boolean {
  return IT.test(title) && !NOT_IT.test(title);
}

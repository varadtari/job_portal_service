// Location → country detection and the regions offered in the Jobs location filter. Rule-based.

type CountryDef = { code: string; name: string; patterns: RegExp };

const C = (code: string, name: string, words: string[]): CountryDef => ({
  code,
  name,
  patterns: new RegExp(`(^|[^a-z])(${words.join("|")})([^a-z]|$)`, "i"),
});

// Order matters only for ambiguous names; more specific countries come before generic words.
export const COUNTRIES: CountryDef[] = [
  C("IN", "India", ["india", "ind", "bengaluru", "bangalore", "pune", "mumbai", "bombay", "hyderabad", "chennai", "madras", "delhi", "new delhi", "ncr", "gurgaon", "gurugram", "noida", "kolkata", "calcutta", "ahmedabad", "jaipur", "kochi", "cochin", "chandigarh", "indore", "coimbatore", "nagpur", "goa", "thiruvananthapuram", "trivandrum", "bhubaneswar", "vadodara", "surat", "lucknow", "mysore", "mysuru", "karnataka", "maharashtra", "telangana", "tamil nadu", "kerala", "haryana", "uttar pradesh", "west bengal", "gujarat"]),
  C("US", "United States", ["usa", "u\\.s\\.a?\\.?", "us", "united states", "america", "san francisco", "sf bay area", "bay area", "new york", "nyc", "seattle", "austin", "boston", "chicago", "los angeles", "denver", "atlanta", "dallas", "houston", "san jose", "palo alto", "mountain view", "sunnyvale", "redmond", "washington dc", "miami", "portland", "philadelphia", "pittsburgh", "raleigh", "salt lake city", "phoenix", "san diego", "minneapolis", "nashville", "california", "texas", "washington", "massachusetts", "colorado", "illinois", "georgia", "florida", "virginia", "oregon", "north carolina", "new jersey", "utah", "arizona", "ca", "ny", "wa", "tx", "ma", "co", "il", "ga", "fl", "va", "nc", "nj", "or", "ut", "az"]),
  C("CA", "Canada", ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary", "waterloo", "ontario", "british columbia", "quebec", "alberta"]),
  C("GB", "United Kingdom", ["uk", "u\\.k\\.", "united kingdom", "england", "scotland", "wales", "london", "manchester", "edinburgh", "cambridge", "oxford", "bristol", "belfast", "leeds", "glasgow"]),
  C("IE", "Ireland", ["ireland", "dublin", "cork"]),
  C("DE", "Germany", ["germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart"]),
  C("NL", "Netherlands", ["netherlands", "amsterdam", "rotterdam", "utrecht", "eindhoven", "the hague"]),
  C("FR", "France", ["france", "paris", "lyon"]),
  C("ES", "Spain", ["spain", "madrid", "barcelona"]),
  C("PT", "Portugal", ["portugal", "lisbon", "porto"]),
  C("PL", "Poland", ["poland", "warsaw", "krakow", "kraków", "wroclaw", "wrocław"]),
  C("SE", "Sweden", ["sweden", "stockholm"]),
  C("CH", "Switzerland", ["switzerland", "zurich", "zürich", "geneva"]),
  C("IT", "Italy", ["italy", "milan", "rome"]),
  C("RO", "Romania", ["romania", "bucharest"]),
  C("AE", "United Arab Emirates", ["uae", "united arab emirates", "dubai", "abu dhabi"]),
  C("SA", "Saudi Arabia", ["saudi arabia", "riyadh", "jeddah"]),
  C("IL", "Israel", ["israel", "tel aviv"]),
  C("SG", "Singapore", ["singapore"]),
  C("JP", "Japan", ["japan", "tokyo", "osaka"]),
  C("KR", "South Korea", ["south korea", "korea", "seoul"]),
  C("CN", "China", ["china", "beijing", "shanghai", "shenzhen"]),
  C("HK", "Hong Kong", ["hong kong"]),
  C("MY", "Malaysia", ["malaysia", "kuala lumpur"]),
  C("ID", "Indonesia", ["indonesia", "jakarta"]),
  C("PH", "Philippines", ["philippines", "manila"]),
  C("VN", "Vietnam", ["vietnam", "ho chi minh", "hanoi"]),
  C("AU", "Australia", ["australia", "sydney", "melbourne", "brisbane", "perth"]),
  C("NZ", "New Zealand", ["new zealand", "auckland", "wellington"]),
  C("BR", "Brazil", ["brazil", "brasil", "são paulo", "sao paulo"]),
  C("MX", "Mexico", ["mexico", "méxico", "mexico city"]),
  C("AR", "Argentina", ["argentina", "buenos aires"]),
  C("ZA", "South Africa", ["south africa", "cape town", "johannesburg"]),
];

const EUROPE = new Set(["GB", "IE", "DE", "NL", "FR", "ES", "PT", "PL", "SE", "CH", "IT", "RO"]);
const APAC = new Set(["IN", "SG", "JP", "KR", "CN", "HK", "MY", "ID", "PH", "VN", "AU", "NZ"]);
const MIDDLE_EAST = new Set(["AE", "SA", "IL"]);

/**
 * ISO country code for a job location, or null when it's unknown / multi-country / remote-anywhere.
 * Multi-location strings ("Bengaluru / London") take the first recognisable place.
 */
export function detectCountry(location: string | null | undefined): string | null {
  if (!location) return null;
  for (const part of location.split(/\s*(?:\/|;|\||\bor\b)\s*/i)) {
    // US state abbreviations only count after a comma ("Austin, TX"), never on their own
    const p = part.replace(/^\s*remote\s*[-–(:,]?\s*/i, "");
    for (const c of COUNTRIES) {
      if (c.code === "US") {
        const strong = /(usa|u\.s\.a?\.?|united states|america|san francisco|bay area|new york|nyc|seattle|austin|boston|chicago|los angeles|denver|atlanta|dallas|houston|san jose|palo alto|mountain view|sunnyvale|redmond|washington dc|miami|portland|philadelphia|pittsburgh|raleigh|salt lake city|phoenix|san diego|minneapolis|nashville|california|texas|massachusetts|colorado|illinois|florida|virginia|oregon|north carolina|new jersey|utah|arizona)/i;
        if (strong.test(p) || /,\s*(CA|NY|WA|TX|MA|CO|IL|GA|FL|VA|NC|NJ|OR|UT|AZ)\b/.test(part) || /(^|[^a-z])US([^a-z]|$)/.test(part)) return "US";
        continue;
      }
      if (c.patterns.test(p)) return c.code;
    }
  }
  return null;
}

export const COUNTRY_NAME: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));

export type RegionKey = "anywhere" | "remote" | "india" | "us" | "canada" | "uk" | "europe" | "germany" | "netherlands" | "middle-east" | "singapore" | "apac" | "australia";

export const REGIONS: { key: RegionKey; label: string; countries?: string[]; remoteOnly?: boolean }[] = [
  { key: "anywhere", label: "Anywhere" },
  { key: "remote", label: "Remote", remoteOnly: true },
  { key: "india", label: "India", countries: ["IN"] },
  { key: "us", label: "United States", countries: ["US"] },
  { key: "canada", label: "Canada", countries: ["CA"] },
  { key: "uk", label: "UK & Ireland", countries: ["GB", "IE"] },
  { key: "europe", label: "Europe", countries: [...EUROPE] },
  { key: "germany", label: "Germany", countries: ["DE"] },
  { key: "netherlands", label: "Netherlands", countries: ["NL"] },
  { key: "middle-east", label: "Middle East", countries: [...MIDDLE_EAST] },
  { key: "singapore", label: "Singapore", countries: ["SG"] },
  { key: "apac", label: "Asia-Pacific", countries: [...APAC] },
  { key: "australia", label: "Australia & NZ", countries: ["AU", "NZ"] },
];

export const regionByKey = (key: string | undefined) => REGIONS.find((r) => r.key === key);

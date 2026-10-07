const INDIA = /india|bengaluru|bangalore|pune|mumbai|hyderabad|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore|coimbatore/i;
const UK = /united kingdom|\buk\b|london|manchester|edinburgh/i;

/** ISO country code guessed from a location string (aggregators need one). Defaults to India. */
export function countryFor(location: string | null | undefined): "in" | "gb" | "us" {
  if (!location || INDIA.test(location)) return "in";
  if (UK.test(location)) return "gb";
  return /usa|united states|\b[A-Z]{2}\b|new york|san francisco|seattle|austin|boston/i.test(location) ? "us" : "in";
}

const ROTATION = ["in", "us", "gb", "de", "ca", "sg", "ae", "au"] as const;

/** Worldwide searches (no location) query one country per day to stay inside JSearch's free quota. */
export function rotatingCountry(date = new Date()): (typeof ROTATION)[number] {
  const day = Math.floor(date.getTime() / 86400000);
  return ROTATION[day % ROTATION.length];
}

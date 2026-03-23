const firstNames = [
  "alex", "maria", "anna", "david", "michael", "elena", "ivan", "olga", "sarah", "john", "mark", "sofia", "daniel", "peter", "linda", "nina"
];

const lastNames = [
  "smith", "johnson", "williams", "brown", "jones", "miller", "davis", "wilson", "moore", "taylor", "anderson", "thomas", "jackson", "white", "harris", "martin"
];

const countries = [
  "canada", "brazil", "germany", "france", "spain", "italy", "poland", "norway", "sweden", "japan", "korea", "india", "turkey", "ukraine", "mexico", "chile"
];

const cities = [
  "london", "berlin", "paris", "madrid", "rome", "vienna", "prague", "warsaw", "helsinki", "tokyo", "seoul", "delhi", "ankara", "kyiv", "toronto", "sydney"
];

const commonWords = [
  "market", "studio", "garden", "planet", "orange", "coffee", "travel", "winter", "summer", "forest", "bridge", "paper", "cloud", "ocean", "sunset", "family"
];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function digits(min = 10, max = 9999) {
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export function generateReadableLocalPart() {
  const patterns = [
    () => `${pick(firstNames)}${pick(lastNames)}`,
    () => `${pick(firstNames)}${pick(cities)}`,
    () => `${pick(commonWords)}${pick(countries)}`,
    () => `${pick(firstNames)}${pick(lastNames)}${digits(10, 999)}`,
    () => `${pick(commonWords)}${pick(cities)}${digits(10, 99)}`
  ];

  const value = pick(patterns)().toLowerCase().replace(/[^a-z0-9]/g, "");
  return value.slice(0, 24);
}

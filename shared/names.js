// Names for bots: the best-known philosophers in history — names most people would recognise (all 16 characters or fewer).
export const PHILOSOPHERS = [
  'Socrates', 'Plato', 'Aristotle', 'Pythagoras', 'Diogenes', 'Epicurus', 'Seneca', 'Marcus Aurelius',
  'Confucius', 'Lao Tzu', 'Aquinas', 'Machiavelli', 'Descartes', 'Pascal', 'Hobbes', 'Locke',
  'Hume', 'Voltaire', 'Rousseau', 'Kant', 'Hegel', 'Kierkegaard', 'Nietzsche', 'Sartre', 'Camus', 'Beauvoir',
];

const key = (n) => String(n).toLowerCase().replace(/\s+/g, '');

/** A random philosopher whose name nobody at the table is using (falls back to "Bot N" if somehow all are taken). */
export function pickBotName(takenNames, rng = Math.random) {
  const taken = new Set(takenNames.map(key));
  const free = PHILOSOPHERS.filter((n) => !taken.has(key(n)));
  if (free.length) return free[Math.floor(rng() * free.length)];
  for (let i = 2; ; i++) if (!taken.has(key('Bot ' + i))) return 'Bot ' + i;
}

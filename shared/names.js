// Names for bots: famous philosophers from across history and around the world (all 16 characters or fewer).
export const PHILOSOPHERS = [
  'Socrates', 'Plato', 'Aristotle', 'Heraclitus', 'Parmenides', 'Pythagoras', 'Thales', 'Diogenes', 'Epicurus', 'Zeno',
  'Hypatia', 'Seneca', 'Epictetus', 'Marcus Aurelius', 'Plotinus', 'Augustine', 'Boethius',
  'Confucius', 'Lao Tzu', 'Zhuangzi', 'Mencius', 'Mozi', 'Xunzi', 'Zhu Xi', 'Wang Yangming',
  'Nagarjuna', 'Shankara', 'Dogen', 'Avicenna', 'Averroes', 'Al-Farabi', 'Maimonides', 'Aquinas', 'Ibn Khaldun',
  'Machiavelli', 'Montaigne', 'Erasmus', 'Bacon', 'Descartes', 'Pascal', 'Spinoza', 'Hobbes', 'Locke', 'Leibniz',
  'Hume', 'Voltaire', 'Rousseau', 'Kant', 'Wollstonecraft', 'Hegel', 'Bentham', 'Mill', 'Schopenhauer',
  'Kierkegaard', 'Nietzsche', 'Russell', 'Wittgenstein', 'Heidegger', 'Sartre', 'Beauvoir', 'Camus', 'Arendt', 'Weil',
];

const key = (n) => String(n).toLowerCase().replace(/\s+/g, '');

/** A random philosopher whose name nobody at the table is using (falls back to "Bot N" if somehow all are taken). */
export function pickBotName(takenNames, rng = Math.random) {
  const taken = new Set(takenNames.map(key));
  const free = PHILOSOPHERS.filter((n) => !taken.has(key(n)));
  if (free.length) return free[Math.floor(rng() * free.length)];
  for (let i = 2; ; i++) if (!taken.has(key('Bot ' + i))) return 'Bot ' + i;
}

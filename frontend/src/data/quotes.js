// Short motivational lines. One is shown per day.
export const QUOTES = [
  "Small steps taken every day add up to a career.",
  "You do not need to know everything today. You need to learn one thing well.",
  "Progress is quiet. Keep showing up.",
  "Every expert you admire started as a beginner.",
  "Finish this lesson, and tomorrow you will know more than you do now.",
  "Skills are built in the boring days. Do today's lesson.",
  "A clear next step beats a perfect plan.",
  "Confidence comes after practice, not before it.",
  "Your future is built from what you repeat.",
  "Mistakes are how learning shows you where to look.",
  "Ten focused minutes are better than an hour of worry.",
  "Be patient with the process and strict with the habit.",
  "The best time to start was earlier. The next best time is now.",
  "Learn it, use it, then teach it. That is how it sticks.",
  "Do not compare your first chapter to someone else's tenth.",
  "Curiosity is a skill. Practice it today.",
  "Hard things become normal when you keep doing them.",
  "You are closer than you were yesterday.",
  "Consistency turns effort into results.",
  "Today's lesson is tomorrow's confidence.",
];

export function quoteOfTheDay() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

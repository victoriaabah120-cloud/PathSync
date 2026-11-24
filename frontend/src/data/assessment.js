export const NOT_SURE = "Not sure yet";

// Every question also gets a "Not sure yet" option automatically.
export const QUESTIONS = [
  { id: "activities", step: "Interests", text: "Which activities do you enjoy most?", hint: "Pick up to 2.", max: 2,
    options: ["Helping or caring for people", "Solving problems and fixing things", "Creating or designing things", "Working with numbers and money", "Teaching or explaining", "Working with animals, plants or the outdoors"] },
  { id: "subjects", step: "Interests", text: "Which school subjects did you like best?", hint: "Pick up to 2.", max: 2,
    options: ["Sciences", "Maths", "Languages", "Arts", "Business or Economics", "Practical or technical subjects"] },
  { id: "free_time", step: "Interests", text: "What do you enjoy doing in your free time?", hint: "Pick up to 2.", max: 2,
    options: ["Reading and research", "Building or repairing things", "Drawing or making content", "Organizing events or leading groups", "Helping friends with their problems"] },
  { id: "described", step: "Strengths and work style", text: "How do people describe you?", hint: "Pick up to 2.", max: 2,
    options: ["Patient", "Creative", "Analytical", "A natural leader", "A good listener", "Hands-on"] },
  { id: "teamwork", step: "Strengths and work style", text: "How do you prefer to work?", hint: "Pick one.", max: 1,
    options: ["Alone", "In a small team", "Leading a group"] },
  { id: "pressure", step: "Strengths and work style", text: "How do you handle pressure?", hint: "Pick one.", max: 1,
    options: ["I stay calm", "I plan ahead", "I work best with deadlines", "I find it stressful"] },
  { id: "place", step: "Preferred environment", text: "Where would you like to work?", hint: "Pick up to 2.", max: 2,
    options: ["Office", "Hospital or clinic", "School", "Outdoors or on site", "Workshop or lab", "From home"] },
  { id: "focus", step: "Preferred environment", text: "Would you rather work mostly with...", hint: "Pick one.", max: 1,
    options: ["People", "Things and tools", "Ideas and data", "A mix"] },
  { id: "values", step: "Goals", text: "What matters most to you in a career?", hint: "Pick up to 3.", max: 3,
    options: ["Good income", "Job security", "Helping others", "Creativity", "Flexibility", "Respect and status"] },
  { id: "time", step: "Goals", text: "How much time can you spend learning each week?", hint: "Pick one.", max: 1,
    options: ["Under 3 hours", "3 to 6 hours", "6 to 10 hours", "More than 10 hours"] },
  { id: "situation", step: "Goals", text: "What is your current situation?", hint: "Pick one.", max: 1,
    options: ["Student", "Graduate", "Working, but want a change", "Not working right now"] },
];

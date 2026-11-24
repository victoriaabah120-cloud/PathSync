// Career fields and their specializations. Add or change items here to change what users can pick.
export const FIELDS = [
  {
    id: "engineering",
    name: "Engineering",
    blurb: "Design, build and maintain the things society runs on.",
    specializations: ["Civil Engineering", "Electrical Engineering", "Mechanical Engineering", "Chemical Engineering", "Petroleum Engineering", "Agricultural Engineering"],
  },
  {
    id: "healthcare",
    name: "Healthcare",
    blurb: "Care for people and protect public health.",
    specializations: ["Nursing", "Medicine", "Pharmacy", "Medical Laboratory Science", "Physiotherapy", "Public Health"],
  },
  {
    id: "law",
    name: "Law",
    blurb: "Understand rules, rights and how justice works.",
    specializations: ["Corporate Law", "Criminal Law", "Human Rights Law", "Property Law", "Paralegal Practice"],
  },
  {
    id: "business",
    name: "Business",
    blurb: "Manage money, people, products and ideas.",
    specializations: ["Accounting", "Marketing", "Human Resources", "Banking and Finance", "Entrepreneurship", "Project Management"],
  },
  {
    id: "education",
    name: "Education",
    blurb: "Teach, guide and help others learn.",
    specializations: ["Primary School Teaching", "Secondary School Teaching", "Early Childhood Education", "Special Needs Education", "Educational Leadership"],
  },
  {
    id: "agriculture",
    name: "Agriculture",
    blurb: "Grow food and run farms and food businesses.",
    specializations: ["Crop Farming", "Livestock Farming", "Agribusiness", "Fish Farming", "Agricultural Extension"],
  },
  {
    id: "creative-arts",
    name: "Creative Arts",
    blurb: "Make things people see, hear and read.",
    specializations: ["Graphic Design", "Fashion Design", "Photography and Film", "Music Production", "Writing and Journalism"],
  },
  {
    id: "trades",
    name: "Trades",
    blurb: "Skilled hands-on work that is always in demand.",
    specializations: ["Electrician", "Plumbing", "Carpentry", "Auto Mechanic", "Welding"],
  },
  {
    id: "technology",
    name: "Technology",
    blurb: "Build software and work with data and systems.",
    specializations: ["Software Development", "Data Analysis", "Cybersecurity", "UI/UX Design", "IT Support"],
  },
  {
    id: "other",
    name: "Other",
    blurb: "Something not listed? Type your own career.",
    specializations: [],
  },
];

export function findField(id) {
  return FIELDS.find((field) => field.id === id);
}

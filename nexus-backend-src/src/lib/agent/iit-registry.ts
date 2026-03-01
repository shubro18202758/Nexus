// Seed data for the IIT registry — the starting point for the Nexus crawler.
// Each entry has a known club directory URL that Stagehand will use as the
// entry point for the discovery agent.

export const IIT_SEED_REGISTRY = [
  {
    id: "iitb",
    fullName: "IIT Bombay",
    city: "Mumbai",
    clubDirectoryUrl: "https://gymkhana.iitb.ac.in/saa/clubs",
    fallbackUrls: [
      "https://www.gymkhana.iitb.ac.in/clubs",
      "https://iitb.ac.in/newacadhome/CulturalActivities.jsp",
    ],
  },
  {
    id: "iitd",
    fullName: "IIT Delhi",
    city: "New Delhi",
    clubDirectoryUrl: "https://bsw.iitd.ac.in/clubs.php",
    fallbackUrls: [
      "https://iitd.ac.in/index.php/student-activities",
    ],
  },
  {
    id: "iitk",
    fullName: "IIT Kanpur",
    city: "Kanpur",
    clubDirectoryUrl: "https://students.iitk.ac.in/sac/clubs",
    fallbackUrls: [
      "https://www.iitk.ac.in/doaa/student-clubs",
    ],
  },
  {
    id: "iitm",
    fullName: "IIT Madras",
    city: "Chennai",
    clubDirectoryUrl: "https://students.iitm.ac.in/clubs",
    fallbackUrls: [
      "https://www.iitm.ac.in/student_activities/clubs",
    ],
  },
  {
    id: "iitr",
    fullName: "IIT Roorkee",
    city: "Roorkee",
    clubDirectoryUrl: "https://channeli.in/clubs",
    fallbackUrls: [
      "https://www.iitr.ac.in/campus/pages/Student_Clubs.html",
    ],
  },
  {
    id: "iith",
    fullName: "IIT Hyderabad",
    city: "Hyderabad",
    clubDirectoryUrl: "https://sac.iith.ac.in/clubs",
    fallbackUrls: [
      "https://www.iith.ac.in/students/clubs",
    ],
  },
  {
    id: "iitg",
    fullName: "IIT Guwahati",
    city: "Guwahati",
    clubDirectoryUrl: "https://students.iitg.ac.in/clubs",
    fallbackUrls: [
      "https://www.iitg.ac.in/stud_act/clubs",
    ],
  },
  {
    id: "iitbbs",
    fullName: "IIT Bhubaneswar",
    city: "Bhubaneswar",
    clubDirectoryUrl: "https://www.iitbbs.ac.in/student-activities/clubs",
    fallbackUrls: [],
  },
] as const;

export type IITId = typeof IIT_SEED_REGISTRY[number]["id"];

// Club category inference hints — helps Groq categorize clubs correctly
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  technical: ["coding", "programming", "robotics", "AI", "ML", "web", "app", "hardware", "electronics", "satellite", "aerospace", "cyber", "data", "cloud", "IoT", "open source"],
  cultural: ["dance", "music", "drama", "theatre", "film", "photography", "art", "fashion", "literary", "creative", "quiz", "debate"],
  sports: ["football", "cricket", "basketball", "swimming", "athletics", "badminton", "tennis", "chess", "esports", "gym", "yoga"],
  entrepreneurship: ["startup", "E-Cell", "entrepreneurship", "innovation", "business", "venture", "product", "incubation"],
  research: ["research", "science", "astronomy", "physics", "chemistry", "biology", "environment", "sustainability"],
  social: ["NSS", "social", "community", "NGO", "volunteering", "welfare", "outreach"],
  media: ["newspaper", "newsletter", "magazine", "radio", "podcast", "journalism", "PR", "media"],
  hobby: ["cooking", "hiking", "travel", "gaming", "reading", "gardening"],
};

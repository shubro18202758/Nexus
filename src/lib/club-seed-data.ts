/**
 * Curated seed data for well-known IIT clubs.
 * This provides rich descriptions, verified URLs, logos, cover images,
 * and metadata for clubs that are already in the database but lack quality data.
 *
 * Cover images sourced from Unsplash (stable, permanent image IDs).
 * Logos loaded via Google Favicons from verified website URLs.
 */

export interface ClubSeedEntry {
  name: string;
  iitId: string;
  shortName?: string;
  category: string;
  description: string;
  tagline?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  email?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  tags: string[];
  memberCount?: number;
  foundedYear?: number;
  activityScore?: number;
}

export const CLUB_SEED_DATA: ClubSeedEntry[] = [
  // ══════════ IIT BOMBAY ══════════
  {
    name: "Techfest",
    iitId: "iitb",
    shortName: "Techfest",
    category: "technical",
    description:
      "Techfest is Asia's largest science and technology festival, organised annually by IIT Bombay since 1998. Featuring 100+ competitions, international exhibitions, cutting-edge robotics challenges, lecture series by Nobel laureates, and an annual footfall exceeding 175,000, Techfest has become a global platform for innovation.",
    tagline: "Asia's Largest Science & Technology Festival",
    websiteUrl: "https://techfest.org",
    instagramUrl: "https://www.instagram.com/techfestiitb/",
    linkedinUrl: "https://www.linkedin.com/company/techfest-iit-bombay/",
    email: "pr@techfest.org",
    coverImageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["technology", "festival", "competitions", "robotics", "AI", "exhibitions", "innovation"],
    memberCount: 500,
    foundedYear: 1998,
    activityScore: 95,
  },
  {
    name: "Mood Indigo",
    iitId: "iitb",
    shortName: "Moodi",
    category: "cultural",
    description:
      "Mood Indigo is Asia's largest college cultural festival, born at IIT Bombay in 1971. Spanning four electrifying days each December, it showcases international music acts, dance battles, theatrical productions, stand-up comedy, and fine arts exhibitions, drawing over 150,000 visitors and 1,000+ international artists.",
    tagline: "Asia's Largest College Cultural Festival",
    websiteUrl: "https://moodi.org",
    instagramUrl: "https://www.instagram.com/maborig/",
    linkedinUrl: "https://www.linkedin.com/company/mood-indigo-iit-bombay/",
    email: "contact@moodi.org",
    coverImageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["cultural", "festival", "music", "dance", "drama", "arts", "performances"],
    memberCount: 600,
    foundedYear: 1971,
    activityScore: 98,
  },
  {
    name: "Web and Coding Club",
    iitId: "iitb",
    shortName: "WnCC",
    category: "technical",
    description:
      "The Web and Coding Club (WnCC) of IIT Bombay is the go-to community for competitive programming, software development, and open-source contributions. WnCC organises workshops on web/app development, machine learning, and DevOps, hosts annual hackathons, and mentors freshers through its acclaimed Seasons of Code programme.",
    tagline: "Code • Build • Innovate",
    websiteUrl: "https://wncc.iitb.ac.in",
    instagramUrl: "https://www.instagram.com/wncc_iitb/",
    linkedinUrl: "https://www.linkedin.com/company/wncc-iitb/",
    githubUrl: "https://github.com/wncc",
    coverImageUrl:
      "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["coding", "programming", "web development", "hackathons", "open source", "machine learning"],
    memberCount: 200,
    foundedYear: 2009,
    activityScore: 88,
  },
  {
    name: "Robotics Club",
    iitId: "iitb",
    shortName: "RC",
    category: "technical",
    description:
      "The Robotics Club of IIT Bombay designs and builds autonomous robots, drones, and intelligent systems. A powerhouse in ABU Robocon — India's premier robotics contest — the club also works on ROS-based navigation, swarm robotics, and robotic arms, with multiple national championship wins.",
    tagline: "Building the Machines of Tomorrow",
    websiteUrl: "https://www.roboticsiitb.com",
    instagramUrl: "https://www.instagram.com/robotics_club_iitb/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["robotics", "autonomous systems", "drones", "Robocon", "embedded systems", "AI"],
    memberCount: 80,
    activityScore: 82,
  },
  {
    name: "Electronics Club",
    iitId: "iitb",
    shortName: "Elec Club",
    category: "technical",
    description:
      "The Electronics Club at IIT Bombay is a hub for hardware enthusiasts, fostering hands-on projects in PCB design, embedded systems, IoT, FPGA development, and signal processing. The club runs semester-long project series, conducts soldering workshops, and participates in national hardware hackathons.",
    tagline: "Where Circuits Come Alive",
    instagramUrl: "https://www.instagram.com/elecclub_iitb/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["electronics", "IoT", "embedded systems", "PCB design", "microcontrollers", "FPGA"],
    memberCount: 60,
    activityScore: 75,
  },
  {
    name: "Aeromodelling Club",
    iitId: "iitb",
    shortName: "AeroClub",
    category: "technical",
    description:
      "The Aeromodelling Club of IIT Bombay designs, fabricates, and flies RC aircraft, multirotors, and fixed-wing UAVs. Members compete in SAE Aero Design and Boeing-hosted challenges, and the club conducts workshops on aerodynamics, composite layup, flight controllers, and 3D-printed airframes.",
    tagline: "Fighting against the wind and giving wings to dreams!",
    websiteUrl: "https://gymkhana.iitb.ac.in/instiapp/org/aeromodelling-club",
    instagramUrl: "https://www.instagram.com/iitb_aeroclub/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["aeromodelling", "aviation", "drones", "UAV", "aerodynamics", "RC aircraft"],
    memberCount: 40,
    foundedYear: 2003,
    activityScore: 72,
  },
  {
    name: "Gymkhana",
    iitId: "iitb",
    shortName: "Gymkhana",
    category: "other",
    description:
      "The IIT Bombay Students' Gymkhana is the central governing body for all student extracurricular life. Overseeing 100+ clubs across cultural, technical, and sports councils, it coordinates festivals like Techfest & Mood Indigo, runs elections, manages budgets, and drives campus-wide initiatives.",
    tagline: "The Pulse of Student Life at IIT Bombay",
    websiteUrl: "https://gymkhana.iitb.ac.in",
    instagramUrl: "https://www.instagram.com/iitb_gymkhana/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["student government", "activities", "cultural", "technical", "sports", "governance"],
    memberCount: 50,
    activityScore: 90,
  },
  {
    name: "Staccato",
    iitId: "iitb",
    shortName: "Staccato",
    category: "cultural",
    description:
      "Staccato is the Western Music Club of IIT Bombay, uniting vocalists, guitarists, drummers, and keyboardists who share a passion for rock, jazz, pop, blues, and indie. The club jams weekly, performs at Mood Indigo and hostel nights, and competes in inter-college band battles across India.",
    tagline: "IIT Bombay's Western Music Vibe",
    instagramUrl: "https://www.instagram.com/staccato.iitb/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["western music", "rock", "jazz", "bands", "performances", "vocals", "instruments"],
    memberCount: 35,
    activityScore: 68,
  },
  {
    name: "Mountaineering Club",
    iitId: "iitb",
    shortName: "MountClub",
    category: "sports",
    description:
      "The Mountaineering Club of IIT Bombay fuels the spirit of adventure with Himalayan expeditions, Sahyadri treks, rock-climbing workshops, and rappelling sessions. The club regularly conquers peaks above 20,000 ft and introduces freshers to basic mountaineering courses every semester.",
    tagline: "Scaling New Heights",
    instagramUrl: "https://www.instagram.com/mountaineering_club_iitb/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["mountaineering", "trekking", "rock climbing", "adventure", "Himalayas", "outdoors"],
    memberCount: 100,
    activityScore: 70,
  },
  {
    name: "Maths And Physics Club",
    iitId: "iitb",
    shortName: "MnP Club",
    category: "research",
    description:
      "The Maths and Physics Club at IIT Bombay hosts stimulating talks by professors, puzzle nights, olympiad prep sessions, and discussions on cutting-edge theoretical physics and pure mathematics. The club bridges curiosity with rigour, organising Techfest's science quiz and inter-hostel Mathmania.",
    tagline: "Where Curiosity Meets Rigour",
    instagramUrl: "https://www.instagram.com/mnpc_iitb/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["mathematics", "physics", "problem solving", "olympiad", "theoretical", "puzzles", "science"],
    memberCount: 45,
    activityScore: 65,
  },
  {
    name: "Avenues",
    iitId: "iitb",
    shortName: "Avenues",
    category: "entrepreneurship",
    description:
      "Avenues is the flagship annual business festival of IIT Bombay's Shailesh J. Mehta School of Management. It features case-study competitions, conclaves with Fortune 500 leaders, startup pitch arenas, B-school challenges, and networking summits bridging academia with industry.",
    tagline: "Where Business Meets Innovation",
    websiteUrl: "https://www.avenuesom.in",
    instagramUrl: "https://www.instagram.com/avenues_iitb/",
    linkedinUrl: "https://www.linkedin.com/company/avenues-iitb/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["business", "festival", "leadership", "entrepreneurship", "management", "case competition"],
    memberCount: 120,
    foundedYear: 2015,
    activityScore: 78,
  },
  {
    name: "Aakaar",
    iitId: "iitb",
    shortName: "Aakaar",
    category: "technical",
    description:
      "Aakaar is Asia's largest civil engineering festival, organised by IIT Bombay's Department of Civil Engineering. It showcases competitions in structural design, bridge-building, sustainable construction, and urban planning, alongside expert lectures, industrial visits, and paper presentations.",
    tagline: "Asia's Largest Civil Engineering Festival",
    websiteUrl: "https://aakaar.iitb.ac.in",
    instagramUrl: "https://www.instagram.com/aakaariitb/",
    linkedinUrl: "https://in.linkedin.com/company/aakaariitb",
    coverImageUrl:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["civil engineering", "infrastructure", "construction", "sustainability", "technical fest"],
    memberCount: 80,
    foundedYear: 2012,
    activityScore: 74,
  },

  // ══════════ IIT DELHI ══════════
  {
    name: "Fine Arts and Crafts Club",
    iitId: "iitd",
    shortName: "FAC Club",
    category: "cultural",
    description:
      "The Fine Arts and Crafts Club (Azure) at IIT Delhi nurtures artistic expression through workshops in oil painting, sketching, pottery, calligraphy, digital illustration, and mural design. The club organises annual exhibitions, live art installations during Rendezvous, and inter-college art competitions.",
    tagline: "Colour Your World",
    instagramUrl: "https://www.instagram.com/fac.iitd/",
    linkedinUrl: "https://www.linkedin.com/company/fine-arts-and-crafts-club-iit-delhi/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["fine arts", "crafts", "painting", "sketching", "pottery", "calligraphy", "digital art"],
    memberCount: 50,
    activityScore: 66,
  },
  {
    name: "Dance Club",
    iitId: "iitd",
    shortName: "DanceClub",
    category: "cultural",
    description:
      "The Dance Club at IIT Delhi brings together dancers across classical Indian, contemporary, hip-hop, and freestyle genres. The club conducts regular workshops by professional choreographers, stages performances at Rendezvous and Tryst, and competes in national inter-college dance festivals.",
    tagline: "Move. Express. Inspire.",
    instagramUrl: "https://www.instagram.com/iitddanceclub/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["dance", "classical", "contemporary", "hip-hop", "performances", "choreography"],
    memberCount: 60,
    activityScore: 67,
  },
  {
    name: "Literary Club",
    iitId: "iitd",
    shortName: "LitClub",
    category: "cultural",
    description:
      "The Literary Club at IIT Delhi champions the spoken and written word — from parliamentary debates, slam poetry, and quizzing to creative writing workshops and open-mic nights. The club represents IIT Delhi at national MUN conferences and hosts the annual literary fest during Rendezvous.",
    tagline: "Words That Move Mountains",
    instagramUrl: "https://www.instagram.com/litclub_iitd/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["literary", "debate", "quizzing", "creative writing", "poetry", "public speaking", "MUN"],
    memberCount: 40,
    activityScore: 62,
  },
  {
    name: "Robotics Club",
    iitId: "iitd",
    shortName: "RoboticsIITD",
    category: "technical",
    description:
      "The Robotics Club at IIT Delhi designs autonomous rovers, humanoid robots, and intelligent drone systems. It fields teams for ABU Robocon and DRDO challenges, organises workshops on ROS, computer vision, and control theory, and hosts the annual RoboWars during Tryst.",
    tagline: "Innovate. Build. Automate.",
    instagramUrl: "https://www.instagram.com/robotics_iitd/",
    linkedinUrl: "https://www.linkedin.com/company/robotics-iitd/",
    coverImageUrl:
      "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&h=300&q=80",
    tags: ["robotics", "autonomous systems", "drones", "ROS", "computer vision", "AI", "RoboWars"],
    memberCount: 55,
    activityScore: 73,
  },
];

import { SectionType } from '../models/Resume';

export interface SectionConfig {
    id: string;
    sectionType: SectionType;
    title: string;
    description: string;
}

export const SECTION_CONFIGS: SectionConfig[] = [
    {
        id: "education",
        sectionType: SectionType.EDUCATION,
        title: "Education",
        description:
            "Show off your primary education, college degrees & exchange semesters.",
    },
    {
        id: "work",
        sectionType: SectionType.WORK,
        title: "Professional Experience",
        description:
            "A place to highlight your professional experience - including internships.",
    },
    {
        id: "skills",
        sectionType: SectionType.SKILLS,
        title: "Skills",
        description:
            "List your technical, managerial or soft skills in this section.",
    },
    {
        id: "languages",
        sectionType: SectionType.LANGUAGES,
        title: "Languages",
        description:
            "You speak more than one language? Make sure to list them here.",
    },
    {
        id: "certificates",
        sectionType: SectionType.CERTIFICATES,
        title: "Certificates",
        description:
            "Drivers licenses and other industry-specific certificates you have belong here.",
    },
    {
        id: "interests",
        sectionType: SectionType.INTERESTS,
        title: "Interests",
        description:
            "Do you have interests that align with your career aspiration?",
    },
    {
        id: "projects",
        sectionType: SectionType.PROJECTS,
        title: "Projects",
        description:
            "Worked on a particular challenging project in the past? Mention it here.",
    },
    {
        id: "courses",
        sectionType: SectionType.COURSES,
        title: "Courses",
        description:
            "Did you complete MOOCs or an evening course? Show them off in this section.",
    },
    {
        id: "awards",
        sectionType: SectionType.AWARDS,
        title: "Awards",
        description:
            "Awards like student competitions or industry accolades belong here.",
    },
    {
        id: "organizations",
        sectionType: SectionType.ORGANIZATIONS,
        title: "Organisations",
        description:
            "If you volunteer or participate in a good cause, why not state it?",
    },
    {
        id: "publications",
        sectionType: SectionType.PUBLICATIONS,
        title: "Publications",
        description:
            "Academic publications or book releases have a dedicated place here.",
    },
    {
        id: "references",
        sectionType: SectionType.REFERENCES,
        title: "References",
        description:
            "If you have former colleagues or bosses that vouch for you, list them.",
    },
    {
        id: "softSkills",
        sectionType: SectionType.SOFTSKILSS,
        title: "Soft Skills",
        description: "Highlight your interpersonal and communication abilities.",
    },
    {
        id: "achievements",
        sectionType: SectionType.ACHIVEMENTS,
        title: "Achievements",
        description: "Showcase your notable accomplishments and milestones.",
    },
    {
        id: "technicalSkills",
        sectionType: SectionType.TECK_SKILLS,
        title: "Technical Skills",
        description:
            "List your programming languages, tools, and technical expertise.",
    },
];
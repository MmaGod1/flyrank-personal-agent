/**
 * Shared data models for the FL-06 Job Scout & CV Tailor milestone.
 * Kept in one file so every module (storage, API routes, matching,
 * tailoring) imports the same shapes instead of redefining them.
 */
export const DEFAULT_PROFILE = {
    targetRoles: ["Frontend Developer", "Frontend Developer Intern"],
    experienceLevel: "internship / junior",
    preferredLocation: "Remote",
    workArrangement: "remote",
    skills: [
        "HTML",
        "CSS",
        "JavaScript",
        "React",
        "Next.js",
        "TypeScript",
        "Tailwind CSS",
        "Git & GitHub",
    ],
    otherPreferences: "",
    updatedAt: new Date(0).toISOString(),
};

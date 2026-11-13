/** Mirrors backend/src/mira_backend/models/driver.py */

export interface Driver {
  id: string;
  slug: string;
  display_name: string;
  gender: "male" | "female";
  avatar: string;
}

export interface Memory {
  id: string;
  category: "profile" | "preference" | "episodic";
  content: string;
  created_at: string;
}

export interface SessionStarted {
  session_id: string;
  driver: Driver;
  applied: string[];
  greeting: string;
}

export interface DriverProfile {
  driver: Driver;
  preferences: Record<string, number | string>;
  memories: Memory[];
}

export type Mood = {
  id: string;
  value: number;
  createdAt: string;
  /** Local calendar date of the record, independent of later timezone changes. */
  day?: string;
  note?: string;
  tags?: string[];
};

export type Letter = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  favorite?: boolean;
};

export type ReliefSession = {
  id: string;
  createdAt: string;
  feeling: string;
  technique: "breathing" | "grounding";
  durationSeconds: number;
  before?: number;
  after?: number;
  action?: string;
};

export type CustomAction = {
  id: string;
  title: string;
  detail?: string;
  createdAt: string;
  archived?: boolean;
};

export type AppData = {
  version: 2;
  moods: Mood[];
  letters: Letter[];
  actions: Record<string, string[]>;
  reliefSessions: number;
  reliefHistory: ReliefSession[];
  customActions: CustomAction[];
  plannedActions: string[];
};

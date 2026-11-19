export interface Location {
  address: string;
  city: string;
  countryCode: string;
  postalCode: string;
}

export interface Basics {
  name: string;
  label: string;
  email: string;
  phone: string;
  summary: string;
  location: Location;
}

export interface ResumeSection {
  id: string;
  type: string;
  title: string;
  content: any[];
  isCustom?: boolean;
}

export interface ResumeContent {
  basics: Basics;
  sections: ResumeSection[];
  sectionOrder: string[];
}

export interface PrivacySettings {
  hideEmail: boolean;
  hidePhone: boolean;
  hideAddress: boolean;
}

export interface DailyView {
  date: string;
  count: number;
}

export interface ResumeSharing {
  isPublic: boolean;
  shareToken?: string | null;
  slug?: string | null;
  viewCount?: number;
  lastViewedAt?: string | null;
  dailyViews?: DailyView[];
  privacy: PrivacySettings;
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  templateId?: string;
  themeConfig?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  sharing?: ResumeSharing;
  content: ResumeContent;
}

export interface CreateResumeDTO extends Omit<Resume, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {}
export interface UpdateResumeDTO extends Partial<CreateResumeDTO> {}

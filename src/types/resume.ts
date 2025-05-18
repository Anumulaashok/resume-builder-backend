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

export interface Resume {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  content: ResumeContent;
}

export interface CreateResumeDTO extends Omit<Resume, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {}
export interface UpdateResumeDTO extends Partial<CreateResumeDTO> {}

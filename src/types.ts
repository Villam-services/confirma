export type FindingCategory =
  | 'Design Criteria'
  | 'Code / Standard'
  | 'Regulation / Act'
  | 'Material / Specification'
  | 'Load / Demand'
  | 'Safety / Risk'
  | 'Inspection / Testing'
  | 'Submission / Documentation'
  | 'General Engineering Information';

export type PdfPageText = {
  page: number;
  text: string;
};

export type ReviewFinding = {
  id: string;
  category: FindingCategory;
  topic: string;
  requirement: string;
  value: string;
  sourcePage: number;
  sourceExcerpt: string;
  confidence: 'High' | 'Medium' | 'Needs review';
};

export type LibraryReference = {
  id: string;
  title: string;
  authority: string;
  jurisdiction: string;
  category: FindingCategory;
  keywords: string[];
  summary: string;
  source: string;
  driveFileId?: string;
  driveUrl?: string;
  lastIndexed?: string;
};

export type CrossReference = {
  id: string;
  findingId: string;
  findingTopic: string;
  referenceTitle: string;
  authority: string;
  jurisdiction: string;
  relevance: number;
  reason: string;
  source: string;
};

export type ReviewSession = {
  id: string;
  fileName: string;
  createdAt: string;
  findingCount: number;
  matchCount: number;
  findings: ReviewFinding[];
  references: CrossReference[];
};

export type LibraryDocument = {
  id: string;
  title: string;
  fileName: string;
  driveFileId: string;
  driveUrl: string;
  indexedAt: string;
  status: 'Indexed' | 'Backend required';
  reference: LibraryReference;
};

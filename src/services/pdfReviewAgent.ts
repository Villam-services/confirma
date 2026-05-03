import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { CrossReference, FindingCategory, LibraryReference, PdfPageText, ReviewFinding } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const categorySignals: Array<{ category: FindingCategory; keywords: string[] }> = [
  { category: 'Design Criteria', keywords: ['design criteria', 'design basis', 'design requirement', 'basis of design', 'performance criteria'] },
  { category: 'Code / Standard', keywords: ['code', 'standard', 'csa', 'aci', 'asce', 'nbcc', 'building code', 'opss', 'astm', 'aasho', 'aashto'] },
  { category: 'Regulation / Act', keywords: ['regulation', 'act', 'law', 'compliance', 'permit', 'approval', 'authority having jurisdiction'] },
  { category: 'Material / Specification', keywords: ['material', 'specification', 'concrete', 'steel', 'asphalt', 'granular', 'pipe', 'coating', 'grade'] },
  { category: 'Load / Demand', keywords: ['load', 'pressure', 'wind', 'snow', 'seismic', 'live load', 'dead load', 'factor of safety'] },
  { category: 'Safety / Risk', keywords: ['safety', 'risk', 'hazard', 'fall protection', 'confined space', 'fire', 'emergency'] },
  { category: 'Inspection / Testing', keywords: ['inspection', 'testing', 'test', 'commissioning', 'sampling', 'quality control', 'acceptance'] },
  { category: 'Submission / Documentation', keywords: ['submission', 'submittal', 'drawing', 'report', 'certificate', 'record', 'documentation'] },
];

const highValueTerms = [
  'shall',
  'must',
  'required',
  'minimum',
  'maximum',
  'not less than',
  'not greater than',
  'design',
  'criteria',
  'standard',
  'code',
  'regulation',
  'factor',
  'limit',
  'spacing',
  'clearance',
  'capacity',
  'strength',
  'approval',
  'inspection',
  'testing',
];

export async function extractPdfText(file: File): Promise<PdfPageText[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: PdfPageText[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    pages.push({ page: pageNumber, text });
  }

  return pages;
}

export function buildFindings(pages: PdfPageText[]): ReviewFinding[] {
  const candidates = pages.flatMap((page) => splitIntoStatements(page.text).map((statement) => ({ ...page, statement })));
  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scoreStatement(candidate.statement) }))
    .filter((candidate) => candidate.score >= 3)
    .sort((left, right) => right.score - left.score)
    .slice(0, 80);

  return ranked.map((candidate, index) => {
    const category = detectCategory(candidate.statement);
    const topic = extractTopic(candidate.statement, category);
    const value = extractEngineeringValue(candidate.statement);

    return {
      id: `finding-${index + 1}`,
      category,
      topic,
      requirement: cleanStatement(candidate.statement),
      value,
      sourcePage: candidate.page,
      sourceExcerpt: createExcerpt(candidate.statement),
      confidence: candidate.score >= 8 ? 'High' : candidate.score >= 5 ? 'Medium' : 'Needs review',
    };
  });
}

export function crossReferenceFindings(findings: ReviewFinding[], library: LibraryReference[]): CrossReference[] {
  return findings
    .flatMap((finding) =>
      library
        .map((reference) => ({ reference, relevance: calculateRelevance(finding, reference.keywords, reference.category) }))
        .filter((match) => match.relevance >= 28)
        .sort((left, right) => right.relevance - left.relevance)
        .slice(0, 3)
        .map((match) => ({
          id: `${finding.id}-${match.reference.id}`,
          findingId: finding.id,
          findingTopic: finding.topic,
          referenceTitle: match.reference.title,
          authority: match.reference.authority,
          jurisdiction: match.reference.jurisdiction,
          relevance: match.relevance,
          reason: buildMatchReason(finding, match.reference.keywords),
          source: match.reference.source,
        })),
    )
    .sort((left, right) => right.relevance - left.relevance);
}

function splitIntoStatements(text: string): string[] {
  return text
    .split(/(?<=[.;:])\s+|\n+/)
    .map(cleanStatement)
    .filter((statement) => statement.length >= 35 && statement.length <= 700);
}

function cleanStatement(statement: string): string {
  return statement.replace(/\s+/g, ' ').replace(/^[-*\d.\s]+/, '').trim();
}

function scoreStatement(statement: string): number {
  const normalized = statement.toLowerCase();
  const termScore = highValueTerms.reduce((score, term) => score + (normalized.includes(term) ? 2 : 0), 0);
  const numberScore = /\b\d+(\.\d+)?\s?(mm|cm|m|kpa|mpa|kn|kg|%|hr|h|l\/s|m3\/s|psi|ft|in)\b/i.test(statement) ? 3 : 0;
  const referenceScore = /\b(section|clause|table|figure|appendix|part)\s+[a-z0-9.-]+\b/i.test(statement) ? 2 : 0;
  return termScore + numberScore + referenceScore;
}

function detectCategory(statement: string): FindingCategory {
  const normalized = statement.toLowerCase();
  const ranked = categorySignals
    .map((signal) => ({
      category: signal.category,
      score: signal.keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score ? ranked[0].category : 'General Engineering Information';
}

function extractTopic(statement: string, category: FindingCategory): string {
  const normalized = cleanStatement(statement);
  const sectionMatch = normalized.match(/\b(section|clause|table|figure|appendix|part)\s+[a-z0-9.-]+\b/i)?.[0];
  if (sectionMatch) return `${category}: ${sectionMatch}`;

  const signal = categorySignals.find((item) => item.category === category)?.keywords.find((keyword) => normalized.toLowerCase().includes(keyword));
  if (signal) return titleCase(signal);

  return normalized.split(' ').slice(0, 6).join(' ');
}

function extractEngineeringValue(statement: string): string {
  const matches = statement.match(/\b\d+(\.\d+)?\s?(mm|cm|m|kpa|mpa|kn|kg|%|hr|h|l\/s|m3\/s|psi|ft|in|degrees?)\b/gi);
  if (matches?.length) return Array.from(new Set(matches)).slice(0, 4).join(', ');

  const modalMatch = statement.match(/\b(shall|must|required|minimum|maximum|not less than|not greater than)\b/i)?.[0];
  return modalMatch ? titleCase(modalMatch) : 'Review required';
}

function createExcerpt(statement: string): string {
  const cleaned = cleanStatement(statement);
  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned;
}

function calculateRelevance(finding: ReviewFinding, keywords: string[], referenceCategory: FindingCategory): number {
  const haystack = `${finding.category} ${finding.topic} ${finding.requirement} ${finding.value}`.toLowerCase();
  const keywordScore = keywords.reduce((score, keyword) => score + (haystack.includes(keyword.toLowerCase()) ? 18 : 0), 0);
  const categoryScore = finding.category === referenceCategory ? 22 : 0;
  return Math.min(100, keywordScore + categoryScore);
}

function buildMatchReason(finding: ReviewFinding, keywords: string[]): string {
  const haystack = `${finding.topic} ${finding.requirement}`.toLowerCase();
  const matched = keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).slice(0, 3);
  return matched.length ? `Matched: ${matched.join(', ')}` : `Related category: ${finding.category}`;
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

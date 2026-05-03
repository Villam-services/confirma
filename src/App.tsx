import { FileCheck2, FileSearch, Library, Loader2, UploadCloud } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { buildFindings, crossReferenceFindings, extractPdfText } from './services/pdfReviewAgent';
import type { CrossReference, ReviewFinding } from './types';

type Step = 'idle' | 'reviewing' | 'reviewed' | 'matching';

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [references, setReferences] = useState<CrossReference[]>([]);
  const [error, setError] = useState('');

  const stats = useMemo(
    () => [
      { label: 'Findings', value: findings.length.toString() },
      { label: 'Sources', value: new Set(findings.map((finding) => finding.sourcePage)).size.toString() },
      { label: 'Matches', value: references.length.toString() },
    ],
    [findings, references],
  );

  async function handleFile(file?: File) {
    if (!file) return;

    setError('');
    setReferences([]);
    setFindings([]);
    setFileName(file.name);

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      setStep('idle');
      return;
    }

    try {
      setStep('reviewing');
      const pages = await extractPdfText(file);
      const nextFindings = buildFindings(pages);
      setFindings(nextFindings);
      setStep('reviewed');
    } catch {
      setError('The PDF could not be reviewed. Try a text-based PDF or upload a clearer file.');
      setStep('idle');
    }
  }

  function runCrossReference() {
    setStep('matching');
    const matches = crossReferenceFindings(findings);
    setReferences(matches);
    setStep('reviewed');
  }

  const busy = step === 'reviewing' || step === 'matching';

  return (
    <main className="app-shell">
      <section className="workspace-header">
        <div>
          <p className="eyebrow">Confirma Engineering Review</p>
          <h1>PDF criteria, code, and standards review</h1>
        </div>
        <div className="status-strip" aria-label="Review metrics">
          {stats.map((stat) => (
            <div className="metric" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="review-layout">
        <aside className="control-panel">
          <button className="upload-zone" type="button" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={28} aria-hidden="true" />
            <span>{fileName || 'Upload engineering PDF'}</span>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="application/pdf"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <div className="step-list" aria-label="Review steps">
            <ReviewStep icon={<FileSearch size={18} />} label="Extract source-backed findings" active={step === 'reviewing'} done={findings.length > 0} />
            <ReviewStep icon={<Library size={18} />} label="Cross-reference library" active={step === 'matching'} done={references.length > 0} />
            <ReviewStep icon={<FileCheck2 size={18} />} label="Table-only reporting" active={false} done={findings.length > 0} />
          </div>

          <button className="primary-action" type="button" disabled={!findings.length || busy} onClick={runCrossReference}>
            {step === 'matching' ? <Loader2 className="spin" size={18} /> : <Library size={18} />}
            Cross-reference findings
          </button>

          {error ? <div className="error-banner">{error}</div> : null}
        </aside>

        <section className="table-stack" aria-label="Review results">
          <FindingTable findings={findings} busy={step === 'reviewing'} />
          {references.length > 0 ? <ReferenceTable references={references} /> : null}
        </section>
      </section>
    </main>
  );
}

function ReviewStep({ icon, label, active, done }: { icon: React.ReactNode; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`review-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span className="step-icon">{active ? <Loader2 className="spin" size={18} /> : icon}</span>
      <span>{label}</span>
    </div>
  );
}

function FindingTable({ findings, busy }: { findings: ReviewFinding[]; busy: boolean }) {
  const rows = busy
    ? [{ id: 'loading', category: '', topic: '', requirement: '', value: '', sourcePage: 0, sourceExcerpt: '', confidence: '' }]
    : findings.length
      ? findings
      : [{ id: 'empty', category: '', topic: '', requirement: '', value: '', sourcePage: 0, sourceExcerpt: '', confidence: '' }];

  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Topic</th>
            <th>Requirement / Information</th>
            <th>Value</th>
            <th>Source</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((finding) => (
            <tr key={finding.id}>
              <td>{finding.category || (busy ? 'Reviewing' : 'Upload PDF')}</td>
              <td>{finding.topic || (busy ? 'Extracting' : 'Awaiting file')}</td>
              <td>{finding.requirement || (busy ? 'PDF text extraction in progress' : 'No findings loaded')}</td>
              <td>{finding.value || '-'}</td>
              <td>{finding.sourcePage ? `Page ${finding.sourcePage}: ${finding.sourceExcerpt}` : '-'}</td>
              <td>{finding.confidence || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferenceTable({ references }: { references: CrossReference[] }) {
  return (
    <div className="table-card compact">
      <table>
        <thead>
          <tr>
            <th>Finding</th>
            <th>Reference</th>
            <th>Authority</th>
            <th>Jurisdiction</th>
            <th>Relevance</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {references.map((reference) => (
            <tr key={reference.id}>
              <td>{reference.findingTopic}</td>
              <td>{reference.referenceTitle}</td>
              <td>{reference.authority}</td>
              <td>{reference.jurisdiction}</td>
              <td>{reference.relevance}%</td>
              <td>{reference.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import type { ReviewSession } from '../types';

const SESSION_KEY = 'confirma-review-sessions';
const MAX_SESSIONS = 20;

export function loadSessions(): ReviewSession[] {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ReviewSession[]) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: ReviewSession): ReviewSession[] {
  const sessions = loadSessions();
  const nextSessions = [session, ...sessions.filter((item) => item.id !== session.id)].slice(0, MAX_SESSIONS);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSessions));
  return nextSessions;
}

export function clearSessions(): ReviewSession[] {
  window.localStorage.removeItem(SESSION_KEY);
  return [];
}

// Placeholder data for modules that aren't backed by real API endpoints yet.
//
// What was here before, and where it went:
//   SAMPLE_ATTENDANCE     -> replaced by GET /api/auth/attendance/
//   SAMPLE_GATE_LOG       -> replaced by GET /api/auth/gate-entry/
//   SAMPLE_CHILD_ACTIVITY -> replaced by GET /api/auth/student-activity/<id>/
//
// Only SAMPLE_EVENTS remains because the events module hasn't been built
// server-side yet. Drop it once /api/events/ exists.

export const SAMPLE_EVENTS = [
  { id: 1, title: 'Final Year Project Expo',         category: 'ACADEMIC',  date: '2026-05-10', time: '09:00', venue: 'Main Auditorium', registered: true,  capacity: 300, registered_count: 287 },
  { id: 2, title: 'Inter-University Cricket Match',  category: 'SPORTS',    date: '2026-05-15', time: '14:00', venue: 'Sports Ground',   registered: false, capacity: 500, registered_count: 320 },
  { id: 3, title: 'AI & Machine Learning Workshop',  category: 'WORKSHOP',  date: '2026-05-20', time: '10:00', venue: 'CS Lab 3',        registered: true,  capacity:  50, registered_count:  48 },
  { id: 4, title: 'Spring Cultural Night',           category: 'CULTURAL',  date: '2026-05-25', time: '18:00', venue: 'Open Amphitheatre', registered: false, capacity: 800, registered_count: 650 },
  { id: 5, title: 'Research Paper Seminar',          category: 'ACADEMIC',  date: '2026-06-02', time: '11:00', venue: 'Seminar Hall',    registered: true,  capacity: 150, registered_count:  95 },
  { id: 6, title: 'Industry Career Fair',            category: 'WORKSHOP',  date: '2026-06-10', time: '09:00', venue: 'Exhibition Hall', registered: false, capacity: 600, registered_count: 400 },
]

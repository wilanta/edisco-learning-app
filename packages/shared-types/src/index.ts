export type HealthResponse = {
  status: 'ok';
  service: 'api' | 'worker';
};

export type GenerationStatusResponse = {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  resultLessonId: string | null;
  trackId: string | null;
  errorMessage: string | null;
};

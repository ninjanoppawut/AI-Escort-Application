export const HTTP_STATUS_CLASSES = ["2xx", "3xx", "4xx", "5xx"] as const;
export const METRIC_RESULTS = ["success", "failure"] as const;

export interface RedMetricLabels {
  routeTemplate: string;
  method: string;
  statusClass: (typeof HTTP_STATUS_CLASSES)[number];
  flow: string;
  stage: string;
}

export interface QueueMetricLabels {
  queue: string;
  result: (typeof METRIC_RESULTS)[number];
  stage: string;
}

export interface MetricsRecorder {
  recordRequest(
    labels: RedMetricLabels,
    durationMilliseconds: number,
  ): void | Promise<void>;
  recordQueueDepth(
    labels: QueueMetricLabels,
    depth: number,
  ): void | Promise<void>;
  recordQueueAge(
    labels: QueueMetricLabels,
    oldestMessageAgeSeconds: number,
  ): void | Promise<void>;
}

/**
 * High-cardinality identifiers never belong in metric labels. Request, trace,
 * user, class, session, group, and observation IDs are intentionally absent.
 */
export const noOpMetricsRecorder: MetricsRecorder = {
  recordRequest() {},
  recordQueueDepth() {},
  recordQueueAge() {},
};

import type { CaptureDestinationId, CaptureResult } from './capture';

export const SHOW_CAPTURE = 'tldr:show-capture';
export const RETRY_DESTINATION = 'tldr:retry-destination';
export const UPDATE_TAGS = 'tldr:update-tags';

export type ShowCaptureMessage = {
  type: typeof SHOW_CAPTURE;
  capture: CaptureResult;
};

export type RetryDestinationMessage = {
  type: typeof RETRY_DESTINATION;
  itemId: string;
  destinationId: CaptureDestinationId;
};

export type UpdateTagsMessage = {
  type: typeof UPDATE_TAGS;
  itemId: string;
  tags: string[];
};

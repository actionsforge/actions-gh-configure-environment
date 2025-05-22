import { GitHubService } from './github';
import { Reviewer } from './types';
import * as core from '@actions/core';

export function logDebug(enabled: boolean, message: string): void {
  if (enabled) core.debug(message);
}

export async function processReviewers(reviewers: string, github: GitHubService): Promise<Reviewer[]> {
  const reviewerList = reviewers.split(',').map(r => r.trim());
  const processedReviewers: Reviewer[] = [];

  for (const reviewer of reviewerList) {
    if (reviewer.startsWith('user:')) {
      const username = reviewer.slice(5);
      processedReviewers.push(await github.getUser(username));
    } else if (reviewer.startsWith('team:')) {
      const teamSlug = reviewer.slice(5);
      processedReviewers.push(await github.getTeam(teamSlug));
    }
  }

  return processedReviewers;
}

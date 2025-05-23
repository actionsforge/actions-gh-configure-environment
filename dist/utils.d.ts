import { GitHubService } from './github';
import { Reviewer } from './types';
export declare function logDebug(enabled: boolean, message: string): void;
export declare function processReviewers(reviewers: string, github: GitHubService): Promise<Reviewer[]>;

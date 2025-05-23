import { Reviewer, EnvironmentConfig } from './types';
export type GitHubError = Error & {
    status?: number;
};
type UserReviewer = Reviewer & {
    login: string;
};
type TeamReviewer = Reviewer & {
    slug: string;
};
export declare class GitHubService {
    private octokit;
    private owner;
    private repo;
    private debug;
    constructor(token: string, repository: string, debug?: boolean);
    getUser(username: string): Promise<UserReviewer>;
    getTeam(teamSlug: string): Promise<TeamReviewer>;
    hasTeamAccess(teamSlug: string): Promise<boolean>;
    resolveReviewers(environmentName: string, reviewers: Reviewer[]): Promise<EnvironmentConfig['reviewers']>;
    private isWaitTimerRule;
    private isReviewersRule;
    private isPreventSelfReviewRule;
    updateEnvironment(environmentName: string, config: EnvironmentConfig): Promise<{
        status: string;
        message: string;
    }>;
    getEnvironmentConfig(environmentName: string): Promise<Record<string, unknown>>;
    deleteAnEnvironment(environmentName: string): Promise<{
        status: string;
        message: string;
    }>;
    getAllEnvironments(): Promise<string[]>;
}
export {};

import { Octokit } from '@octokit/rest';
import { Reviewer, EnvironmentConfig } from './types';
import * as core from '@actions/core';
import { logDebug } from './utils';

export type GitHubError = Error & { status?: number };

type UserReviewer = Reviewer & { login: string };
type TeamReviewer = Reviewer & { slug: string };
type RawReviewer = {
  type: 'User' | 'Team';
  reviewer: {
    id: number;
    login?: string;
    slug?: string;
  };
};
type ExistingReviewer = {
  type: 'User' | 'Team';
  id: number;
  login?: string;
  slug?: string;
};
type ProtectionRule =
  | { type: 'wait_timer'; wait_timer?: number }
  | { type: 'prevent_self_review'; prevent_self_review?: boolean }
  | { type: 'required_reviewers'; reviewers?: RawReviewer[] };

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private debug: boolean;

  constructor(token: string, repository: string, debug = false) {
    if (!token) {
      throw new Error('Token is required');
    }
    if (!repository) {
      throw new Error('Repository is required');
    }
    this.octokit = new Octokit({ auth: token });
    [this.owner, this.repo] = repository.split('/');
    this.debug = debug;
  }

  async getUser(username: string): Promise<UserReviewer> {
    const { data: user } = await this.octokit.users.getByUsername({ username });
    return { type: 'User', id: user.id, login: user.login };
  }

  async getTeam(teamSlug: string): Promise<TeamReviewer> {
    const { data: team } = await this.octokit.teams.getByName({
      org: this.owner,
      team_slug: teamSlug
    });
    return { type: 'Team', id: team.id, slug: team.slug };
  }

  async hasTeamAccess(teamSlug: string): Promise<boolean> {
    try {
      const { data: repos } = await this.octokit.teams.listReposInOrg({
        org: this.owner,
        team_slug: teamSlug
      });
      return repos.some((repo: { full_name: string }) => repo.full_name === `${this.owner}/${this.repo}`);
    } catch {
      return false;
    }
  }

  async resolveReviewers(environmentName: string, reviewers: Reviewer[]): Promise<EnvironmentConfig['reviewers']> {
    const reviewerList: EnvironmentConfig['reviewers'] = [];
    const failedTeams: { slug: string; error: string }[] = [];

    let existingReviewers: ExistingReviewer[] = [];
    try {
      const existingEnv = await this.getEnvironmentConfig(environmentName);
      const protectionRules = Array.isArray(existingEnv.protection_rules)
        ? (existingEnv.protection_rules as ProtectionRule[])
        : [];

      const requiredReviewersRule = protectionRules.find(
        (r): r is { type: 'required_reviewers'; reviewers?: RawReviewer[] } =>
          r.type === 'required_reviewers'
      );

      const rawReviewers = requiredReviewersRule?.reviewers ?? [];
      existingReviewers = rawReviewers.map((er: RawReviewer) => ({
        type: er.type,
        id: er.reviewer.id,
        ...(er.reviewer.login ? { login: er.reviewer.login } : {}),
        ...(er.reviewer.slug ? { slug: er.reviewer.slug } : {})
      }));
    } catch (error) {
      logDebug(this.debug, `Environment ${environmentName} does not exist yet, skipping existing reviewer check`);
    }

    const isAlreadyIncluded = (r: Reviewer): boolean => {
      return existingReviewers.some(
        er => er.type === r.type && er.id === r.id
      );
    };

    for (const reviewer of reviewers) {
      try {
        if (!reviewer || typeof reviewer !== 'object') {
          core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
          continue;
        }

        if (reviewer.type === 'User') {
          if (!reviewer.login) {
            core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
            continue;
          }
          try {
            const user = await this.getUser(reviewer.login);
            reviewerList.push(user);
            logDebug(this.debug, `${isAlreadyIncluded(user) ? 'Skipping' : 'Adding'} user ${reviewer.login}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            core.error(`Failed to process reviewer for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)} — ${errorMessage}`);
          }
        } else if (reviewer.type === 'Team') {
          if (!reviewer.slug) {
            core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
            continue;
          }
          try {
            const team = await this.getTeam(reviewer.slug);
            if (!team || !team.id) {
              core.error(`Invalid reviewer format for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
              continue;
            }
            const hasAccess = await this.hasTeamAccess(reviewer.slug);
            if (!hasAccess) {
              const errorMessage = `Team ${reviewer.slug} does not have access to ${this.owner}/${this.repo} repository`;
              core.error(errorMessage);
              failedTeams.push({ slug: reviewer.slug, error: errorMessage });
              continue;
            }
            reviewerList.push(team);
            logDebug(this.debug, `${isAlreadyIncluded(team) ? 'Skipping' : 'Adding'} team ${reviewer.slug}`);
          } catch (error) {
            const gitHubError = error as GitHubError;
            const errorMessage = gitHubError.message || 'Unknown error';

            if (error instanceof Error && error.message === 'API Error') {
              core.error(`Error adding team ${reviewer.slug}: ${errorMessage}`);
              failedTeams.push({ slug: reviewer.slug, error: errorMessage });
            } else if (
              (gitHubError.status && (gitHubError.status === 404 || gitHubError.status === 403)) ||
              (errorMessage && (
                errorMessage.includes('does not have access') ||
                errorMessage.includes('Not Found') ||
                errorMessage.includes('Resource not accessible by integration') ||
                errorMessage.includes('Not Found or access denied')
              ))
            ) {
              core.error(`Error adding team ${reviewer.slug}: ${errorMessage}`);
              failedTeams.push({ slug: reviewer.slug, error: errorMessage });
            } else {
              throw error; // Re-throw unexpected errors
            }
          }
        } else {
          core.error(`Invalid reviewer type for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        core.error(`Failed to process reviewer for ${this.owner}/${this.repo}: ${JSON.stringify(reviewer)} — ${errorMessage}`);
        throw error; // Re-throw unexpected errors
      }
    }

    if (failedTeams.length > 0) {
      core.error(`The following teams do not have access to ${this.owner}/${this.repo}: ${failedTeams.map(f => f.slug).join(', ')}`);
    }

    return reviewerList;
  }

  private isWaitTimerRule(rule: unknown): rule is { type: string; wait_timer?: number } {
    return typeof rule === 'object' && rule !== null && 'type' in rule && (rule as { type: string }).type === 'wait_timer';
  }

  private isReviewersRule(rule: unknown): rule is { type: string; reviewers?: { type: 'User' | 'Team'; reviewer: { id: number; login?: string; slug?: string } }[]; prevent_self_review?: boolean } {
    return typeof rule === 'object' && rule !== null && 'type' in rule && (rule as { type: string }).type === 'required_reviewers';
  }

  private isPreventSelfReviewRule(rule: unknown): rule is { type: string; prevent_self_review?: boolean } {
    return typeof rule === 'object' && rule !== null && 'type' in rule && (rule as { type: string }).type === 'prevent_self_review';
  }

  async updateEnvironment(environmentName: string, config: EnvironmentConfig): Promise<{ status: string; message: string }> {
    const octokitConfig = {
      wait_timer: config.wait_timer ?? undefined,
      prevent_self_review: config.prevent_self_review,
      deployment_branch_policy: config.deployment_branch_policy ? {
        protected_branches: config.deployment_branch_policy.protected_branches,
        custom_branch_policies: config.deployment_branch_policy.custom_branch_policies
      } : undefined
    };

    try {
      const { data: currentConfig } = await this.octokit.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });

      const currentRules = currentConfig.protection_rules || [];
      const waitTimerRule = currentRules.find((r: { id: number; node_id: string; type: string; wait_timer?: number }) => r.type === 'wait_timer');
      const currentWaitTimer = this.isWaitTimerRule(waitTimerRule) ? waitTimerRule.wait_timer : undefined;
      const reviewersRule = currentRules.find((r: { id: number; node_id: string; type: string; reviewers?: { type?: 'User' | 'Team'; reviewer?: { id: number; login?: string; slug?: string } }[] }) => r.type === 'required_reviewers');
      const currentReviewers = this.isReviewersRule(reviewersRule) ? reviewersRule.reviewers : undefined;
      const currentPreventSelfReview = this.isReviewersRule(reviewersRule) ? reviewersRule.prevent_self_review : undefined;
      const currentBranchPolicy = currentConfig.deployment_branch_policy;
      const normalizeReviewers = (reviewers: { type: 'User' | 'Team'; id?: number; login?: string; slug?: string; reviewer?: { id: number; login?: string; slug?: string } }[] | undefined) => {
        if (!reviewers) return undefined;
        return reviewers.map(r => ({
          type: r.type,
          id: r.reviewer?.id || r.id,
          ...(r.type === 'User' ? { login: r.reviewer?.login || r.login } : {}),
          ...(r.type === 'Team' ? { slug: r.reviewer?.slug || r.slug } : {})
        })).sort((a, b) => {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          if (a.type === 'User') return (a.login || '').localeCompare(b.login || '');
          return (a.slug || '').localeCompare(b.slug || '');
        });
      };
      const normalizedCurrentReviewers = normalizeReviewers(currentReviewers);
      const normalizedDesiredReviewers = normalizeReviewers(config.reviewers);
      const hasChanges =
        currentWaitTimer !== octokitConfig.wait_timer ||
        JSON.stringify(normalizedCurrentReviewers) !== JSON.stringify(normalizedDesiredReviewers) ||
        currentPreventSelfReview !== octokitConfig.prevent_self_review ||
        JSON.stringify(currentBranchPolicy) !== JSON.stringify(octokitConfig.deployment_branch_policy);

      logDebug(this.debug, `currentWaitTimer: ${currentWaitTimer}`);
      logDebug(this.debug, `octokitConfig.wait_timer: ${octokitConfig.wait_timer}`);
      logDebug(this.debug, `currentPreventSelfReview: ${currentPreventSelfReview}`);
      logDebug(this.debug, `reviewersRule: ${JSON.stringify(reviewersRule, null, 2)}`);
      logDebug(this.debug, `octokitConfig.prevent_self_review: ${octokitConfig.prevent_self_review}`);
      logDebug(this.debug, `currentBranchPolicy: ${JSON.stringify(currentBranchPolicy, null, 2)}`);
      logDebug(this.debug, `octokitConfig.deployment_branch_policy: ${JSON.stringify(octokitConfig.deployment_branch_policy, null, 2)}`);
      logDebug(this.debug, `normalizedCurrentReviewers: ${JSON.stringify(normalizedCurrentReviewers, null, 2)}`);
      logDebug(this.debug, `normalizedDesiredReviewers: ${JSON.stringify(normalizedDesiredReviewers, null, 2)}`);

      if (!hasChanges) {
        return {
          status: 'nochange',
          message: 'No update required: environment is up to date.'
        };
      }

      const formattedConfig = {
        ...octokitConfig,
        reviewers: config.reviewers?.map(r => ({
          type: r.type,
          id: r.id,
          ...(r.type === 'User' ? { login: (r as UserReviewer).login } : {}),
          ...(r.type === 'Team' ? { slug: (r as TeamReviewer).slug } : {})
        }))
      };

      await this.octokit.repos.createOrUpdateEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName,
        ...formattedConfig
      });

      return {
        status: 'success',
        message: 'Update successful: environment configuration updated.'
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not Found')) {
        const formattedConfig = {
          ...octokitConfig,
          reviewers: config.reviewers?.map(r => ({
            type: r.type,
            id: r.id,
            ...(r.type === 'User' ? { login: (r as UserReviewer).login } : {}),
            ...(r.type === 'Team' ? { slug: (r as TeamReviewer).slug } : {})
          }))
        };

        await this.octokit.repos.createOrUpdateEnvironment({
          owner: this.owner,
          repo: this.repo,
          environment_name: environmentName,
          ...formattedConfig
        });

        return {
          status: 'success',
          message: 'Update successful: environment created.'
        };
      }
      throw error;
    }
  }

  async getEnvironmentConfig(environmentName: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await this.octokit.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });
      return data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not Found')) {
        throw error;
      }
      throw error;
    }
  }

  async deleteAnEnvironment(environmentName: string): Promise<{ status: string; message: string }> {
    try {
      const { data: env } = await this.octokit.repos.getEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });

      if (!env) {
        return {
          status: 'nochange',
          message: `No update required: environment '${environmentName}' does not exist.`
        };
      }

      await this.octokit.repos.deleteAnEnvironment({
        owner: this.owner,
        repo: this.repo,
        environment_name: environmentName
      });

      return {
        status: 'success',
        message: `Update successful: environment '${environmentName}' deleted.`
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not Found')) {
        return {
          status: 'nochange',
          message: `No update required: environment '${environmentName}' does not exist.`
        };
      }
      throw error;
    }
  }

  async getAllEnvironments(): Promise<string[]> {
    try {
      const { data } = await this.octokit.repos.getAllEnvironments({
        owner: this.owner,
        repo: this.repo
      });
      return (data.environments || []).map((env: { name: string }) => env.name);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get environments: ${errorMessage}`);
    }
  }
}
